import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BILLING_PREFLIGHT_TIMEOUT_MS,
  ENTITLEMENT_REFRESH_DELAYS_MS,
  getSubscriptionPlanName,
  refreshEntitlementWithRetries,
  withBillingTimeout,
} from "../src/lib/iap/subscription-billing.ts";

assert.deepEqual(ENTITLEMENT_REFRESH_DELAYS_MS, [0, 1000, 2000, 4000]);
assert.equal(BILLING_PREFLIGHT_TIMEOUT_MS, 12_000);
assert.equal(getSubscriptionPlanName("com.noticomax.app.plus.monthly"), "NoticoMax Plus");
assert.equal(getSubscriptionPlanName("com.noticomax.app.platinum.monthly"), "NoticoMax Platinum");
assert.equal(getSubscriptionPlanName("com.noticomax.app.maxxed.monthly"), "NoticoMax MAXXED");
assert.equal(getSubscriptionPlanName("unverified.legacy.product"), "NoticoMax subscription");
assert.equal(getSubscriptionPlanName(null), null);

const waits = [];
let refreshCount = 0;
const becameActive = await refreshEntitlementWithRetries(
  async () => ++refreshCount === 3,
  async (delayMs) => {
    waits.push(delayMs);
    return true;
  },
);
assert.equal(becameActive, true);
assert.equal(refreshCount, 3);
assert.deepEqual(waits, [1000, 2000]);

let cancelledRefreshes = 0;
const cancelled = await refreshEntitlementWithRetries(
  async () => {
    cancelledRefreshes += 1;
    return false;
  },
  async () => false,
);
assert.equal(cancelled, false);
assert.equal(cancelledRefreshes, 1, "Unmount cancellation stops bounded retries");

assert.equal(await withBillingTimeout(Promise.resolve("ready"), 50), "ready");
await assert.rejects(
  withBillingTimeout(new Promise(() => {}), 5, "billing timeout"),
  /billing timeout/,
);

const settingsSource = await readFile(new URL("../src/app/settings/page.tsx", import.meta.url), "utf8");
assert.match(settingsSource, /useState\(false\)[\s\S]*setIsIOSBilling\(isIOS\(\)\)/);
assert.doesNotMatch(settingsSource, /const isIOSBilling = typeof window/);

const cardSource = await readFile(
  new URL("../src/components/settings/subscription-card.tsx", import.meta.url),
  "utf8",
);
assert.match(cardSource, /if \(!isIOSBilling\) return;[\s\S]*getSubscriptionStatus\(\)/);
assert.match(cardSource, /openInBrowser\(href\)/);
assert.match(cardSource, /window\.clearTimeout\(timerId\)[\s\S]*resolve\(false\)/);
assert.match(cardSource, /PAYWALL_OPENING_STATE_MS = 3_000/);
assert.match(cardSource, /paywallOpeningTimerRef[\s\S]*window\.clearTimeout/);
assert.doesNotMatch(cardSource, /com\.noticomax\.pro\.monthly/);

const revenueCatSource = await readFile(
  new URL("../src/lib/iap/revenuecat-client.ts", import.meta.url),
  "utf8",
);
assert.match(revenueCatSource, /isPluginAvailable\("Purchases"\)/);
assert.match(revenueCatSource, /isPluginAvailable\("RevenueCatUI"\)/);
assert.match(revenueCatSource, /withBillingTimeout\([\s\S]*Purchases\.getOfferings\(\)/);
assert.match(revenueCatSource, /current\.availablePackages\.length === 0/);
assert.match(revenueCatSource, /RevenueCatUI\.presentPaywall\(\{[\s\S]*offering/);
assert.match(revenueCatSource, /addListener\("paywallDismissed"/);
assert.match(revenueCatSource, /const presentation = present\(\)/);
assert.match(revenueCatSource, /Promise\.race\(/);

const homeSource = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
assert.match(homeSource, /return \(\) => \{[\s\S]*hideBannerAd\(\)/);
assert.match(homeSource, /activeView !== "dashboard"/);
assert.match(homeSource, /\[activeView, isPro, isLoggedIn\]/);

const admobSource = await readFile(
  new URL("../src/lib/ads/admob-client.ts", import.meta.url),
  "utf8",
);
assert.match(admobSource, /adSize: BannerAdSize\.BANNER/);
assert.doesNotMatch(admobSource, /adSize: BannerAdSize\.ADAPTIVE_BANNER/);

console.log("subscription billing contract: ok");
