import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/family/checkins";

export const runtime = "nodejs";

// Leaving removes the membership; its foreign keys delete consent and the
// member's last check-in in the same transaction. RLS applies to every query.
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claims?.claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = claims.claims.sub as string;

  const body = await request.json().catch(() => null);
  if (!isUuid(body?.householdId)) return NextResponse.json({ error: "A valid family ID is required." }, { status: 400 });
  const householdId = body.householdId;
  const { data: household, error: readError } = await supabase.from("households")
    .select("id, owner_user_id").eq("id", householdId).maybeSingle();
  if (readError) return NextResponse.json({ error: "Could not load family." }, { status: 503 });
  if (!household) return NextResponse.json({ error: "Family not found or membership ended." }, { status: 404 });

  if (household.owner_user_id === userId) {
    if (body.deleteIfOwner !== true) {
      return NextResponse.json({ error: "Owners must confirm deleting the family before leaving." }, { status: 400 });
    }
    const { error } = await supabase.from("households").delete().eq("id", householdId);
    if (error) return NextResponse.json({ error: "Could not delete family." }, { status: 503 });
    return NextResponse.json({ ok: true, deleted: true });
  }

  const { error } = await supabase.from("household_members").delete()
    .eq("household_id", householdId).eq("user_id", userId);
  if (error) return NextResponse.json({ error: "Could not leave family." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
