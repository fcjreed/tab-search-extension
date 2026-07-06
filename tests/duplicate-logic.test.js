/**
 * Unit tests for duplicate-tab logic extracted from background.js and content.js.
 * Run with: node tests/duplicate-logic.test.js
 */

"use strict";

const assert = require("node:assert/strict");

// ---------------------------------------------------------------------------
// Logic extracted verbatim from background.js: computeTabsToClose()
// ---------------------------------------------------------------------------
function computeTabsToClose(tabs, activeTabId) {
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
  return toClose;
}

// ---------------------------------------------------------------------------
// Logic extracted verbatim from content.js: getDuplicateCount()
// ---------------------------------------------------------------------------
function getDuplicateCount(allTabs) {
  const urlMap = new Map();
  for (const t of allTabs) {
    if (!urlMap.has(t.url)) urlMap.set(t.url, []);
    urlMap.get(t.url).push(t);
  }
  let count = 0;
  for (const group of urlMap.values()) {
    if (group.length > 1) count += group.length - 1;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let _nextId = 1;
function tab(url, { id, lastAccessed = 0, active = false } = {}) {
  return { id: id ?? _nextId++, url, lastAccessed, active };
}

function pass(name) { console.log(`  ✓ ${name}`); }

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

// 1. Exact-URL duplicate counting
(function testDuplicateCounting() {
  console.log("\n[1] Exact-URL duplicate counting");

  // No duplicates
  {
    const tabs = [tab("https://a.com"), tab("https://b.com")];
    assert.equal(getDuplicateCount(tabs), 0);
    pass("No duplicates → count = 0");
  }

  // Single duplicate pair
  {
    const tabs = [tab("https://a.com"), tab("https://a.com")];
    assert.equal(getDuplicateCount(tabs), 1);
    pass("2 identical URLs → count = 1");
  }

  // Triple duplicate
  {
    const tabs = [tab("https://a.com"), tab("https://a.com"), tab("https://a.com")];
    assert.equal(getDuplicateCount(tabs), 2);
    pass("3 identical URLs → count = 2");
  }

  // Multiple groups
  {
    const tabs = [
      tab("https://a.com"), tab("https://a.com"),
      tab("https://b.com"), tab("https://b.com"), tab("https://b.com"),
      tab("https://c.com"),
    ];
    assert.equal(getDuplicateCount(tabs), 1 + 2);
    pass("2 groups (2+3 dupes) + 1 unique → count = 3");
  }

  // Case-sensitive URL comparison (exact match only)
  {
    const tabs = [tab("https://A.com"), tab("https://a.com")];
    assert.equal(getDuplicateCount(tabs), 0);
    pass("Different-case URLs are NOT duplicates (exact match)");
  }

  // Fragment and query differences
  {
    const tabs = [tab("https://a.com/page"), tab("https://a.com/page?q=1")];
    assert.equal(getDuplicateCount(tabs), 0);
    pass("URL with query string vs without → not duplicates");
  }

  {
    const tabs = [tab("https://a.com/page#s1"), tab("https://a.com/page#s2")];
    assert.equal(getDuplicateCount(tabs), 0);
    pass("Different fragments → not duplicates");
  }

  {
    const tabs = [tab("https://a.com/page#s1"), tab("https://a.com/page#s1")];
    assert.equal(getDuplicateCount(tabs), 1);
    pass("Same URL including fragment → duplicates");
  }
})();


// 2. computeTabsToClose — close behavior
(function testCloseSet() {
  console.log("\n[2] computeTabsToClose — closure behavior");

  // No duplicates → nothing closed
  {
    const tabs = [tab("https://a.com", { id: 1 }), tab("https://b.com", { id: 2 })];
    assert.deepEqual(computeTabsToClose(tabs, 1), []);
    pass("No duplicates → toClose = []");
  }

  // Single pair: non-active tabs → most-recent survivor
  {
    const tabs = [
      tab("https://a.com", { id: 10, lastAccessed: 1000 }),
      tab("https://a.com", { id: 11, lastAccessed: 2000 }),
    ];
    const closed = computeTabsToClose(tabs, 99); // 99 = not in group
    assert.deepEqual(closed, [10]); // 10 has lower lastAccessed
    pass("Non-active group: most recently accessed tab survives");
  }

  // Single pair: active tab in group → active survives regardless of lastAccessed
  {
    const tabs = [
      tab("https://a.com", { id: 10, lastAccessed: 5000 }), // more recent but not active
      tab("https://a.com", { id: 11, lastAccessed: 1000 }),  // active
    ];
    const closed = computeTabsToClose(tabs, 11); // 11 is active
    assert.deepEqual(closed, [10]);
    pass("Active tab survives even if another has higher lastAccessed");
  }

  // Three tabs: active tab is one of the duplicates
  {
    const tabs = [
      tab("https://a.com", { id: 1, lastAccessed: 100 }),
      tab("https://a.com", { id: 2, lastAccessed: 200 }),  // active
      tab("https://a.com", { id: 3, lastAccessed: 300 }),
    ];
    const closed = computeTabsToClose(tabs, 2);
    assert.ok(closed.includes(1) && closed.includes(3));
    assert.ok(!closed.includes(2));
    assert.equal(closed.length, 2);
    pass("Active tab survives in 3-tab duplicate group; other 2 closed");
  }

  // Two separate groups: each closes all but survivor
  {
    const tabs = [
      tab("https://a.com", { id: 1, lastAccessed: 100 }),
      tab("https://a.com", { id: 2, lastAccessed: 200 }),
      tab("https://b.com", { id: 3, lastAccessed: 50  }),
      tab("https://b.com", { id: 4, lastAccessed: 300 }),
    ];
    const closed = computeTabsToClose(tabs, 99);
    assert.ok(closed.includes(1)); // a.com: keep 2 (more recent)
    assert.ok(closed.includes(3)); // b.com: keep 4 (more recent)
    assert.equal(closed.length, 2);
    pass("Two groups: correct survivor per group");
  }

  // Unique tab is never closed
  {
    const tabs = [
      tab("https://a.com", { id: 1, lastAccessed: 100 }),
      tab("https://a.com", { id: 2, lastAccessed: 200 }),
      tab("https://c.com", { id: 3, lastAccessed: 999 }), // unique
    ];
    const closed = computeTabsToClose(tabs, 99);
    assert.ok(!closed.includes(3));
    pass("Unique tab is never in toClose");
  }
})();


// 3. Survivor rule edge cases
(function testSurvivorEdgeCases() {
  console.log("\n[3] Survivor selection edge cases");

  // All lastAccessed = 0 → first tab in array survives (reduce never updates best)
  {
    const tabs = [
      tab("https://a.com", { id: 1, lastAccessed: 0 }),
      tab("https://a.com", { id: 2, lastAccessed: 0 }),
      tab("https://a.com", { id: 3, lastAccessed: 0 }),
    ];
    const closed = computeTabsToClose(tabs, 99);
    // reduce starts with first element as `best`; 0 > 0 is false so best never changes → id=1 survives
    assert.ok(!closed.includes(1), "First tab survives when all lastAccessed=0");
    assert.ok(closed.includes(2) && closed.includes(3));
    pass("All lastAccessed=0: first-in-array tab survives (deterministic)");
  }

  // Active tab keeps even when it's also the oldest
  {
    const tabs = [
      tab("https://a.com", { id: 1, lastAccessed: 9999 }),
      tab("https://a.com", { id: 2, lastAccessed: 1 }), // oldest, but active
    ];
    const closed = computeTabsToClose(tabs, 2);
    assert.deepEqual(closed, [1]);
    pass("Active tab (oldest) still kept over more-recent non-active tab");
  }

  // about:newtab treated as duplicates (expected per spec: exact URL match)
  {
    const tabs = [
      tab("about:newtab", { id: 1, lastAccessed: 100 }),
      tab("about:newtab", { id: 2, lastAccessed: 200 }),
    ];
    const closed = computeTabsToClose(tabs, 99);
    assert.deepEqual(closed, [1]);
    pass("about:newtab pages treated as duplicates (keep most recent)");
  }

  // about:blank treated as duplicates
  {
    const tabs = [
      tab("about:blank", { id: 1, lastAccessed: 100 }),
      tab("about:blank", { id: 2, lastAccessed: 200 }),
    ];
    const closed = computeTabsToClose(tabs, 99);
    assert.equal(closed.length, 1);
    pass("about:blank pages treated as duplicates");
  }
})();


// 4. Count / close parity: getDuplicateCount vs computeTabsToClose length
(function testCountCloseParity() {
  console.log("\n[4] Count / close parity: getDuplicateCount == toClose.length");

  const cases = [
    // [description, tabs, activeTabId]
    ["no dupes", [tab("https://a.com", {id:1}), tab("https://b.com", {id:2})], 99],
    ["2 dupes of same URL", [tab("https://a.com", {id:1}), tab("https://a.com", {id:2})], 99],
    ["3 dupes", [tab("https://a.com", {id:1}), tab("https://a.com", {id:2}), tab("https://a.com", {id:3})], 99],
    ["2 groups", [
      tab("https://a.com", {id:1}), tab("https://a.com", {id:2}),
      tab("https://b.com", {id:3}), tab("https://b.com", {id:4}),
    ], 99],
    ["active in dupe group", [
      tab("https://a.com", {id:1}), tab("https://a.com", {id:2}),
    ], 1],
  ];

  for (const [desc, tabs, activeTabId] of cases) {
    const count = getDuplicateCount(tabs);
    const closed = computeTabsToClose(tabs, activeTabId);
    assert.equal(
      count, closed.length,
      `Parity failed for "${desc}": count=${count} vs toClose=${closed.length}`
    );
    pass(`Parity holds for: ${desc}`);
  }
})();


// 5. No-duplicate UI state
(function testNoDuplicateState() {
  console.log("\n[5] No-duplicate state");

  {
    const tabs = [tab("https://a.com"), tab("https://b.com"), tab("https://c.com")];
    assert.equal(getDuplicateCount(tabs), 0);
    pass("All unique URLs → count = 0 (button should show 'No Duplicates', disabled)");
  }

  {
    const tabs = [];
    assert.equal(getDuplicateCount(tabs), 0);
    pass("Empty tab list → count = 0");
  }

  {
    const tabs = [tab("https://a.com")];
    assert.equal(getDuplicateCount(tabs), 0);
    pass("Single tab → count = 0");
  }
})();


// 6. Post-close state: tabs removed from allTabs should update count
(function testPostCloseUpdate() {
  console.log("\n[6] Post-close state update");

  {
    let allTabs = [
      tab("https://a.com", { id: 1 }),
      tab("https://a.com", { id: 2 }),
      tab("https://b.com", { id: 3 }),
    ];
    assert.equal(getDuplicateCount(allTabs), 1);

    // Simulate closeTab(2): remove from allTabs
    const closedSet = new Set([2]);
    allTabs = allTabs.filter((t) => !closedSet.has(t.id));
    assert.equal(getDuplicateCount(allTabs), 0);
    pass("After individual close removes duplicate, count drops to 0");
  }

  {
    let allTabs = [
      tab("https://a.com", { id: 1 }),
      tab("https://a.com", { id: 2 }),
      tab("https://a.com", { id: 3 }),
    ];
    assert.equal(getDuplicateCount(allTabs), 2);

    // Simulate closeDuplicateTabs response: remove closed ids
    const closedSet = new Set([1, 2]);
    allTabs = allTabs.filter((t) => !closedSet.has(t.id));
    assert.equal(getDuplicateCount(allTabs), 0);
    pass("After batch close response removes duplicates, count drops to 0");
  }
})();


// 7. Cross-window: tabs from multiple windowIds all considered
(function testCrossWindowGrouping() {
  console.log("\n[7] Cross-window grouping");

  {
    const tabs = [
      { id: 1, url: "https://a.com", lastAccessed: 100, windowId: 1 },
      { id: 2, url: "https://a.com", lastAccessed: 200, windowId: 2 }, // different window
    ];
    const count = getDuplicateCount(tabs);
    const closed = computeTabsToClose(tabs, 99);
    assert.equal(count, 1);
    assert.deepEqual(closed, [1]); // tab 2 has higher lastAccessed
    pass("Tabs in different windows are grouped by URL: cross-window duplicate detected");
  }
})();


// ---------------------------------------------------------------------------
// 8. Single merged onMessage listener — action dispatch routing
// ---------------------------------------------------------------------------
(function testOnMessageRouting() {
  console.log("\n[8] Single onMessage listener — action routing");

  // Simulate the background listener dispatch table
  const calls = [];
  const mockBrowser = {
    tabs: {
      update: (tabId, opts) => { calls.push({ fn: "tabs.update", tabId, opts }); return Promise.resolve(); },
      remove: (tabId) => { calls.push({ fn: "tabs.remove", tabId }); return Promise.resolve(); },
      query: () => Promise.resolve([]),
    },
    windows: {
      update: (windowId, opts) => { calls.push({ fn: "windows.update", windowId, opts }); return Promise.resolve(); },
    },
  };

  function dispatchMessage(msg, sendResponse) {
    if (msg.action === "switchTab") {
      mockBrowser.tabs.update(msg.tabId, { active: true });
      mockBrowser.windows.update(msg.windowId, { focused: true });
      return false;
    }
    if (msg.action === "closeTab") {
      mockBrowser.tabs.remove(msg.tabId);
      return false;
    }
    if (msg.action === "closeDuplicateTabs") {
      mockBrowser.tabs.query({})
        .then((tabs) => {
          sendResponse({ closedTabIds: [] });
        })
        .catch((err) => {
          sendResponse({ error: err.message, closedTabIds: [] });
        });
      return true;
    }
    return false;
  }

  // switchTab dispatches both tab and window update
  {
    calls.length = 0;
    const ret = dispatchMessage({ action: "switchTab", tabId: 5, windowId: 2 }, () => {});
    assert.equal(ret, false, "switchTab returns false (sync)");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].fn, "tabs.update");
    assert.equal(calls[0].tabId, 5);
    assert.equal(calls[1].fn, "windows.update");
    assert.equal(calls[1].windowId, 2);
    pass("switchTab: routes to tabs.update + windows.update, returns false");
  }

  // closeTab dispatches tab remove
  {
    calls.length = 0;
    const ret = dispatchMessage({ action: "closeTab", tabId: 7 }, () => {});
    assert.equal(ret, false, "closeTab returns false (sync)");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].fn, "tabs.remove");
    assert.equal(calls[0].tabId, 7);
    pass("closeTab: routes to tabs.remove, returns false");
  }

  // closeDuplicateTabs keeps channel open
  {
    calls.length = 0;
    const ret = dispatchMessage({ action: "closeDuplicateTabs", activeTabId: 1 }, () => {});
    assert.equal(ret, true, "closeDuplicateTabs returns true (async)");
    pass("closeDuplicateTabs: returns true (keeps message channel open)");
  }

  // Unknown actions fall through cleanly
  {
    const ret = dispatchMessage({ action: "unknownAction" }, () => {});
    assert.equal(ret, false, "Unknown action returns false");
    pass("Unknown action: returns false without side-effects");
  }
})();


// ---------------------------------------------------------------------------
// 9. closeDuplicateTabs background-failure response handling (content.js path)
// ---------------------------------------------------------------------------
(function testCloseDupesResponseHandling() {
  console.log("\n[9] closeDuplicateTabs response handling (content.js)");

  // Simulate the content.js .then() handler
  function applyResponse(allTabs, tabs, response) {
    if (!response || !response.closedTabIds) return { allTabs: [...allTabs], tabs: [...tabs] };
    const closedSet = new Set(response.closedTabIds);
    return {
      allTabs: allTabs.filter((t) => !closedSet.has(t.id)),
      tabs: tabs.filter((t) => !closedSet.has(t.id)),
    };
  }

  const base = [
    { id: 1, url: "https://a.com" },
    { id: 2, url: "https://a.com" },
    { id: 3, url: "https://b.com" },
  ];

  // Normal success
  {
    const result = applyResponse(base, base, { closedTabIds: [1] });
    assert.equal(result.allTabs.length, 2);
    assert.ok(!result.allTabs.find((t) => t.id === 1));
    pass("Success response: closed tab removed from allTabs");
  }

  // Empty closedTabIds (e.g., no duplicates found by background, or error path returns [])
  {
    const result = applyResponse(base, base, { closedTabIds: [] });
    assert.equal(result.allTabs.length, 3, "Empty closedTabIds leaves allTabs unchanged");
    pass("Empty closedTabIds array: UI state unchanged (correct no-op)");
  }

  // Error response from background catch: { error, closedTabIds: [] }
  {
    const result = applyResponse(base, base, { error: "tabs.remove failed", closedTabIds: [] });
    assert.equal(result.allTabs.length, 3, "Error response with empty closedTabIds: UI unchanged");
    pass("Background error response (closedTabIds:[]): UI left intact for retry");
  }

  // Null / undefined response (channel failure → .catch() fires, not .then())
  // The .then() guard: !response || !response.closedTabIds → returns early
  {
    const result = applyResponse(base, base, null);
    assert.equal(result.allTabs.length, 3);
    pass("Null response: guard returns early, UI unchanged");
  }

  {
    const result = applyResponse(base, base, undefined);
    assert.equal(result.allTabs.length, 3);
    pass("Undefined response: guard returns early, UI unchanged");
  }

  // Response with missing closedTabIds property
  {
    const result = applyResponse(base, base, { status: "ok" });
    assert.equal(result.allTabs.length, 3);
    pass("Response missing closedTabIds: guard returns early, UI unchanged");
  }
})();


// ---------------------------------------------------------------------------
// 10. Single-tab closeTab recovery — local state restoration
// ---------------------------------------------------------------------------
(function testCloseTabRecovery() {
  console.log("\n[10] closeTab optimistic-update recovery");

  // Simulate content.js closeTab() optimistic remove + rollback on failure
  function simulateCloseTab(allTabsIn, tabsIn, tabId) {
    const savedAllTab = allTabsIn.find((t) => t.id === tabId);
    const savedTab = tabsIn.find((t) => t.id === tabId);
    const allTabs = allTabsIn.filter((t) => t.id !== tabId);
    const tabs = tabsIn.filter((t) => t.id !== tabId);
    return { allTabs, tabs, savedAllTab, savedTab };
  }

  function simulateRecovery(allTabs, tabs, savedAllTab, savedTab) {
    const recovered = [...allTabs];
    const recoveredFiltered = [...tabs];
    if (savedAllTab) recovered.push(savedAllTab);
    if (savedTab) recoveredFiltered.push(savedTab);
    return { allTabs: recovered, tabs: recoveredFiltered };
  }

  // Recovery restores the tab to allTabs and tabs
  {
    const allTabs = [{ id: 1, url: "https://a.com" }, { id: 2, url: "https://b.com" }];
    const tabs = [{ id: 1, url: "https://a.com" }, { id: 2, url: "https://b.com" }];
    const { allTabs: after, tabs: afterFiltered, savedAllTab, savedTab } = simulateCloseTab(allTabs, tabs, 1);
    assert.equal(after.length, 1, "Optimistic remove reduces count");
    assert.ok(!after.find((t) => t.id === 1), "Tab removed optimistically");

    const { allTabs: recovered, tabs: recoveredTabs } = simulateRecovery(after, afterFiltered, savedAllTab, savedTab);
    assert.equal(recovered.length, 2, "Recovery restores tab count");
    assert.ok(recovered.find((t) => t.id === 1), "Removed tab is back in allTabs after recovery");
    assert.ok(recoveredTabs.find((t) => t.id === 1), "Removed tab is back in tabs after recovery");
    pass("Recovery: tab fully restored to allTabs and tabs after background failure");
  }

  // If tab not in tabs (active tab excluded from filtered list), recovery still updates allTabs
  {
    const allTabs = [{ id: 1, url: "https://a.com" }, { id: 2, url: "https://b.com" }];
    const tabs = [{ id: 2, url: "https://b.com" }]; // id:1 is active, excluded from tabs
    const { allTabs: after, tabs: afterFiltered, savedAllTab, savedTab } = simulateCloseTab(allTabs, tabs, 1);
    // savedTab is undefined because id:1 not in tabs
    assert.ok(savedAllTab, "savedAllTab captured even when not in filtered tabs");
    assert.equal(savedTab, undefined, "savedTab is undefined when tab not in filtered list");

    const { allTabs: recovered } = simulateRecovery(after, afterFiltered, savedAllTab, savedTab);
    assert.equal(recovered.length, 2, "allTabs restored correctly");
    assert.ok(recovered.find((t) => t.id === 1), "allTabs contains recovered tab");
    pass("Recovery: handles case where tab is active (not in filtered tabs array)");
  }

  // Recovery pushes to end of array (known behavior — cosmetic, not functional regression)
  {
    const allTabs = [{ id: 1, url: "https://a.com" }, { id: 2, url: "https://b.com" }, { id: 3, url: "https://c.com" }];
    const tabs = [...allTabs];
    const { allTabs: after, tabs: afterFiltered, savedAllTab, savedTab } = simulateCloseTab(allTabs, tabs, 2);
    const { allTabs: recovered } = simulateRecovery(after, afterFiltered, savedAllTab, savedTab);
    // Tab 2 was at index 1 but is now at the end
    const recoveredIdx = recovered.findIndex((t) => t.id === 2);
    assert.equal(recoveredIdx, recovered.length - 1, "Recovered tab appended at end (cosmetic reorder)");
    pass("Recovery appends at end of array — cosmetic reorder only, tab is present");
  }

  // Double-close guard: closing already-absent tab id returns no savedAllTab
  {
    const allTabs = [{ id: 2, url: "https://b.com" }];
    const tabs = [{ id: 2, url: "https://b.com" }];
    const { savedAllTab, savedTab } = simulateCloseTab(allTabs, tabs, 99); // id:99 doesn't exist
    assert.equal(savedAllTab, undefined);
    assert.equal(savedTab, undefined);
    // Recovery with undefined saves is a no-op
    const { allTabs: recovered } = simulateRecovery([{ id: 2, url: "https://b.com" }], [{ id: 2, url: "https://b.com" }], savedAllTab, savedTab);
    assert.equal(recovered.length, 1);
    pass("Closing non-existent tab id: save is undefined, recovery is a no-op");
  }
})();


// ---------------------------------------------------------------------------
// 11. Confirmation text scope validation
// ---------------------------------------------------------------------------
(function testConfirmationText() {
  console.log("\n[11] Confirmation text cross-window scope");

  // Simulate the confirm string generated by closeDuplicateTabs
  function buildConfirmText(n) {
    return `Close ${n} duplicate tab${n !== 1 ? "s" : ""} across all windows?`;
  }

  {
    assert.ok(buildConfirmText(1).includes("across all windows"), "Singular includes cross-window phrase");
    assert.equal(buildConfirmText(1), "Close 1 duplicate tab across all windows?");
    pass("n=1: correct singular form + cross-window scope phrase");
  }

  {
    assert.ok(buildConfirmText(2).includes("across all windows"), "Plural includes cross-window phrase");
    assert.equal(buildConfirmText(2), "Close 2 duplicate tabs across all windows?");
    pass("n=2: correct plural form + cross-window scope phrase");
  }

  {
    assert.ok(buildConfirmText(10).includes("across all windows"));
    assert.ok(buildConfirmText(10).includes("tabs"));
    pass("n=10: plural tabs and cross-window phrase present");
  }
})();


console.log("\nAll tests passed.\n");
