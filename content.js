/*
 * Zen Tab Search - Content Script
 * Fuzzy search with highlighting, debounce, and keyboard shortcuts.
 */

/* Fuzzy matching: chars must appear in order */
function fuzzyMatch(str, query) {
  str = str.toLowerCase();
  query = query.toLowerCase();
  let i = 0;
  for (const char of query) {
    i = str.indexOf(char, i);
    if (i === -1) return false;
    i++;
  }
  return true;
}

/* Calculate match score: more matching chars = higher score */
function calculateScore(tab, query) {
  const title = (tab.title || "").toLowerCase();
  const url = (tab.url || "").toLowerCase();
  const queryLower = query.toLowerCase();

  let score = 0;

  // Exact prefix match (highest)
  if (title.toLowerCase().startsWith(queryLower)) score += 100;
  if (url.toLowerCase().startsWith(queryLower)) score += 90;

  // Contains query
  if (title.includes(queryLower)) score += 50;
  if (url.includes(queryLower)) score += 40;

  // Fuzzy match bonus
  if (fuzzyMatch(title, query)) score += 30;
  if (fuzzyMatch(url, query)) score += 20;

  // Word-by-word match (higher score = more words match)
  const queryWords = queryLower.split(/\s+/);
  const titleWords = title.split(/\s+/);
  const urlWords = url.split(/\s+/);

  let matchedWords = 0;
  for (const qw of queryWords) {
    if (qw.length < 2) continue;
    if (titleWords.some((tw) => tw.includes(qw)) || urlWords.some((uw) => uw.includes(qw))) {
      matchedWords++;
    }
  }
  score += matchedWords * 10;

  return score;
}

/* Highlight matched characters in text */
function highlightText(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
}

function showOmnibar() {
  if (document.getElementById("zen-tab-omnibar-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "zen-tab-omnibar-overlay";
  overlay.className = "zen-overlay";

  const omnibar = document.createElement("div");
  omnibar.className = "zen-omnibar";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Search tabs...";
  input.className = "zen-input";
  input.autofocus = true;

  const countEl = document.createElement("div");
  countEl.className = "zen-count";

  const list = document.createElement("ul");
  list.className = "zen-list";

  omnibar.appendChild(input);
  omnibar.appendChild(countEl);
  omnibar.appendChild(list);
  overlay.appendChild(omnibar);
  document.body.appendChild(overlay);

  input.focus();

  let allTabs = [];
  let selectedIndex = -1;
  let escListener, visibilityListener;

  /* Fetch tabs with current window filter */
  browser.runtime
    .sendMessage({ type: "getTabs" })
    .then((tabs) => {
      allTabs = tabs.filter((tab) => Number.isInteger(tab.id) && tab.id >= 0);
      renderTabs(allTabs);
    })
    .catch((error) => {
      console.error("Error fetching tabs:", error);
    });

  function renderTabs(filteredTabs, query = "") {
    list.innerHTML = "";
    countEl.textContent = `${filteredTabs.length} of ${allTabs.length} tabs`;

    if (filteredTabs.length === 0) {
      const empty = document.createElement("li");
      empty.className = "zen-empty";
      empty.textContent = "No tabs found";
      list.appendChild(empty);
      return;
    }

    filteredTabs.forEach((tab, index) => {
      const li = document.createElement("li");
      li.className = "zen-tab-item";
      li.dataset.tabId = tab.id;

      if (tab.favIconUrl && tab.favIconUrl.trim()) {
        const favIcon = document.createElement("div");
        favIcon.className = "zen-favicon";
        const img = document.createElement("img");
        img.src = tab.favIconUrl;
        img.onerror = () => {
          favIcon.style.visibility = "hidden";
        };
        favIcon.appendChild(img);
        li.appendChild(favIcon);
      }

      const title = document.createElement("span");
      title.innerHTML = highlightText(tab.title || "Untitled", query);
      title.className = "zen-title";
      li.appendChild(title);

      const url = document.createElement("span");
      try {
        url.textContent = tab.url ? new URL(tab.url).hostname : "No URL";
      } catch {
        url.textContent = "No URL";
      }
      url.className = "zen-url";
      li.appendChild(url);

      const closeBtn = document.createElement("span");
      closeBtn.className = "zen-close-btn";
      closeBtn.innerHTML = "×";
      closeBtn.title = "Close tab";
      li.appendChild(closeBtn);

      li.addEventListener("click", () => {
        switchToTab(tab.id);
      });

      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        browser.runtime.sendMessage({ type: "closeTab", tabId: tab.id });
        // Remove from local array and re-render
        allTabs = allTabs.filter((t) => t.id !== tab.id);
        applyFilter(input.value);
      });

      list.appendChild(li);
    });
  }

  function applyFilter(query) {
    if (!query.trim()) {
      renderTabs(allTabs);
      return;
    }

    const filtered = allTabs
      .map((tab) => ({ tab, score: calculateScore(tab, query) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ tab }) => tab);

    renderTabs(filtered, query);
  }

  function updateSelection() {
    const items = list.querySelectorAll("li");
    items.forEach((item) => item.classList.remove("selected"));
    if (selectedIndex >= 0 && selectedIndex < items.length) {
      items[selectedIndex].classList.add("selected");
      items[selectedIndex].scrollIntoView({ block: "nearest" });
    }
  }

  function switchToTab(tabId, openNew = false) {
    if (openNew) {
      browser.tabs.create({ active: true, index: null, url: null }).then(() => {
        // Switch to the newly created tab
        browser.tabs.update(tabId, { active: true });
      });
    } else {
      browser.runtime
        .sendMessage({ type: "switchTab", tabId })
        .then((response) => {
          if (!response?.error) closeOmnibar();
        })
        .catch((error) => {
          console.error("Error switching tab:", error);
        });
    }
  }

  function closeOmnibar() {
    const overlay = document.getElementById("zen-tab-omnibar-overlay");
    if (overlay) {
      overlay.remove();
      document.removeEventListener("keydown", escListener);
      document.removeEventListener("visibilitychange", visibilityListener);
    }
  }

  escListener = (e) => {
    if (e.key === "Escape") {
      closeOmnibar();
      e.preventDefault();
      e.stopPropagation();
    }
  };
  document.addEventListener("keydown", escListener);

  visibilityListener = () => {
    if (document.hidden) closeOmnibar();
  };
  document.addEventListener("visibilitychange", visibilityListener);

  // Debounced input handler
  let debounceTimer;
  input.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      selectedIndex = -1;
      applyFilter(e.target.value);
    }, 50);
  });

  // Keyboard navigation
  input.addEventListener("keydown", (e) => {
    const items = list.querySelectorAll("li");
    const numItems = items.length;

    if (e.key === "ArrowDown" || e.key === "Tab") {
      selectedIndex = selectedIndex < numItems - 1 ? selectedIndex + 1 : 0;
      updateSelection();
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      selectedIndex = selectedIndex <= 0 ? numItems - 1 : selectedIndex - 1;
      updateSelection();
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      selectedIndex = Math.min(selectedIndex + 10, numItems - 1);
      updateSelection();
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      selectedIndex = Math.max(selectedIndex - 10, 0);
      updateSelection();
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (e.metaKey || e.ctrlKey) {
        // Open in new tab
        const selectedItem = list.querySelector("li.selected");
        if (selectedItem) {
          const tabId = parseInt(selectedItem.dataset.tabId, 10);
          switchToTab(tabId, true);
        }
      } else if (selectedIndex >= 0 && numItems > 0) {
        const selectedItem = items[selectedIndex];
        const tabId = parseInt(selectedItem.dataset.tabId, 10);
        switchToTab(tabId);
      }
      e.preventDefault();
    }
  });

  // Close on click outside
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOmnibar();
  });
}

/* Listen for messages from background */
browser.runtime.onMessage.addListener((message) => {
  if (message.type === "showOmnibar") {
    showOmnibar();
  }
});