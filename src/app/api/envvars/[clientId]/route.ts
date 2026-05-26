import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireBearerScope } from "@/lib/supabase/bearer-auth";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ clientId: string }>;
}

// DELETE /api/envvars/:clientId — soft-delete to match the web sync engine.
export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const auth = await requireBearerScope(request, "envvars");
  if (auth.error) return auth.error;
  const { clientId } = await ctx.params;

  const now = new Date().toISOString();
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("items")
    .update({ deleted: true, deleted_at: now, updated_at: now })
    .eq("client_id", clientId)
    .eq("user_id", auth.userId)
    .eq("type", "envvar")
    .select("client_id")
    .maybeSingle();

  if (error) {
    console.error("[envvars DELETE] failed:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
