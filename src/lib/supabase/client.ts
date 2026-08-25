import { createBrowserClient } from "@supabase/ssr";

let cached: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Browser-side Supabase client. Use in client components.
 * Cached so repeated calls return the same instance (and the same auth listeners).
 */
export function getSupabaseBrowserClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase browser client is not configured");
  }
  cached = createBrowserClient(url, key);
  return cached;
}
