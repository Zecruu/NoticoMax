import { isElectronDesktop, isIOS } from "@/lib/platform";

export type AppleSignInPayload =
  | { identityToken: string; email?: string }
  | { code: string };

export interface AppleSignInResult {
  success: boolean;
  payload?: AppleSignInPayload;
  error?: string;
}

/**
 * Trigger the platform-appropriate Apple sign-in flow.
 * - iOS: native ASAuthorizationController via @capacitor-community/apple-sign-in
 * - Electron (Mac/desktop): BrowserWindow -> redirect -> auth code
 * - Web: popup window -> redirect -> postMessage -> auth code
 */
export async function triggerAppleSignIn(): Promise<AppleSignInResult> {
  if (isIOS()) {
    try {
      const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
      const result = await SignInWithApple.authorize({
        clientId: "com.noticomax.app",
        redirectURI: "https://www.noticomax.com/api/auth/apple/callback",
        scopes: "email name",
      });
      const token = result.response?.identityToken;
      if (!token) return { success: false, error: "No identity token returned" };
      return {
        success: true,
        payload: { identityToken: token, email: result.response?.email ?? undefined },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  if (isElectronDesktop()) {
    const result = await window.electronAPI!.openAppleSignIn();
    if (!result.success || !result.code) {
      return { success: false, error: result.error || "Sign-in cancelled" };
    }
    return { success: true, payload: { code: result.code } };
  }

  // Web (browser): popup with postMessage handshake
  return await webPopupSignIn();
}

function webPopupSignIn(): Promise<AppleSignInResult> {
  return new Promise((resolve) => {
    const state = Math.random().toString(36).slice(2);
    const params = new URLSearchParams({
      client_id: "com.noticomax.signin",
      redirect_uri: "https://www.noticomax.com/api/auth/apple/callback",
      response_type: "code",
      scope: "name email",
      state,
      response_mode: "form_post",
    });
    const url = `https://appleid.apple.com/auth/authorize?${params.toString()}`;

    const popup = window.open(url, "apple-signin", "width=600,height=700");
    if (!popup) {
      resolve({ success: false, error: "Popup blocked" });
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== "apple-signin") return;
      window.removeEventListener("message", onMessage);
      const { code, error } = event.data;
      if (error) resolve({ success: false, error });
      else if (code) resolve({ success: true, payload: { code } });
      else resolve({ success: false, error: "No code returned" });
    };

    window.addEventListener("message", onMessage);

    // If popup closed without completing
    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        setTimeout(() => {
          window.removeEventListener("message", onMessage);
          resolve({ success: false, error: "Sign-in cancelled" });
        }, 500);
      }
    }, 500);
  });
}
