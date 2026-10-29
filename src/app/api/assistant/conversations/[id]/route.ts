import { NextRequest, NextResponse } from "next/server";
import { resolveAllowedAssistantUser } from "@/lib/ai/gate";
import { conversationError } from "@/lib/ai/conversations";
import { UUID } from "@/lib/ai/conversation-types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;
  const { id } = await context.params;
  const before = Number(request.nextUrl.searchParams.get("before") ?? Number.MAX_SAFE_INTEGER);
  if (!UUID.test(id) || !Number.isSafeInteger(before) || before <= 0)
    return NextResponse.json({ error: "Invalid chat" }, { status: 400 });
  const admin = getSupabaseAdminClient();
  const conversation = await admin.from("lyte_conversations").select("id, title, updated_at, storage_bytes").eq("user_id", gate.userId).eq("id", id).maybeSingle();
  if (conversation.error) return NextResponse.json({ error: "Couldn't load this chat." }, { status: 503 });
  if (!conversation.data) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  const result = await admin.from("lyte_conversation_turns")
    .select("id, request_id, user_content, assistant_content, status, created_at")
    .eq("user_id", gate.userId).eq("conversation_id", id).lt("id", before).order("id", { ascending: false }).limit(31);
  if (result.error) return NextResponse.json({ error: "Couldn't load this chat." }, { status: 503 });
  return NextResponse.json({ conversation: conversation.data, turns: result.data.slice(0, 30).reverse(), hasMore: result.data.length > 30 }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest, context: Context) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid chat" }, { status: 400 });
  const result = await getSupabaseAdminClient().rpc("lyte_delete_conversation", { p_user: gate.userId, p_conversation: id });
  if (result.error) {
    const error = conversationError(result.error);
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ deleted: true });
}
