import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Returns the current user + entitlements for the active session.
 * Replaces /api/auth/verify (which used custom session tokens).
 */
export async function GET() {
  const supabase = await getSupabaseServerClient();

  const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claimsData?.claims) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const userId = claimsData.claims.sub as string;
  const email = (claimsData.claims.email as string) || null;

  const { data: ent } = await supabase
    .from("entitlements")
    .select(
      "lifetime_pro, pro_expires_at, pro_source, family_plan_active, extra_seats, storage_plan, storage_bytes_used",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const lifetimePro = ent?.lifetime_pro === true;
  const proActive =
    lifetimePro ||
    (ent?.pro_expires_at ? new Date(ent.pro_expires_at) > new Date() : false);

  return NextResponse.json({
    authenticated: true,
    userId,
    email,
    entitlements: {
      proActive,
      syncEnabled: proActive,
      adsRemoved: proActive,
      source: ent?.pro_source ?? null,
      expiresAt: ent?.pro_expires_at ?? null,
      lifetimePro,
      familyPlanActive: ent?.family_plan_active === true,
      extraSeats: ent?.extra_seats ?? 0,
      storagePlan: ent?.storage_plan ?? "free",
      storageBytesUsed: ent?.storage_bytes_used ?? 0,
    },
  });
}
