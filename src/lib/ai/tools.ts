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

export interface ToolExecutionResult {
  clientId: string;
  type: string;
  title: string;
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
