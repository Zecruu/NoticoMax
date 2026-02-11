let currentType = "note";

// Type toggle
document.querySelectorAll(".type-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".type-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentType = btn.dataset.type;
    document.getElementById("url-field").style.display =
      currentType === "url" ? "block" : "none";
  });
});

// Auto-fill from current tab
chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  const tab = tabs[0];
  if (tab) {
    document.getElementById("title").value = tab.title || "";
    document.getElementById("url").value = tab.url || "";

    // Check for selected text
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString() || "",
      });
      if (result?.result) {
        document.getElementById("content").value = result.result;
      }
    } catch {
      // No permission to access page
    }
  }

  // Check for pending clip from context menu
  const { pendingClip } = await chrome.storage.local.get("pendingClip");
  if (pendingClip) {
    document.getElementById("title").value = pendingClip.title || "";
    document.getElementById("content").value = pendingClip.content || "";
    document.getElementById("url").value = pendingClip.url || "";
    if (pendingClip.type === "url") {
      currentType = "url";
      document.querySelectorAll(".type-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.type === "url");
      });
      document.getElementById("url-field").style.display = "block";
    }
    await chrome.storage.local.remove("pendingClip");
  }
});

// Save
document.getElementById("save").addEventListener("click", async () => {
  const btn = document.getElementById("save");
  const status = document.getElementById("status");
  btn.disabled = true;
  btn.textContent = "Saving...";

  const data = {
    type: currentType,
    title: document.getElementById("title").value || "Untitled",
    content: document.getElementById("content").value,
    url: currentType === "url" ? document.getElementById("url").value : undefined,
  };

  chrome.runtime.sendMessage({ type: "SAVE_CLIP", data }, (response) => {
    if (response?.success) {
      status.className = "status success";
      status.textContent = "Saved!";
      setTimeout(() => window.close(), 1000);
    } else {
      status.className = "status error";
      status.textContent = response?.error || "Failed to save. Check settings.";
      btn.disabled = false;
      btn.textContent = "Save";
    }
  });
});

// Settings
document.getElementById("open-settings").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("main-view").style.display = "none";
  document.getElementById("settings-view").style.display = "block";

  chrome.storage.sync.get(["noticoUrl", "noticoToken"], (settings) => {
    document.getElementById("notico-url").value = settings.noticoUrl || "";
    document.getElementById("notico-token").value = settings.noticoToken || "";
  });
});

document.getElementById("back").addEventListener("click", () => {
  document.getElementById("settings-view").style.display = "none";
  document.getElementById("main-view").style.display = "block";
});

document.getElementById("save-settings").addEventListener("click", () => {
  const noticoUrl = document.getElementById("notico-url").value.replace(/\/$/, "");
  const noticoToken = document.getElementById("notico-token").value;

  chrome.storage.sync.set({ noticoUrl, noticoToken }, () => {
    document.getElementById("settings-view").style.display = "none";
    document.getElementById("main-view").style.display = "block";
  });
});
