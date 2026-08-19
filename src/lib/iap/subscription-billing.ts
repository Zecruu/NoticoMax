const PLAN_NAMES: Record<string, string> = {
  "com.noticomax.app.plus.monthly": "NoticoMax Plus",
  "com.noticomax.app.platinum.monthly": "NoticoMax Platinum",
  "com.noticomax.app.maxxed.monthly": "NoticoMax MAXXED",
};

export const ENTITLEMENT_REFRESH_DELAYS_MS = [0, 1000, 2000, 4000] as const;
export const BILLING_PREFLIGHT_TIMEOUT_MS = 12_000;

export function withBillingTimeout<T>(
  operation: Promise<T>,
  timeoutMs = BILLING_PREFLIGHT_TIMEOUT_MS,
  message = "Subscription plans took too long to load",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);

    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
