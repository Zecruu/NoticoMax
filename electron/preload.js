const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  platform: process.platform,
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  checkForUpdate: () => ipcRenderer.invoke("check-for-update"),
  openDownloadUrl: (url) => ipcRenderer.invoke("open-download-url", url),
  getOpenAtLogin: () => ipcRenderer.invoke("get-open-at-login"),
  setOpenAtLogin: (enabled) => ipcRenderer.invoke("set-open-at-login", enabled),
});
