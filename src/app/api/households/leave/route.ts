import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// POST /api/households/leave — body { householdId, deleteIfOwner? }
// Member leaves a household. If the caller is the owner:
//   - deleteIfOwner=true → delete the whole household (cascades to members)
//   - otherwise → 400; owners must transfer or delete, not just leave
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub as string;

  const body = await request.json().catch(() => ({}));
  const householdId = typeof body.householdId === "string" ? body.householdId : "";
  const deleteIfOwner = body.deleteIfOwner === true;
  if (!householdId) {
    return NextResponse.json({ error: "householdId required" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const { data: household } = await admin
    .from("households")
    .select("id, owner_user_id")
    .eq("id", householdId)
    .maybeSingle();
  if (!household) {
    return NextResponse.json({ error: "Household not found" }, { status: 404 });
  }

  const isOwner = household.owner_user_id === userId;

  if (isOwner) {
    if (!deleteIfOwner) {
      return NextResponse.json(
        { error: "Owners can't leave without deleting the household. Re-send with deleteIfOwner:true to confirm." },
        { status: 400 },
      );
    }
    const { error } = await admin.from("households").delete().eq("id", householdId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: true });
  }

  const { error } = await admin
    .from("household_members")
    .delete()
    .eq("household_id", householdId)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
