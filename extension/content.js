// Listen for messages from background script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "CLIP_SAVED") {
    showNotification("Saved to Notico");
  }
  if (msg.type === "GET_SELECTION") {
    return window.getSelection()?.toString() || "";
  }
});

function showNotification(text) {
  const el = document.createElement("div");
  el.textContent = text;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "2147483647",
    padding: "12px 20px",
    borderRadius: "8px",
    background: "#0a0a0a",
    color: "#fff",
    fontSize: "14px",
    fontFamily: "system-ui, sans-serif",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    transition: "opacity 0.3s",
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, 2000);
}
