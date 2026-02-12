interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion?: string;
  latestVersion?: string;
  error?: string;
}

interface UpdateDownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

interface UpdateDownloadedInfo {
  version: string;
}

interface UpdateError {
  message: string;
}

interface ElectronAPI {
  isElectron: boolean;
  platform: string;
  getAppVersion: () => Promise<string>;
  checkForUpdate: () => Promise<UpdateCheckResult>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => void;
  getOpenAtLogin: () => Promise<boolean>;
  setOpenAtLogin: (enabled: boolean) => Promise<boolean>;

  onUpdateDownloadProgress: (callback: (data: UpdateDownloadProgress) => void) => () => void;
  onUpdateDownloaded: (callback: (data: UpdateDownloadedInfo) => void) => () => void;
  onUpdateError: (callback: (data: UpdateError) => void) => () => void;
  removeAllUpdateListeners: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
