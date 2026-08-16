# Lyte — Supabase-first Memory Architecture

Lyte is the AI assistant inside NoticoMax. It is **not a generic chatbot**: it
is a personal memory and productivity assistant whose value grows with what the
user intentionally saves. The guiding principle for every design decision here:

> **The LLM is replaceable. The user's memory is not.**

Core loop: capture everything → remember it in structured storage → understand
relationships → retrieve only what matters → help the user act.

- **Storage source of truth: Supabase (Postgres).** MongoDB is not used and
  must not be introduced.
- **Brain: Gemini** (`gemini-3.1-flash-lite` today, via `src/lib/ai/gemini.ts`).
  Swappable behind `generateReply` without touching memory or retrieval.
- **The model never sees the database.** It sees 3–10 compressed, ranked
  snippets per request, plus recent conversation. Nothing else.

---

## 1. Current state (as of 2026-08-15)

### Storage today

| Store | Role |
|---|---|
| Supabase `items` | Synced notes, URLs, reminders — **and `envvar`/`credential` secrets** (see §7) |
| Supabase `folders`, `locations`, budget/goals/households tables | Organization + feature data |
| Supabase `assistant_usage` (migration `0011`) | Cost/usage ledger; caps enforced before every model call |
| Supabase `assistant_profile` (migration `0012`) | Assistant name (default now **Lyte**, migration `0013`) + style; user-renameable |
| Supabase `assistant_memory` (migration `0012`) | Curated preferences/facts; inspectable + deletable; secret-guarded writes |
| Supabase `assistant_tool_audit` (migration `0012`) | Every tool request logged (validated/executed/rejected/failed) |
| IndexedDB via Dexie (`src/lib/db/indexed-db.ts`) | Offline-first local copy of items/folders/study data; `sync-engine.ts` reconciles with Supabase |

Migrations `0011`, `0012` are **required** for the assistant (the chat GET
probes `assistant_usage` and the UI surfaces a "run the migrations" state);
`0013` applies the Lyte default-name rebrand. Apply in order.

### Assistant pipeline today (`/api/assistant/chat`)

1. Gate: bearer auth + server-side email allow-list (`resolveAllowedAssistantUser`).
2. Explicit "remember that…" capture from the newest user turn (secret-guarded).
3. **Retrieval** (`src/lib/ai/retrieval.ts`): keyword search over safe `items`
   types + `assistant_memory`, ranked, compressed to ≤8 snippets → system prompt.
4. Budget check against caps (300¢/mo, 25¢/day, 5¢/req, 1000 actions/mo) with a
   worst-case estimate; rejected turns are ledgered too.
5. One Gemini call with: system prompt (identity + curated memory summary +
   retrieved snippets) + the **last 20 conversation messages only**.
6. Bounded tool use: ≤2 validated tool calls (`create_note` / `create_url` /
   `create_reminder` / `create_alarm`), gated on **explicit write intent** in
   the user's message (PR #6 behavior — an info question can never create a
   note). Every call audited. `userId` bound server-side, never model-supplied.

---

## 2. Target memory model (Supabase-first)

Everything below lives in Postgres. Existing tables are kept; new tables are
added incrementally. Every table is per-user (`user_id` FK → `auth.users`,
RLS owner-read; writes only via validated server endpoints).

### 2.1 Capture surfaces → structured rows

| Content | Table (today → target) |
|---|---|
| Notes | `items(type='note')` — stays |
| URLs / bookmarks | `items(type='url')` — stays |
| Reminders / alarms | `items(type='reminder')` — stays |
| Documents / files | Supabase Storage object + `documents` row (metadata, extracted text) |
| Voice notes | Storage object + `voice_notes` row (transcript once transcribed) |
| Images / photos | Storage object + `images` row (caption/OCR text once processed) |
| Projects | `projects` (name, status, description) + `project_links` (project ↔ item edges) |
| Tags | `items.tags text[]` today → optional `tags` table when tag metadata is needed |
| Assistant memories | `assistant_memory` — stays |
| Conversation summaries | `assistant_conversations` (see §6) |
| Knowledge-graph edges | `memory_edges` (see §2.3) |

### 2.2 Enrichment envelope

Every saved item should *eventually* carry an AI-generated enrichment. Rather
than widening every table, use one sidecar table keyed by source:

```sql
create table memory_enrichment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_table text not null,          -- 'items' | 'documents' | 'voice_notes' | ...
  source_id uuid not null,
  summary text,                        -- short AI summary
  entities jsonb not null default '[]',-- [{name, kind}] people/places/orgs/dates
  auto_tags text[] not null default '{}',
  importance numeric(3,2) not null default 0.5,  -- 0..1
  embedding vector(768),               -- pgvector; null until backfilled
  embedding_model text,                -- which model produced it (replaceable brain!)
  enriched_at timestamptz,
  unique (source_table, source_id)
);
```

Enrichment is **asynchronous and optional**: capture never waits on the model,
and a missing enrichment row degrades to text search — never to failure. Cost
of enrichment calls goes through the same `assistant_usage` ledger and caps.

### 2.3 Relationships (knowledge graph)

```sql
create table memory_edges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_table text not null, from_id uuid not null,
  to_table text not null,   to_id uuid not null,
  relation text not null,   -- 'about' | 'part_of' | 'mentions' | 'related_to' | 'project'
  weight numeric(3,2) not null default 0.5,
  created_by text not null default 'ai'  -- 'ai' | 'user'
);
```

Edges are created by enrichment (entity co-occurrence, project linking) or
explicitly by the user. Retrieval can follow one hop (an item pulls in its
project's pinned facts) — never unbounded graph walks.

### 2.4 Vector search readiness

- Enable the `pgvector` extension; the `embedding` column above is the slot.
- `searchLyteMemory` is the seam: today it is ILIKE keyword search; when
  embeddings exist it becomes hybrid (vector similarity ∪ keyword hits, merged
  by the same ranker). **Callers do not change.**
- Embedding model name is stored per-row, so switching embedding providers is a
  backfill job, not a schema change.

---

## 3. Retrieval pipeline (implemented seam: `src/lib/ai/retrieval.ts`)

```
request → intent → search query → Supabase search → rank → top 3–10 → compress → prompt
```

1. **Receive** the user's message.
2. **Intent**: write-intent gate already classifies command vs. question
   (`hasWriteIntent`, PR #6). Info questions lean on retrieval; commands lean
   on tools. (Later: a cheap intent classifier can pick retrieval *strategy* —
   temporal for "this week", entity for "about Sarah".)
3. **Search query**: `extractKeywords` — lowercased word tokens, stopwords
   dropped, capped at 6, safe to embed in PostgREST filters.
4. **Search**: parallel queries over `items` (positive allowlist
   `note|url|reminder`, `deleted=false`) and `assistant_memory`. Candidates
   capped (40/20). Future: + `memory_enrichment.embedding` vector query.
5. **Rank**: keyword hits (title 3×, body 1×) + recency decay (14-day
   half-life-ish) + pinned bonus + upcoming-reminder bonus + memory confidence.
   Future: `importance` from enrichment and project-match bonus join the sum.
6. **Select** the top ≤8 (target band 3–10).
7. **Compress** each to a ≤240-char single-line snippet with kind + title + date.
8. **Prompt**: snippets + curated memory summary + last 20 messages + request.
   The model is told to answer from the snippets and to *say so* when they
   don't cover the question — never to guess.

Failure policy: retrieval is best-effort; any error returns `[]` and chat
proceeds without context rather than breaking.

---

## 4. Ranking & compression rules

- **Never** ship raw full documents to the model; snippets only.
- Ranking inputs, in priority order: query relevance → pinned/favorite →
  importance (enrichment) → project match → recency. Ties break toward recent.
- Compression is deterministic string truncation today; enrichment summaries
  replace raw-body truncation as they appear (better signal per token).
- Token budget for retrieved context stays well under the input-token cap that
  `estimateInputTokens`/`checkBudget` already enforce — snippets are counted in
  the estimate because they're inside the system prompt.

---

## 5. Conversation memory & compression (§6 referenced from code)

Today (implemented): only the **last 20 messages** are sent to the model; the
client keeps the full transcript locally.

Next slice — `assistant_conversations`:

```sql
create table assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text not null default '',        -- rolling summary of older turns
  important_facts jsonb not null default '[]',
  current_goal text,
  message_count int not null default 0,
  updated_at timestamptz not null default now()
);
```

- Every 10–20 messages, a cheap background summarization turn folds the oldest
  messages into `summary` + promotes durable facts into `assistant_memory`
  (secret-guarded, user-visible, deletable).
- The prompt then carries: rolling summary + current goal + recent messages —
  bounded forever, regardless of conversation length.
- Summarization calls are ledgered in `assistant_usage` like any other call.

---

## 6. Privacy & permissions

### Password/secret policy (hard rules, already enforced)

- `items` rows of type **`credential`/`envvar` are never queried by retrieval**
  — the type filter is a positive allowlist plus a row-level re-check.
- `assistant_memory` writes are guarded by `looksLikeSecret` — heuristic
  refusal of password/token/card-shaped content.
- No password read/write tools exist; the system prompt instructs refusal.
- Future password features (e.g. "which site was that login for?") must operate
  on **metadata only** (site name, username hint) behind an explicit opt-in,
  and still never place the secret value in model context.

### Per-category permission model (to build)

```sql
create table assistant_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,      -- 'notes'|'files'|'photos'|'calendar'|'contacts'|'voice'|'links'
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
```

- Defaults: notes/links/calendar-reminders **on** (they already power the
  assistant), files/photos/contacts/voice **off until opted in**.
- `searchLyteMemory` consults permissions before touching a category's tables;
  a denied category is invisible to retrieval and enrichment.
- Settings UI exposes toggles; the audit table already gives per-action
  traceability.

### Existing guarantees to preserve

- Server-side gate on every assistant route; model never receives `user_id`.
- Write tools require explicit user write intent (PR #6) — keep this gate in
  front of any new tool.
- All model calls server-side only; `GEMINI_API_KEY` lives in Railway env.
- Usage caps enforced *before* calls; rejected turns are also ledgered.

---

## 7. Offline / cache / sync plan (design only — do not build in this PR)

NoticoMax is already offline-first for items via Dexie + `sync-engine.ts`.
Lyte should follow the same shape:

**Cache locally (IndexedDB):**
- The user's items (already there) — this makes *local keyword search* possible
  offline with the same allowlist rules.
- `assistant_memory` rows and the assistant profile (small, non-secret).
- Recent conversation transcript + last rolling summary.

**Works offline:**
- Browsing/searching saved items (pure local keyword search, same ranker
  heuristics ported to the client).
- Reading what Lyte remembers; queueing new explicit memories.
- Drafting notes/reminders (existing offline item creation).

**Queues for sync:**
- New memories, profile renames, and any tool-created items — reuse the item
  sync queue; assistant tables get a small mirror queue with last-write-wins
  and server-side secret-guard revalidation on flush.

**Requires connectivity (by design):**
- Model turns (chat/enrichment) — the brain is server-side only; no API keys
  on device, caps enforced centrally. Offline chat shows a clear queued/offline
  state instead of pretending.

**Conflict rule:** server timestamps win for assistant tables (they're
append-mostly); item conflicts keep the existing sync-engine behavior.

---

## 8. UI overhaul handoff (for the future `painter` mission)

Priorities, in order:

1. **Memory surface**: "What Lyte remembers" should grow from a drawer into a
   first-class screen — grouped by type, searchable, with provenance (explicit
   vs. inferred) and one-tap forget. Trust is the product.
2. **Retrieval transparency**: when Lyte answers from saved items, show which
   items it used (tappable chips linking to the item). This builds trust and
   catches bad retrieval early.
3. **Capture-anything affordance**: a single quick-capture entry (text, voice,
   link, photo) that lands in NoticoMax storage and is enriched later.
4. **Permission toggles** (§6) in Settings with plain-language descriptions.
5. **Conversation continuity**: persisted transcript + "new chat" affordance
   backed by `assistant_conversations`.
6. Keep the existing keyboard-avoidance work intact (hard-won on iOS).

**Data boundaries painter can rely on:** all reads via `/api/assistant/*`;
retrieval snippets have a stable shape (`RetrievedMemory`: kind/title/snippet/
updatedAt/pinned/score); no client ever talks to Gemini or holds keys.

---

## 9. Roadmap (incremental, each step shippable)

1. ✅ This PR: Lyte rebrand, retrieval seam (`searchLyteMemory`), snippet
   prompting, history cap, migration `0013`.
2. `assistant_conversations` + rolling summarization every 10–20 messages.
3. `assistant_permissions` + Settings toggles; retrieval consults them.
4. `memory_enrichment` (summary/tags/entities/importance) as async post-save.
5. pgvector + embedding backfill → hybrid retrieval behind the same seam.
6. `projects` + `memory_edges`; one-hop graph expansion in retrieval.
7. Documents/voice/images capture with Storage + extract/transcribe pipelines.
8. Offline mirror of assistant tables + queued actions (§7).
