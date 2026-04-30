import { signal } from '@preact/signals';
import styles from './Toast.module.scss';

const message = signal('');
const visible = signal(false);
let timer: ReturnType<typeof setTimeout>;

export function showToast(msg: string) {
  message.value = msg;
  visible.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (visible.value = false), 2500);
}

export function Toast() {
  return <div class={`${styles.toast} ${visible.value ? styles.show : ''}`}>{message.value}</div>;
}
