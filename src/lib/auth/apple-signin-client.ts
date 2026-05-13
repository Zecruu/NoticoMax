import { isElectronDesktop, isIOS } from "@/lib/platform";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface AppleSignInResult {
  success: boolean;
  /**
   * Pass to useLicense.loginWithApple. iOS native sign-in returns
   * `identityToken`; Electron's PKCE OAuth flow returns `code`. Web flow
   * has no payload — Supabase's auth state listener handles the redirect.
   */
  payload?: { identityToken?: string; code?: string };
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
 * - **Electron**: not yet supported in the Supabase migration. Email/password
 *   works on Electron in the meantime.
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
    // Desktop flow:
    //   1. Ask Supabase for the OAuth URL (skipBrowserRedirect so we can
    //      open it in a popup BrowserWindow ourselves). This also stores
    //      the PKCE verifier in this renderer's localStorage.
    //   2. Pass the URL to the Electron main process, which opens it in
    //      a popup and intercepts the navigation back to /auth/callback
    //      to extract the `code` query param.
    //   3. Hand the code back to the caller (auth-gate). Caller then
    //      calls useLicense.loginWithApple({ code }) which exchanges it
    //      for a session — the verifier from step 1 is read out of
    //      localStorage automatically by exchangeCodeForSession.
    try {
      const supabase = getSupabaseBrowserClient();
      // The `source=electron` query param tells the /auth/callback page to
      // hand the code back to this Electron app via the noticomax:// scheme
      // instead of running exchangeCodeForSession in the browser (where the
      // PKCE verifier doesn't exist).
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          skipBrowserRedirect: true,
          redirectTo: "https://app.noticomax.com/auth/callback?source=electron",
        },
      });
      if (error || !data?.url) {
        return { success: false, error: error?.message || "Could not initialize Apple sign-in" };
      }
      const electronAPI = (window as unknown as {
        electronAPI?: { openAppleSignIn?: (url: string) => Promise<{ success: boolean; code?: string; error?: string }> };
      }).electronAPI;
      if (!electronAPI?.openAppleSignIn) {
        return { success: false, error: "Electron Apple sign-in bridge not available" };
      }
      const result = await electronAPI.openAppleSignIn(data.url);
      if (!result.success || !result.code) {
        return { success: false, error: result.error || "Sign-in cancelled" };
      }
      return { success: true, payload: { code: result.code } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
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
