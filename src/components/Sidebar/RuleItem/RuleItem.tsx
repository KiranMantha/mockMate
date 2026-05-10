import type { MockRule } from '@types';
import styles from './RuleItem.module.scss';

type RuleItemProps = {
  rule: MockRule;
  selected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string, name: string) => void;
};

export function RuleItem({ rule, selected, onSelect, onDelete }: RuleItemProps) {
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer?.setData('ruleId', rule.id);
    // Add a ghost effect if desired
    e.dataTransfer!.effectAllowed = 'move';
  };

  return (
    <div
      class={`${styles.item} ${selected ? styles.active : ''} ${!rule.enabled ? styles.dim : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={(e) => (e.currentTarget as HTMLElement).classList.remove(styles.dragging)}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-toggle]') && !target.closest('[data-del]')) onSelect(rule.id);
      }}
    >
      <div class={styles.info}>
        <div class={styles.name}>{rule.name || 'Unnamed'}</div>
        {rule.urlPattern ? <div class={styles.url}>{rule.urlPattern}</div> : null}
      </div>

      <div class={styles.tags}>
        <span class={`${styles.tag} ${rule.type === 'graphql' ? styles.gql : styles.rest}`}>
          {rule.type === 'graphql' ? 'GQL' : 'REST'}
        </span>
        {rule.responseType === 'dynamic' && <span class={`${styles.tag} ${styles.js}`}>JS</span>}
      </div>

      <button
        data-del
        class={styles.delBtn}
        title="Delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(rule.id, rule.name);
        }}
      >
        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={2.5}>
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        </svg>
      </button>
    </div>
  );
}
