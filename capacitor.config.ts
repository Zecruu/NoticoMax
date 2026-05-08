import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.noticomax.app",
  appName: "Notico Max",
  webDir: "out",

  server: {
    url: "https://app.noticomax.com",
    cleartext: false,
    allowNavigation: [
      "app.noticomax.com",
      "www.noticomax.com",
      "noticomax.com",
      "appleid.apple.com",
      "rsahskcjdodshgtcxqmq.supabase.co",
    ],
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0a0a0a",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK" as never,
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body" as never,
      style: "DARK" as never,
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_notification",
      iconColor: "#3b82f6",
      sound: "default",
    },
  },

  ios: {
    scheme: "NoticoMax",
    contentInset: "automatic",
  },
};

export default config;
