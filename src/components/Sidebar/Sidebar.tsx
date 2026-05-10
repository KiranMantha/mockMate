import { deleteRule, filteredRules, globalEnabled, groups, searchQuery, selectedId, setGlobalEnabled } from '@store';
import { confirm } from '../ConfirmDialog';
import { showToast } from '../Toast';
import { Toggle } from '../Toggle';
import { RuleGroupItem } from './RuleGroupItem';
import { RuleItem } from './RuleItem';
import styles from './Sidebar.module.scss';

type SidebarProps = {
  onAddRule: () => void;
  onAddGroup: () => void;
  onMoveRule: (ruleId: string, groupId: string) => void;
  onImport: () => void;
  onExport: () => void;
};

export function Sidebar({ onAddRule, onAddGroup, onMoveRule, onImport, onExport }: SidebarProps) {
  const rules = filteredRules.value;
  const enabled = globalEnabled.value;
  const allGroups = groups.value;

  console.log('sidebar', { rules, enabled, allGroups });

  const handleGlobalToggle = async (val: boolean) => {
    await setGlobalEnabled(val);
    showToast(val ? '✅ MockMate enabled' : '⏸ MockMate paused');
  };

  const handleDelete = (id: string, name: string) => {
    confirm('Delete rule?', `"${name}" will be permanently deleted.`, async () => {
      await deleteRule(id);
      showToast('🗑 Deleted');
    });
  };

  /**
   * Specifically handles dropping into the "Ungrouped" section.
   * Resets the groupId to null.
   */
  const onDropInUngrouped = (e: DragEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.classList.remove(styles.dragOver);

    const ruleId = e.dataTransfer?.getData('ruleId');
    if (ruleId) {
      onMoveRule(ruleId, '');
    }
  };

  const renderRuleList = (groupId: string) => {
    const list = rules.filter((r) => r.groupId === groupId);
    return list.map((rule) => (
      <RuleItem
        key={rule.id}
        rule={rule}
        selected={rule.id === selectedId.value}
        onSelect={(id) => (selectedId.value = id)}
        onDelete={handleDelete}
      />
    ));
  };

  return (
    <aside class={styles.sidebar}>
      <div class={styles.head}>
        <div class={styles.logo}>
          <div class={styles.logoMark}>🎭</div>
          <span class={styles.logoText}>MockMate</span>
        </div>
        <Toggle small checked={enabled} onChange={handleGlobalToggle} />
      </div>

      <div class={styles.toolbar}>
        <div class={styles.searchWrap}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={2.5}>
            <circle cx={11} cy={11} r={8} />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search rules…"
            value={searchQuery.value}
            onInput={(e) => (searchQuery.value = (e.target as HTMLInputElement).value)}
          />
        </div>
        <button class={styles.btnNew} onClick={onAddRule}>
          + New
        </button>
      </div>

      <div class={styles.list}>
        {/* Dynamic Groups */}
        {allGroups.length ? (
          <div class={styles.groups}>
            {allGroups.map((group) => (
              <RuleGroupItem key={group.id} group={group}>
                {renderRuleList(group.id)}
              </RuleGroupItem>
            ))}
          </div>
        ) : null}

        {/* Section for rules without a group */}
        <div
          class={styles.ungroupedZone}
          onDragOver={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).classList.add(styles.dragOver);
          }}
          onDragLeave={(e) => {
            (e.currentTarget as HTMLElement).classList.remove(styles.dragOver);
          }}
          onDrop={onDropInUngrouped}
        >
          {renderRuleList('')}
        </div>

        {/* Empty State */}
        {rules.length === 0 && (
          <div class={styles.empty}>
            <div class={styles.emptyIcon}>🎭</div>
            <div class={styles.emptyText}>{searchQuery.value ? 'No matches' : 'No rules yet'}</div>
          </div>
        )}
      </div>

      <div class={styles.foot}>
        <button class={styles.btnFooter} onClick={onImport}>
          ⬆ Import
        </button>
        <button class={styles.btnFooter} onClick={onExport}>
          ⬇ Export
        </button>
        <button class={styles.btnFooter} onClick={() => onAddGroup()}>
          + New Group
        </button>
      </div>
    </aside>
  );
}
