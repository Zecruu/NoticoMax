/**
 * Server-side tool mediation for the Notico assistant — typed interface + stub.
 *
 * The future assistant will be allowed to write notes/reminders, but the model
 * must NEVER write to the DB directly. The flow is always:
 *   1. model proposes a tool call (name + JSON args),
 *   2. the server validates it here against a fixed allowlist + field rules,
 *   3. only then (in a later mission) does the server execute it, scoped to the
 *      authenticated user's ownership, logging an audit row alongside usage.
 *
 * This file delivers steps 1–2 (typed contract + validation) so future write
 * execution can plug into the same gate. Execution (step 3) is intentionally a
 * stub — see executeToolCall.
 */

export type AssistantToolName = "create_note" | "create_reminder";

/** Allowlist — anything not in here is rejected before validation. */
export const ALLOWED_TOOLS: AssistantToolName[] = ["create_note", "create_reminder"];

export interface CreateNoteArgs {
  title?: string;
  content: string;
  folderId?: string | null;
}

export interface CreateReminderArgs {
  title: string;
  content?: string;
  /** ISO-8601 instant the reminder fires at. */
  remindAt: string;
}

export type ValidatedToolCall =
  | { name: "create_note"; args: CreateNoteArgs }
  | { name: "create_reminder"; args: CreateReminderArgs };

export type ToolValidation =
  | { ok: true; call: ValidatedToolCall }
  | { ok: false; error: string };

const LIMITS = {
  title: 200,
  content: 20_000,
} as const;

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Validate a model-proposed tool call. Pure + synchronous: no DB access, no
 * trust in the model's JSON. Returns a narrowed, typed call on success.
 * Ownership is enforced later at execution time (the userId is bound there,
 * never taken from the model).
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
    const folderId = asString(args.folderId);
    return { ok: true, call: { name: "create_note", args: { content, title, folderId } } };
  }

  // create_reminder
  const title = asString(args.title)?.trim();
  if (!title) return { ok: false, error: "create_reminder requires a title" };
  if (title.length > LIMITS.title) return { ok: false, error: "title too long" };
  const remindAtRaw = asString(args.remindAt)?.trim();
  if (!remindAtRaw) return { ok: false, error: "create_reminder requires remindAt" };
  const ts = Date.parse(remindAtRaw);
  if (Number.isNaN(ts)) return { ok: false, error: "remindAt is not a valid date" };
  const content = asString(args.content)?.trim();
  if (content && content.length > LIMITS.content) return { ok: false, error: "content too long" };
  return {
    ok: true,
    call: {
      name: "create_reminder",
      args: { title, content, remindAt: new Date(ts).toISOString() },
    },
  };
}

/**
 * Execute a validated tool call on behalf of `userId`. STUB — DB write wiring
 * (ownership-scoped inserts + an audit row tied to the usage ledger) is a
 * deliberate follow-up. Kept here so the typed contract + gate already exist.
 */
export async function executeToolCall(
  _userId: string,
  _call: ValidatedToolCall,
): Promise<never> {
  throw new Error("Assistant tool execution is not implemented yet");
}
