import { isElectronDesktop, isIOS } from "@/lib/platform";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface AppleSignInResult {
  success: boolean;
  /** Set on iOS only — pass to useLicense.loginWithApple */
  payload?: { identityToken: string };
  error?: string;
}

/**
 * Trigger the platform-appropriate Apple sign-in flow.
 *
 * - **iOS**: native plugin returns an identity token; caller passes it to
 *   `supabase.auth.signInWithIdToken` (via useLicense.loginWithApple).
 * - **Web**: full-page redirect via `supabase.auth.signInWithOAuth`. Returns
 *   `success: true` immediately; the actual sign-in completes on redirect-back.
 *   Caller does NOT need to call loginWithApple — the auth state listener picks
 *   up the new session.
 * - **Electron**: opens an in-app auth window pointed at Supabase's OAuth URL,
 *   intercepts the redirect back to `${origin}/auth/callback?code=...`, then
 *   exchanges the PKCE code for a session. Caller doesn't need to call
 *   loginWithApple — the auth state listener picks up the session.
 */
export async function triggerAppleSignIn(): Promise<AppleSignInResult> {
  if (isIOS()) {
    try {
      const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
      const result = await SignInWithApple.authorize({
        clientId: "com.noticomax.app",
        redirectURI: "https://app.noticomax.com/auth/callback",
        scopes: "email name",
      });
      const token = result.response?.identityToken;
      if (!token) return { success: false, error: "No identity token returned" };
      return { success: true, payload: { identityToken: token } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  if (isElectronDesktop()) {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.openOAuthWindow) {
      return {
        success: false,
        error: "This app build doesn't support Apple sign-in. Please update to the latest version.",
      };
    }

    const supabase = getSupabaseBrowserClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { success: false, error: error.message };
    if (!data?.url) return { success: false, error: "Supabase did not return an OAuth URL" };

    const result = await electronAPI.openOAuthWindow(data.url, redirectTo);
    if (!result.success || !result.code) {
      return { success: false, error: result.error || "Apple sign-in failed" };
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.code);
    if (exchangeError) return { success: false, error: exchangeError.message };
    return { success: true };
  }

  // Web fallback — full-page redirect via Supabase OAuth
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) return { success: false, error: error.message };
  // Browser is now redirecting; this code path won't continue.
  return { success: true };
}
