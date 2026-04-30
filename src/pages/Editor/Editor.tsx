import { showToast } from '@components';
import { useSignal } from '@preact/signals';
import type { HttpMethod, MockRule, ResponseType } from '@types';
import { useEffect } from 'preact/hooks';
import styles from './Editor.module.scss';

const SNIPPETS: [string, string][] = [
  ['Echo body', 'const { url, method, body } = request;\nreturn { echoed: body, url, method, ts: Date.now() };'],
  ['Random ID', 'return { id: Math.random().toString(36).slice(2), ts: new Date().toISOString() };'],
  [
    'GQL response',
    "const { graphql } = request;\nreturn { data: { [graphql?.operationName || 'result']: { id: 1, ok: true } } };"
  ],
  [
    'Paginated',
    'const page = request.body?.page || 1, size = 10;\nreturn { items: Array.from({length:size},(_,i)=>({id:(page-1)*size+i+1})), total:100, page };'
  ],
  ['Error body', "return { error: 'Not found', code: 'NOT_FOUND' };"]
];

interface Props {
  rule: MockRule;
  onSave: (updated: MockRule) => void;
}

export function Editor({ rule, onSave }: Props) {
  // Local form state — decoupled from store until Save
  const form = useSignal<MockRule>({ ...rule });
  const activeTab = useSignal<ResponseType>(rule.responseType ?? 'static');
  const dirty = useSignal(false);

  // Re-sync when a different rule is selected
  useEffect(() => {
    form.value = { ...rule };
    activeTab.value = rule.responseType ?? 'static';
    dirty.value = false;
  }, [rule.id]);

  // Cmd/Ctrl+S
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
  };

  const isGQL = form.value.type === 'graphql';
  // FIX 2: dynamic code present → always wins at runtime; show warning on static tab
  const hasDynamic = (form.value.dynamicCode ?? '').trim().length > 0;
  const dynamicOverride = activeTab.value === 'static' && hasDynamic;

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
                      // FIX 1: switching to GQL auto-locks method to POST
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
                <div class={styles.hint}>
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
                  <div class={styles.hint}>
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
                <div class={styles.respTabs}>
                  <button
                    class={`${styles.tab} ${activeTab.value === 'static' ? styles.active : ''}`}
                    onClick={() => {
                      activeTab.value = 'static';
                      dirty.value = true;
                    }}
                  >
                    📄 Static JSON
                  </button>
                  <button
                    class={`${styles.tab} ${activeTab.value === 'dynamic' ? styles.active : ''}`}
                    onClick={() => {
                      activeTab.value = 'dynamic';
                      dirty.value = true;
                    }}
                  >
                    ⚡ Dynamic JS
                  </button>
                </div>
              </div>

              {/* FIX 2: warn when dynamic code will override static */}
              {dynamicOverride && (
                <div class={styles.note}>
                  ⚡ Dynamic JS code is present — it will take precedence over the static JSON body at runtime.
                </div>
              )}

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

              {activeTab.value === 'dynamic' && (
                <div class={styles.field}>
                  <label>JavaScript — function body</label>
                  <div class={styles.codeWrap}>
                    <span class={styles.codeLang}>JS</span>
                    <textarea
                      class={`${styles.code} ${styles.codeLg}`}
                      rows={10}
                      value={form.value.dynamicCode}
                      placeholder={
                        '// request = { url, method, body, headers, graphql }\nreturn { success: true, ts: Date.now() };'
                      }
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
                  <div class={styles.hint}>
                    Receives <code>request</code> object. Return value becomes the response body.
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
                  <div class={styles.hint}>Simulates network latency</div>
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
      </div>

      {/* Save bar */}
      <div class={styles.saveBar}>
        <span class={`${styles.saveStatus} ${dirty.value ? styles.dirty : ''}`}>
          {dirty.value ? 'Unsaved changes' : 'All saved'}
        </span>
        <div class={styles.saveActions}>
          <button class={styles.btnDiscard} onClick={handleDiscard}>
            Discard
          </button>
          <button class={styles.btnSave} onClick={handleSave}>
            Save Rule
          </button>
        </div>
      </div>
    </div>
  );
}
