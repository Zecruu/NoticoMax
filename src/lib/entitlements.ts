import type { IUserDocument, IUserEntitlements, ProSource } from "@/models/User";
import type { ILicenseDocument } from "@/models/License";

/**
 * Computed entitlements for a user.
 *
 * Pro tier (single tier):
 *   - syncEnabled: cloud sync to MongoDB is allowed
 *   - adsRemoved: ad banners are hidden
 *   - proActive: convenience flag — true when user has Pro
 *
 * Sources of Pro:
 *   - lifetime: manual grant via DB (e.g. early supporters, refunds)
 *   - license_key: legacy product key (NMAX-XXXX-XXXX-XXXX)
 *   - apple_iap: active App Store subscription
 *   - stripe: active Stripe subscription (future)
 */
export interface ComputedEntitlements {
  proActive: boolean;
  syncEnabled: boolean;
  adsRemoved: boolean;
  source?: ProSource;
  expiresAt?: string;
}

/**
 * Compute the user's effective entitlements from their stored entitlements
 * and (optionally) an associated license key record.
 *
 * Precedence: lifetime > active subscription > active legacy license.
 */
export function computeEntitlements(
  user: Pick<IUserDocument, "entitlements"> | null,
  license?: Pick<ILicenseDocument, "active"> | null
): ComputedEntitlements {
  const stored: IUserEntitlements = user?.entitlements ?? {
    lifetimePro: false,
  };

  // Lifetime grant always wins
  if (stored.lifetimePro) {
    return {
      proActive: true,
      syncEnabled: true,
      adsRemoved: true,
      source: "lifetime",
    };
  }

  // Active subscription (Apple IAP / Stripe)
  if (stored.proExpiresAt && new Date(stored.proExpiresAt) > new Date()) {
    return {
      proActive: true,
      syncEnabled: true,
      adsRemoved: true,
      source: stored.proSource,
      expiresAt: stored.proExpiresAt.toISOString(),
    };
  }

  // Legacy license key still treated as Pro for grandfathered users
  if (license?.active) {
    return {
      proActive: true,
      syncEnabled: true,
      adsRemoved: true,
      source: "license_key",
    };
  }

  // Free tier
  return {
    proActive: false,
    syncEnabled: false,
    adsRemoved: false,
  };
}
