/* Log to confirm background script is running */
/* console.log("Background script loaded at", new Date().toISOString()); */

/* Listen for the command */
browser.commands.onCommand.addListener((command) => {
  /* console.log("Command received:", command, "at", new Date().toISOString()); */
  if (command === "show-omnibar") {
    /* Get the active tab and send message to its content script */
    browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => {
        if (tabs[0] && Number.isInteger(tabs[0].id) && tabs[0].id >= 0) {
          /* console.log("Active tab found:", tabs[0].id); */
          browser.tabs
            .sendMessage(tabs[0].id, { type: "showOmnibar" })
            .then(() => {
              /* console.log("showOmnibar message sent successfully to tab:", tabs[0].id); */
            })
            .catch((error) => {
              console.error("Error sending showOmnibar message:", error);
            });
        } else {
          console.error("No valid active tab found");
        }
      })
      .catch((error) => {
        console.error("Error querying tabs:", error);
      });
  } else {
    /* console.log("Unknown command:", command); */
  }
});

/* Handle messages from content scripts */
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  /* console.log("Message received in background:", message, "from tab:", sender.tab?.id); */
  if (message.type === "getTabs") {
    browser.tabs
      .query({})
      .then((tabs) => {
        /* console.log("Sending tabs:", tabs.length, "tabs:", JSON.stringify(tabs.map(t => ({ id: t.id, title: t.title })))); */
        sendResponse(
          tabs.map((tab) => ({
            id: tab.id,
            title: tab.title || "Untitled",
            url: tab.url || "",
            favIconUrl: tab.favIconUrl || "",
            windowId: tab.windowId,
          })),
        );
      })
      .catch((error) => {
        console.error("Error querying tabs:", error);
        sendResponse({ error: error.message });
      });
    return true; /* Keep the message channel open for async response */
  } else if (message.type === "switchTab") {
    const tabId = message.tabId;
    /* console.log("Received switchTab request for tabId:", tabId); */
    if (!Number.isInteger(tabId) || tabId < 0) {
      console.error("Invalid tabId:", tabId);
      sendResponse({ error: "Invalid tabId" });
      return true;
    }
    browser.tabs
      .get(tabId)
      .then((tab) => {
        if (!tab || !Number.isInteger(tab.windowId)) {
          console.error("Tab not found or invalid windowId for tabId:", tabId);
          sendResponse({ error: "Tab or window not found" });
          return;
        }
        /* console.log("Switching to window:", tab.windowId, "for tab:", tabId); */
        browser.windows
          .update(tab.windowId, { focused: true })
          .then(() => {
            browser.tabs
              .update(tabId, { active: true })
              .then(() => {
                /* console.log("Successfully switched to tab:", tabId); */
                sendResponse({ success: true });
              })
              .catch((error) => {
                console.error("Error activating tab:", error);
                sendResponse({ error: error.message });
              });
          })
          .catch((error) => {
            console.error("Error focusing window:", error);
            sendResponse({ error: error.message });
          });
      })
      .catch((error) => {
        console.error("Error getting tab:", error);
        sendResponse({ error: error.message });
      });
    return true; /* Keep the message channel open for async response */
  } else if (message.type === "closeTab") {
    const tabId = message.tabId;
    if (!Number.isInteger(tabId) || tabId < 0) {
      console.error("Invalid tabId for closing:", tabId);
      sendResponse({ error: "Invalid tabId" });
      return true;
    }
    browser.tabs.remove(tabId)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Error closing tab:", error);
        sendResponse({ error: error.message });
      });
    return true;
  }
});
