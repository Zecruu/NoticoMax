"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

/**
 * Supabase OAuth landing page. Apple (and any other OAuth provider) redirects
 * here after auth. We exchange the code for a session, then send the user home.
 */
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [electronHandoff, setElectronHandoff] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const source = url.searchParams.get("source");

    if (!code) {
      const err = url.searchParams.get("error_description") || url.searchParams.get("error");
      setError(err || "No authorization code returned");
      return;
    }

    // Electron desktop flow: the Electron renderer (running at
    // app.noticomax.com inside the app shell) holds the PKCE verifier in
    // localStorage. THIS page is loaded in the user's default browser, which
    // has no verifier. So bounce the code back to the app via the custom
    // protocol; the app will run exchangeCodeForSession there.
    if (source === "electron") {
      setElectronHandoff(true);
      const protocolUrl = `noticomax://auth/callback?code=${encodeURIComponent(code)}`;
      window.location.href = protocolUrl;
      return;
    }

    const supabase = getSupabaseBrowserClient();
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: exchangeError }: { error: { message: string } | null }) => {
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
        router.replace("/");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [router]);

  if (electronHandoff) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Returning you to the app…</p>
        <p className="mt-1 text-xs text-muted-foreground">
          If nothing happens, you can close this tab.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-semibold text-destructive">Sign-in failed</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
        <button
          onClick={() => router.replace("/")}
          className="mt-4 text-primary hover:underline"
        >
          Back to app
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}
