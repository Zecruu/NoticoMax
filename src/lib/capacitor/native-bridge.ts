import { isCapacitorNative, isIOS } from "@/lib/platform";

export async function initCapacitorPlugins() {
  if (!isCapacitorNative()) return;

  const { SplashScreen } = await import("@capacitor/splash-screen");
  const { StatusBar, Style } = await import("@capacitor/status-bar");
  const { Keyboard } = await import("@capacitor/keyboard");
  const { App } = await import("@capacitor/app");

  // Hide splash screen after app loads
  await SplashScreen.hide();

  // Configure status bar
  await StatusBar.setStyle({ style: Style.Dark });
  if (!isIOS()) {
    await StatusBar.setBackgroundColor({ color: "#0a0a0a" });
  }

  // The provider owns viewport listeners on web and native. Native keyboard
  // events also constrain the visible area when only the body is resized.
  const { setNativeKeyboardHeight } =
    await import("./keyboard-avoidance");

  Keyboard.addListener("keyboardWillShow", (info) => {
    setNativeKeyboardHeight(info.keyboardHeight);
  });
  Keyboard.addListener("keyboardDidShow", (info) => {
    setNativeKeyboardHeight(info.keyboardHeight);
  });
  Keyboard.addListener("keyboardDidHide", () => {
    setNativeKeyboardHeight(0);
  });

  // Handle deep links
  App.addListener("appUrlOpen", (data) => {
    try {
      const url = new URL(data.url);
      if (url.pathname) {
        window.location.href = url.pathname + url.search;
      }
    } catch {
      // Invalid URL, ignore
    }
  });

  // Handle Android back button
  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });
}

export async function updateStatusBarTheme(isDark: boolean) {
  if (!isCapacitorNative()) return;

  const { StatusBar, Style } = await import("@capacitor/status-bar");
  await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });

  if (!isIOS()) {
    await StatusBar.setBackgroundColor({
      color: isDark ? "#0a0a0a" : "#ffffff",
    });
  }
}
