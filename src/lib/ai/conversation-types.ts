export interface Conversation {
  id: string;
  title: string;
  updated_at: string;
  storage_bytes: number;
}

export interface ConversationTurn {
  id: number;
  request_id: string;
  user_content: string;
  assistant_content: string | null;
  status: "pending" | "completed" | "failed";
  created_at: string;
}

export interface CloudStorage {
  used: number;
  limit: number;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const MAX_REPLY_BYTES = 64 * 1024;

/** Only confirmed turns enter model context; interrupted work is never replayed. */
export function conversationContext(turns: ConversationTurn[], message: string) {
  return [
    ...turns.filter((turn) => turn.status === "completed").flatMap((turn) => [
      { role: "user" as const, content: turn.user_content },
      { role: "assistant" as const, content: turn.assistant_content ?? "" },
    ]),
    { role: "user" as const, content: message },
  ].slice(-20);
}
