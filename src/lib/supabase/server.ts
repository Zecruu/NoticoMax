import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cookie-aware Supabase client for server-side use (route handlers, server
 * components, server actions). Reads/writes session cookies via Next's
 * cookies() helper. Bound to the requesting user's session — RLS applies.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components can't set cookies. Middleware refreshes
            // them out-of-band, so this is safe to swallow.
          }
        },
      },
    }
  );
}
