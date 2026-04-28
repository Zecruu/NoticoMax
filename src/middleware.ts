import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refresh Supabase auth cookies on every request. Required so the JWT in
 * the user's session cookie stays valid; without this, server route handlers
 * see an expired session.
 *
 * Uses getClaims() (validates JWT signature against Supabase's published JWKS)
 * — not getSession(), which trusts the cookie blindly.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Refreshes the session cookie if expired.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every request EXCEPT:
     * - static files (_next/static, _next/image)
     * - favicon, public assets
     * - Apple sign-in callback (no cookie refresh needed; it's a redirect target)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/auth/apple/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
