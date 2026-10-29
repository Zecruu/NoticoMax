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
import { consumeLyteQuota, getLyteUsage } from "@/lib/ai/lyte-quota";
import {
  ASSISTANT_MODEL,
  generateReply,
} from "@/lib/ai/openai";
import { getProfile } from "@/lib/ai/profile";
import {
  addMemory,
  buildMemorySummary,
  detectExplicitMemory,
  listMemories,
} from "@/lib/ai/memory";
import {
  TOOL_DECLARATIONS,
  conversationWriteIntent,
  runToolCalls,
} from "@/lib/ai/tools";
import { buildRetrievalBlock, searchLyteMemory } from "@/lib/ai/retrieval";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { schedulingTimeContext } from "@/lib/ai/time-context";
import { ConversationError, conversationError, parseConversationRequest, recentConversationTurns } from "@/lib/ai/conversations";
import { conversationContext, MAX_REPLY_BYTES } from "@/lib/ai/conversation-types";

export const runtime = "nodejs";

/**
 * Conversation compression, first slice: only the most recent turns go to the
 * model. Older turns will be folded into a rolling summary later
 * (docs/LYTE_ARCHITECTURE.md §6) — for now they are simply dropped so a long
 * chat can't balloon input tokens.
 */
const MAX_HISTORY_MESSAGES = 20;

const ASSISTANT_TOOLS = TOOL_DECLARATIONS;

/**
 * GET /api/assistant/chat — status for the UI: configured + allowed + budget.
 */
export async function GET(request: NextRequest) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;

  const configured = !!process.env.OPENAI_API_KEY;
  const admin = getSupabaseAdminClient();

  // Probe the assistant ledger so the UI can show a precise "run the migration"
  // state instead of a generic failure when the tables don't exist yet.
  const probe = await admin.from("assistant_usage").select("id").limit(1);
  const migrationsReady = !(
    probe.error && (probe.error as { code?: string }).code === "42P01"
  );

  const budget = migrationsReady ? await checkBudget(admin, gate.userId) : null;
  const lyte = migrationsReady ? await getLyteUsage(admin, gate.userId) : null;

  return NextResponse.json({
    enabled:
      configured &&
      migrationsReady &&
      !!budget?.allowed &&
      (lyte?.chats.remaining ?? 0) > 0,
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
    lyte,
    blockedReason:
      budget && !budget.allowed
        ? budget.reason
        : lyte && lyte.chats.remaining <= 0
        ? "Monthly Lyte chat limit reached"
        : null,
  });
}

/**
 * POST /api/assistant/chat — one assistant turn.
 * Body: { conversationId, requestId, message, timeZone }.
 * History is loaded server-side; client-supplied transcripts are not trusted.
 */
export async function POST(request: NextRequest) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;
  const { userId, email } = gate;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "The assistant isn't configured yet. Please try again later." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let turn: ReturnType<typeof parseConversationRequest>;
  try {
    turn = parseConversationRequest(body);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  const admin = getSupabaseAdminClient();
  const reservation = await admin.rpc("lyte_begin_turn", {
    p_user: userId, p_conversation: turn.conversationId,
    p_request: turn.requestId, p_content: turn.message,
  });
  if (reservation.error) {
    const error = conversationError(reservation.error);
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (reservation.data.status === "completed")
    return NextResponse.json({ reply: reservation.data.reply, conversationId: turn.conversationId, recovered: true });
  if (reservation.data.status !== "started")
    return NextResponse.json({ error: "This message was already submitted. Reopen the chat to check its reply before sending again.", code: "already_submitted" }, { status: 409 });

  let finished = false;
  try {
    const history = await recentConversationTurns(admin, userId, turn.conversationId);
    const messages = conversationContext(history, turn.message);

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

    // Retrieval-first: search Supabase for context relevant to THIS request
    // (best-effort — empty on failure) while loading profile + curated memory.
    const [profile, memories, retrieved] = await Promise.all([
      getProfile(admin, userId),
      listMemories(admin, userId),
      lastUser
        ? searchLyteMemory(admin, userId, lastUser.content)
        : Promise.resolve([]),
    ]);
    // The model and the write guard receive the same bounded conversation.
    const recentMessages = messages.slice(-MAX_HISTORY_MESSAGES);
    const writeIntent = conversationWriteIntent(recentMessages);
    const systemPrompt = buildSystemPrompt(
      profile.displayName,
      buildMemorySummary(memories),
      buildRetrievalBlock(retrieved),
      schedulingTimeContext(body.timeZone),
      writeIntent.source === "clarification"
    );

    const inputTokensEst = recentMessages.reduce(
      (n, m) => n + estimateInputTokens(m.content),
      estimateInputTokens(systemPrompt)
    );
    const maxOutputTokens = maxOutputTokensForCap();
    const worstCaseCents = estimateCostCents(inputTokensEst, maxOutputTokens);

    const budget = await checkBudget(admin, userId, {
      pendingCostCents: worstCaseCents,
    });
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
        {
          error: budget.reason ?? "Usage limit reached",
          code: "budget_exceeded",
        },
        { status: 429 }
      );
    }

    const lyteQuota = await consumeLyteQuota(admin, userId, "chats");
    if (!lyteQuota.allowed) {
      await recordUsage(admin, {
        userId,
        userEmail: email,
        model: ASSISTANT_MODEL,
        status: "rejected",
        inputTokens: inputTokensEst,
        estimatedCostCents: worstCaseCents,
        metadata: { reason: lyteQuota.reason, lyte: lyteQuota.meter },
      });
      return NextResponse.json(
        {
          error: lyteQuota.reason ?? "Lyte chat limit reached",
          code: "lyte_quota_exceeded",
        },
        { status: 429 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const result = await generateReply({
        apiKey,
        model: ASSISTANT_MODEL,
        messages: recentMessages,
        systemPrompt,
        maxOutputTokens,
        tools: ASSISTANT_TOOLS.filter((tool) =>
          writeIntent.allowedTools.includes(tool.name)
        ),
        signal: controller.signal,
      });

      const actualCostCents = estimateCostCents(
        result.inputTokens,
        result.outputTokens
      );
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
        recentMessages
      );
      // A fixed reply reservation guarantees space before provider/tool writes.
      // Never silently truncate a confirmed tool result.
      if (new TextEncoder().encode(reply).length > MAX_REPLY_BYTES)
        throw new Error("Reply exceeded its storage reservation");
      const saved = await admin.rpc("lyte_finish_turn", { p_user: userId, p_request: turn.requestId, p_reply: reply });
      if (saved.error) throw conversationError(saved.error);
      finished = true;
      return NextResponse.json({ reply, savedMemory, conversationId: turn.conversationId });
    } catch (err) {
      const status = (err as { status?: number }).status;
      console.error("[assistant chat] generation or persistence failed", { status: status ?? "unknown" });
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
        { error: "The reply could not be confirmed. Reopen this chat and check your saved items before sending the request again." },
        { status: status && status >= 400 && status < 600 ? 502 : 500 }
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const problem = error instanceof ConversationError ? error : conversationError({});
    return NextResponse.json({ error: problem.message, code: problem.code }, { status: problem.status });
  } finally {
    if (!finished) {
      const release = await admin.rpc("lyte_finish_turn", { p_user: userId, p_request: turn.requestId, p_reply: null });
      if (release.error) console.error("[assistant chat] reservation release failed");
    }
  }
}
