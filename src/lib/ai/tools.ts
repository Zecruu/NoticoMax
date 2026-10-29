import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantFunctionCall, ChatMessage } from "@/lib/ai/openai";

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
  args: Record<string, unknown>
): ToolValidation {
  const title = asString(args.title)?.trim();
  if (!title) return { ok: false, error: `${name} requires a title` };
  if (title.length > LIMITS.title)
    return { ok: false, error: "title too long" };
  const remindAtRaw = asString(args.remindAt)?.trim();
  if (!remindAtRaw) return { ok: false, error: `${name} requires remindAt` };
  if (!/T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(remindAtRaw)) {
    return { ok: false, error: "remindAt needs an explicit timezone offset" };
  }
  const ts = Date.parse(remindAtRaw);
  if (Number.isNaN(ts))
    return { ok: false, error: "remindAt is not a valid date" };
  const content = asString(args.content)?.trim();
  if (content && content.length > LIMITS.content)
    return { ok: false, error: "content too long" };
  return {
    ok: true,
    call: {
      name,
      args: { title, content, remindAt: new Date(ts).toISOString() },
    },
  };
}

/**
 * Validate a model-proposed tool call. Pure + synchronous: no DB access, no
 * trust in the model's JSON. Returns a narrowed, typed call on success.
 */
export function validateToolCall(
  name: string,
  rawArgs: unknown
): ToolValidation {
  if (!ALLOWED_TOOLS.includes(name as AssistantToolName)) {
    return { ok: false, error: `Unknown or disallowed tool: ${name}` };
  }
  const args = (rawArgs ?? {}) as Record<string, unknown>;

  if (name === "create_note") {
    const content = asString(args.content)?.trim();
    if (!content)
      return { ok: false, error: "create_note requires non-empty content" };
    if (content.length > LIMITS.content)
      return { ok: false, error: "content too long" };
    const title = asString(args.title)?.trim();
    if (title && title.length > LIMITS.title)
      return { ok: false, error: "title too long" };
    return {
      ok: true,
      call: { name: "create_note", args: { content, title } },
    };
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
    if (title && title.length > LIMITS.title)
      return { ok: false, error: "title too long" };
    const content = asString(args.content)?.trim();
    if (content && content.length > LIMITS.content)
      return { ok: false, error: "content too long" };
    return {
      ok: true,
      call: { name: "create_url", args: { url, title, content } },
    };
  }

  // create_reminder / create_alarm share shape (alarm = reminder w/ a tag).
  return validateReminderLike(name as "create_reminder" | "create_alarm", args);
}

/**
 * Provider-independent function declarations for the assistant's write tools.
 * The Responses API adapter adds the function-tool envelope; the server
 * still validates + executes. Descriptions tell the model to use absolute
 * ISO-8601 datetimes (the chat route injects the current time).
 */
export const TOOL_DECLARATIONS = [
  {
    name: "create_note",
    description:
      "Create a note for the user. Use when they want to jot down or save text.",
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
        title: {
          type: "string",
          description: "Optional title for the bookmark.",
        },
        content: {
          type: "string",
          description: "Optional note about the link.",
        },
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
        remindAt: {
          type: "string",
          description: "Absolute ISO-8601 datetime to fire at.",
        },
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
        remindAt: {
          type: "string",
          description: "Absolute ISO-8601 datetime for the alarm.",
        },
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
const REMIND_WRITE =
  /\bremind me\b(?!\s+(what|when|where|which|who|why|how|if|whether)\b)/i;
// Interrogative openers — an information request, not a command.
const INFO_QUESTION =
  /^\s*(what|what'?s|when|where|which|who|whose|why|how|do|does|did|is|are|am|was|were|have|has|should|shall|tell me|show me|list)\b/i;
// Polite-command wrappers that look like questions but are really commands:
// "can you create…", "could you save…", "please add…".
const POLITE_COMMAND =
  /^\s*(please\s+)?((can|could|would|will)\s+you\s+|please\s+)/i;

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

  // A short answer followed by "What did I save?" is not a save command.
  // Check verbs within command clauses, rather than borrowing them from an
  // information question elsewhere in the same message.
  return t
    .split(
      /[.!?]\s+|\n+|,\s+(?=(?:also[,\s]+)?(?:what|when|where|which|who|why|how|tell me|show me)\b)/i
    )
    .some((part) => {
      const clause = part.replace(/^\s*also[,\s]+/i, "");
      if (INFO_QUESTION.test(clause) && !POLITE_COMMAND.test(clause))
        return false;
      return WRITE_VERBS.test(clause) || REMIND_WRITE.test(clause);
    });
}

export interface ConversationWriteIntent {
  source: "explicit" | "clarification" | "none";
  allowedTools: readonly AssistantToolName[];
}

const CANCEL_REQUEST =
  /(?:^|[.!?]\s*)(?:(?:actually|wait|please)[,\s]+)*(?:no\b|never\s*mind\b|cancel\b|stop\b|forget (?:it|that)\b|(?:do not|don['’]?t)\b)/i;
const COMPLETED_WRITE = /\b(?:created|saved|scheduled|done|already set)\b/i;
const SCHEDULING_QUESTION =
  /\b(?:(?:what|which)\s+(?:time\s*zone|timezone|time|date|day)|when\b[^.!?]*(?:remind|alarm|schedule))\b|remindAt (?:requires|needs|is not)|requires remindAt/i;
const SCHEDULING_WORDS = new Set(
  (
    "at on in the of and this next after today tomorrow tonight morning afternoon evening " +
    "noon midnight am pm a p m minute minutes hour hours day days week weeks month months " +
    "monday tuesday wednesday thursday friday saturday sunday mon tue tues wed thu thur thurs fri sat sun " +
    "january february march april may june july august september october november december " +
    "jan feb mar apr jun jul aug sep sept oct nov dec " +
    "utc gmt est edt cst cdt mst mdt pst pdt eastern central mountain pacific " +
    "my local time timezone zone yes sure please around instead works for me is fine thanks"
  ).split(/\s+/)
);

function isSchedulingAnswer(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 160 || CANCEL_REQUEST.test(text)) return false;
  // An IANA timezone is a valid answer to a timezone clarification.
  if (/^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(text)) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: text });
      return true;
    } catch {
      return false;
    }
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && Number.isFinite(Date.parse(text)))
    return true;
  const words =
    text
      .toLowerCase()
      .replace(/\d+(?:st|nd|rd|th)?/g, " ")
      .match(/[a-z]+/g) ?? [];
  const hasTimeOrDate =
    /\d|\b(today|tomorrow|tonight|noon|midnight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eastern|central|mountain|pacific|utc|gmt|local)\b/i.test(
      text
    );
  return hasTimeOrDate && words.every((word) => SCHEDULING_WORDS.has(word));
}

/** A scheduling answer may finish an adjacent, still-pending explicit request.
 * Never scan past an unrelated turn, a completed write, or a cancellation.
 * Continuations authorize only the original reminder/alarm tool, not all writes.
 */
export function conversationWriteIntent(
  messages: readonly ChatMessage[]
): ConversationWriteIntent {
  const none: ConversationWriteIntent = { source: "none", allowedTools: [] };
  const recent = messages.slice(-20);
  const latest = recent[recent.length - 1];
  if (latest?.role !== "user" || CANCEL_REQUEST.test(latest.content.trim()))
    return none;
  if (hasWriteIntent(latest.content))
    return { source: "explicit", allowedTools: ALLOWED_TOOLS };
  for (let index = recent.length - 1; index >= 2; index -= 2) {
    const answer = recent[index];
    const question = recent[index - 1];
    const request = recent[index - 2];
    if (
      answer.role !== "user" ||
      question.role !== "assistant" ||
      request.role !== "user"
    )
      return none;
    if (
      !isSchedulingAnswer(answer.content) ||
      COMPLETED_WRITE.test(question.content) ||
      !SCHEDULING_QUESTION.test(question.content) ||
      CANCEL_REQUEST.test(request.content.trim())
    )
      return none;
    if (hasWriteIntent(request.content)) {
      const tool = /\balarm\b/i.test(request.content)
        ? "create_alarm"
        : /\bremind(?:er)?\b/i.test(request.content)
        ? "create_reminder"
        : null;
      return tool ? { source: "clarification", allowedTools: [tool] } : none;
    }
  }
  return none;
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
function toItemRow(
  userId: string,
  call: ValidatedToolCall
): Record<string, unknown> {
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
  }
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
  call: ValidatedToolCall
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

/**
 * Execute up to two validated tool calls the model requested, then
 * compose a clear reply. Bounded + non-recursive: we never feed results back
 * for another model round.
 *
 * The conversation gate recognizes explicit commands and narrow scheduling
 * clarifications. Validation and authenticated ownership still apply to every
 * write. No model text can claim success when the server blocked its tool.
 */
export async function runToolCalls(
  admin: SupabaseClient,
  userId: string,
  functionCalls: AssistantFunctionCall[],
  modelText: string,
  messages: readonly ChatMessage[]
): Promise<string> {
  if (!functionCalls.length) return modelText || "…";

  const writeIntent = conversationWriteIntent(messages);

  const created: string[] = [];
  const failed: string[] = [];
  const clarifications: string[] = [];
  let blocked = false;

  for (const fc of functionCalls.slice(0, 2)) {
    // Gate: no explicit write request → refuse the write, log it, don't create.
    if (!writeIntent.allowedTools.includes(fc.name as AssistantToolName)) {
      blocked = true;
      await logToolAudit(admin, {
        userId,
        tool: fc.name || "unknown",
        status: "rejected",
        args: fc.args,
        error: "no_explicit_write_intent",
      });
      continue;
    }

    const validation = validateToolCall(fc.name, fc.args);
    if (!validation.ok) {
      await logToolAudit(admin, {
        userId,
        tool: fc.name || "unknown",
        status: "rejected",
        args: fc.args,
        error: validation.error,
      });
      clarifications.push(validation.error);
      continue;
    }
    try {
      const res = await executeToolCall(admin, userId, validation.call);
      created.push(`${toolNoun(validation.call.name)} “${res.title}”`);
    } catch {
      failed.push(toolNoun(validation.call.name));
    }
  }

  const parts: string[] = [];
  if (created.length)
    parts.push(`Done — I created your ${created.join(", ")}.`);
  if (failed.length)
    parts.push(`Sorry, I couldn't create the ${failed.join(", ")} just now.`);
  if (clarifications.length) {
    parts.push(
      `I need a bit more detail before I can do that: ${clarifications.join(
        "; "
      )}.`
    );
  }
  if (parts.length) return parts.join(" ");

  // Nothing was created. If we blocked a write on an info question, answer
  // honestly rather than echoing the model's tool-call reasoning.
  if (blocked) {
    return "Nothing was created. Tell me what you would like me to save or schedule.";
  }
  return modelText || "Done.";
}
