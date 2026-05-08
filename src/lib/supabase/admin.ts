import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Bypasses RLS — server-only.
 * Use for: data migrations, admin operations, talking to the auth.admin API,
 * and tables like claude_resumes that have no per-user RLS policies.
 *
 * NEVER import this from a client component or route that runs in the browser.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("Supabase URL or secret key not configured");
  }
  cached = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
