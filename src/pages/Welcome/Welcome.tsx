import styles from './Welcome.module.scss';

interface Props {
  onNew: () => void;
}

export function Welcome({ onNew }: Props) {
  return (
    <div class={styles.welcome}>
      <div class={styles.art}>🎭</div>
      <h2 class={styles.title}>Intercept. Mock. Ship.</h2>
      <p class={styles.desc}>Create a rule to intercept any REST or GraphQL request and return a custom response — without touching your backend.</p>
      <button class={styles.btn} onClick={onNew}>
        + New Rule
      </button>
    </div>
  );
}
