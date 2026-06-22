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

  // Track keyboard height via CSS variable + a `keyboard-open` marker class.
  // The class lets CSS hide the fixed bottom nav (.mobile-bottom-nav) so it
  // never covers the focused field, and the var feeds the bottom-padding used
  // by dialogs/pages. We also pull the focused input into view above the
  // keyboard — iOS doesn't reliably do this for inputs inside scroll areas.
  const bringFocusIntoView = () => {
    const el = document.activeElement as HTMLElement | null;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  Keyboard.addListener("keyboardWillShow", (info) => {
    document.body.style.setProperty(
      "--keyboard-height",
      `${info.keyboardHeight}px`
    );
    document.documentElement.classList.add("keyboard-open");
    requestAnimationFrame(bringFocusIntoView);
  });
  Keyboard.addListener("keyboardDidShow", (info) => {
    // Re-assert once the layout has settled — keyboardWillShow can fire before
    // the resize completes, leaving the field still partially covered.
    document.body.style.setProperty(
      "--keyboard-height",
      `${info.keyboardHeight}px`
    );
    bringFocusIntoView();
  });
  Keyboard.addListener("keyboardWillHide", () => {
    document.body.style.setProperty("--keyboard-height", "0px");
    document.documentElement.classList.remove("keyboard-open");
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
