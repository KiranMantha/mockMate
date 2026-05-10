import styles from './Toggle.module.scss';

interface ToggleProps {
  small?: boolean;
  checked: boolean;
  onChange: (val: boolean) => void;
}

export function Toggle({ checked, onChange, small }: ToggleProps) {
  return (
    <label class={`${styles.pill} ${small ? styles.small : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <div class={styles.track} />
    </label>
  );
}
