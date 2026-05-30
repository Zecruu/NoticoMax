import { isCapacitorNative, isIOS } from "@/lib/platform";

// Google's official test IDs — safe to ship until real AdMob unit IDs land.
// Live IDs are set via env (NEXT_PUBLIC_ADMOB_*) at build time.
const TEST_IOS_BANNER = "ca-app-pub-3940256099942544/2934735716";
const TEST_ANDROID_BANNER = "ca-app-pub-3940256099942544/6300978111";

const IOS_BANNER_ID = process.env.NEXT_PUBLIC_ADMOB_IOS_BANNER_ID || TEST_IOS_BANNER;
const ANDROID_BANNER_ID = process.env.NEXT_PUBLIC_ADMOB_ANDROID_BANNER_ID || TEST_ANDROID_BANNER;

let initialized = false;
let bannerVisible = false;

export function getBannerAdUnitId(): string {
  return isIOS() ? IOS_BANNER_ID : ANDROID_BANNER_ID;
}

/**
 * One-shot AdMob initialization. Requests App Tracking Transparency on iOS
 * before initializing so personalized ads can be served when allowed.
 * Safe to call multiple times.
 */
export async function initAdMob(): Promise<void> {
  if (!isCapacitorNative() || initialized) return;
  initialized = true;
  try {
    const { AdMob } = await import("@capacitor-community/admob");
    if (isIOS()) {
      const tracking = await AdMob.trackingAuthorizationStatus();
      if (tracking.status === "notDetermined") {
        await AdMob.requestTrackingAuthorization();
      }
    }
    await AdMob.initialize({
      testingDevices: [],
      initializeForTesting: false,
    });
  } catch (err) {
    console.warn("[admob] initialize failed:", err);
  }
}

/**
 * Show a bottom banner ad. No-op if not on a native platform, if AdMob
 * isn't initialized, or if the banner is already visible.
 */
export async function showBannerAd(): Promise<void> {
  if (!isCapacitorNative() || bannerVisible) return;
  try {
    if (!initialized) await initAdMob();
    const { AdMob, BannerAdPosition, BannerAdSize } = await import(
      "@capacitor-community/admob"
    );
    await AdMob.showBanner({
      adId: getBannerAdUnitId(),
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: !process.env.NEXT_PUBLIC_ADMOB_IOS_BANNER_ID,
    });
    bannerVisible = true;
  } catch (err) {
    console.warn("[admob] showBanner failed:", err);
  }
}

export async function hideBannerAd(): Promise<void> {
  if (!isCapacitorNative()) return;
  // Always attempt removeBanner — the bannerVisible flag can fall out of sync
  // with native state after a hot-reload or a missed render, and we'd rather
  // call removeBanner against an already-hidden banner (no-op) than fail to
  // hide an active ad on a Pro user. AdMob.removeBanner is idempotent.
  try {
    const { AdMob } = await import("@capacitor-community/admob");
    await AdMob.removeBanner();
  } catch (err) {
    console.warn("[admob] removeBanner failed:", err);
  } finally {
    bannerVisible = false;
  }
}
