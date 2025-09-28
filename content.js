/* 
 * Zen Tab Search - Content Script
 * This script handles the UI interaction and tab searching functionality.
 * It creates an overlay with search capabilities and manages user input.
 */

/* Log to confirm content script is running */
console.log("Content script loaded at", new Date().toISOString());

/* Enhanced fuzzy matching algorithm:
 * - Case-insensitive matching
 * - Characters must appear in order but don't need to be consecutive
 * - More intuitive than exact matching
 * - Similar to Sublime Text's search behavior
 */
function fuzzyMatch(str, query) {
  str = str.toLowerCase();
  query = query.toLowerCase();
  let i = 0;
  for (let char of query) {
    i = str.indexOf(char, i);
    if (i === -1) return false;
    i++;
  }
  return true;
}

/* Main UI component initialization
 * Creates an overlay with search input and results list
 * Handles all user interactions and keyboard navigation
 * Manages tab switching and UI state
 */
function showOmnibar() {
  console.log("showOmnibar called at", new Date().toISOString());
  /* Check if overlay already exists */
  if (document.getElementById("zen-tab-omnibar-overlay")) {
    console.log("Overlay already exists, skipping");
    return;
  }

  /* Create overlay */
  const overlay = document.createElement("div");
  overlay.id = "zen-tab-omnibar-overlay";
  overlay.className = "zen-overlay";

  /* Create omnibar container */
  const omnibar = document.createElement("div");
  omnibar.className = "zen-omnibar";

  /* Input field */
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Search tabs...";
  input.className = "zen-input";
  input.autofocus = true;

  /* Tabs list */
  const list = document.createElement("ul");
  list.className = "zen-list";

  omnibar.appendChild(input);
  omnibar.appendChild(list);
  overlay.appendChild(omnibar);
  document.body.appendChild(overlay);

  /* Explicitly focus the input */
  input.focus();
  console.log("Overlay created, input focused");

  /* Handle Escape key globally */
  const escListener = (e) => {
    if (e.key === "Escape") {
      console.log("Escape pressed on document, closing omnibar");
      closeOmnibar();
      e.preventDefault();
      e.stopPropagation();
    }
  };
  
  document.addEventListener("keydown", escListener);

  /* Handle tab visibility changes */
  const visibilityListener = () => {
    if (document.hidden) {
      console.log("Tab hidden, closing omnibar");
      closeOmnibar();
    }
  };
  
  document.addEventListener("visibilitychange", visibilityListener);

  /* Fetch tabs */
  browser.runtime.sendMessage({ type: "getTabs" }).then((tabs) => {
    console.log("Received tabs:", tabs.length, "tabs:", JSON.stringify(tabs.map(t => ({ id: t.id, title: t.title }))));
    let allTabs = tabs.filter(tab => Number.isInteger(tab.id) && tab.id >= 0); // Filter out invalid tabs

    /* Dynamic list rendering
     * - Efficiently updates DOM only when necessary
     * - Handles both keyboard and mouse interaction
     * - Provides visual feedback for selected items
     * - Implements smooth scrolling for better UX
     */
    function renderTabs(filteredTabs) {
      console.log("Rendering tabs, count:", filteredTabs.length);
      list.innerHTML = "";
      filteredTabs.forEach((tab) => {
        const li = document.createElement("li");
        li.className = "zen-tab-item";
        li.dataset.tabId = tab.id; /* Store tabId directly */

        /* Favicon */
        if (tab.favIconUrl) {
          const img = document.createElement("img");
          img.src = tab.favIconUrl;
          img.className = "zen-favicon";
          li.appendChild(img);
        }

        /* Title and URL */
        const title = document.createElement("span");
        title.textContent = tab.title || "Untitled";
        title.className = "zen-title";

        const url = document.createElement("span");
        url.textContent = tab.url ? new URL(tab.url).hostname : "No URL";
        url.className = "zen-url";

        li.appendChild(title);
        li.appendChild(url);

        /* Click to switch */
        li.addEventListener("click", () => {
          const tabId = parseInt(li.dataset.tabId, 10);
          console.log("Clicked tabId:", tabId, "title:", tab.title);
          switchToTab(tabId);
        });

        list.appendChild(li);
      });
    }

    /* Tab switching logic
     * - Validates tab ID before switching
     * - Handles errors gracefully
     * - Provides feedback on success/failure
     * - Maintains UI consistency
     */
    function switchToTab(tabId) {
      if (!Number.isInteger(tabId) || tabId < 0) {
        console.error("Invalid tabId:", tabId);
        return;
      }
      console.log("Attempting to switch to tab:", tabId);
      browser.runtime.sendMessage({ type: "switchTab", tabId }).then((response) => {
        if (response.error) {
          console.error("Error response from switchTab:", response.error);
          return;
        }
        console.log("SwitchTab successful for tabId:", tabId);
        closeOmnibar();
      }).catch((error) => {
        console.error("Error sending switchTab message:", error);
      });
    }

    /* Initial render */
    renderTabs(allTabs);

    /* Input listener for filtering */
    input.addEventListener("input", (e) => {
      const query = e.target.value;
      console.log("Filtering tabs with query:", query);
      if (query) {
        const filtered = allTabs.filter((tab) =>
          fuzzyMatch(tab.title || "", query) || fuzzyMatch(tab.url || "", query)
        );
        console.log("Filtered tabs:", filtered.length, "tabs:", JSON.stringify(filtered.map(t => ({ id: t.id, title: t.title }))));
        renderTabs(filtered);
      } else {
        renderTabs(allTabs);
      }
    });

    /* Keyboard navigation (up/down/left/right/enter) - remove Escape handling here */
    let selectedIndex = -1;
    input.addEventListener("keydown", (e) => {
      const items = list.querySelectorAll("li");
      const numItems = items.length;

      if (e.key === "ArrowDown"  || e.key === "Tab") {
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
      } else if (e.key === "Enter" && selectedIndex >= 0 && numItems > 0) {
        const selectedItem = items[selectedIndex];
        const tabId = parseInt(selectedItem.dataset.tabId, 10);
        console.log("Enter pressed, selected tabId:", tabId);
        switchToTab(tabId);
        e.preventDefault();
      }
    });

    /* Helper to update selection */
    function updateSelection() {
      const items = list.querySelectorAll("li");
      items.forEach((item) => item.classList.remove("selected"));
      if (selectedIndex >= 0 && selectedIndex < items.length) {
        items[selectedIndex].classList.add("selected");
        items[selectedIndex].scrollIntoView({ block: "nearest" });
        console.log("Selected index updated to:", selectedIndex, "tabId:", items[selectedIndex].dataset.tabId);
      }
    }
  }).catch((error) => {
    console.error("Error fetching tabs:", error);
  });

  /* Close on click outside */
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      console.log("Clicked outside, closing omnibar");
      closeOmnibar();
    }
  });

  /* Function to close omnibar - update to remove visibility listener */
  function closeOmnibar() {
    const overlay = document.getElementById("zen-tab-omnibar-overlay");
    if (overlay) {
      overlay.remove();
      console.log("Omnibar closed at", new Date().toISOString());
      document.removeEventListener("keydown", escListener);
      document.removeEventListener("visibilitychange", visibilityListener);
    }
  }
}

/* Listen for messages from background */
browser.runtime.onMessage.addListener((message) => {
  console.log("Message received in content script:", message);
  if (message.type === "showOmnibar") {
    showOmnibar();
  }
});