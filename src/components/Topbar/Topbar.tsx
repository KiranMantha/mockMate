import type { MockRule } from '@types';
import { Toggle } from '../Toggle';
import styles from './Topbar.module.scss';

interface Props {
  rule: MockRule | null;
  savedTitle?: string;
  savedSub?: string;
  onToggleEnabled: (val: boolean) => void;
  onDelete: () => void;
}

export function Topbar({ rule, savedTitle, savedSub, onToggleEnabled, onDelete }: Props) {
  if (!rule) {
    return (
      <div class={styles.topbar}>
        <div class={styles.left}>
          <div class={styles.title}>MockMate</div>
          <div class={styles.sub}>Select a rule or create a new one</div>
        </div>
        <div class={styles.right} />
      </div>
    );
  }

  return (
    <div class={styles.topbar}>
      <div class={styles.left}>
        <div class={styles.title}>{savedTitle ?? rule.name}</div>
        <div class={styles.sub}>{savedSub ?? rule.urlPattern}</div>
      </div>
      <div class={styles.right}>
        <div class={`${styles.ruleToggle} ${rule.enabled ? styles.on : ''}`}>
          <span class={styles.toggleLabel}>{rule.enabled ? 'Enabled' : 'Disabled'}</span>
          <Toggle checked={rule.enabled} onChange={onToggleEnabled} />
        </div>
        <button class={styles.btnDelete} onClick={onDelete}>
          🗑 Delete
        </button>
      </div>
    </div>
  );
}
