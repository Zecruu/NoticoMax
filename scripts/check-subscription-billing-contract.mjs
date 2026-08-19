import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ENTITLEMENT_REFRESH_DELAYS_MS,
  getSubscriptionPlanName,
  refreshEntitlementWithRetries,
} from "../src/lib/iap/subscription-billing.ts";

assert.deepEqual(ENTITLEMENT_REFRESH_DELAYS_MS, [0, 1000, 2000, 4000]);
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
assert.doesNotMatch(cardSource, /com\.noticomax\.pro\.monthly/);

console.log("subscription billing contract: ok");
