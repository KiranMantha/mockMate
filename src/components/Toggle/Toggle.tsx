import styles from './Toggle.module.scss';

interface Props {
  checked: boolean;
  onChange: (val: boolean) => void;
  small?: boolean;
}

export function Toggle({ checked, onChange, small }: Props) {
  return (
    <label class={`${styles.pill} ${small ? styles.small : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <div class={styles.track} />
    </label>
  );
}
