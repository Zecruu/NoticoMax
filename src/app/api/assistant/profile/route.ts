import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveAllowedAssistantUser } from "@/lib/ai/gate";
import { getProfile, upsertProfile } from "@/lib/ai/profile";

export const runtime = "nodejs";

/** GET /api/assistant/profile — the caller's assistant name + style. */
export async function GET(request: NextRequest) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;

  const admin = getSupabaseAdminClient();
  const profile = await getProfile(admin, gate.userId);
  return NextResponse.json({ profile });
}

/** PUT /api/assistant/profile — rename / restyle the assistant. */
export async function PUT(request: NextRequest) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  try {
    const profile = await upsertProfile(admin, gate.userId, {
      displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      styleSummary:
        typeof body.styleSummary === "string" || body.styleSummary === null
          ? (body.styleSummary as string | null)
          : undefined,
    });
    return NextResponse.json({ profile });
  } catch (err) {
    console.error("[assistant profile] update failed:", err);
    return NextResponse.json({ error: "Couldn't save the profile" }, { status: 500 });
  }
}
