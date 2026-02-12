const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  checkForUpdate: () => ipcRenderer.invoke("check-for-update"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  getOpenAtLogin: () => ipcRenderer.invoke("get-open-at-login"),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke("set-open-at-login", enabled),

  // Event listeners for main-to-renderer communication
  onUpdateDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("update-download-progress", handler);
    return () => ipcRenderer.removeListener("update-download-progress", handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("update-downloaded", handler);
    return () => ipcRenderer.removeListener("update-downloaded", handler);
  },
  onUpdateError: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("update-error", handler);
    return () => ipcRenderer.removeListener("update-error", handler);
  },
  removeAllUpdateListeners: () => {
    ipcRenderer.removeAllListeners("update-download-progress");
    ipcRenderer.removeAllListeners("update-downloaded");
    ipcRenderer.removeAllListeners("update-error");
  },
});
