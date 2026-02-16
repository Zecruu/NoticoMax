declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean;
      getPlatform: () => "ios" | "android" | "web";
      isPluginAvailable: (name: string) => boolean;
    };
  }
}

export {};
