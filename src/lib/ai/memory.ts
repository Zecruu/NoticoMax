import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Assistant memory: user-owned preferences and secretary-style habits the
 * assistant is trusted to remember. Stored in `assistant_memory` (migration
 * 0012). Inspectable + deletable by the user.
 *
 * HARD RULE: secrets, passwords, tokens, and payment data are NEVER stored here.
 * `looksLikeSecret` guards every write.
 */

export type MemoryType = "preference" | "instruction" | "do" | "dont" | "fact" | "style";
export type MemorySource = "user_explicit" | "assistant_inferred" | "system";

const MEMORY_TYPES: MemoryType[] = ["preference", "instruction", "do", "dont", "fact", "style"];
const MAX_CONTENT = 500;
/** How many memories to fold into the prompt — a curated summary, not history. */
const SUMMARY_MAX = 20;

export interface MemoryRow {
  id: string;
  type: MemoryType;
  content: string;
  source: MemorySource;
  confidence: number;
  pinned: boolean;
  createdAt: string;
}

interface RawMemoryRow {
  id: string;
  type: string;
  content: string;
  source: string;
  confidence: number | string;
  pinned: boolean;
  created_at: string;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function cap(text: string): string {
  const t = text.trim();
  return t.length > MAX_CONTENT ? t.slice(0, MAX_CONTENT) : t;
}

/**
 * Heuristic guard: refuse to persist anything that looks like a secret. Better
 * to drop a borderline-useful memory than to ever store a credential.
 */
export function looksLikeSecret(text: string): boolean {
  if (
    /(pass(?:word|phrase)|secret|api[\s_-]?key|access[\s_-]?token|\btoken\b|credit\s*card|\bcvv\b|\bssn\b|routing\s*number|seed\s*phrase|private\s*key|\bpin\b)/i.test(
      text,
    )
  ) {
    return true;
  }
  // Long opaque strings (keys/tokens) — no spaces, 24+ chars.
  return /(^|\s)[A-Za-z0-9_\-]{24,}(\s|$)/.test(text);
}

function rowToMemory(r: RawMemoryRow): MemoryRow {
  return {
    id: r.id,
    type: (MEMORY_TYPES.includes(r.type as MemoryType) ? r.type : "preference") as MemoryType,
    content: r.content,
    source: r.source as MemorySource,
    confidence: Number(r.confidence) || 0,
    pinned: !!r.pinned,
    createdAt: r.created_at,
  };
}

export async function listMemories(
  admin: SupabaseClient,
  userId: string,
): Promise<MemoryRow[]> {
  const { data } = await admin
    .from("assistant_memory")
    .select("id, type, content, source, confidence, pinned, created_at")
    .eq("user_id", userId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []).map((r) => rowToMemory(r as RawMemoryRow));
}

export async function addMemory(
  admin: SupabaseClient,
  userId: string,
  input: {
    type?: MemoryType;
    content: string;
    source?: MemorySource;
    confidence?: number;
    pinned?: boolean;
  },
): Promise<MemoryRow | { rejected: "empty" | "too_long" | "secret" }> {
  const content = cap(input.content ?? "");
  if (!content) return { rejected: "empty" };
  if ((input.content ?? "").trim().length > MAX_CONTENT) return { rejected: "too_long" };
  if (looksLikeSecret(content)) return { rejected: "secret" };

  const type = MEMORY_TYPES.includes(input.type as MemoryType)
    ? (input.type as MemoryType)
    : "preference";
  const source: MemorySource = input.source ?? "user_explicit";
  const confidence = clamp(
    input.confidence ?? (source === "assistant_inferred" ? 0.5 : 1),
    0,
    1,
  );
  const pinned = input.pinned ?? source === "user_explicit";

  const { data, error } = await admin
    .from("assistant_memory")
    .insert({ user_id: userId, type, content, source, confidence, pinned })
    .select("id, type, content, source, confidence, pinned, created_at")
    .single();
  if (error || !data) return { rejected: "empty" };
  return rowToMemory(data as RawMemoryRow);
}

export async function deleteMemory(
  admin: SupabaseClient,
  userId: string,
  id: string,
): Promise<boolean> {
  const { error } = await admin
    .from("assistant_memory")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  return !error;
}

/**
 * A small curated memory block for the system prompt — pinned + confident items
 * only, capped. Never the full history.
 */
export function buildMemorySummary(memories: MemoryRow[]): string {
  const curated = memories
    .filter((m) => m.pinned || m.confidence >= 0.6)
    .slice(0, SUMMARY_MAX);
  if (!curated.length) return "";
  return curated.map((m) => `- (${m.type}) ${m.content}`).join("\n");
}

/**
 * Detect an explicit "remember this" intent in a user message. Returns a memory
 * candidate or null. Prefers explicit phrasing; refuses anything secret-shaped.
 */
export function detectExplicitMemory(
  text: string,
): { type: MemoryType; content: string } | null {
  const t = (text ?? "").trim();
  if (!t || looksLikeSecret(t)) return null;

  let m: RegExpMatchArray | null;
  if ((m = t.match(/^\s*(?:please\s+)?remember(?:\s+that)?[:,]?\s+(.+)/i))) {
    return { type: "fact", content: cap(m[1]) };
  }
  if ((m = t.match(/^\s*i\s+(?:really\s+)?(?:like|love|prefer|enjoy)\s+(.+)/i))) {
    return { type: "preference", content: cap(`Likes ${m[1]}`) };
  }
  if ((m = t.match(/^\s*i\s+(?:really\s+)?(?:hate|dislike|don'?t\s+like)\s+(.+)/i))) {
    return { type: "dont", content: cap(`Dislikes ${m[1]}`) };
  }
  if ((m = t.match(/^\s*(?:always|please\s+always)\s+(.+)/i))) {
    return { type: "do", content: cap(`Always ${m[1]}`) };
  }
  if ((m = t.match(/^\s*(?:never|please\s+never|don'?t)\s+(.+)/i))) {
    return { type: "dont", content: cap(`Never ${m[1]}`) };
  }
  return null;
}
