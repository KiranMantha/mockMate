import { signal } from '@preact/signals';
import styles from './ConfirmDialog.module.scss';

interface ConfirmState {
  title: string;
  msg: string;
  cb: () => void;
}

const state = signal<ConfirmState | null>(null);

export function confirm(title: string, msg: string, cb: () => void) {
  state.value = { title, msg, cb };
}

export function ConfirmDialog() {
  const open = state.value !== null;

  const handleYes = () => {
    state.value?.cb();
    state.value = null;
  };

  const handleNo = () => {
    state.value = null;
  };

  return (
    <div
      class={`${styles.overlay} ${open ? styles.open : ''}`}
      onClick={(e) => e.target === e.currentTarget && handleNo()}
    >
      <div class={styles.box}>
        <h3>{state.value?.title}</h3>
        <p>{state.value?.msg}</p>
        <div class={styles.actions}>
          <button onClick={handleNo}>Cancel</button>
          <button data-variant="danger-outline" onClick={handleYes}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
