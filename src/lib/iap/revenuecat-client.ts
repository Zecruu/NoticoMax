/**
 * RevenueCat client wrapper. Only active on iOS via the Capacitor plugin.
 * On Electron/web, all operations are no-ops or throw — those platforms use
 * the existing Gumroad license-key path for Pro.
 *
 * Lifecycle:
 *   1. App boot:    initIAP() — configures Purchases SDK with the public key
 *   2. Post-login:  identifyIAPUser(userId) — aliases the anonymous RC ID to
 *                   the user's Mongo _id (which our webhook keys off of)
 *   3. Show paywall: getOfferings() then purchase(packageIdentifier)
 *   4. User taps "Restore": restorePurchases()
 *   5. On logout:   resetIAPUser() — back to anonymous
 */
import { isIOS } from "@/lib/platform";
import { withBillingTimeout } from "@/lib/iap/subscription-billing";

// IMPORTANT: Must match the entitlement identifier configured in the RevenueCat
// dashboard exactly (case-sensitive).
export const PRO_ENTITLEMENT_ID = "Pro";

let initPromise: Promise<void> | null = null;

async function loadPurchases() {
  if (!isIOS()) {
    throw new Error("RevenueCat is only available on iOS");
  }
  if (!window.Capacitor?.isPluginAvailable("Purchases")) {
    throw new Error("RevenueCat Purchases is not available in this app build");
  }
  const mod = await import("@revenuecat/purchases-capacitor");
  return mod.Purchases;
}

/**
 * Configure the Purchases SDK. Safe to call multiple times — only the first
 * call actually configures. Idempotent.
 */
export async function initIAP(): Promise<void> {
  if (!isIOS()) return;
  if (initPromise) return initPromise;

  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY;
  if (!apiKey) {
    throw new Error("RevenueCat is not configured for this app build");
  }

  initPromise = (async () => {
    const Purchases = await loadPurchases();
    await Purchases.configure({ apiKey });
  })();
  try {
    await initPromise;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}

/** Alias the current (likely anonymous) RC user to our backend user id. */
export async function identifyIAPUser(userId: string): Promise<void> {
  if (!isIOS()) return;
  await initIAP();
  const Purchases = await loadPurchases();
  await Purchases.logIn({ appUserID: userId });
}

/** Reset to anonymous on logout. */
export async function resetIAPUser(): Promise<void> {
  if (!isIOS()) return;
  await initIAP();
  const Purchases = await loadPurchases();
  await Purchases.logOut();
}

export interface IAPPackage {
  identifier: string;          // e.g. "$rc_monthly"
  productId: string;            // e.g. "com.noticomax.pro.monthly"
  priceString: string;          // localized e.g. "$2.99"
  title: string;
  description: string;
  period: string | null;        // e.g. "P1M"
}

async function getCurrentOffering() {
  await initIAP();
  const Purchases = await loadPurchases();
  const result = await withBillingTimeout(
    Purchases.getOfferings(),
    undefined,
    "Subscription plans took too long to load from the App Store",
  );
  const current = result.current;
  if (!current || current.availablePackages.length === 0) {
    throw new Error("No purchasable subscription plans are available from the App Store");
  }
  return current;
}

/** Fetch the configured offering from RevenueCat. Returns null on web. */
export async function getOfferings(): Promise<IAPPackage[] | null> {
  if (!isIOS()) return null;
  const current = await getCurrentOffering();
  return current.availablePackages.map((p) => ({
    identifier: p.identifier,
    productId: p.product.identifier,
    priceString: p.product.priceString,
    title: p.product.title,
    description: p.product.description,
    period: p.product.subscriptionPeriod ?? null,
  }));
}

/**
 * Trigger the Apple purchase sheet for the given package identifier.
 * Returns true if the user now has the "pro" entitlement (purchase succeeded
 * OR they already had it). Returns false if cancelled or not entitled.
 */
export async function purchase(packageIdentifier: string): Promise<boolean> {
  if (!isIOS()) throw new Error("Purchase only available on iOS");
  await initIAP();
  const Purchases = await loadPurchases();
  const offerings = await Purchases.getOfferings();
  const pkg = offerings.current?.availablePackages.find(
    (p) => p.identifier === packageIdentifier
  );
  if (!pkg) throw new Error(`Package "${packageIdentifier}" not found in current offering`);

  try {
    const result = await Purchases.purchasePackage({ aPackage: pkg });
    return Boolean(result.customerInfo.entitlements.active[PRO_ENTITLEMENT_ID]);
  } catch (err: unknown) {
    // RevenueCat throws { userCancelled: true } when the user dismisses the sheet.
    if (err && typeof err === "object" && "userCancelled" in err && err.userCancelled) {
      return false;
    }
    throw err;
  }
}

/** "Restore Purchases" — required by App Store. */
export async function restorePurchases(): Promise<boolean> {
  if (!isIOS()) return false;
  await initIAP();
  const Purchases = await loadPurchases();
  const { customerInfo } = await Purchases.restorePurchases();
  return Boolean(customerInfo.entitlements.active[PRO_ENTITLEMENT_ID]);
}

/** Read current entitlement status without triggering UI. */
export async function getSubscriptionStatus(): Promise<{
  proActive: boolean;
  expiresAt: string | null;
  productId: string | null;
}> {
  if (!isIOS()) return { proActive: false, expiresAt: null, productId: null };
  await initIAP();
  const Purchases = await loadPurchases();
  const { customerInfo } = await Purchases.getCustomerInfo();
  const ent = customerInfo.entitlements.active[PRO_ENTITLEMENT_ID];
  return {
    proActive: Boolean(ent),
    expiresAt: ent?.expirationDate ?? null,
    productId: ent?.productIdentifier ?? null,
  };
}

// ---------------------------------------------------------------------------
// RevenueCat hosted Paywall + Customer Center
//
// These render native iOS UI on top of the Capacitor webview. They are
// configured in the RevenueCat dashboard (Paywalls / Customer Center sections)
// — there's no UI code to write here. Edit those views in the dashboard and
// the changes show up in the next purchase flow without redeploying the app.
// ---------------------------------------------------------------------------

async function loadRCUI() {
  if (!isIOS()) {
    throw new Error("RevenueCat UI is only available on iOS");
  }
  if (!window.Capacitor?.isPluginAvailable("RevenueCatUI")) {
    throw new Error("RevenueCat paywalls are not available in this app build");
  }
  const mod = await import("@revenuecat/purchases-capacitor-ui");
  return { RevenueCatUI: mod.RevenueCatUI, PAYWALL_RESULT: mod.PAYWALL_RESULT };
}

export type PaywallOutcome = "purchased" | "restored" | "cancelled" | "not_presented" | "error";

function mapPaywallResult(
  result: string,
  PAYWALL_RESULT: Record<string, string>,
): PaywallOutcome {
  switch (result) {
    case PAYWALL_RESULT.PURCHASED: return "purchased";
    case PAYWALL_RESULT.RESTORED: return "restored";
    case PAYWALL_RESULT.CANCELLED: return "cancelled";
    case PAYWALL_RESULT.NOT_PRESENTED: return "not_presented";
    case PAYWALL_RESULT.ERROR: return "error";
    default: return "error";
  }
}

async function waitForPaywallResult(
  RevenueCatUI: Awaited<ReturnType<typeof loadRCUI>>["RevenueCatUI"],
  PAYWALL_RESULT: Awaited<ReturnType<typeof loadRCUI>>["PAYWALL_RESULT"],
  presentation: Promise<{ result: string }>,
): Promise<PaywallOutcome> {
  let resolveDismissed: (() => void) | null = null;
  const dismissed = new Promise<void>((resolve) => {
    resolveDismissed = resolve;
  });
  const listener = await RevenueCatUI.addListener("paywallDismissed", () => {
    resolveDismissed?.();
  });

  try {
    return await Promise.race([
      presentation.then(({ result }) => mapPaywallResult(result, PAYWALL_RESULT)),
      dismissed.then(async () => {
        // Give the native result callback a brief chance to report a purchase
        // before treating a plain close gesture as cancellation.
        await new Promise((resolve) => setTimeout(resolve, 250));
        return "cancelled" as const;
      }),
    ]);
  } finally {
    await listener.remove();
  }
}

/** Present the RevenueCat-hosted paywall. */
export async function presentPaywall(): Promise<PaywallOutcome> {
  if (!isIOS()) return "not_presented";
  const offering = await getCurrentOffering();
  const { RevenueCatUI, PAYWALL_RESULT } = await loadRCUI();
  return waitForPaywallResult(
    RevenueCatUI,
    PAYWALL_RESULT,
    RevenueCatUI.presentPaywall({ offering, displayCloseButton: true }),
  );
}

/** Present the paywall only if the user does not already have Pro. */
export async function presentPaywallIfNeeded(): Promise<PaywallOutcome> {
  if (!isIOS()) return "not_presented";
  const offering = await getCurrentOffering();
  const { RevenueCatUI, PAYWALL_RESULT } = await loadRCUI();
  return waitForPaywallResult(
    RevenueCatUI,
    PAYWALL_RESULT,
    RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: PRO_ENTITLEMENT_ID,
      offering,
    }),
  );
}

/** Open RevenueCat's hosted Customer Center (manage subscription, refund, etc). */
export async function presentCustomerCenter(): Promise<void> {
  if (!isIOS()) return;
  await initIAP();
  const { RevenueCatUI } = await loadRCUI();
  await RevenueCatUI.presentCustomerCenter();
}
