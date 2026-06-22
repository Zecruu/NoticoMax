import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireBearerUser } from "@/lib/supabase/bearer-auth";
import {
  ALLOWED_ASSISTANT_EMAIL,
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
} from "@/lib/ai/gemini";

export const runtime = "nodejs";

const SYSTEM_PROMPT =
  "You are Notico, the helpful assistant inside the NOTICO MAX note-taking app. " +
  "Be concise and friendly. Help the user with their notes, reminders, URLs, and " +
  "general questions. You cannot yet take actions in the app — guide the user instead.";

/** Resolve the caller's id + email and confirm they're on the allow-list. */
async function resolveAllowedUser(
  request: NextRequest,
): Promise<
  | { userId: string; email: string; error: null }
  | { userId: null; email: null; error: NextResponse }
> {
  const auth = await requireBearerUser(request);
  if (auth.error) return { userId: null, email: null, error: auth.error };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(auth.userId);
  const email = data?.user?.email?.toLowerCase() ?? null;

  if (error || !email || email !== ALLOWED_ASSISTANT_EMAIL) {
    // 403, not 404 — the user is authenticated but not authorized for the
    // assistant while it's in limited foundation rollout.
    return {
      userId: null,
      email: null,
      error: NextResponse.json(
        { error: "The Notico assistant isn't available on your account yet." },
        { status: 403 },
      ),
    };
  }
  return { userId: auth.userId, email, error: null };
}

/**
 * GET /api/assistant/chat — lightweight status for the UI to decide whether to
 * enable the composer: is the assistant configured + is the caller allowed +
 * how much budget is left.
 */
export async function GET(request: NextRequest) {
  const gate = await resolveAllowedUser(request);
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
  const gate = await resolveAllowedUser(request);
  if (gate.error) return gate.error;
  const { userId, email } = gate;

  // Degrade safely when the provider key isn't provisioned in the server env.
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

  // Worst-case cost estimate: all input tokens + a fully-used capped response.
  const inputTokensEst = messages.reduce(
    (n, m) => n + estimateInputTokens(m.content),
    estimateInputTokens(SYSTEM_PROMPT),
  );
  const maxOutputTokens = maxOutputTokensForCap();
  const worstCaseCents = estimateCostCents(inputTokensEst, maxOutputTokens);

  // Pre-call gate: refuse (and log) before spending anything if a cap would be
  // exceeded — factoring in the worst-case estimate for THIS request.
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

  // Bound a single response so it can't exceed the per-request cap.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const result = await generateReply({
      apiKey,
      model: ASSISTANT_MODEL,
      messages,
      systemPrompt: SYSTEM_PROMPT,
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
      // Token usage is from Gemini's usageMetadata; cost is our estimate from
      // the published per-token rates (Google doesn't return a billed amount).
      metadata: { cost_basis: "estimated_from_token_rates" },
    });

    return NextResponse.json({ reply: result.text });
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
