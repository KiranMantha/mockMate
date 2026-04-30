/**
 * bridge.js — ISOLATED world
 * Has access to chrome.runtime. Uses window.postMessage to pass rules
 * to the MAIN world interceptor (postMessage crosses world boundaries,
 * CustomEvent does NOT — that was the v1 bug).
 */
(async function () {
  function sendToMain(type, payload) {
    window.postMessage({ __mockmate__: true, type, payload }, '*');
  }

  // Load rules and push to MAIN world immediately
  const data = await chrome.storage.local.get(['mockRules', 'mockEnabled']);
  sendToMain('INIT', {
    rules: data.mockRules || [],
    enabled: data.mockEnabled ?? true
  });

  // When rules change (user saved in dashboard), push fresh rules
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'RULES_CHANGED') {
      chrome.storage.local.get(['mockRules', 'mockEnabled']).then((fresh) => {
        sendToMain('UPDATE', {
          rules: fresh.mockRules || [],
          enabled: fresh.mockEnabled ?? true
        });
      });
    }
  });
})();
