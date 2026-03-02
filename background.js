/* Log to confirm background script is running */
/* console.log("Background script loaded at", new Date().toISOString()); */

// Command listener
browser.commands.onCommand.addListener(async (command) => {
  /* console.log("Command received:", command); */
  if (command === "show-omnibar") {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0] && Number.isInteger(tabs[0].id) && tabs[0].id >= 0) {
        await browser.tabs.sendMessage(tabs[0].id, { type: "showOmnibar" });
      } else {
        console.error("No valid active tab found");
      }
    } catch (error) {
      console.error("Error sending showOmnibar message:", error);
    }
  }
});

// Message listener
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  /* console.log("Message received in background:", message); */

  (async () => {
    if (message.type === "getTabs") {
      try {
        const tabs = await browser.tabs.query({ currentWindow: true });
        const groupsById = new Map();

        if (browser.tabGroups && typeof browser.tabGroups.query === "function") {
          const tabGroupIds = [...new Set(tabs.map((tab) => tab.groupId).filter((groupId) => Number.isInteger(groupId) && groupId >= 0))];

          if (tabGroupIds.length > 0) {
            try {
              const groups = await browser.tabGroups.query({});
              groups.forEach((group) => {
                groupsById.set(group.id, group);
              });
            } catch (error) {
              console.error("Error querying tab groups:", error);
            }
          }
        }

        sendResponse(
          tabs.map((tab) => {
            const groupId = Number.isInteger(tab.groupId) ? tab.groupId : -1;
            const group = groupsById.get(groupId);

            return {
              id: tab.id,
              title: tab.title || "Untitled",
              url: tab.url || "",
              favIconUrl: tab.favIconUrl || "",
              windowId: tab.windowId,
              audible: tab.audible || false,
              groupId,
              groupTitle: group?.title || "",
              groupColor: group?.color || "",
            };
          }),
        );
      } catch (error) {
        console.error("Error querying tabs:", error);
        sendResponse({ error: error.message });
      }
    } else if (message.type === "switchTab") {
      const tabId = message.tabId;
      if (!Number.isInteger(tabId) || tabId < 0) {
        sendResponse({ error: "Invalid tabId" });
        return;
      }
      try {
        const tab = await browser.tabs.get(tabId);
        if (!tab || !Number.isInteger(tab.windowId)) {
          sendResponse({ error: "Tab or window not found" });
          return;
        }
        await browser.windows.update(tab.windowId, { focused: true });
        await browser.tabs.update(tabId, { active: true });
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error switching tab:", error);
        sendResponse({ error: error.message });
      }
    } else if (message.type === "closeTab") {
      const tabId = message.tabId;
      if (!Number.isInteger(tabId) || tabId < 0) {
        sendResponse({ error: "Invalid tabId" });
        return;
      }
      try {
        await browser.tabs.remove(tabId);
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error closing tab:", error);
        sendResponse({ error: error.message });
      }
    }
  })();

  return true; // Keep channel open for async response
});