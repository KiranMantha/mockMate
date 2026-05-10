import styles from './Welcome.module.scss';

interface Props {
  onAddRule: () => void;
}

export function Welcome({ onAddRule }: Props) {
  return (
    <div class={styles.welcome}>
      <div class={styles.art}>🎭</div>
      <h2 class={styles.title}>Intercept. Mock. Ship.</h2>
      <p class={styles.desc}>
        Create a rule to intercept any REST or GraphQL request and return a custom response — without touching your
        backend.
      </p>
      <button class={styles.btn} onClick={onAddRule}>
        + New Rule
      </button>
    </div>
  );
}
