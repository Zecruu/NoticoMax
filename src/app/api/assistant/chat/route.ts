import { NextRequest, NextResponse } from "next/server";
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
import { ASSISTANT_MODEL, generateReply, type ChatMessage } from "@/lib/ai/gemini";
import { getProfile } from "@/lib/ai/profile";
import {
  addMemory,
  buildMemorySummary,
  detectExplicitMemory,
  listMemories,
} from "@/lib/ai/memory";

export const runtime = "nodejs";

/** Assemble the system prompt from the assistant's name + curated memory. */
function buildSystemPrompt(name: string, memorySummary: string): string {
  const base =
    `You are ${name}, the user's personal assistant inside the NOTICO MAX app. ` +
    "Be concise, warm, and genuinely helpful with their notes, URLs, reminders, " +
    "and day-to-day organization. Respect the user's stated preferences and habits.";
  const security =
    " SECURITY: Never ask for, store, repeat, or reveal passwords, secrets, API keys, " +
    "or payment details. You do not have access to the user's saved passwords or " +
    "credentials. If asked to expose a saved password, politely decline.";
  const memory = memorySummary
    ? `\n\nWhat you remember about this user (honor these):\n${memorySummary}`
    : "";
  return base + security + memory;
}

/**
 * GET /api/assistant/chat — status for the UI: configured + allowed + budget.
 */
export async function GET(request: NextRequest) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;

  const configured = !!process.env.GEMINI_API_KEY;
  const admin = getSupabaseAdminClient();
  const budget = await checkBudget(admin, gate.userId);

  return NextResponse.json({
    enabled: configured && budget.allowed,
    configured,
    model: ASSISTANT_MODEL,
    caps: CAPS,
    usage: {
      monthlyCentsUsed: budget.monthlyCentsUsed,
      dailyCentsUsed: budget.dailyCentsUsed,
      monthlyActions: budget.monthlyActions,
    },
    blockedReason: budget.allowed ? null : budget.reason,
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
  const systemPrompt = buildSystemPrompt(profile.displayName, buildMemorySummary(memories));

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

    return NextResponse.json({ reply: result.text, savedMemory });
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
