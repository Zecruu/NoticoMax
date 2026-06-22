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

export interface BudgetStatus {
  allowed: boolean;
  reason?: string;
  monthlyCentsUsed: number;
  dailyCentsUsed: number;
  monthlyActions: number;
}

/**
 * Roll up this month's ledger and decide whether another call is allowed.
 * Reads at most `monthlyActions` rows (the action cap bounds the row count),
 * so summing in JS is cheap and avoids needing a SQL aggregate RPC.
 *
 * `now` is injectable for testing; defaults to the wall clock.
 */
export async function checkBudget(
  admin: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<BudgetStatus> {
  const monthStart = startOfUtcMonth(now).toISOString();
  const dayStart = startOfUtcDay(now).getTime();

  const { data, error } = await admin
    .from("assistant_usage")
    .select("cost_cents, created_at")
    .eq("user_id", userId)
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
    const cost = Number(r.cost_cents) || 0;
    monthlyCentsUsed += cost;
    if (new Date(r.created_at).getTime() >= dayStart) dailyCentsUsed += cost;
  }
  const monthlyActions = rows.length;

  let reason: string | undefined;
  if (monthlyActions >= CAPS.monthlyActions) {
    reason = "Monthly action limit reached";
  } else if (monthlyCentsUsed >= CAPS.monthlyCents) {
    reason = "Monthly spend limit reached";
  } else if (dailyCentsUsed >= CAPS.dailyCents) {
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
  userId: string,
  entry: {
    model: string;
    action: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
  },
): Promise<void> {
  const { error } = await admin.from("assistant_usage").insert({
    user_id: userId,
    model: entry.model,
    action: entry.action,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    cost_cents: entry.costCents,
  });
  if (error) {
    console.error("[assistant usage] failed to record usage:", error);
  }
}
