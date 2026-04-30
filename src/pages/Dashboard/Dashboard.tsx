import { Sidebar, Topbar, confirm, showToast } from '@components';
import { useSignal } from '@preact/signals';
import {
  addRule,
  deleteRule,
  loadFromStorage,
  makeBlankRule,
  rules,
  selectedId,
  selectedRule,
  toggleRule,
  updateRule
} from '@store';
import type { MockRule } from '@types';
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

  const handleNew = async () => {
    const rule = makeBlankRule();
    await addRule(rule);
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
      [JSON.stringify({ version: 3, exportedAt: new Date().toISOString(), rules: rules.value }, null, 2)],
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
        const incoming: MockRule[] = data.rules ?? (Array.isArray(data) ? data : []);
        const existingIds = new Set(rules.value.map((r) => r.id));
        const fresh = incoming.filter((r) => !existingIds.has(r.id));
        const next = [...fresh, ...rules.value];
        // persist directly
        await chrome.storage.local.set({ mockRules: next });
        rules.value = next;
        showToast(`✅ Imported ${fresh.length} rule(s)`);
      } catch {
        showToast('❌ Invalid file');
      }
    };
    fi.click();
  };

  const rule = selectedRule.value;

  return (
    <div class={styles.app}>
      <Sidebar onNew={handleNew} onImport={handleImport} onExport={handleExport} />

      <div class={styles.main}>
        <Topbar
          rule={rule}
          savedTitle={savedTitle.value}
          savedSub={savedSub.value}
          onToggleEnabled={handleToggleEnabled}
          onDelete={handleDelete}
        />
        {rule ? <Editor key={rule.id} rule={rule} onSave={handleSave} /> : <Welcome onNew={handleNew} />}
      </div>
    </div>
  );
}
