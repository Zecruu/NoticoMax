const PLAN_NAMES: Record<string, string> = {
  "com.noticomax.app.plus.monthly": "NoticoMax Plus",
  "com.noticomax.app.platinum.monthly": "NoticoMax Platinum",
  "com.noticomax.app.maxxed.monthly": "NoticoMax MAXXED",
};

export const ENTITLEMENT_REFRESH_DELAYS_MS = [0, 1000, 2000, 4000] as const;

export function getSubscriptionPlanName(productId: string | null): string | null {
  if (!productId) return null;
  return PLAN_NAMES[productId] ?? "NoticoMax subscription";
}

export async function refreshEntitlementWithRetries(
  refresh: () => Promise<boolean>,
  wait: (delayMs: number) => Promise<boolean>,
  delays: readonly number[] = ENTITLEMENT_REFRESH_DELAYS_MS,
): Promise<boolean> {
  for (const delayMs of delays) {
    if (delayMs > 0 && !(await wait(delayMs))) return false;
    if (await refresh()) return true;
  }
  return false;
}
