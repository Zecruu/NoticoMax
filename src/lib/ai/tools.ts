import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side tool mediation for the Notico assistant.
 *
 * The model must NEVER write to the DB directly. The flow is always:
 *   1. model (or UI) proposes a tool call (name + JSON args),
 *   2. the server validates it here against a fixed allowlist + field rules,
 *   3. the server executes it scoped to the AUTHENTICATED user's ownership
 *      (userId is bound server-side, never taken from the model), writing to the
 *      same `items` table the app syncs from, and logs an audit row.
 *
 * Passwords/credentials are intentionally NOT writable or readable here.
 */

export type AssistantToolName =
  | "create_note"
  | "create_url"
  | "create_reminder"
  | "create_alarm";

/** Allowlist — anything not in here is rejected before validation. */
export const ALLOWED_TOOLS: AssistantToolName[] = [
  "create_note",
  "create_url",
  "create_reminder",
  "create_alarm",
];

export interface CreateNoteArgs {
  title?: string;
  content: string;
}
export interface CreateUrlArgs {
  url: string;
  title?: string;
  content?: string;
}
export interface CreateReminderArgs {
  title: string;
  content?: string;
  /** ISO-8601 instant the reminder fires at. */
  remindAt: string;
}
export type CreateAlarmArgs = CreateReminderArgs;

export type ValidatedToolCall =
  | { name: "create_note"; args: CreateNoteArgs }
  | { name: "create_url"; args: CreateUrlArgs }
  | { name: "create_reminder"; args: CreateReminderArgs }
  | { name: "create_alarm"; args: CreateAlarmArgs };

export type ToolValidation =
  | { ok: true; call: ValidatedToolCall }
  | { ok: false; error: string };

const LIMITS = {
  title: 200,
  content: 20_000,
  url: 2_048,
} as const;

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function titleFromContent(content: string): string {
  const firstLine = content.split("\n")[0].trim();
  return (firstLine || "Note").slice(0, LIMITS.title);
}

function validateReminderLike(
  name: "create_reminder" | "create_alarm",
  args: Record<string, unknown>,
): ToolValidation {
  const title = asString(args.title)?.trim();
  if (!title) return { ok: false, error: `${name} requires a title` };
  if (title.length > LIMITS.title) return { ok: false, error: "title too long" };
  const remindAtRaw = asString(args.remindAt)?.trim();
  if (!remindAtRaw) return { ok: false, error: `${name} requires remindAt` };
  const ts = Date.parse(remindAtRaw);
  if (Number.isNaN(ts)) return { ok: false, error: "remindAt is not a valid date" };
  const content = asString(args.content)?.trim();
  if (content && content.length > LIMITS.content) return { ok: false, error: "content too long" };
  return {
    ok: true,
    call: { name, args: { title, content, remindAt: new Date(ts).toISOString() } },
  };
}

/**
 * Validate a model-proposed tool call. Pure + synchronous: no DB access, no
 * trust in the model's JSON. Returns a narrowed, typed call on success.
 */
export function validateToolCall(name: string, rawArgs: unknown): ToolValidation {
  if (!ALLOWED_TOOLS.includes(name as AssistantToolName)) {
    return { ok: false, error: `Unknown or disallowed tool: ${name}` };
  }
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  if (name === "create_note") {
    const content = asString(args.content)?.trim();
    if (!content) return { ok: false, error: "create_note requires non-empty content" };
    if (content.length > LIMITS.content) return { ok: false, error: "content too long" };
    const title = asString(args.title)?.trim();
    if (title && title.length > LIMITS.title) return { ok: false, error: "title too long" };
    return { ok: true, call: { name: "create_note", args: { content, title } } };
  }

  if (name === "create_url") {
    const url = asString(args.url)?.trim();
    if (!url) return { ok: false, error: "create_url requires a url" };
    if (url.length > LIMITS.url) return { ok: false, error: "url too long" };
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: "url is not valid" };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "url must be http(s)" };
    }
    const title = asString(args.title)?.trim();
    if (title && title.length > LIMITS.title) return { ok: false, error: "title too long" };
    const content = asString(args.content)?.trim();
    if (content && content.length > LIMITS.content) return { ok: false, error: "content too long" };
    return { ok: true, call: { name: "create_url", args: { url, title, content } } };
  }

  // create_reminder / create_alarm share shape (alarm = reminder w/ a tag).
  return validateReminderLike(name as "create_reminder" | "create_alarm", args);
}

/**
 * Gemini function declarations for the assistant's write tools. Passed as
 * `tools[].functionDeclarations` so the model can request a tool; the server
 * still validates + executes. Descriptions tell the model to use absolute
 * ISO-8601 datetimes (the chat route injects the current time).
 */
export const TOOL_DECLARATIONS = [
  {
    name: "create_note",
    description: "Create a note for the user. Use when they want to jot down or save text.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The note body." },
        title: { type: "string", description: "Optional short title." },
      },
      required: ["content"],
    },
  },
  {
    name: "create_url",
    description: "Save a URL / bookmark for the user.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The http(s) URL to save." },
        title: { type: "string", description: "Optional title for the bookmark." },
        content: { type: "string", description: "Optional note about the link." },
      },
      required: ["url"],
    },
  },
  {
    name: "create_reminder",
    description:
      "Create a reminder. Resolve relative times (e.g. 'tomorrow 9am') to an absolute ISO-8601 datetime using the current time provided in the system prompt.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "What to be reminded about." },
        remindAt: { type: "string", description: "Absolute ISO-8601 datetime to fire at." },
        content: { type: "string", description: "Optional extra detail." },
      },
      required: ["title", "remindAt"],
    },
  },
  {
    name: "create_alarm",
    description:
      "Create an alarm at a specific absolute ISO-8601 datetime. Like a reminder but for a precise alarm time.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Label for the alarm." },
        remindAt: { type: "string", description: "Absolute ISO-8601 datetime for the alarm." },
        content: { type: "string", description: "Optional extra detail." },
      },
      required: ["title", "remindAt"],
    },
  },
] as const;

export interface ToolExecutionResult {
  clientId: string;
  type: string;
  title: string;
}

// Write verbs/phrases. Kept deliberately broad but only consulted once a
// message is established to be a command, not a question.
const WRITE_VERBS =
  /\b(create|save|saving|add|adding|make|set|record|log|bookmark|jot|store|capture|append|put|note)\b|note (this|that|it|down)|write (this|that|it|down)|new (note|reminder|alarm|bookmark|url|link|to-?do)/i;
// "remind me to/about/at ..." is a command; "remind me what/when ..." is a
// question (handled by the question check below).
const REMIND_WRITE = /\bremind me\b(?!\s+(what|when|where|which|who|why|how|if|whether)\b)/i;
// Interrogative openers — an information request, not a command.
const INFO_QUESTION =
  /^\s*(what|what'?s|when|where|which|who|whose|why|how|do|does|did|is|are|am|was|were|have|has|should|shall|tell me|show me|list)\b/i;
// Polite-command wrappers that look like questions but are really commands:
// "can you create…", "could you save…", "please add…".
const POLITE_COMMAND = /^\s*(please\s+)?((can|could|would|will)\s+you\s+|please\s+)/i;

/**
 * Decide whether the user's latest message explicitly asks the assistant to
 * WRITE something, vs. asking for information. Gates every create_* tool so an
 * info question ("what do I have this week?") can never create a note. Pure +
 * synchronous so it's easy to reason about and test.
 *
 * Rule: a message phrased as a question writes nothing (even if it contains a
 * verb like "save" in "what did I save?"), unless it's a polite command
 * ("can you save…"). Otherwise, an explicit write verb signals intent.
 */
export function hasWriteIntent(message: string): boolean {
  const t = (message ?? "").trim();
  if (!t) return false;

  const isQuestion = INFO_QUESTION.test(t) && !POLITE_COMMAND.test(t);
  if (isQuestion) return false;

  return WRITE_VERBS.test(t) || REMIND_WRITE.test(t);
}

/** Human-friendly label for a tool, used in assistant confirmations. */
export function toolNoun(name: AssistantToolName): string {
  switch (name) {
    case "create_note":
      return "note";
    case "create_url":
      return "bookmark";
    case "create_reminder":
      return "reminder";
    case "create_alarm":
      return "alarm";
  }
}

/** Map a validated call to an `items` row insert payload. */
function toItemRow(userId: string, call: ValidatedToolCall): Record<string, unknown> {
  switch (call.name) {
    case "create_note":
      return {
        user_id: userId,
        type: "note",
        title: call.args.title?.trim() || titleFromContent(call.args.content),
        content: call.args.content,
      };
    case "create_url":
      return {
        user_id: userId,
        type: "url",
        title: call.args.title?.trim() || call.args.url,
        content: call.args.content ?? "",
        url: call.args.url,
      };
    case "create_reminder":
      return {
        user_id: userId,
        type: "reminder",
        title: call.args.title,
        content: call.args.content ?? "",
        reminder_date: call.args.remindAt,
        reminder_completed: false,
      };
    case "create_alarm":
      return {
        user_id: userId,
        type: "reminder",
        title: call.args.title,
        content: call.args.content ?? "",
        reminder_date: call.args.remindAt,
        reminder_completed: false,
        // The items schema has no 'alarm' type; tag the reminder so the alarm
        // intent is preserved and queryable.
        tags: ["alarm"],
      };
  }
}

/** Append a tool-audit row. Best-effort: logs but never throws. */
export async function logToolAudit(
  admin: SupabaseClient,
  entry: {
    userId: string;
    tool: string;
    status: "validated" | "executed" | "rejected" | "failed";
    targetClientId?: string | null;
    args?: unknown;
    error?: string | null;
  },
): Promise<void> {
  const { error } = await admin.from("assistant_tool_audit").insert({
    user_id: entry.userId,
    tool: entry.tool,
    status: entry.status,
    target_client_id: entry.targetClientId ?? null,
    args: entry.args ?? {},
    error: entry.error ?? null,
  });
  if (error) console.error("[assistant tool audit] insert failed:", error);
}

/**
 * Execute a validated tool call for `userId`, writing to the synced `items`
 * table and logging an audit row. Ownership is bound to the authenticated
 * userId here — never taken from model input.
 */
export async function executeToolCall(
  admin: SupabaseClient,
  userId: string,
  call: ValidatedToolCall,
): Promise<ToolExecutionResult> {
  const row = toItemRow(userId, call);
  const { data, error } = await admin
    .from("items")
    .insert(row)
    .select("client_id, type, title")
    .single();

  if (error || !data) {
    await logToolAudit(admin, {
      userId,
      tool: call.name,
      status: "failed",
      args: call.args,
      error: error?.message ?? "insert failed",
    });
    throw new Error(error?.message ?? "Tool execution failed");
  }

  await logToolAudit(admin, {
    userId,
    tool: call.name,
    status: "executed",
    targetClientId: data.client_id as string,
    args: call.args,
  });

  return {
    clientId: data.client_id as string,
    type: data.type as string,
    title: data.title as string,
  };
}
