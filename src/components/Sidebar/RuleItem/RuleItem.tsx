import { Icon, IconButton } from '@components';
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
        <span class={styles.tag}>{rule.type === 'graphql' ? 'GQL' : 'REST'}</span>
        <span class={`${styles.tag} ${styles.responseType}`}>{rule.responseType === 'dynamic' ? 'JS' : 'Static'}</span>
      </div>

      <IconButton
        data-del
        className={'danger'}
        title="Delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(rule.id, rule.name);
        }}
      >
        <Icon name="delete" />
      </IconButton>
    </div>
  );
}
