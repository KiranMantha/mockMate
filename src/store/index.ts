import { computed, signal } from '@preact/signals';
import type { MockRule, RuleGroup } from '@types';

// ── Persisted state ───────────────────────────────────────────────────────────
export const rules = signal<MockRule[]>([]);
export const groups = signal<RuleGroup[]>([]);
export const globalEnabled = signal<boolean>(true);

// ── UI state ──────────────────────────────────────────────────────────────────
export const selectedId = signal<string | null>(null);
export const searchQuery = signal<string>('');

// ── Derived ───────────────────────────────────────────────────────────────────
export const selectedRule = computed(() => rules.value.find((r) => r.id === selectedId.value) ?? null);

export const filteredRules = computed(() => {
  const query = searchQuery.value.toLowerCase();
  if (!query) return rules.value;
  return rules.value.filter(
    (rule) => rule.name.toLowerCase().includes(query) || rule.urlPattern.toLowerCase().includes(query)
  );
});

// ── Storage helpers ───────────────────────────────────────────────────────────
export async function loadFromStorage(): Promise<void> {
  const data = await chrome.storage.local.get(['mockRules', 'mockEnabled', 'mockGroups']);
  rules.value = (data.mockRules as MockRule[]) ?? [];
  groups.value = (data.mockGroups as RuleGroup[]) ?? [];
  globalEnabled.value = (data.mockEnabled as boolean) ?? true;
}

export async function persistRules(updated: MockRule[]): Promise<void> {
  rules.value = updated;
  await chrome.storage.local.set({ mockRules: updated });
}

export async function persistGroups(updated: RuleGroup[]): Promise<void> {
  groups.value = updated;
  await chrome.storage.local.set({ mockGroups: updated });
}

export async function setGlobalEnabled(val: boolean): Promise<void> {
  globalEnabled.value = val;
  await chrome.storage.local.set({ mockEnabled: val });
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function makeBlankRule(): MockRule {
  return {
    id: uid(),
    groupId: '', // New field
    name: 'New Rule',
    type: 'rest',
    method: '*',
    urlPattern: '',
    graphqlOperation: '',
    responseType: 'static',
    responseBody: '{\n  "success": true\n}',
    dynamicCode: [
      'function modifyResponse(args) {',
      '  const { method, url, response, responseType, requestHeaders, requestData, responseJSON } = args;',
      '  return response;',
      '}'
    ].join('\n'),
    statusCode: '200',
    delay: '0',
    headers: { 'Content-Type': 'application/json' },
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

// ── Rule actions ──────────────────────────────────────────────────────────────
export async function addRule(rule: MockRule): Promise<void> {
  await persistRules([rule, ...rules.value]);
  selectedId.value = rule.id;
}

export async function updateRule(updated: MockRule): Promise<void> {
  await persistRules(
    rules.value.map((rule) => (rule.id === updated.id ? { ...updated, updatedAt: Date.now() } : rule))
  );
}

export async function deleteRule(id: string): Promise<void> {
  await persistRules(rules.value.filter((rule) => rule.id !== id));
  if (selectedId.value === id) selectedId.value = null;
}

export async function toggleRule(id: string, enabled: boolean): Promise<void> {
  await persistRules(rules.value.map((rule) => (rule.id === id ? { ...rule, enabled, updatedAt: Date.now() } : rule)));
}

// ── Group actions ─────────────────────────────────────────────────────────────
export async function addGroup(name: string): Promise<void> {
  const newGroup: RuleGroup = {
    id: uid(),
    name,
    enabled: true
  };
  await persistGroups([...groups.value, newGroup]);
}

export async function deleteGroup(groupId: string): Promise<void> {
  // 1. Remove the group
  await persistGroups(groups.value.filter((group) => group.id !== groupId));
  // 2. Orphan the rules (move them back to "Ungrouped")
  await persistRules(rules.value.map((rule) => (rule.groupId === groupId ? { ...rule, groupId: '' } : rule)));
}

/**
 * Toggles all rules within a group.
 * If you also want to persist the group's "enabled" status itself,
 * we update both rules and the group metadata.
 */
export async function toggleGroup(groupId: string, enabled: boolean): Promise<void> {
  // Update group status
  await persistGroups(groups.value.map((group) => (group.id === groupId ? { ...group, enabled } : group)));
  // Update all rules belonging to this group
  await persistRules(
    rules.value.map((rule) => (rule.groupId === groupId ? { ...rule, enabled, updatedAt: Date.now() } : rule))
  );
}

export async function renameGroup(groupId: string, name: string): Promise<void> {
  await persistGroups(groups.value.map((group) => (group.id === groupId ? { ...group, name } : group)));
}

export async function resetAll() {
  await chrome.storage.local.set({ mockRules: [], mockGroups: [] });
  rules.value = [];
  groups.value = [];
  selectedId.value = null;
}
