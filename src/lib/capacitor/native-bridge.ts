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

  // Keyboard avoidance is driven by keyboard-avoidance.ts (visualViewport-based)
  // which publishes --keyboard-height / --visual-viewport-height + the
  // `keyboard-open` class and scrolls the focused field above the keyboard.
  // Capacitor's keyboard events are an extra trigger; visualViewport stays
  // authoritative when present, and we only set the vars from Capacitor's
  // reported height as a fallback for old webviews that lack visualViewport.
  const { initKeyboardAvoidance, applyViewportVars, nudgeScrollToFocused } =
    await import("./keyboard-avoidance");
  initKeyboardAvoidance();

  const root = document.documentElement;
  const hasVisualViewport = !!window.visualViewport;

  Keyboard.addListener("keyboardWillShow", (info) => {
    if (!hasVisualViewport) {
      root.style.setProperty("--keyboard-height", `${info.keyboardHeight}px`);
      root.classList.add("keyboard-open");
    }
    nudgeScrollToFocused();
  });
  Keyboard.addListener("keyboardDidShow", () => {
    applyViewportVars();
    nudgeScrollToFocused();
  });
  Keyboard.addListener("keyboardWillHide", () => {
    if (!hasVisualViewport) {
      root.style.setProperty("--keyboard-height", "0px");
      root.classList.remove("keyboard-open");
    } else {
      applyViewportVars();
    }
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
