interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  getAppVersion: () => Promise<string>;
  checkForUpdate: () => Promise<{
    hasUpdate: boolean;
    currentVersion?: string;
    latestVersion?: string;
    downloadUrl?: string;
    error?: string;
  }>;
  openDownloadUrl: (url: string) => Promise<void>;
  getOpenAtLogin: () => Promise<boolean>;
  setOpenAtLogin: (enabled: boolean) => Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
