export function isCapacitorNative(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.Capacitor?.isNativePlatform()
  );
}

export function isElectronDesktop(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.electronAPI?.isElectron
  );
}

export function isIOS(): boolean {
  return isCapacitorNative() && window.Capacitor!.getPlatform() === "ios";
}

export function getPlatform(): "ios" | "electron" | "web" {
  if (isElectronDesktop()) return "electron";
  if (isIOS()) return "ios";
  return "web";
}
