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

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");

    if (!code) {
      // Maybe an error from the provider
      const err = url.searchParams.get("error_description") || url.searchParams.get("error");
      setError(err || "No authorization code returned");
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
        // Session is now stored; redirect home
        router.replace("/");
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [router]);

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
