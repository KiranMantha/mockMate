// dashboard.js
const $ = (id) => document.getElementById(id);

// ── State ──────────────────────────────────────────────────────────────────────
let rules = [],
  globalEnabled = true,
  selectedId = null,
  isDirty = false,
  activeTab = "static";
let confirmCb = null,
  currentEnabled = true;

// ── Load ───────────────────────────────────────────────────────────────────────
(async () => {
  const d = await chrome.storage.local.get(["mockRules", "mockEnabled"]);
  rules = d.mockRules || [];
  globalEnabled = d.mockEnabled ?? true;
  $("globalToggle").checked = globalEnabled;
  updateGlobalUI();
  renderList();
  wire();
  buildSnippets();
})();

// ── Wire events ────────────────────────────────────────────────────────────────
function wire() {
  $("globalToggle").addEventListener("change", onGlobalToggle);
  $("btnNew").addEventListener("click", newRule);
  $("btnNewW").addEventListener("click", newRule);
  $("btnImport").addEventListener("click", () => $("fileInput").click());
  $("btnExport").addEventListener("click", exportRules);
  $("fileInput").addEventListener("change", importRules);
  $("search").addEventListener("input", renderList);
  $("btnSave").addEventListener("click", saveRule);
  $("btnDiscard").addEventListener("click", discardChanges);
  $("fType").addEventListener("change", () => {
    syncGqlField();
    markDirty();
  });
  $("tabStatic").addEventListener("click", () => setTab("static"));
  $("tabDynamic").addEventListener("click", () => setTab("dynamic"));
  $("fBody").addEventListener("input", () => {
    updatePreview();
    markDirty();
  });
  [
    "fName",
    "fMethod",
    "fUrl",
    "fGqlOp",
    "fCode",
    "fStatus",
    "fDelay",
    "fHeaders",
  ].forEach((id) => {
    $(id).addEventListener("input", markDirty);
    $(id).addEventListener("change", markDirty);
  });
  $("confirmNo").addEventListener("click", () => closeOverlay());
  $("confirmYes").addEventListener("click", () => {
    closeOverlay();
    confirmCb?.();
  });
  $("overlay").addEventListener("click", (e) => {
    if (e.target === $("overlay")) closeOverlay();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveRule();
    }
  });
}

// ── Global toggle ──────────────────────────────────────────────────────────────
async function onGlobalToggle() {
  globalEnabled = $("globalToggle").checked;
  await chrome.storage.local.set({ mockEnabled: globalEnabled });
  updateGlobalUI();
  toast(globalEnabled ? "✅ MockMate enabled" : "⏸ MockMate paused");
}
function updateGlobalUI() {
  const on = globalEnabled;
  $("sdot").className = "sdot" + (on ? " on" : " off");
  $("glabel").textContent = on ? "Active" : "Paused";
}

// ── Rule list ──────────────────────────────────────────────────────────────────
function renderList() {
  const q = $("search").value.toLowerCase();
  const el = $("list");
  el.innerHTML = "";
  const filtered = rules.filter(
    (r) =>
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.urlPattern.toLowerCase().includes(q),
  );
  if (!filtered.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🎭</div><h3>No rules yet</h3></div>`;
    return;
  }
  filtered.forEach((r) => {
    const d = document.createElement("div");
    d.className =
      "rule-item" +
      (r.id === selectedId ? " active" : "") +
      (!r.enabled ? " dim" : "");
    d.innerHTML = `
      <div class="rule-info">
        <div class="rule-name">${esc(r.name)}</div>
        <div class="rule-url">${esc(r.urlPattern)}</div>
      </div>
      <label class="itoggle" title="Enable/disable">
        <input type="checkbox" ${r.enabled ? "checked" : ""}/>
        <div class="itrack"></div>
      </label>
      <div class="tags">
        <span class="tag ${r.type === "graphql" ? "tag-gql" : "tag-rest"}">${r.type === "graphql" ? "GQL" : "REST"}</span>
        ${r.responseType === "dynamic" ? '<span class="tag tag-js">JS</span>' : ""}
      </div>
      <button class="del-btn" title="Delete">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
      </button>`;
    d.querySelector(".itoggle input").addEventListener("change", (e) => {
      e.stopPropagation();
      quickToggle(r.id, e.target.checked);
    });
    d.querySelector(".del-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDelete(r.id, r.name);
    });
    d.addEventListener("click", (e) => {
      if (e.target.closest(".itoggle") || e.target.closest(".del-btn")) return;
      selectRule(r.id);
    });
    el.appendChild(d);
  });
}

// ── Select rule ────────────────────────────────────────────────────────────────
function selectRule(id) {
  if (isDirty && selectedId) {
    confirm2("Unsaved changes", "Discard changes to current rule?", () => {
      isDirty = false;
      doSelect(id);
    });
    return;
  }
  doSelect(id);
}

function doSelect(id) {
  selectedId = id;
  const r = rules.find((x) => x.id === id);
  if (!r) return showWelcome();
  currentEnabled = r.enabled ?? true;

  // topbar
  $("topTitle").textContent = r.name || "Unnamed";
  $("topSub").textContent = r.urlPattern || "";
  renderTopbar(r);

  // form
  $("fName").value = r.name || "";
  $("fType").value = r.type || "rest";
  $("fMethod").value = r.method || "*";
  $("fUrl").value = r.urlPattern || "";
  $("fGqlOp").value = r.graphqlOperation || "";
  $("fStatus").value = r.statusCode || "200";
  $("fDelay").value = r.delay || "0";
  $("fHeaders").value = r.headers
    ? JSON.stringify(r.headers, null, 2)
    : '{"Content-Type": "application/json"}';
  $("fBody").value = r.responseBody || "";
  $("fCode").value = r.dynamicCode || "";
  syncGqlField();
  setTab(r.responseType || "static", false);
  updatePreview();

  showEditor();
  isDirty = false;
  updateSaveBar();
  renderList();
}

function renderTopbar(r) {
  $("topActions").innerHTML = `
    <div class="rule-toggle-wrap ${r.enabled ? "on" : ""}" id="rtWrap">
      <span class="rule-toggle-label">${r.enabled ? "Enabled" : "Disabled"}</span>
      <label class="ptoggle" style="cursor:pointer">
        <input type="checkbox" id="rtCheck" ${r.enabled ? "checked" : ""}/>
        <div class="ptrack"></div>
      </label>
    </div>
    <button class="btn btn-danger" id="btnDelete">🗑 Delete</button>`;
  $("rtCheck").addEventListener("change", (e) => {
    const on = e.target.checked;
    currentEnabled = on;
    $("rtWrap").className = "rule-toggle-wrap" + (on ? " on" : "");
    $("rtWrap").querySelector(".rule-toggle-label").textContent = on
      ? "Enabled"
      : "Disabled";
    // instant-save enabled state
    const idx = rules.findIndex((x) => x.id === selectedId);
    if (idx !== -1) {
      rules[idx].enabled = on;
      persist();
      renderList();
    }
    toast(on ? "✅ Rule enabled" : "⏸ Rule disabled");
  });
  $("btnDelete").addEventListener("click", () =>
    confirmDelete(selectedId, rules.find((x) => x.id === selectedId)?.name),
  );
}

function showWelcome() {
  $("welcome").style.display = "flex";
  $("editor").style.display = "none";
  $("saveBar").style.display = "none";
  $("topTitle").textContent = "MockMate";
  $("topSub").textContent = "Select a rule or create a new one";
  $("topActions").innerHTML = "";
}
function showEditor() {
  $("welcome").style.display = "none";
  $("editor").style.display = "block";
  $("saveBar").style.display = "flex";
}

// ── New rule ───────────────────────────────────────────────────────────────────
function newRule() {
  const r = {
    id: uid(),
    name: "New Rule",
    type: "rest",
    method: "*",
    urlPattern: "",
    graphqlOperation: "",
    responseType: "static",
    responseBody: '{\n  "success": true\n}',
    dynamicCode: "",
    statusCode: "200",
    delay: "0",
    headers: { "Content-Type": "application/json" },
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  rules.unshift(r);
  persist();
  renderList();
  doSelect(r.id);
  setTimeout(() => {
    $("fName").focus();
    $("fName").select();
  }, 40);
}

// ── Save ───────────────────────────────────────────────────────────────────────
function saveRule() {
  if (!selectedId) return;
  const name = $("fName").value.trim();
  const url = $("fUrl").value.trim();
  if (!name) return toast("⚠️ Name is required");
  if (!url) return toast("⚠️ URL pattern is required");

  let headers = { "Content-Type": "application/json" };
  try {
    const h = $("fHeaders").value.trim();
    if (h) headers = JSON.parse(h);
  } catch {
    return toast("⚠️ Headers must be valid JSON");
  }

  if (activeTab === "static" && $("fBody").value.trim()) {
    try {
      JSON.parse($("fBody").value.trim());
    } catch {
      return toast("⚠️ Response body must be valid JSON");
    }
  }

  const idx = rules.findIndex((r) => r.id === selectedId);
  if (idx === -1) return;

  rules[idx] = {
    ...rules[idx],
    name,
    type: $("fType").value,
    method: $("fMethod").value,
    urlPattern: url,
    graphqlOperation: $("fGqlOp").value.trim(),
    responseType: activeTab,
    responseBody: $("fBody").value.trim(),
    dynamicCode: $("fCode").value.trim(),
    statusCode: $("fStatus").value,
    delay: $("fDelay").value || "0",
    headers,
    enabled: currentEnabled,
    updatedAt: Date.now(),
  };

  persist();
  isDirty = false;
  updateSaveBar();
  renderList();
  renderTopbar(rules[idx]);
  $("topTitle").textContent = name;
  $("topSub").textContent = url;
  toast("✅ Rule saved");
}

function discardChanges() {
  if (!selectedId) return;
  isDirty = false;
  doSelect(selectedId);
  toast("↩ Discarded");
}

function markDirty() {
  if (!selectedId) return;
  isDirty = true;
  updateSaveBar();
}

function updateSaveBar() {
  const s = $("saveStatus");
  s.textContent = isDirty ? "Unsaved changes" : "All saved";
  s.className = "save-status" + (isDirty ? " dirty" : "");
}

// ── Quick toggle (sidebar dot) ─────────────────────────────────────────────────
function quickToggle(id, on) {
  const idx = rules.findIndex((r) => r.id === id);
  if (idx === -1) return;
  rules[idx].enabled = on;
  rules[idx].updatedAt = Date.now();
  persist();
  renderList();
  if (selectedId === id) {
    currentEnabled = on;
    const wrap = $("rtWrap");
    if (wrap) {
      wrap.className = "rule-toggle-wrap" + (on ? " on" : "");
      wrap.querySelector(".rule-toggle-label").textContent = on
        ? "Enabled"
        : "Disabled";
      const cb = $("rtCheck");
      if (cb) cb.checked = on;
    }
  }
  toast(on ? "✅ Enabled" : "⏸ Disabled");
}

// ── Delete ─────────────────────────────────────────────────────────────────────
function confirmDelete(id, name) {
  confirm2("Delete rule?", `"${name}" will be permanently deleted.`, () => {
    rules = rules.filter((r) => r.id !== id);
    persist();
    if (selectedId === id) {
      selectedId = null;
      isDirty = false;
      showWelcome();
    }
    renderList();
    toast("🗑 Deleted");
  });
}

// ── Tabs ───────────────────────────────────────────────────────────────────────
function setTab(tab, dirty = false) {
  activeTab = tab;
  $("tabStatic").classList.toggle("active", tab === "static");
  $("tabDynamic").classList.toggle("active", tab === "dynamic");
  $("panelStatic").style.display = tab === "static" ? "block" : "none";
  $("panelDynamic").style.display = tab === "dynamic" ? "block" : "none";
  if (dirty) markDirty();
}
$("tabStatic").addEventListener("click", () => setTab("static", true));
$("tabDynamic").addEventListener("click", () => setTab("dynamic", true));

// ── Helpers ────────────────────────────────────────────────────────────────────
function syncGqlField() {
  $("gqlField").style.display = $("fType").value === "graphql" ? "" : "none";
}

function updatePreview() {
  const raw = $("fBody").value.trim();
  const el = $("preview");
  if (!raw) {
    el.textContent = "—";
    el.className = "preview";
    return;
  }
  try {
    el.textContent = JSON.stringify(JSON.parse(raw), null, 2);
    el.className = "preview";
  } catch (e) {
    el.textContent = "JSON error: " + e.message;
    el.className = "preview err";
  }
}

function buildSnippets() {
  const snips = [
    [
      "Echo body",
      "const { url, method, body } = request;\nreturn { echoed: body, url, method, ts: Date.now() };",
    ],
    [
      "Random ID",
      "return { id: Math.random().toString(36).slice(2), ts: new Date().toISOString() };",
    ],
    [
      "GQL response",
      "const { graphql } = request;\nreturn { data: { [graphql?.operationName || 'result']: { id: 1, ok: true } } };",
    ],
    [
      "Paginated",
      "const page = request.body?.page || 1, size = 10;\nreturn { items: Array.from({length:size},(_,i)=>({id:(page-1)*size+i+1})), total:100, page };",
    ],
    ["Error body", "return { error: 'Not found', code: 'NOT_FOUND' };"],
  ];
  const wrap = $("snippets");
  snips.forEach(([label, code]) => {
    const b = document.createElement("button");
    b.className = "snip";
    b.textContent = label;
    b.addEventListener("click", () => {
      $("fCode").value = code;
      markDirty();
    });
    wrap.appendChild(b);
  });
}

// ── Import / Export ────────────────────────────────────────────────────────────
function exportRules() {
  const blob = new Blob(
    [
      JSON.stringify(
        { version: 2, exportedAt: new Date().toISOString(), rules },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: `mockmate-${Date.now()}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
  toast("📦 Exported");
}

function importRules(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const d = JSON.parse(ev.target.result);
      const incoming = d.rules || (Array.isArray(d) ? d : []);
      const existing = new Set(rules.map((x) => x.id));
      const fresh = incoming.filter((x) => !existing.has(x.id));
      rules = [...fresh, ...rules];
      persist();
      renderList();
      toast(`✅ Imported ${fresh.length} rule(s)`);
    } catch {
      toast("❌ Invalid file");
    }
  };
  r.readAsText(file);
  e.target.value = "";
}

// ── Storage ────────────────────────────────────────────────────────────────────
async function persist() {
  await chrome.storage.local.set({ mockRules: rules });
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────
function confirm2(title, msg, cb) {
  $("confirmTitle").textContent = title;
  $("confirmMsg").textContent = msg;
  confirmCb = cb;
  $("overlay").classList.add("open");
}
function closeOverlay() {
  $("overlay").classList.remove("open");
}

// ── Toast ──────────────────────────────────────────────────────────────────────
let _t;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_t);
  _t = setTimeout(() => el.classList.remove("show"), 2500);
}

// ── Utils ──────────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
