const DASHBOARD = chrome.runtime.getURL('index.html');

chrome.action.onClicked.addListener(async () => {
  const [existing] = await chrome.tabs.query({ url: DASHBOARD });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: DASHBOARD });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_RULES') {
    chrome.storage.local.get(['mockRules', 'mockEnabled']).then((data) => {
      sendResponse({ rules: data.mockRules || [], enabled: data.mockEnabled ?? true });
    });
    return true;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: 'RULES_CHANGED' }).catch(() => {});
    }
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['mockRules', 'mockEnabled']).then((data) => {
    if (!data.mockRules) chrome.storage.local.set({ mockRules: [] });
    if (data.mockEnabled === undefined) chrome.storage.local.set({ mockEnabled: true });
  });
});
