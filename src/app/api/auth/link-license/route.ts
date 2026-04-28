import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Activate a legacy product key (NMAX-XXXX-XXXX-XXXX) for the currently
 * signed-in user. Binds the license row to user_id and grants Pro entitlement.
 */
export async function POST(request: NextRequest) {
  try {
    const { licenseKey } = (await request.json()) as { licenseKey?: string };

    if (!licenseKey) {
      return NextResponse.json({ error: "License key required" }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims();
    if (claimsErr || !claimsData?.claims) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    const userId = claimsData.claims.sub as string;

    const admin = getSupabaseAdminClient();
    const trimmedKey = licenseKey.trim();

    const { data: license, error: lookupErr } = await admin
      .from("licenses")
      .select("license_key, active, user_id")
      .eq("license_key", trimmedKey)
      .maybeSingle();

    if (lookupErr) {
      console.error("[link-license] lookup error:", lookupErr.message);
      return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
    }
    if (!license) {
      return NextResponse.json({ error: "Invalid product key" }, { status: 403 });
    }
    if (!license.active) {
      return NextResponse.json({ error: "This product key has been deactivated" }, { status: 403 });
    }
    if (license.user_id && license.user_id !== userId) {
      return NextResponse.json(
        { error: "This product key is already activated on another account" },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("licenses")
      .update({ user_id: userId, activated_at: now })
      .eq("license_key", trimmedKey);
    if (updateErr) {
      console.error("[link-license] update error:", updateErr.message);
      return NextResponse.json({ error: "Activation failed" }, { status: 500 });
    }

    await admin
      .from("entitlements")
      .upsert(
        {
          user_id: userId,
          lifetime_pro: false,
          pro_source: "license_key",
          pro_expires_at: null,
        },
        { onConflict: "user_id" }
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[link-license] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
