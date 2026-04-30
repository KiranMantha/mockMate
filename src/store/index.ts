import { computed, signal } from '@preact/signals';
import type { MockRule } from '@types';

// ── Persisted state ───────────────────────────────────────────────────────────
export const rules = signal<MockRule[]>([]);
export const globalEnabled = signal<boolean>(true);

// ── UI state ──────────────────────────────────────────────────────────────────
export const selectedId = signal<string | null>(null);
export const searchQuery = signal<string>('');

// ── Derived ───────────────────────────────────────────────────────────────────
export const selectedRule = computed(() => rules.value.find((r) => r.id === selectedId.value) ?? null);

export const filteredRules = computed(() => {
  const q = searchQuery.value.toLowerCase();
  if (!q) return rules.value;
  return rules.value.filter((r) => r.name.toLowerCase().includes(q) || r.urlPattern.toLowerCase().includes(q));
});

// ── Storage helpers ───────────────────────────────────────────────────────────
export async function loadFromStorage(): Promise<void> {
  const data = await chrome.storage.local.get(['mockRules', 'mockEnabled']);
  rules.value = (data.mockRules ?? []) as MockRule[];
  globalEnabled.value = (data.mockEnabled ?? true) as boolean;
}

export async function persistRules(updated: MockRule[]): Promise<void> {
  rules.value = updated;
  await chrome.storage.local.set({ mockRules: updated });
}

export async function setGlobalEnabled(val: boolean): Promise<void> {
  globalEnabled.value = val;
  await chrome.storage.local.set({ mockEnabled: val });
}

// ── Rule actions ──────────────────────────────────────────────────────────────
export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function makeBlankRule(): MockRule {
  return {
    id: uid(),
    name: 'New Rule',
    type: 'rest',
    method: '*',
    urlPattern: '',
    graphqlOperation: '',
    responseType: 'static',
    responseBody: '{\n  "success": true\n}',
    dynamicCode: '',
    statusCode: '200',
    delay: '0',
    headers: { 'Content-Type': 'application/json' },
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export async function addRule(rule: MockRule): Promise<void> {
  await persistRules([rule, ...rules.value]);
  selectedId.value = rule.id;
}

export async function updateRule(updated: MockRule): Promise<void> {
  await persistRules(rules.value.map((r) => (r.id === updated.id ? updated : r)));
}

export async function deleteRule(id: string): Promise<void> {
  await persistRules(rules.value.filter((r) => r.id !== id));
  if (selectedId.value === id) selectedId.value = null;
}

export async function toggleRule(id: string, enabled: boolean): Promise<void> {
  await persistRules(rules.value.map((r) => (r.id === id ? { ...r, enabled, updatedAt: Date.now() } : r)));
}
