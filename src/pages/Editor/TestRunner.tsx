import { useSignal } from '@preact/signals';
import type { MockRule } from '@types';
import styles from './TestRunner.module.scss';

interface TestResult {
  status: number;
  body: string;
  matched: boolean;
  error?: string;
}

interface Props {
  rule: MockRule;
  sandboxRunDynamic?: (code: string, args: object) => Promise<string>;
}

// Checks if a URL matches the rule's urlPattern (mirrors content.js logic)
function urlMatches(pattern: string, url: string): boolean {
  try {
    const re = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(re, 'i').test(url);
  } catch {
    return url.toLowerCase().includes(pattern.toLowerCase());
  }
}

function statusClass(code: number) {
  if (code < 300) return styles.s2xx;
  if (code < 400) return styles.s3xx;
  if (code < 500) return styles.s4xx;
  return styles.s5xx;
}

function tryFormat(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

async function runInSandbox(code: string, args: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const iframe = document.getElementById('sandbox-iframe') as HTMLIFrameElement;
    const callId = Math.random().toString(36).slice(2);

    const handler = (event: MessageEvent) => {
      if (event.data.callId === callId) {
        window.removeEventListener('message', handler);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.result);
      }
    };

    window.addEventListener('message', handler);
    iframe.contentWindow?.postMessage({ command: 'execute', code, args, callId }, '*');
  });
}

export function TestRunner({ rule }: Props) {
  const testUrl = useSignal(rule.urlPattern.replace(/\*/g, '').replace(/\^|\$/, '') || '');
  const testBody = useSignal('');
  const loading = useSignal(false);

  const actualResult = useSignal<TestResult | null>(null);
  const mockedResult = useSignal<TestResult | null>(null);

  const isGQL = rule.type === 'graphql';
  const method = isGQL ? 'POST' : rule.method === '*' ? 'GET' : rule.method;
  const needsBody = ['POST', 'PUT', 'PATCH'].includes(method);

  // Checks whether the current rule would match the test URL
  function ruleMatchesUrl(url: string): boolean {
    if (!rule.enabled) return false;
    if (!rule.urlPattern?.trim()) return false;
    if (!urlMatches(rule.urlPattern, url)) return false;
    return true;
  }

  // Compute mocked response from rule (mirrors buildMockResponse in content.js)
  async function computeMocked(url: string, bodyRaw: string): Promise<TestResult> {
    const status = parseInt(rule.statusCode || '200', 10);

    if (rule.responseType === 'dynamic') {
      if (!rule.dynamicCode?.trim()) {
        return { status, body: '{}', matched: true };
      }
      try {
        const staticBody = rule.responseBody || '{}';
        let responseJSON = null;
        try {
          responseJSON = JSON.parse(staticBody);
        } catch (_) {}

        const args = {
          method,
          url,
          response: staticBody,
          responseType: 'json',
          requestHeaders: {},
          requestData: bodyRaw
            ? (() => {
                try {
                  return JSON.parse(bodyRaw);
                } catch {
                  return bodyRaw;
                }
              })()
            : null,
          responseJSON
        };

        const data = await runInSandbox(rule.dynamicCode, args);

        return { status, body: JSON.stringify(data), matched: true };
      } catch (e: any) {
        return {
          status,
          body: JSON.stringify({ __mockmate_error__: e.message }, null, 2),
          matched: true,
          error: e.message
        };
      }
    }

    return { status, body: tryFormat(rule.responseBody || '{}'), matched: true };
  }

  async function runTest() {
    const url = testUrl.value.trim();
    if (!url) return;

    loading.value = true;
    actualResult.value = null;
    mockedResult.value = null;

    const bodyRaw = needsBody ? testBody.value.trim() : '';

    // ── Fire real fetch ────────────────────────────────────────────────────────
    const fetchInit: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(bodyRaw ? { body: bodyRaw } : {})
    };

    const [actualRes, mockedRes] = await Promise.allSettled([
      // Real network request
      fetch(url, fetchInit)
        .then(
          async (res) =>
            ({
              status: res.status,
              body: tryFormat(await res.text()),
              matched: false
            }) as TestResult
        )
        .catch(
          (e) =>
            ({
              status: 0,
              body: e.message,
              matched: false,
              error: e.message
            }) as TestResult
        ),

      // Mock computation (local, no network)
      ruleMatchesUrl(url)
        ? computeMocked(url, bodyRaw)
        : Promise.resolve({
            status: 0,
            body: 'Rule pattern did not match this URL.',
            matched: false
          } as TestResult)
    ]);

    actualResult.value =
      actualRes.status === 'fulfilled'
        ? actualRes.value
        : { status: 0, body: String(actualRes.reason), matched: false };
    mockedResult.value =
      mockedRes.status === 'fulfilled'
        ? mockedRes.value
        : { status: 0, body: String(mockedRes.reason), matched: false };
    loading.value = false;
  }

  const isMatched = mockedResult.value?.matched ?? false;

  return (
    <div class={styles.wrap}>
      {/* ── URL bar ─────────────────────────────────────────────────────────── */}
      <div class={styles.urlBar}>
        <span class={styles.methodBadge}>{method}</span>
        <input
          class={styles.urlInput}
          type="text"
          value={testUrl.value}
          placeholder="https://api.example.com/users/1"
          onInput={(e) => (testUrl.value = (e.target as HTMLInputElement).value)}
        />
        <button class={styles.btnRun} onClick={runTest} disabled={loading.value || !testUrl.value.trim()}>
          {loading.value ? (
            <>
              <div class={styles.spinner} /> Running…
            </>
          ) : (
            '▶ Run Test'
          )}
        </button>
      </div>

      {/* ── Optional request body ────────────────────────────────────────────── */}
      {needsBody && (
        <div class={styles.bodyField}>
          <label>Request Body — JSON (optional)</label>
          <textarea
            rows={3}
            style="font-family:var(--mono,monospace);font-size:12px"
            value={testBody.value}
            placeholder='{"key": "value"}'
            onInput={(e) => (testBody.value = (e.target as HTMLTextAreaElement).value)}
          />
        </div>
      )}

      {/* ── No-match warning ─────────────────────────────────────────────────── */}
      {mockedResult.value && !isMatched && (
        <div class={styles.noMatch}>
          ⚠️ The URL you tested does not match this rule's pattern (<code>{rule.urlPattern}</code>). The rule would not
          intercept this request.
        </div>
      )}

      {/* ── Results side by side ─────────────────────────────────────────────── */}
      {(actualResult.value || mockedResult.value) && (
        <div class={styles.results}>
          {/* Actual response */}
          <div class={styles.resultPanel}>
            <div class={styles.resultHeader}>
              <span class={styles.resultLabel}>Actual Response</span>
              {actualResult.value && actualResult.value.status > 0 && (
                <span class={`${styles.statusBadge} ${statusClass(actualResult.value.status)}`}>
                  {actualResult.value.status}
                </span>
              )}
            </div>
            <div class={`${styles.resultBody} ${actualResult.value?.error ? styles.error : ''}`}>
              {actualResult.value ? actualResult.value.body || '(empty)' : <span class={styles.idle}>—</span>}
            </div>
          </div>

          {/* Mocked response */}
          <div class={styles.resultPanel}>
            <div class={styles.resultHeader}>
              <span class={styles.resultLabel}>Mocked Response</span>
              <div style="display:flex;gap:6px;align-items:center">
                {isMatched && mockedResult.value && mockedResult.value.status > 0 && (
                  <span class={`${styles.statusBadge} ${statusClass(mockedResult.value.status)}`}>
                    {mockedResult.value.status}
                  </span>
                )}
                <span class={`${styles.matchBadge} ${isMatched ? styles.matched : styles.bypassed}`}>
                  {isMatched ? '✓ matched' : '✗ no match'}
                </span>
              </div>
            </div>
            <div
              class={`${styles.resultBody} ${isMatched ? styles.mocked : ''} ${mockedResult.value?.error ? styles.error : ''}`}
            >
              {mockedResult.value ? mockedResult.value.body || '(empty)' : <span class={styles.idle}>—</span>}
            </div>
          </div>
        </div>
      )}

      {/* ── Hint ─────────────────────────────────────────────────────────────── */}
      {!actualResult.value && !mockedResult.value && (
        <div class={styles.hint}>
          Enter a concrete URL and click <strong>Run Test</strong>. The actual response comes from the real network; the
          mocked response is computed locally from your rule — no page reload needed.
        </div>
      )}
    </div>
  );
}
