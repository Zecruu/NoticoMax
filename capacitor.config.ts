import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.noticomax.app",
  appName: "Notico Max",
  webDir: "out",

  server: {
    url: "https://www.noticomax.com",
    cleartext: false,
    allowNavigation: [
      "www.noticomax.com",
      "noticomax.com",
      "accounts.google.com",
      "*.stripe.com",
    ],
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0a0a0a",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
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

  android: {
    backgroundColor: "#0a0a0a",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
