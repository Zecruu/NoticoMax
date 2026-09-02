import type { SupabaseClient } from "@supabase/supabase-js";
import {
  featureForKind,
  lyteAllowanceForPlan,
  resolveCurrentPlanId,
  type AssistantPlanId,
  type LyteMeterKind,
  type PlanId,
} from "@/lib/billing/plans";

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface LyteMeter {
  kind: LyteMeterKind;
  used: number;
  planAllowance: number;
  extraRemaining: number;
  remaining: number;
}

export interface LyteUsageSnapshot {
  planId: PlanId;
  chats: LyteMeter;
  lookups: LyteMeter;
}

export interface LyteQuotaResult {
  allowed: boolean;
  reason?: string;
  usedExtra: boolean;
  meter: LyteMeter;
}

interface EntitlementRow {
  assistant_plan?: AssistantPlanId | null;
  lyte_extra_chats?: number | null;
  lyte_extra_lookups?: number | null;
  lifetime_pro?: boolean | null;
  pro_expires_at?: string | null;
}

async function loadEntitlements(
  admin: SupabaseClient,
  userId: string,
): Promise<EntitlementRow> {
  const { data, error } = await admin
    .from("entitlements")
    .select("assistant_plan, lyte_extra_chats, lyte_extra_lookups, lifetime_pro, pro_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // Migration 0014 not applied yet — treat as no extras / no assistant plan.
    console.warn("[lyte-quota] entitlements read failed:", error.message);
    return {};
  }
  return (data ?? {}) as EntitlementRow;
}

function planFromEntitlements(ent: EntitlementRow): PlanId {
  const lifetimePro = ent.lifetime_pro === true;
  const proActive =
    lifetimePro ||
    (ent.pro_expires_at ? new Date(ent.pro_expires_at) > new Date() : false);
  return resolveCurrentPlanId({
    assistantPlan: ent.assistant_plan ?? null,
    proActive,
    lifetimePro,
  });
}

async function countCompleted(
  admin: SupabaseClient,
  userId: string,
  kind: LyteMeterKind,
  now: Date,
): Promise<number> {
  const monthStart = startOfUtcMonth(now).toISOString();
  const { count, error } = await admin
    .from("assistant_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "completed")
    .eq("feature", featureForKind(kind))
    .gte("created_at", monthStart);
  if (error) {
    console.warn("[lyte-quota] usage count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

function meterFrom(
  kind: LyteMeterKind,
  used: number,
  planId: PlanId,
  extras: number,
): LyteMeter {
  const planAllowance = lyteAllowanceForPlan(planId)[kind];
  const extraRemaining = Math.max(0, extras);
  const remaining = Math.max(0, planAllowance - used) + extraRemaining;
  return { kind, used, planAllowance, extraRemaining, remaining };
}

export async function getLyteUsage(
  admin: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<LyteUsageSnapshot> {
  const ent = await loadEntitlements(admin, userId);
  const planId = planFromEntitlements(ent);
  const [chatsUsed, lookupsUsed] = await Promise.all([
    countCompleted(admin, userId, "chats", now),
    countCompleted(admin, userId, "lookups", now),
  ]);
  return {
    planId,
    chats: meterFrom("chats", chatsUsed, planId, ent.lyte_extra_chats ?? 0),
    lookups: meterFrom("lookups", lookupsUsed, planId, ent.lyte_extra_lookups ?? 0),
  };
}

/**
 * Allow a Lyte action if the monthly plan allowance still has room, otherwise
 * consume one purchased extra credit atomically. Extras persist until used;
 * the monthly counter resets, extras do not.
 */
export async function consumeLyteQuota(
  admin: SupabaseClient,
  userId: string,
  kind: LyteMeterKind,
  now: Date = new Date(),
): Promise<LyteQuotaResult> {
  const ent = await loadEntitlements(admin, userId);
  const planId = planFromEntitlements(ent);
  const used = await countCompleted(admin, userId, kind, now);
  const extras = kind === "chats" ? (ent.lyte_extra_chats ?? 0) : (ent.lyte_extra_lookups ?? 0);
  const current = meterFrom(kind, used, planId, extras);

  if (used < current.planAllowance) {
    return { allowed: true, usedExtra: false, meter: current };
  }

  const { data, error } = await admin.rpc("consume_lyte_extra", {
    p_user_id: userId,
    p_kind: kind,
  });

  if (error) {
    console.warn("[lyte-quota] extra decrement failed:", error.message);
    return {
      allowed: false,
      reason: kind === "chats" ? "Monthly Lyte chat limit reached" : "Monthly Lyte lookup limit reached",
      usedExtra: false,
      meter: current,
    };
  }

  if (data !== null && data !== undefined) {
    return {
      allowed: true,
      usedExtra: true,
      meter: meterFrom(kind, used, planId, Number(data) || 0),
    };
  }

  const noun = kind === "chats" ? "chat" : "web lookup";
  return {
    allowed: false,
    reason:
      current.planAllowance === 0
        ? `Lyte ${noun}s need a paid plan. Upgrade or buy an extra pack.`
        : `Monthly Lyte ${noun} limit reached. Buy extra ${noun}s to keep going.`,
    usedExtra: false,
    meter: current,
  };
}
