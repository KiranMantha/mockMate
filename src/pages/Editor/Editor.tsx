import { showToast } from '@components';
import { useSignal } from '@preact/signals';
import type { HttpMethod, MockRule, ResponseType } from '@types';
import { useEffect } from 'preact/hooks';
import styles from './Editor.module.scss';
import { TestRunner } from './TestRunner';

const DEFAULT_TEMPLATE = [
  'function modifyResponse(args) {',
  '  const { method, url, response, responseType, requestHeaders, requestData, responseJSON } = args;',
  '  // Modify and return the response based on request attributes',
  '',
  '  return response;',
  '}'
].join('\n');

const SNIPPETS: [string, string][] = [
  [
    'Echo args',
    [
      'function modifyResponse(args) {',
      '  const { method, url, requestData, responseJSON } = args;',
      '  console.log("method:", method, "url:", url);',
      '  return { echoed: requestData, url, method, ts: Date.now() };',
      '}'
    ].join('\n')
  ],
  [
    'Random ID',
    [
      'function modifyResponse(args) {',
      '  return { id: Math.random().toString(36).slice(2), ts: new Date().toISOString() };',
      '}'
    ].join('\n')
  ],
  [
    'Modify JSON',
    [
      'function modifyResponse(args) {',
      '  const { responseJSON } = args;',
      '  // Mutate the parsed response and return it',
      '  if (Array.isArray(responseJSON)) {',
      '    return responseJSON.slice(0, 1);',
      '  }',
      '  return { ...responseJSON, __mocked: true };',
      '}'
    ].join('\n')
  ],
  [
    'GQL response',
    [
      'function modifyResponse(args) {',
      "  const operationName = args.requestData?.operationName || 'result';",
      '  return { data: { [operationName]: { id: 1, ok: true } } };',
      '}'
    ].join('\n')
  ],
  [
    'Paginated',
    [
      'function modifyResponse(args) {',
      '  const page = args.requestData?.page || 1;',
      '  const size = 10;',
      '  return {',
      '    items: Array.from({ length: size }, (_, i) => ({ id: (page - 1) * size + i + 1 })),',
      '    total: 100,',
      '    page',
      '  };',
      '}'
    ].join('\n')
  ],
  [
    'Error body',
    ['function modifyResponse(args) {', "  return { error: 'Not found', code: 'NOT_FOUND' };", '}'].join('\n')
  ]
];

// Mock args object used when running the script live in the editor —
// mirrors the shape passed to modifyResponse(args) at runtime
const MOCK_ARGS = {
  method: 'GET',
  url: 'https://api.example.com/mock',
  response: '[{"id":1,"name":"Mock User"}]',
  responseType: 'json',
  requestHeaders: { 'content-type': 'application/json' },
  requestData: null,
  responseJSON: [{ id: 1, name: 'Mock User' }]
};

type LogLevel = 'log' | 'warn' | 'error' | 'info';

interface LogEntry {
  level: LogLevel;
  args: string;
}

interface RunResult {
  returnValue: string | null;
  logs: LogEntry[];
  error: string | null;
}

// Runs the dynamic code with a sandboxed console, returns logs + return value
function runDynamic(code: string): RunResult {
  const logs: LogEntry[] = [];

  const sandboxedConsole = (['log', 'warn', 'error', 'info'] as LogLevel[]).reduce(
    (acc, level) => {
      acc[level] = (...args: unknown[]) => {
        logs.push({
          level,
          args: args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' ')
        });
      };
      return acc;
    },
    {} as Record<LogLevel, (...args: unknown[]) => void>
  );

  try {
    // Wrap the user code so modifyResponse is defined, then call it with MOCK_ARGS
    // eslint-disable-next-line no-new-func
    const fn = new Function('args', 'console', code + '\n; return modifyResponse(args);');
    const result = fn(MOCK_ARGS, sandboxedConsole);
    return {
      returnValue: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      logs,
      error: null
    };
  } catch (e: any) {
    return { returnValue: null, logs, error: e.message };
  }
}

// ── Editor ────────────────────────────────────────────────────────────────────
interface Props {
  rule: MockRule;
  onSave: (updated: MockRule) => void;
}

export function Editor({ rule, onSave }: Props) {
  const form = useSignal<MockRule>({ ...rule });
  const activeTab = useSignal<ResponseType>(rule.responseType ?? 'static');
  const dirty = useSignal(false);

  // Live console output — re-computed every time dynamic code changes
  const consoleResult = useSignal<RunResult>({ returnValue: null, logs: [], error: null });

  useEffect(() => {
    form.value = { ...rule };
    activeTab.value = rule.responseType ?? 'static';
    dirty.value = false;
    // Run once on load if dynamic
    if ((rule.responseType === 'dynamic' || rule.dynamicCode?.trim()) && rule.dynamicCode?.trim()) {
      consoleResult.value = runDynamic(rule.dynamicCode);
    } else {
      consoleResult.value = { returnValue: null, logs: [], error: null };
    }
  }, [rule]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  const set = (patch: Partial<MockRule>) => {
    form.value = { ...form.value, ...patch };
    dirty.value = true;
    // Re-run dynamic code live whenever it changes
    if ('dynamicCode' in patch) {
      const code = (patch.dynamicCode ?? '').trim();
      consoleResult.value = code ? runDynamic(code) : { returnValue: null, logs: [], error: null };
    }
  };

  const switchTab = (tab: ResponseType) => {
    activeTab.value = tab;
    dirty.value = true;
    if (tab === 'dynamic' && !form.value.dynamicCode?.trim()) {
      form.value = { ...form.value, dynamicCode: DEFAULT_TEMPLATE };
      consoleResult.value = runDynamic(DEFAULT_TEMPLATE);
    }
  };

  const isGQL = form.value.type === 'graphql';

  function handleSave() {
    if (!form.value.name.trim()) return showToast('⚠️ Name is required');
    if (!form.value.urlPattern.trim()) return showToast('⚠️ URL pattern is required');

    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const rawHeaders = typeof form.value.headers === 'string' ? form.value.headers : JSON.stringify(form.value.headers);
    try {
      headers = JSON.parse(rawHeaders);
    } catch {
      return showToast('⚠️ Headers must be valid JSON');
    }

    if (activeTab.value === 'static' && form.value.responseBody.trim()) {
      try {
        JSON.parse(form.value.responseBody);
      } catch {
        return showToast('⚠️ Response body must be valid JSON');
      }
    }

    onSave({
      ...form.value,
      method: isGQL ? 'POST' : form.value.method,
      responseType: activeTab.value,
      headers,
      updatedAt: Date.now()
    });
    dirty.value = false;
  }

  function handleDiscard() {
    form.value = { ...rule };
    activeTab.value = rule.responseType ?? 'static';
    dirty.value = false;
  }

  const headersStr =
    typeof form.value.headers === 'object'
      ? JSON.stringify(form.value.headers, null, 2)
      : (form.value.headers as string) || '{"Content-Type": "application/json"}';

  const jsonPreview = (() => {
    const raw = form.value.responseBody?.trim();
    if (!raw) return { text: '—', err: false };
    try {
      return { text: JSON.stringify(JSON.parse(raw), null, 2), err: false };
    } catch (e: any) {
      return { text: 'JSON error: ' + e.message, err: true };
    }
  })();

  return (
    <div class={styles.shell}>
      <div class={styles.scroll}>
        <div class={styles.form}>
          {/* ── Basics ─────────────────────────────────────────────────────── */}
          <div>
            <div class={styles.sectionTitle}>Basics</div>
            <div class={styles.fields}>
              <div class={styles.field}>
                <label>Rule Name</label>
                <input
                  class={styles.nameInput}
                  type="text"
                  value={form.value.name}
                  placeholder="e.g. Mock users API"
                  onInput={(e) => set({ name: (e.target as HTMLInputElement).value })}
                />
              </div>

              <div class={styles.row2}>
                <div class={styles.field}>
                  <label>API Type</label>
                  <select
                    value={form.value.type}
                    onChange={(e) => {
                      const type = (e.target as HTMLSelectElement).value as MockRule['type'];
                      set({ type, method: type === 'graphql' ? 'POST' : '*' });
                    }}
                  >
                    <option value="rest">REST</option>
                    <option value="graphql">GraphQL</option>
                  </select>
                </div>

                <div class={styles.field}>
                  <label>{isGQL ? 'Method (GraphQL is always POST)' : 'Method'}</label>
                  <select
                    value={isGQL ? 'POST' : form.value.method}
                    disabled={isGQL}
                    onChange={(e) => set({ method: (e.target as HTMLSelectElement).value as HttpMethod })}
                  >
                    <option value="*">Any</option>
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
              </div>

              <div class={styles.field}>
                <label>URL Pattern</label>
                <input
                  type="text"
                  value={form.value.urlPattern}
                  placeholder="https://api.example.com/users/* or *jsonplaceholder*users*"
                  onInput={(e) => set({ urlPattern: (e.target as HTMLInputElement).value })}
                />
                <div class="hint">
                  Use <code>*</code> as wildcard. Matched against the full request URL.
                </div>
              </div>

              {isGQL && (
                <div class={styles.field}>
                  <label>GraphQL Operation Name</label>
                  <input
                    type="text"
                    value={form.value.graphqlOperation}
                    placeholder="e.g. GetUser, ListPosts"
                    onInput={(e) => set({ graphqlOperation: (e.target as HTMLInputElement).value })}
                  />
                  <div class="hint">
                    Matches <code>operationName</code> in the request body. Leave empty to match all operations.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Response ────────────────────────────────────────────────────── */}
          <div>
            <div class={styles.sectionTitle}>Response</div>
            <div class={styles.fields}>
              <div class={styles.field}>
                <label>Response Type</label>
                <div class={styles.radioGroup}>
                  <label class={`${styles.radioOption} ${activeTab.value === 'static' ? styles.radioSelected : ''}`}>
                    <input
                      type="radio"
                      name="responseType"
                      value="static"
                      checked={activeTab.value === 'static'}
                      onChange={() => switchTab('static')}
                    />
                    <span class={styles.radioMark} />
                    <span class={styles.radioLabel}>
                      <span class={styles.radioTitle}>📄 Static JSON</span>
                      <span class={styles.radioDesc}>Fixed JSON response body</span>
                    </span>
                  </label>

                  <label class={`${styles.radioOption} ${activeTab.value === 'dynamic' ? styles.radioSelected : ''}`}>
                    <input
                      type="radio"
                      name="responseType"
                      value="dynamic"
                      checked={activeTab.value === 'dynamic'}
                      onChange={() => switchTab('dynamic')}
                    />
                    <span class={styles.radioMark} />
                    <span class={styles.radioLabel}>
                      <span class={styles.radioTitle}>⚡ Dynamic JS</span>
                      <span class={styles.radioDesc}>JavaScript function — modify response at runtime</span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Static panel */}
              {activeTab.value === 'static' && (
                <div>
                  <div class={styles.field}>
                    <label>Response Body — JSON</label>
                    <div class={styles.codeWrap}>
                      <span class={styles.codeLang}>JSON</span>
                      <textarea
                        class={styles.code}
                        rows={8}
                        value={form.value.responseBody}
                        placeholder='{"success": true, "data": []}'
                        onInput={(e) => set({ responseBody: (e.target as HTMLTextAreaElement).value })}
                      />
                    </div>
                  </div>
                  <div class={styles.field} style="margin-top:10px">
                    <label>Preview</label>
                    <div class={`${styles.preview} ${jsonPreview.err ? styles.err : ''}`}>{jsonPreview.text}</div>
                  </div>
                </div>
              )}

              {/* Dynamic panel */}
              {activeTab.value === 'dynamic' && (
                <div class={styles.field}>
                  <label>JavaScript — function body</label>
                  <div class={styles.codeWrap}>
                    <span class={styles.codeLang}>JS</span>
                    <textarea
                      class={`${styles.code} ${styles.codeLg}`}
                      rows={10}
                      value={form.value.dynamicCode}
                      placeholder=""
                      onInput={(e) => set({ dynamicCode: (e.target as HTMLTextAreaElement).value })}
                    />
                  </div>
                  <div class={styles.snippets}>
                    {SNIPPETS.map(([label, code]) => (
                      <button key={label} class={styles.snip} onClick={() => set({ dynamicCode: code })}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div class="hint">
                    <code>args</code> contains: <code>method</code>, <code>url</code>, <code>response</code>,{' '}
                    <code>responseType</code>, <code>requestHeaders</code>, <code>requestData</code>,{' '}
                    <code>responseJSON</code>.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Options ─────────────────────────────────────────────────────── */}
          <div>
            <div class={styles.sectionTitle}>Options</div>
            <div class={styles.fields}>
              <div class={styles.row2}>
                <div class={styles.field}>
                  <label>HTTP Status</label>
                  <select
                    value={form.value.statusCode}
                    onChange={(e) => set({ statusCode: (e.target as HTMLSelectElement).value })}
                  >
                    {[
                      ['200', '200 OK'],
                      ['201', '201 Created'],
                      ['204', '204 No Content'],
                      ['400', '400 Bad Request'],
                      ['401', '401 Unauthorized'],
                      ['403', '403 Forbidden'],
                      ['404', '404 Not Found'],
                      ['422', '422 Unprocessable'],
                      ['429', '429 Too Many Requests'],
                      ['500', '500 Server Error'],
                      ['502', '502 Bad Gateway'],
                      ['503', '503 Unavailable']
                    ].map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div class={styles.field}>
                  <label>Delay (ms)</label>
                  <input
                    type="text"
                    value={form.value.delay}
                    placeholder="0"
                    onInput={(e) => set({ delay: (e.target as HTMLInputElement).value })}
                  />
                  <div class="hint">Simulates network latency</div>
                </div>
              </div>

              <div class={styles.field}>
                <label>Response Headers — JSON</label>
                <div class={styles.codeWrap}>
                  <span class={styles.codeLang}>JSON</span>
                  <textarea
                    class={styles.code}
                    rows={3}
                    value={headersStr}
                    placeholder='{"Content-Type": "application/json"}'
                    onInput={(e) => set({ headers: (e.target as HTMLTextAreaElement).value as any })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Test ────────────────────────────────────────────────────────── */}
        <div>
          <div class={styles.sectionTitle}>Test Rule</div>
          <div class={styles.fields}>
            <TestRunner rule={form.value} />
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div class={styles.saveBar}>
        <span class={`${styles.saveStatus} ${dirty.value ? styles.dirty : ''}`}>
          {dirty.value ? 'Unsaved changes' : 'All saved'}
        </span>
        <div class={styles.saveActions}>
          <button onClick={handleDiscard}>Discard</button>
          <button data-variant="inverted" onClick={handleSave}>
            Save Rule
          </button>
        </div>
      </div>
    </div>
  );
}
