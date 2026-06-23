import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveAllowedAssistantUser } from "@/lib/ai/gate";
import {
  CAPS,
  checkBudget,
  estimateCostCents,
  estimateInputTokens,
  maxOutputTokensForCap,
  recordUsage,
} from "@/lib/ai/usage";
import {
  ASSISTANT_MODEL,
  generateReply,
  type ChatMessage,
  type GeminiFunctionCall,
  type GeminiTool,
} from "@/lib/ai/gemini";
import { getProfile } from "@/lib/ai/profile";
import {
  addMemory,
  buildMemorySummary,
  detectExplicitMemory,
  listMemories,
} from "@/lib/ai/memory";
import {
  TOOL_DECLARATIONS,
  executeToolCall,
  hasWriteIntent,
  logToolAudit,
  toolNoun,
  validateToolCall,
} from "@/lib/ai/tools";

export const runtime = "nodejs";

/** At most this many tool calls are executed per chat turn (no autonomy). */
const MAX_TOOL_CALLS = 2;

const ASSISTANT_TOOLS: GeminiTool[] = [{ functionDeclarations: [...TOOL_DECLARATIONS] }];

/** Assemble the system prompt from the assistant's name + curated memory. */
function buildSystemPrompt(name: string, memorySummary: string, nowIso: string): string {
  const base =
    `You are ${name}, the user's personal assistant inside the NOTICO MAX app. ` +
    "Be concise, warm, and genuinely helpful with their notes, URLs, reminders, " +
    "and day-to-day organization. Respect the user's stated preferences and habits.";
  const tools =
    ` The current date and time is ${nowIso}. You can take actions by calling the ` +
    "provided tools to create notes, URLs/bookmarks, reminders, and alarms for the user. " +
    "Only call a tool when the user clearly asks to create/save/remind/set something. " +
    "Resolve relative times to an absolute ISO-8601 datetime. If a request is missing " +
    "required details (e.g. a reminder with no time), ask a brief clarifying question " +
    "instead of guessing.";
  const security =
    " SECURITY: Never ask for, store, repeat, or reveal passwords, secrets, API keys, " +
    "or payment details. You do not have access to the user's saved passwords or " +
    "credentials, and there is no tool to read them. If asked to expose a saved password, " +
    "politely decline.";
  const memory = memorySummary
    ? `\n\nWhat you remember about this user (honor these):\n${memorySummary}`
    : "";
  return base + tools + security + memory;
}

/**
 * GET /api/assistant/chat — status for the UI: configured + allowed + budget.
 */
export async function GET(request: NextRequest) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;

  const configured = !!process.env.GEMINI_API_KEY;
  const admin = getSupabaseAdminClient();

  // Probe the assistant ledger so the UI can show a precise "run the migration"
  // state instead of a generic failure when the tables don't exist yet.
  const probe = await admin.from("assistant_usage").select("id").limit(1);
  const migrationsReady = !(
    probe.error && (probe.error as { code?: string }).code === "42P01"
  );

  const budget = migrationsReady ? await checkBudget(admin, gate.userId) : null;

  return NextResponse.json({
    enabled: configured && migrationsReady && !!budget?.allowed,
    configured,
    migrationsReady,
    model: ASSISTANT_MODEL,
    caps: CAPS,
    usage: budget
      ? {
          monthlyCentsUsed: budget.monthlyCentsUsed,
          dailyCentsUsed: budget.dailyCentsUsed,
          monthlyActions: budget.monthlyActions,
        }
      : null,
    blockedReason: budget && !budget.allowed ? budget.reason : null,
  });
}

/**
 * POST /api/assistant/chat — one assistant turn.
 * Body: { messages: { role: "user"|"assistant", content: string }[] }
 *   (or { message: string } shorthand for a single user turn).
 */
export async function POST(request: NextRequest) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;
  const { userId, email } = gate;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "The assistant isn't configured yet. Please try again later." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = normalizeMessages(body);
  if (!messages.length) {
    return NextResponse.json(
      { error: "Provide `messages` or a `message` string." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdminClient();

  // Capture an explicit "remember this" from the latest user turn before we
  // build the memory summary, so it's honored immediately. Best-effort + never
  // stores secrets (addMemory guards).
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  let savedMemory = false;
  if (lastUser) {
    const candidate = detectExplicitMemory(lastUser.content);
    if (candidate) {
      const res = await addMemory(admin, userId, {
        type: candidate.type,
        content: candidate.content,
        source: "user_explicit",
      });
      savedMemory = !("rejected" in res);
    }
  }

  const [profile, memories] = await Promise.all([
    getProfile(admin, userId),
    listMemories(admin, userId),
  ]);
  const systemPrompt = buildSystemPrompt(
    profile.displayName,
    buildMemorySummary(memories),
    new Date().toISOString(),
  );

  const inputTokensEst = messages.reduce(
    (n, m) => n + estimateInputTokens(m.content),
    estimateInputTokens(systemPrompt),
  );
  const maxOutputTokens = maxOutputTokensForCap();
  const worstCaseCents = estimateCostCents(inputTokensEst, maxOutputTokens);

  const budget = await checkBudget(admin, userId, { pendingCostCents: worstCaseCents });
  if (!budget.allowed) {
    await recordUsage(admin, {
      userId,
      userEmail: email,
      model: ASSISTANT_MODEL,
      status: "rejected",
      inputTokens: inputTokensEst,
      estimatedCostCents: worstCaseCents,
      metadata: { reason: budget.reason },
    });
    return NextResponse.json(
      { error: budget.reason ?? "Usage limit reached", code: "budget_exceeded" },
      { status: 429 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const result = await generateReply({
      apiKey,
      model: ASSISTANT_MODEL,
      messages,
      systemPrompt,
      maxOutputTokens,
      tools: ASSISTANT_TOOLS,
      signal: controller.signal,
    });

    const actualCostCents = estimateCostCents(result.inputTokens, result.outputTokens);
    await recordUsage(admin, {
      userId,
      userEmail: email,
      model: ASSISTANT_MODEL,
      status: "completed",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estimatedCostCents: worstCaseCents,
      actualCostCents,
      metadata: { cost_basis: "estimated_from_token_rates" },
    });

    // Bounded, non-recursive tool use: execute up to MAX_TOOL_CALLS validated
    // tool calls the model requested this turn, then return a clear reply. The
    // model never gets a user_id — executeToolCall binds it to the authed user.
    // Writes are gated on explicit user write-intent (see runToolCalls).
    const reply = await runToolCalls(
      admin,
      userId,
      result.functionCalls,
      result.text,
      lastUser?.content ?? "",
    );
    return NextResponse.json({ reply, savedMemory });
  } catch (err) {
    const status = (err as { status?: number }).status;
    console.error("[assistant chat] generation failed:", err);
    await recordUsage(admin, {
      userId,
      userEmail: email,
      model: ASSISTANT_MODEL,
      status: "failed",
      inputTokens: inputTokensEst,
      estimatedCostCents: worstCaseCents,
      metadata: { error: status ?? "unknown" },
    });
    return NextResponse.json(
      { error: "The assistant couldn't respond right now." },
      { status: status && status >= 400 && status < 600 ? 502 : 500 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Execute up to MAX_TOOL_CALLS validated tool calls the model requested, then
 * compose a clear reply. Bounded + non-recursive: we never feed results back
 * for another model round.
 *
 * Writes are gated on EXPLICIT user write-intent: the model is too eager to
 * call create_* on information questions ("what do I have this week?"), which
 * once produced a junk note full of meta-reasoning. If the latest user message
 * isn't an explicit ask to create/save/add/set/remind, every tool call is
 * blocked (and audited) and we answer conversationally instead — never writing
 * the model's reasoning into a note. Validation failures become a clarification.
 */
async function runToolCalls(
  admin: SupabaseClient,
  userId: string,
  functionCalls: GeminiFunctionCall[],
  modelText: string,
  userMessage: string,
): Promise<string> {
  if (!functionCalls.length) return modelText || "…";

  const writeIntent = hasWriteIntent(userMessage);

  const created: string[] = [];
  const failed: string[] = [];
  const clarifications: string[] = [];
  let blocked = false;

  for (const fc of functionCalls.slice(0, MAX_TOOL_CALLS)) {
    // Gate: no explicit write request → refuse the write, log it, don't create.
    if (!writeIntent) {
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
  if (created.length) parts.push(`Done — I created your ${created.join(", ")}.`);
  if (failed.length) parts.push(`Sorry, I couldn't create the ${failed.join(", ")} just now.`);
  if (clarifications.length) {
    parts.push(`I need a bit more detail before I can do that: ${clarifications.join("; ")}.`);
  }
  if (parts.length) return parts.join(" ");

  // Nothing was created. If we blocked a write on an info question, answer
  // honestly rather than echoing the model's tool-call reasoning.
  if (blocked) {
    return (
      modelText.trim() ||
      "I can create notes, reminders, bookmarks, and alarms when you ask me to " +
        "(e.g. “remind me at 9am to call mom”). I can’t read your existing " +
        "schedule, calendar, or saved reminders yet."
    );
  }
  return modelText || "Done.";
}

/** Accept either a full `messages` array or a single `message` string. */
function normalizeMessages(body: Record<string, unknown>): ChatMessage[] {
  if (Array.isArray(body.messages)) {
    return body.messages
      .filter(
        (m): m is { role: string; content: string } =>
          !!m &&
          typeof (m as { content?: unknown }).content === "string" &&
          (m as { content: string }).content.trim().length > 0,
      )
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));
  }
  if (typeof body.message === "string" && body.message.trim()) {
    return [{ role: "user", content: body.message }];
  }
  return [];
}
