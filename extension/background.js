// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-notico",
    title: "Save to Notico",
    contexts: ["selection", "page", "link"],
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "save-to-notico") return;

  const data = {
    title: tab?.title || "Untitled",
    content: info.selectionText || "",
    url: info.linkUrl || info.pageUrl || tab?.url || "",
    type: info.linkUrl || (!info.selectionText && info.pageUrl) ? "url" : "note",
  };

  // Store data and open popup
  await chrome.storage.local.set({ pendingClip: data });

  // Open the popup programmatically isn't possible in MV3,
  // so we send a message to content script to show a notification
  if (tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "CLIP_SAVED",
        data,
      });
    } catch {
      // Content script not loaded, try saving directly
      await saveToNotico(data);
    }
  }
});

async function saveToNotico(data) {
  const settings = await chrome.storage.sync.get(["noticoUrl", "noticoToken"]);
  const baseUrl = settings.noticoUrl || "https://notico.app";
  const token = settings.noticoToken;

  if (!token) {
    console.error("Notico: No API token configured");
    return { success: false, error: "No API token" };
  }

  try {
    const res = await fetch(`${baseUrl}/api/items/clip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { success: true };
  } catch (err) {
    console.error("Notico: Save failed", err);
    return { success: false, error: err.message };
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SAVE_CLIP") {
    saveToNotico(msg.data).then(sendResponse);
    return true; // async response
  }
});
