import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireBearerUser } from "@/lib/supabase/bearer-auth";
import { ALLOWED_ASSISTANT_EMAIL } from "@/lib/ai/usage";

/**
 * Shared access gate for every assistant API route. Authenticates the Bearer
 * token, resolves the user's email server-side (never trusting a client-sent
 * email), and confirms they're on the allow-list. Returns 401 for bad tokens
 * and 403 for authenticated-but-not-authorized callers.
 */
export async function resolveAllowedAssistantUser(
  request: NextRequest,
): Promise<
  | { userId: string; email: string; error: null }
  | { userId: null; email: null; error: NextResponse }
> {
  const auth = await requireBearerUser(request);
  if (auth.error) return { userId: null, email: null, error: auth.error };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(auth.userId);
  const email = data?.user?.email?.toLowerCase() ?? null;

  if (error || !email || email !== ALLOWED_ASSISTANT_EMAIL) {
    return {
      userId: null,
      email: null,
      error: NextResponse.json(
        { error: "The Notico assistant isn't available on your account yet." },
        { status: 403 },
      ),
    };
  }
  return { userId: auth.userId, email, error: null };
}
