import { Sidebar, Topbar, confirm, showToast } from '@components';
import { useSignal } from '@preact/signals';
import {
  addGroup,
  addRule,
  deleteRule,
  groups,
  loadFromStorage,
  makeBlankRule,
  rules,
  selectedId,
  selectedRule,
  toggleRule,
  updateRule
} from '@store';
import type { MockRule, RuleGroup } from '@types';
import { useEffect } from 'preact/hooks';
import { Editor } from '../Editor';
import { Welcome } from '../Welcome';
import styles from './Dashboard.module.scss';

export function Dashboard() {
  // savedTitle/sub update the topbar text immediately after save without waiting for signal propagation
  const savedTitle = useSignal<string | undefined>(undefined);
  const savedSub = useSignal<string | undefined>(undefined);

  useEffect(() => {
    loadFromStorage();
  }, []);

  // Reset saved display info when selection changes
  useEffect(() => {
    savedTitle.value = undefined;
    savedSub.value = undefined;
  }, [selectedId.value]);

  const handleAddRule = async () => {
    const rule = makeBlankRule();
    await addRule(rule);
  };

  // NEW: Create a new empty group
  const handleAddGroup = async () => {
    const name = window.prompt('Group Name:', 'New Collection');
    if (!name?.trim()) return;
    await addGroup(name.trim());
    showToast('📁 Group created');
  };

  // NEW: Move a rule to a group (or null for ungrouped)
  const handleMoveRule = async (ruleId: string, groupId: string) => {
    const ruleToMove = rules.value.find((r) => r.id === ruleId);
    if (!ruleToMove) return;

    await updateRule({ ...ruleToMove, groupId });
    showToast(groupId ? 'Moved to group' : 'Moved to Ungrouped');
  };

  const handleSave = async (updated: MockRule) => {
    await updateRule(updated);
    savedTitle.value = updated.name;
    savedSub.value = updated.urlPattern;
    showToast('✅ Rule saved');
  };

  const handleToggleEnabled = async (val: boolean) => {
    if (!selectedId.value) return;
    await toggleRule(selectedId.value, val);
    showToast(val ? '✅ Rule Enabled' : '⏸ Rule Disabled');
  };

  const handleDelete = () => {
    const rule = selectedRule.value;
    if (!rule) return;
    confirm('Delete rule?', `"${rule.name}" will be permanently deleted.`, async () => {
      await deleteRule(rule.id);
      showToast('🗑 Deleted');
    });
  };

  const handleExport = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { version: 3, exportedAt: new Date().toISOString(), groups: groups.value, rules: rules.value },
          null,
          2
        )
      ],
      {
        type: 'application/json'
      }
    );
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `mockmate-${Date.now()}.json`
    });
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('📦 Exported');
  };

  const handleImport = () => {
    const fi = document.createElement('input');
    fi.type = 'file';
    fi.accept = '.json';
    fi.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        const incomingRules: MockRule[] = data.rules ?? [];
        const incomingGroups: RuleGroup[] = data.groups ?? [];

        // Merge rules — skip duplicates by id
        const existingRuleIds = new Set(rules.value.map((r) => r.id));
        const freshRules = incomingRules.filter((r) => !existingRuleIds.has(r.id));

        // Merge groups — skip duplicates by id
        const existingGroupIds = new Set(groups.value.map((g) => g.id));
        const freshGroups = incomingGroups.filter((g) => !existingGroupIds.has(g.id));

        const nextRules = [...freshRules, ...rules.value];
        const nextGroups = [...freshGroups, ...groups.value];

        await chrome.storage.local.set({ mockRules: nextRules, mockGroups: nextGroups });
        rules.value = nextRules;
        groups.value = nextGroups;

        showToast(`✅ Imported ${freshRules.length} rule(s) and ${freshGroups.length} group(s)`);
      } catch {
        showToast('❌ Invalid file');
      }
    };
    fi.click();
  };

  const rule = selectedRule.value;

  return (
    <div class={styles.app}>
      <Sidebar
        onAddRule={handleAddRule} // New Props
        onAddGroup={handleAddGroup}
        onMoveRule={handleMoveRule}
        onImport={handleImport}
        onExport={handleExport}
      />

      <div class={styles.main}>
        <Topbar
          rule={rule}
          savedTitle={savedTitle.value}
          savedSub={savedSub.value}
          onToggleEnabled={handleToggleEnabled}
          onDelete={handleDelete}
        />
        {rule ? <Editor key={rule.id} rule={rule} onSave={handleSave} /> : <Welcome onAddRule={handleAddRule} />}
      </div>

      <iframe id="sandbox-iframe" src={chrome.runtime.getURL('sandbox.html')} style="display: none;" />
    </div>
  );
}
