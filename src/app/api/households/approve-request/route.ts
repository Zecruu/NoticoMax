import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { familyRpcError, isUuid } from "@/lib/family/checkins";

export const runtime = "nodejs";

// Owner approval is separate from the applicant's request. The database checks
// the owner and the current seat count atomically before granting membership.
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claims?.claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!isUuid(body?.token) || (body?.action !== "approve" && body?.action !== "decline")) {
    return NextResponse.json({ error: "A valid token and action ('approve' | 'decline') are required." }, { status: 400 });
  }
  const { data: householdId, error } = await supabase.rpc("approve_family_request", { p_token: body.token, p_action: body.action });
  if (error) {
    const result = familyRpcError(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, approved: body.action === "approve", declined: body.action === "decline", householdId });
}
