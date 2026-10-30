import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { familyRpcError, isUuid } from "@/lib/family/checkins";

export const runtime = "nodejs";

// Only the invitee may consent to a pending invitation. Membership and status
// change together under a household row lock, including the seat-limit check.
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claims?.claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!isUuid(body?.token) || (body?.action !== "accept" && body?.action !== "decline")) {
    return NextResponse.json({ error: "A valid token and action ('accept' | 'decline') are required." }, { status: 400 });
  }
  const { data: householdId, error } = await supabase.rpc("respond_family_invite", { p_token: body.token, p_action: body.action });
  if (error) {
    const result = familyRpcError(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, householdId });
}
