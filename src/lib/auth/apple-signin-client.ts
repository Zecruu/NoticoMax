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
    return {
      success: false,
      error:
        "Apple sign-in on desktop is temporarily unavailable during our backend migration. Please use email and password.",
    };
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
