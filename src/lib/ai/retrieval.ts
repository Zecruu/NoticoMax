import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lyte retrieval: the first slice of the Supabase-first memory pipeline
 * (see docs/LYTE_ARCHITECTURE.md).
 *
 * Lyte NEVER sends the whole database to the model. This module turns the
 * user's request into a keyword search over Supabase, ranks the hits by
 * relevance + recency + importance, and compresses the top 3–10 into short
 * snippets for the system prompt. Today it is Postgres ILIKE text search; the
 * interfaces are shaped so a vector/embedding layer can slot in behind
 * `searchLyteMemory` later without touching callers.
 *
 * HARD RULE: `credential` and `envvar` items are never queried, never ranked,
 * never snippeted. The type filter below is a positive allowlist — adding a
 * type here is a privacy decision, not a convenience.
 */

/** Item types Lyte may read. NEVER add credential/envvar. */
const SAFE_ITEM_TYPES = ["note", "url", "reminder"] as const;

/** Ranked, compressed unit of context ready for the prompt. */
export interface RetrievedMemory {
  kind: "note" | "url" | "reminder" | "memory";
  title: string;
  snippet: string;
  /** ISO timestamp of last update, when known. */
  updatedAt: string | null;
  pinned: boolean;
  score: number;
}

const MAX_RESULTS = 8; // within the 3–10 target band
const SNIPPET_MAX = 240;
const MAX_KEYWORDS = 6;
const CANDIDATE_LIMIT = 40;

const STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "yours", "what", "whats", "when", "where",
  "which", "who", "why", "how", "did", "does", "have", "has", "had", "was",
  "were", "are", "this", "that", "these", "those", "with", "about", "from",
  "can", "could", "would", "will", "should", "please", "tell", "show", "give",
  "get", "got", "any", "all", "some", "there", "here", "them", "they", "just",
  "like", "want", "need", "know", "find", "look", "make", "made", "save",
  "saved", "note", "notes", "reminder", "reminders", "list", "week", "today",
  "tomorrow", "yesterday", "remember", "remind",
]);

/**
 * Pull search keywords out of a chat message: lowercase word characters only
 * (safe to embed in a PostgREST `or=` filter — no commas, dots, or wildcards
 * survive), stopwords dropped, deduped, capped.
 */
export function extractKeywords(query: string): string[] {
  const words = (query ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, MAX_KEYWORDS);
}

function compress(text: string): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > SNIPPET_MAX ? `${t.slice(0, SNIPPET_MAX - 1)}…` : t;
}

function keywordHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.reduce((n, k) => (lower.includes(k) ? n + 1 : n), 0);
}

/** 0..2 bonus that decays with age — fresh items beat stale ones on ties. */
function recencyBonus(iso: string | null): number {
  if (!iso) return 0;
  const ageDays = (Date.now() - Date.parse(iso)) / 86_400_000;
  if (Number.isNaN(ageDays)) return 0;
  return 2 / (1 + Math.max(0, ageDays) / 14);
}

interface ItemRow {
  type: string;
  title: string;
  content: string;
  url: string | null;
  reminder_date: string | null;
  pinned: boolean;
  updated_at: string;
}

interface MemoryHitRow {
  type: string;
  content: string;
  pinned: boolean;
  confidence: number | string;
  created_at: string;
}

/**
 * Search the user's Supabase memory for the given request and return the top
 * ranked, compressed snippets. Best-effort: any failure returns [] so chat
 * never breaks because retrieval did.
 *
 * Ranking: keyword hits (title worth 3×, body 1×) + recency decay + pinned
 * bonus + upcoming-reminder bonus. Pure heuristics for now — importance
 * scores and embeddings layer in later (docs/LYTE_ARCHITECTURE.md §5).
 */
export async function searchLyteMemory(
  admin: SupabaseClient,
  userId: string,
  query: string,
): Promise<RetrievedMemory[]> {
  const keywords = extractKeywords(query);
  if (!keywords.length) return [];

  const itemFilter = keywords
    .map((k) => `title.ilike.%${k}%,content.ilike.%${k}%`)
    .join(",");
  const memoryFilter = keywords.map((k) => `content.ilike.%${k}%`).join(",");

  try {
    const [itemsRes, memRes] = await Promise.all([
      admin
        .from("items")
        .select("type, title, content, url, reminder_date, pinned, updated_at")
        .eq("user_id", userId)
        .eq("deleted", false)
        .in("type", [...SAFE_ITEM_TYPES])
        .or(itemFilter)
        .order("updated_at", { ascending: false })
        .limit(CANDIDATE_LIMIT),
      admin
        .from("assistant_memory")
        .select("type, content, pinned, confidence, created_at")
        .eq("user_id", userId)
        .or(memoryFilter)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const now = Date.now();
    const results: RetrievedMemory[] = [];

    for (const raw of (itemsRes.data ?? []) as ItemRow[]) {
      // Defense in depth: the query already allowlists types, but never let a
      // sensitive row survive even if the query is edited badly one day.
      if (!SAFE_ITEM_TYPES.includes(raw.type as (typeof SAFE_ITEM_TYPES)[number])) continue;
      const hits = keywordHits(raw.title, keywords) * 3 + keywordHits(raw.content, keywords);
      if (!hits) continue;
      const upcoming =
        raw.type === "reminder" &&
        !!raw.reminder_date &&
        Date.parse(raw.reminder_date) >= now;
      const bodyBits = [
        raw.content,
        raw.url ? `URL: ${raw.url}` : "",
        raw.reminder_date ? `due ${raw.reminder_date}` : "",
      ].filter(Boolean);
      results.push({
        kind: raw.type as RetrievedMemory["kind"],
        title: raw.title,
        snippet: compress(bodyBits.join(" — ")),
        updatedAt: raw.updated_at ?? null,
        pinned: raw.pinned,
        score:
          hits +
          recencyBonus(raw.updated_at) +
          (raw.pinned ? 2 : 0) +
          (upcoming ? 2 : 0),
      });
    }

    for (const raw of (memRes.data ?? []) as MemoryHitRow[]) {
      const hits = keywordHits(raw.content, keywords);
      if (!hits) continue;
      results.push({
        kind: "memory",
        title: raw.type,
        snippet: compress(raw.content),
        updatedAt: raw.created_at ?? null,
        pinned: raw.pinned,
        score:
          hits +
          recencyBonus(raw.created_at) +
          (raw.pinned ? 2 : 0) +
          (Number(raw.confidence) || 0),
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
  } catch (err) {
    console.error("[lyte retrieval] search failed:", err);
    return [];
  }
}

/**
 * Render retrieved snippets as a compact prompt block. Empty string when
 * nothing was retrieved — callers just concatenate.
 */
export function buildRetrievalBlock(memories: RetrievedMemory[]): string {
  if (!memories.length) return "";
  const lines = memories.map((m) => {
    const date = m.updatedAt ? ` (${m.updatedAt.slice(0, 10)})` : "";
    return `- [${m.kind}] ${m.title}${date}: ${m.snippet}`;
  });
  return (
    "Relevant items retrieved from the user's NoticoMax memory for this request " +
    "(use them to answer; if they don't cover the question, say you couldn't find " +
    "it rather than guessing):\n" + lines.join("\n")
  );
}
