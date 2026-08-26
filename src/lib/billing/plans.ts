/**
 * Public plan catalog. Paid tiers are Pro, Platinum, and MAXXED.
 *
 * Product IDs (RevenueCat / App Store):
 *   Pro       → com.noticomax.app.plus.monthly
 *   Platinum  → com.noticomax.app.platinum.monthly
 *   MAXXED    → com.noticomax.app.maxxed.monthly
 *
 * Legacy $2.99 Pro (`com.noticomax.pro.monthly`) is off sale.
 * Family household sharing is not a marketed paid tier.
 */

export type PlanId = "free" | "pro" | "platinum" | "maxxed";
export type AssistantPlanId = "plus" | "platinum" | "maxxed";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  productId?: string;
  /** Visible price, e.g. "$34.99" or "In-app". */
  priceLabel: string;
  /** Suffix such as "/ month". Null when there is no published cadence. */
  pricePeriod: string | null;
  priceNote?: string;
  highlighted?: boolean;
  ctaLabel: string;
  features: string[];
}

export interface ComparisonRow {
  label: string;
  included: Record<PlanId, boolean | string>;
}

export const PLANS: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Keep notes on this device.",
    priceLabel: "$0",
    pricePeriod: null,
    ctaLabel: "Stay on Free",
    features: [
      "Notes, reminders, budget, goals, and passwords",
      "Works offline on this device",
      "Local storage only — no cloud sync",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Sync plus Lyte for everyday use.",
    productId: "com.noticomax.app.plus.monthly",
    priceLabel: "In-app",
    pricePeriod: null,
    priceNote: "Apple shows the localized price for your country.",
    ctaLabel: "Upgrade to Pro",
    features: [
      "Cloud sync across iPhone, desktop, and web",
      "Lyte: 1,000 chats / month",
      "Lyte: 25 web lookups / month",
    ],
  },
  {
    id: "platinum",
    name: "Platinum",
    tagline: "More Lyte room for daily work.",
    productId: "com.noticomax.app.platinum.monthly",
    priceLabel: "In-app",
    pricePeriod: null,
    priceNote: "Apple shows the localized price for your country.",
    highlighted: true,
    ctaLabel: "Upgrade to Platinum",
    features: [
      "Everything in Pro",
      "Lyte: 2,000 chats / month",
      "Lyte: 50 web lookups / month",
    ],
  },
  {
    id: "maxxed",
    name: "MAXXED",
    tagline: "The highest Lyte allowance.",
    productId: "com.noticomax.app.maxxed.monthly",
    priceLabel: "$34.99",
    pricePeriod: "/ month",
    priceNote: "USD list price. Apple shows the localized price for your country.",
    ctaLabel: "Upgrade to MAXXED",
    features: [
      "Everything in Platinum",
      "Lyte: 10,000 chats / month",
      "Lyte: 250 web lookups / month",
    ],
  },
];

export const PLAN_COMPARISON: ComparisonRow[] = [
  { label: "Notes, reminders, budget, goals, passwords", included: { free: true, pro: true, platinum: true, maxxed: true } },
  { label: "Works offline", included: { free: true, pro: true, platinum: true, maxxed: true } },
  { label: "Cloud sync", included: { free: false, pro: true, platinum: true, maxxed: true } },
  { label: "Lyte monthly chats", included: { free: false, pro: "1,000", platinum: "2,000", maxxed: "10,000" } },
  { label: "Lyte monthly web lookups", included: { free: false, pro: "25", platinum: "50", maxxed: "250" } },
];

export function getPlan(id: PlanId): PlanDefinition {
  const plan = PLANS.find((item) => item.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

export function publicPlanIdFromAssistantPlan(plan?: AssistantPlanId | null): PlanId | null {
  if (plan === "plus") return "pro";
  if (plan === "platinum" || plan === "maxxed") return plan;
  return null;
}

export function resolveCurrentPlanId(entitlements: {
  proActive?: boolean;
  lifetimePro?: boolean;
  assistantPlan?: AssistantPlanId | null;
}): PlanId {
  const fromAssistant = publicPlanIdFromAssistantPlan(entitlements.assistantPlan);
  if (fromAssistant) return fromAssistant;
  if (entitlements.proActive || entitlements.lifetimePro) return "pro";
  return "free";
}

export function formatPlanRenewal(expiresAt?: string | null): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
