import type { SupabaseClient } from "@supabase/supabase-js";
import { storageTier } from "../billing/storage.ts";
import { UUID, MAX_MESSAGE_BYTES, type ConversationTurn } from "./conversation-types.ts";

export class ConversationError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) { super(message); this.status = status; this.code = code; }
}

export function conversationError(error: { message?: string }): ConversationError {
  const message = error.message ?? "";
  if (message.includes("storage_full")) return new ConversationError("Your cloud storage is full. Delete a past chat to make room, then try again.", 413, "storage_full");
  if (message.includes("conversation_not_found")) return new ConversationError("This chat could not be found.", 404, "not_found");
  if (message.includes("conversation_busy")) return new ConversationError("This chat still has a reply in progress. Reopen it to check before sending again.", 409, "busy");
  if (message.includes("request_conflict")) return new ConversationError("This message was already submitted with different content.", 409, "request_conflict");
  return new ConversationError("Couldn't save your chat. Please try again later.", 503, "history_unavailable");
}

export function parseConversationRequest(body: Record<string, unknown>) {
  if (typeof body.conversationId !== "string" || !UUID.test(body.conversationId) ||
      typeof body.requestId !== "string" || !UUID.test(body.requestId) ||
      typeof body.message !== "string" || !body.message.trim() ||
      new TextEncoder().encode(body.message.trim()).length > MAX_MESSAGE_BYTES) {
    throw new ConversationError("Send a message of up to 16 KB with a valid chat and request ID.", 400, "invalid_message");
  }
  return { conversationId: body.conversationId, requestId: body.requestId, message: body.message.trim() };
}

export async function cloudStorage(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin.from("entitlements").select("storage_plan, storage_bytes_used").eq("user_id", userId).maybeSingle();
  if (error) throw conversationError(error);
  return { used: Number(data?.storage_bytes_used ?? 0), limit: storageTier(data?.storage_plan).bytes };
}

export async function recentConversationTurns(admin: SupabaseClient, userId: string, conversationId: string) {
  const { data, error } = await admin.from("lyte_conversation_turns")
    .select("id, request_id, user_content, assistant_content, status, created_at")
    .eq("user_id", userId).eq("conversation_id", conversationId).eq("status", "completed")
    .order("id", { ascending: false }).limit(10);
  if (error) throw conversationError(error);
  return (data as ConversationTurn[]).reverse();
}
