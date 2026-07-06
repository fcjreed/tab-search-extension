// Listen for the Ctrl+Space command
browser.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-tab-search") {
    // Get all open tabs
    const tabs = await browser.tabs.query({});
    const tabData = tabs
      .map((t) => ({
        id: t.id,
        title: t.title || "",
        url: t.url || "",
        favIconUrl: t.favIconUrl || "",
        windowId: t.windowId,
        lastAccessed: t.lastAccessed || 0,
      }))
      .sort((a, b) => b.lastAccessed - a.lastAccessed);

    // Send to content script in active tab
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (activeTab) {
      browser.tabs.sendMessage(activeTab.id, {
        action: "toggle",
        tabs: tabData,
        activeTabId: activeTab.id,
      });
    }
  }
});

// Single action-dispatch listener for all content-script messages
browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "switchTab") {
    browser.tabs.update(msg.tabId, { active: true });
    browser.windows.update(msg.windowId, { focused: true });
    return false;
  }

  if (msg.action === "closeTab") {
    browser.tabs.remove(msg.tabId);
    return false;
  }

  if (msg.action === "closeDuplicateTabs") {
    browser.tabs.query({})
      .then((tabs) => {
        const activeTabId = msg.activeTabId;
        const urlMap = new Map();
        for (const t of tabs) {
          if (!urlMap.has(t.url)) urlMap.set(t.url, []);
          urlMap.get(t.url).push(t);
        }
        const toClose = [];
        for (const group of urlMap.values()) {
          if (group.length <= 1) continue;
          const activeInGroup = group.find((t) => t.id === activeTabId);
          const keepId = activeInGroup
            ? activeInGroup.id
            : group.reduce((best, t) =>
                (t.lastAccessed || 0) > (best.lastAccessed || 0) ? t : best
              ).id;
          for (const t of group) {
            if (t.id !== keepId) toClose.push(t.id);
          }
        }
        if (toClose.length === 0) {
          sendResponse({ closedTabIds: [] });
          return;
        }
        return browser.tabs.remove(toClose).then(() => {
          sendResponse({ closedTabIds: toClose });
        });
      })
      .catch((err) => {
        sendResponse({ error: err.message, closedTabIds: [] });
      });
    return true; // keep channel open for async response
  }

  return false;
});
