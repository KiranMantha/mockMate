import { deleteRule, filteredRules, globalEnabled, searchQuery, selectedId, setGlobalEnabled } from '@store';
import { confirm } from '../ConfirmDialog';
import { showToast } from '../Toast';
import { Toggle } from '../Toggle';
import { RuleItem } from './RuleItem';
import styles from './Sidebar.module.scss';

interface Props {
  onNew: () => void;
  onImport: () => void;
  onExport: () => void;
}

export function Sidebar({ onNew, onImport, onExport }: Props) {
  const rules = filteredRules.value;
  const enabled = globalEnabled.value;

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

  return (
    <aside class={styles.sidebar}>
      <div class={styles.head}>
        <div class={styles.logo}>
          <div class={styles.logoMark}>🎭</div>
          <span class={styles.logoText}>MockMate</span>
        </div>
        <Toggle checked={enabled} onChange={handleGlobalToggle} />
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
        <button class={styles.btnNew} onClick={onNew}>
          + New
        </button>
      </div>

      <div class={styles.list}>
        {rules.length === 0 ? (
          <div class={styles.empty}>
            <div class={styles.emptyIcon}>🎭</div>
            <div class={styles.emptyText}>{searchQuery.value ? 'No matches' : 'No rules yet'}</div>
          </div>
        ) : (
          rules.map((r) => (
            <RuleItem
              key={r.id}
              rule={r}
              selected={r.id === selectedId.value}
              onSelect={(id) => (selectedId.value = id)}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      <div class={styles.foot}>
        <button class={styles.btnFooter} onClick={onImport}>
          ⬆ Import
        </button>
        <button class={styles.btnFooter} onClick={onExport}>
          ⬇ Export
        </button>
      </div>
    </aside>
  );
}
