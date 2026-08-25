/**
 * Public plan catalog. Keep this aligned with what we actually grant:
 *   Free  — local-only, ads on iOS
 *   Pro   — cloud sync + ads removed ($2.99/mo, Apple IAP)
 *   Family — household sharing add-on (entitlement exists; no published USD price)
 *
 * Do not list Lyte assistant tiers or storage SKUs here until those are
 * sold in the App Store and the in-app purchase UI is live.
 */

export type PlanId = "free" | "pro" | "family";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  /** Visible price, e.g. "$2.99" or "In-app". */
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
  free: boolean;
  pro: boolean;
  family: boolean;
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
      "Ads on iOS",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Sync everywhere. No ads.",
    priceLabel: "$2.99",
    pricePeriod: "/ month",
    priceNote: "USD list price. Apple shows the localized price for your country.",
    highlighted: true,
    ctaLabel: "Upgrade to Pro",
    features: [
      "Everything in Free",
      "Cloud sync across iPhone, desktop, and web",
      "No ads",
      "100 MB cloud storage when file uploads ship",
    ],
  },
  {
    id: "family",
    name: "Family",
    tagline: "Share a household workspace.",
    priceLabel: "In-app",
    pricePeriod: null,
    priceNote: "Household add-on. Apple shows the price in the App Store purchase sheet.",
    ctaLabel: "See Family details",
    features: [
      "Create a household and invite members",
      "Shared folders, lists, and budget",
      "Extra seats and family storage as add-ons",
      "Lifetime Pro can create a family without this add-on",
    ],
  },
];

export const PLAN_COMPARISON: ComparisonRow[] = [
  { label: "Notes, reminders, budget, goals, passwords", free: true, pro: true, family: true },
  { label: "Works offline", free: true, pro: true, family: true },
  { label: "Cloud sync across devices", free: false, pro: true, family: false },
  { label: "Ad-free", free: false, pro: true, family: false },
  { label: "100 MB cloud storage", free: false, pro: true, family: false },
  { label: "Shared household folders and budget", free: false, pro: false, family: true },
  { label: "Invite family members", free: false, pro: false, family: true },
];

export function getPlan(id: PlanId): PlanDefinition {
  const plan = PLANS.find((item) => item.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

export function resolveCurrentPlanId(entitlements: {
  proActive?: boolean;
  lifetimePro?: boolean;
  familyPlanActive?: boolean;
}): PlanId {
  if (entitlements.familyPlanActive) return "family";
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
