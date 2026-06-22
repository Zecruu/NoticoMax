import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Usage gating + cost accounting for the Notico AI assistant.
 *
 * The assistant is intentionally locked down while it's in foundation stage:
 *   - access is limited to a single allow-listed account, and
 *   - every call is metered against hard spend + action caps backed by the
 *     `assistant_usage` Supabase table (migration 0011).
 *
 * All numbers here are server-authoritative. Nothing in this module is safe to
 * trust from the client; it only runs inside the nodejs API route.
 */

/** Only this account may use the assistant for now. */
export const ALLOWED_ASSISTANT_EMAIL = "nomnk5138@gmail.com";

/** Budget caps (all spend values are in US cents). */
export const CAPS = {
  perRequestCents: 5,
  dailyCents: 25,
  monthlyCents: 300,
  monthlyActions: 1000,
} as const;

/**
 * Gemini gemini-3.1-flash-lite Standard token pricing in USD per 1M tokens,
 * used for budget accounting (see https://ai.google.dev/pricing). Overestimating
 * is safe (caps bite sooner); underestimating risks overspend — keep in sync if
 * Google changes the published rates.
 */
const PRICING_USD_PER_1M = {
  input: 0.25,
  output: 1.5,
} as const;

/** Convert token counts to a fractional-cent cost estimate. */
export function estimateCostCents(inputTokens: number, outputTokens: number): number {
  const usd =
    (inputTokens / 1_000_000) * PRICING_USD_PER_1M.input +
    (outputTokens / 1_000_000) * PRICING_USD_PER_1M.output;
  return usd * 100;
}

/**
 * Cap a single response so one call can't blow the per-request budget. Derived
 * from the per-request cent cap and the output rate; clamped to a sane ceiling
 * so a misconfigured price can't request an absurd number of tokens.
 */
export function maxOutputTokensForCap(): number {
  const usdBudget = CAPS.perRequestCents / 100;
  const tokens = Math.floor((usdBudget / PRICING_USD_PER_1M.output) * 1_000_000);
  return Math.min(tokens, 2048);
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Reporting bucket, e.g. "2026-06". UTC so it lines up with the cap windows. */
export function periodKey(now: Date = new Date()): string {
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}-${m}`;
}

/** Rough token estimate for pre-call worst-case budgeting (~4 chars/token). */
export function estimateInputTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type UsageStatus = "reserved" | "completed" | "rejected" | "failed";

export interface BudgetStatus {
  allowed: boolean;
  reason?: string;
  monthlyCentsUsed: number;
  dailyCentsUsed: number;
  monthlyActions: number;
}

/**
 * Roll up this month's COMPLETED usage and decide whether another call is
 * allowed. When `pendingCostCents` is supplied (a worst-case estimate for the
 * request about to run) the caps are checked against already-spent + pending,
 * and the per-request cap is enforced — so we reject BEFORE paying the provider
 * if the call would push us over. Rejected/failed rows don't count toward spend.
 *
 * Only 'completed' rows count. Reads at most ~monthlyActions rows (bounded by
 * the action cap), so summing in JS is cheap and avoids a SQL aggregate RPC.
 */
export async function checkBudget(
  admin: SupabaseClient,
  userId: string,
  opts: { now?: Date; pendingCostCents?: number } = {},
): Promise<BudgetStatus> {
  const now = opts.now ?? new Date();
  const pending = opts.pendingCostCents ?? 0;
  const monthStart = startOfUtcMonth(now).toISOString();
  const dayStart = startOfUtcDay(now).getTime();

  const { data, error } = await admin
    .from("assistant_usage")
    .select("actual_cost_cents, created_at, status")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("created_at", monthStart);

  if (error) {
    // Fail CLOSED — if we can't read the ledger we can't prove we're under
    // budget, so deny rather than risk uncapped spend.
    return {
      allowed: false,
      reason: "Couldn't verify usage budget",
      monthlyCentsUsed: 0,
      dailyCentsUsed: 0,
      monthlyActions: 0,
    };
  }

  const rows = data ?? [];
  let monthlyCentsUsed = 0;
  let dailyCentsUsed = 0;
  for (const r of rows) {
    const cost = Number(r.actual_cost_cents) || 0;
    monthlyCentsUsed += cost;
    if (new Date(r.created_at).getTime() >= dayStart) dailyCentsUsed += cost;
  }
  const monthlyActions = rows.length;

  let reason: string | undefined;
  if (monthlyActions >= CAPS.monthlyActions) {
    reason = "Monthly action limit reached";
  } else if (pending > CAPS.perRequestCents) {
    reason = "Request exceeds the per-request limit";
  } else if (monthlyCentsUsed + pending > CAPS.monthlyCents) {
    reason = "Monthly spend limit reached";
  } else if (dailyCentsUsed + pending > CAPS.dailyCents) {
    reason = "Daily spend limit reached";
  }

  return {
    allowed: !reason,
    reason,
    monthlyCentsUsed,
    dailyCentsUsed,
    monthlyActions,
  };
}

/** Append one usage row. Best-effort: logs but never throws into the request. */
export async function recordUsage(
  admin: SupabaseClient,
  entry: {
    userId: string;
    userEmail?: string | null;
    model: string;
    feature?: string;
    status: UsageStatus;
    inputTokens?: number;
    outputTokens?: number;
    estimatedCostCents?: number;
    actualCostCents?: number;
    metadata?: Record<string, unknown>;
    now?: Date;
  },
): Promise<void> {
  const { error } = await admin.from("assistant_usage").insert({
    user_id: entry.userId,
    user_email: entry.userEmail ?? null,
    period_key: periodKey(entry.now),
    feature: entry.feature ?? "assistant_chat",
    provider: "google",
    model: entry.model,
    status: entry.status,
    input_tokens: entry.inputTokens ?? 0,
    output_tokens: entry.outputTokens ?? 0,
    estimated_cost_cents: entry.estimatedCostCents ?? 0,
    actual_cost_cents: entry.actualCostCents ?? 0,
    metadata: entry.metadata ?? {},
  });
  if (error) {
    console.error("[assistant usage] failed to record usage:", error);
  }
}
