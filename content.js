(() => {
  let overlay = null;
  let input = null;
  let resultsList = null;
  let countEl = null;
  let closeDupesBtn = null;
  let tabs = [];
  let allTabs = [];
  let currentActiveTabId = null;
  let filtered = [];
  let selectedIndex = 0;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "className") node.className = v;
        else if (k === "textContent") node.textContent = v;
        else node.setAttribute(k, v);
      }
    }
    if (children) {
      for (const child of children) {
        if (typeof child === "string") {
          node.appendChild(document.createTextNode(child));
        } else if (child) {
          node.appendChild(child);
        }
      }
    }
    return node;
  }

  function createOverlay() {
    if (overlay) return;

    overlay = el("div", { id: "tab-search-overlay", className: "hidden" });
    const container = el("div", { id: "tab-search-container" });

    input = el("input", {
      id: "tab-search-input",
      type: "text",
      placeholder: "Search tabs...",
      autocomplete: "off",
      spellcheck: "false",
    });

    resultsList = el("div", { id: "tab-search-results" });
    countEl = el("div", { id: "tab-search-count" });

    const footer = el("div", { id: "tab-search-footer" });
    closeDupesBtn = el("button", {
      id: "tab-search-close-dupes",
      type: "button",
    });
    closeDupesBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      closeDuplicateTabs();
    });
    footer.appendChild(closeDupesBtn);
    footer.appendChild(countEl);

    container.appendChild(input);
    container.appendChild(resultsList);
    container.appendChild(footer);
    overlay.appendChild(container);
    document.documentElement.appendChild(overlay);

    input.addEventListener("input", () => {
      filterTabs(input.value);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectNext();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectPrev();
      } else if (e.key === "Enter") {
        e.preventDefault();
        activateSelected();
      } else if (e.key === "Escape") {
        e.preventDefault();
        hide();
      }
    });

    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) {
        hide();
      }
    });
  }

  function show(tabData, activeTabId) {
    createOverlay();
    allTabs = tabData;
    currentActiveTabId = activeTabId;
    tabs = tabData.filter((t) => t.id !== activeTabId);
    input.value = "";
    selectedIndex = 0;
    filterTabs("");
    updateDupeButton();
    overlay.classList.remove("hidden");
    requestAnimationFrame(() => input.focus());
  }

  function hide() {
    if (overlay) {
      overlay.classList.add("hidden");
      input.value = "";
    }
  }

  function isVisible() {
    return overlay && !overlay.classList.contains("hidden");
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function wordBoundaryMatch(text, query) {
    const lower = text.toLowerCase();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return { score: 0, matches: [] };

    const allMatches = [];
    let totalScore = 0;

    for (const term of terms) {
      // \b word-boundary does not work reliably for non-ASCII/CJK text because
      // those characters are treated as \W, so a leading \b never anchors at
      // position 0 in a CJK string. Fall back to a plain substring match for
      // any term that contains non-ASCII characters.
      const useWordBoundary = !/[^\x00-\x7F]/.test(term);
      let start;
      if (useWordBoundary) {
        const re = new RegExp(`\\b${escapeRegex(term)}`, "i");
        const m = re.exec(lower);
        if (!m) return null;
        start = m.index;
      } else {
        start = lower.indexOf(term);
        if (start === -1) return null;
      }
      for (let j = 0; j < term.length; j++) {
        allMatches.push(start + j);
      }
      // Earlier match positions score higher
      totalScore += 200 - start;
    }

    return { score: totalScore, matches: allMatches };
  }

  function filterTabs(query) {
    if (!query.trim()) {
      filtered = tabs.map((t) => ({ tab: t, titleMatches: [], urlMatches: [] }));
    } else {
      filtered = [];
      for (const tab of tabs) {
        const titleResult = wordBoundaryMatch(tab.title, query);
        const urlResult = wordBoundaryMatch(tab.url, query);

        if (titleResult || urlResult) {
          filtered.push({
            tab,
            score: Math.max(
              titleResult ? titleResult.score + 50 : -Infinity,
              urlResult ? urlResult.score : -Infinity
            ),
            titleMatches: titleResult ? titleResult.matches : [],
            urlMatches: urlResult ? urlResult.matches : [],
          });
        }
      }
      filtered.sort((a, b) => b.score - a.score);
    }

    selectedIndex = 0;
    renderResults();
  }

  // Build highlighted text as document fragment
  function buildHighlightedText(text, matchIndices) {
    const frag = document.createDocumentFragment();
    if (!matchIndices.length) {
      frag.appendChild(document.createTextNode(text));
      return frag;
    }

    const set = new Set(matchIndices);
    let run = "";
    let inHighlight = false;

    for (let i = 0; i < text.length; i++) {
      const shouldHighlight = set.has(i);
      if (shouldHighlight !== inHighlight) {
        if (run) {
          if (inHighlight) {
            const span = el("span", { className: "tab-search-match" }, [run]);
            frag.appendChild(span);
          } else {
            frag.appendChild(document.createTextNode(run));
          }
          run = "";
        }
        inHighlight = shouldHighlight;
      }
      run += text[i];
    }
    if (run) {
      if (inHighlight) {
        frag.appendChild(el("span", { className: "tab-search-match" }, [run]));
      } else {
        frag.appendChild(document.createTextNode(run));
      }
    }
    return frag;
  }

  function renderResults() {
    // Clear results
    while (resultsList.firstChild) {
      resultsList.removeChild(resultsList.firstChild);
    }

    if (filtered.length === 0) {
      resultsList.appendChild(
        el("div", { id: "tab-search-empty", textContent: "No matching tabs" })
      );
      countEl.textContent = "";
      return;
    }

    filtered.forEach((item, i) => {
      const t = item.tab;

      // Favicon
      let faviconEl;
      if (t.favIconUrl) {
        faviconEl = el("img", {
          className: "tab-search-favicon",
          src: t.favIconUrl,
          alt: "",
        });
        faviconEl.addEventListener("error", () => {
          faviconEl.className = "tab-search-favicon-placeholder";
          faviconEl.removeAttribute("src");
        });
      } else {
        faviconEl = el("div", { className: "tab-search-favicon-placeholder" });
      }

      // Title
      const titleDiv = el("div", { className: "tab-search-title" });
      titleDiv.appendChild(buildHighlightedText(t.title, item.titleMatches));

      // URL
      const urlDiv = el("div", { className: "tab-search-url" });
      urlDiv.appendChild(buildHighlightedText(t.url, item.urlMatches));

      // Info container
      const infoDiv = el("div", { className: "tab-search-info" }, [
        titleDiv,
        urlDiv,
      ]);

      // Close button
      const closeBtn = el("button", {
        className: "tab-search-close",
        type: "button",
        title: "Close tab",
        textContent: "\u00d7",
      });
      closeBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeTab(t.id);
      });

      // Row
      const row = el(
        "div",
        {
          className:
            "tab-search-item" + (i === selectedIndex ? " selected" : ""),
          "data-index": String(i),
        },
        [faviconEl, infoDiv, closeBtn]
      );

      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectedIndex = i;
        activateSelected();
      });

      row.addEventListener("mouseenter", () => {
        selectedIndex = i;
        updateSelection();
      });

      resultsList.appendChild(row);
    });

    countEl.textContent = `${filtered.length} tab${filtered.length !== 1 ? "s" : ""}`;
  }

  function updateSelection() {
    const items = resultsList.querySelectorAll(".tab-search-item");
    items.forEach((item, i) => {
      item.classList.toggle("selected", i === selectedIndex);
    });
    const selected = items[selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }

  function selectNext() {
    if (filtered.length === 0) return;
    selectedIndex = (selectedIndex + 1) % filtered.length;
    updateSelection();
  }

  function selectPrev() {
    if (filtered.length === 0) return;
    selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
    updateSelection();
  }

  function closeTab(tabId) {
    const savedAllTab = allTabs.find((t) => t.id === tabId);
    const savedTab = tabs.find((t) => t.id === tabId);
    // Capture position of the closed item and the current selection before
    // filterTabs() resets selectedIndex to 0.
    const closedIndex = filtered.findIndex((item) => item.tab.id === tabId);
    const prevSelected = selectedIndex;
    allTabs = allTabs.filter((t) => t.id !== tabId);
    tabs = tabs.filter((t) => t.id !== tabId);
    filterTabs(input.value); // resets selectedIndex to 0 and re-renders
    updateDupeButton();
    if (filtered.length > 0) {
      if (closedIndex !== -1 && closedIndex < prevSelected) {
        // Closed item was above the selection; the selection shifts up by one.
        selectedIndex = Math.max(0, prevSelected - 1);
      } else {
        // Closed item was at or below the selection; keep the index, clamped.
        selectedIndex = Math.min(prevSelected, filtered.length - 1);
      }
      updateSelection();
    }
    browser.runtime.sendMessage({ action: "closeTab", tabId }).catch(() => {
      // Restore the tab in the UI if the background close failed
      if (savedAllTab) allTabs.push(savedAllTab);
      if (savedTab) tabs.push(savedTab);
      filterTabs(input.value);
      updateDupeButton();
    });
  }

  function getDuplicateCount() {
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

  function updateDupeButton() {
    if (!closeDupesBtn) return;
    const n = getDuplicateCount();
    if (n === 0) {
      closeDupesBtn.textContent = "No Duplicates";
      closeDupesBtn.disabled = true;
      closeDupesBtn.classList.remove("has-dupes");
    } else {
      closeDupesBtn.textContent = `Close ${n} Duplicate${n !== 1 ? "s" : ""}`;
      closeDupesBtn.disabled = false;
      closeDupesBtn.classList.add("has-dupes");
    }
  }

  function closeDuplicateTabs() {
    const n = getDuplicateCount();
    if (n === 0) return;
    if (!confirm(`Close ${n} duplicate tab${n !== 1 ? "s" : ""} across all windows?`)) return;
    browser.runtime.sendMessage({
      action: "closeDuplicateTabs",
      activeTabId: currentActiveTabId,
    }).then((response) => {
      if (!response || !response.closedTabIds) return;
      const closedSet = new Set(response.closedTabIds);
      allTabs = allTabs.filter((t) => !closedSet.has(t.id));
      tabs = tabs.filter((t) => !closedSet.has(t.id));
      filterTabs(input.value);
      updateDupeButton();
    }).catch(() => {
      // Message failed; leave UI state intact so the user can retry
    });
  }

  function activateSelected() {
    if (filtered.length === 0 || selectedIndex >= filtered.length) return;
    const tab = filtered[selectedIndex].tab;
    browser.runtime.sendMessage({
      action: "switchTab",
      tabId: tab.id,
      windowId: tab.windowId,
    });
    hide();
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === "toggle") {
      if (isVisible()) {
        hide();
      } else {
        show(msg.tabs, msg.activeTabId);
      }
    }
  });
})();
