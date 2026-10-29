import { NextRequest, NextResponse } from "next/server";
import { resolveAllowedAssistantUser } from "@/lib/ai/gate";
import { cloudStorage, conversationError } from "@/lib/ai/conversations";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000)
    return NextResponse.json({ error: "Invalid history page" }, { status: 400 });
  const admin = getSupabaseAdminClient();
  try {
    const [result, storage] = await Promise.all([
      admin.from("lyte_conversations").select("id, title, updated_at, storage_bytes")
        .eq("user_id", gate.userId).order("updated_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 40),
      cloudStorage(admin, gate.userId),
    ]);
    if (result.error) throw conversationError(result.error);
    return NextResponse.json({ conversations: result.data.slice(0, 40), hasMore: result.data.length > 40, storage }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load your past chats. Please try again." }, { status: 503 });
  }
}
