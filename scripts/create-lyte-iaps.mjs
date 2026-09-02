#!/usr/bin/env node
/**
 * Create / complete Lyte extra-usage consumable IAPs in App Store Connect
 * and mirror them in RevenueCat (products + default-offering packages).
 *
 * Same path as Lava Stairs crystals (appstoreauto skill). Consumables are
 * POST /v2/inAppPurchases — not subscriptions.
 *
 * Prereqs:
 *   APPLE_API_KEY / APPLE_API_KEY_ID / APPLE_API_ISSUER
 *   defaults: AuthKey_7R59R2ZU8U (team XJ2JD24RGF), issuer from Users and Access
 *   APPLE_BUNDLE_ID=com.noticomax.app
 *
 * Optional RevenueCat (v2 secret — public appl_ cannot create products):
 *   REVENUECAT_SECRET_API_KEY
 *   REVENUECAT_PROJECT_ID   (NoticoMax: proj529c9507)
 *   REVENUECAT_APP_ID       (App Store app: appdd0f7f13dd)
 *
 * APPLE_DRY_RUN=1 lists current IAPs and exits without creating.
 */
import { execFileSync } from "node:child_process";
import { createHash, createSign } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEY_PATH_RAW =
  process.env.APPLE_API_KEY ?? "/Users/michael/.appstoreconnect/private_keys/AuthKey_7R59R2ZU8U.p8";
const KEY_ID = process.env.APPLE_API_KEY_ID ?? "7R59R2ZU8U";
const ISSUER = process.env.APPLE_API_ISSUER ?? "2bd59534-876a-4c05-b039-45f8f4b5bff3";
const BUNDLE_ID = process.env.APPLE_BUNDLE_ID ?? "com.noticomax.app";
const DRY_RUN = process.env.APPLE_DRY_RUN === "1";
const ASC = "https://api.appstoreconnect.apple.com";
const REVIEW_PNG = join(ROOT, "screenshots", "iap-review-lyte.png");
const LOGO = join(ROOT, "public", "icon-mac-1024.png");

const SKUS = [
  {
    productId: "com.noticomax.app.lyte.chats.250",
    name: "250 Lyte Chats",
    description: "250 extra Lyte chats",
    usd: 0.99,
    lookupKey: "lyte_chats_250",
    reviewNote: "Consumable: grants 250 extra Lyte assistant chats.",
  },
  {
    productId: "com.noticomax.app.lyte.chats.1000",
    name: "1,000 Lyte Chats",
    description: "1,000 extra Lyte chats",
    usd: 2.99,
    lookupKey: "lyte_chats_1000",
    reviewNote: "Consumable: grants 1,000 extra Lyte assistant chats.",
  },
  {
    productId: "com.noticomax.app.lyte.lookups.25",
    name: "25 Lyte Lookups",
    description: "25 extra Lyte web lookups",
    usd: 0.99,
    lookupKey: "lyte_lookups_25",
    reviewNote: "Consumable: grants 25 extra Lyte web lookups.",
  },
  {
    productId: "com.noticomax.app.lyte.lookups.100",
    name: "100 Lyte Lookups",
    description: "100 extra Lyte web lookups",
    usd: 2.99,
    lookupKey: "lyte_lookups_100",
    reviewNote: "Consumable: grants 100 extra Lyte web lookups.",
  },
];

function fail(msg) {
  console.error(`[lyte-iap] ${msg}`);
  process.exit(1);
}

const KEY_PATH = KEY_PATH_RAW.startsWith("~")
  ? resolve(process.env.HOME ?? "", KEY_PATH_RAW.slice(1))
  : resolve(KEY_PATH_RAW);

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function mintJwt() {
  const pem = readFileSync(KEY_PATH, "utf8");
  const header = b64url(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({ iss: ISSUER, iat: now, exp: now + 1140, aud: "appstoreconnect-v1" }),
  );
  const signer = createSign("SHA256");
  signer.update(`${header}.${payload}`);
  const sig = signer.sign({ key: pem, dsaEncoding: "ieee-p1363" }, "base64url");
  return `${header}.${payload}.${sig}`;
}

let JWT = mintJwt();

function errDetail(json, fallback) {
  return json?.errors?.map((e) => `${e.code ?? e.title}: ${e.detail}`).join("; ") ?? fallback;
}

async function api(method, path, body) {
  const url = path.startsWith("http") ? path : `${ASC}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${JWT}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status} ${errDetail(json, res.statusText)}`);
    err.status = res.status;
    err.body = json ?? text;
    throw err;
  }
  return json;
}

async function apiAll(path) {
  const rows = [];
  let next = path;
  while (next) {
    const page = await api("GET", next);
    rows.push(...(page.data ?? []));
    const abs = page.links?.next;
    next = abs ? abs.replace(ASC, "") : null;
  }
  return rows;
}

function ensureReviewPng() {
  mkdirSync(join(ROOT, "screenshots"), { recursive: true });
  const jpg = join(ROOT, "screenshots", "iap-review-lyte.jpg");
  // Flatten through JPEG so the PNG has no alpha. 1320×2868 is the size this
  // app already ships (6.9" / iPhone 17 Pro Max) — Apple rejected 1290×2796
  // on Lava Stairs because existing version shots were 1320×2868.
  execFileSync("sips", ["-z", "2868", "1320", "-s", "format", "jpeg", "-s", "formatOptions", "90", LOGO, "--out", jpg], {
    stdio: "pipe",
  });
  execFileSync("sips", ["-s", "format", "png", jpg, "--out", REVIEW_PNG], { stdio: "pipe" });
  const buf = readFileSync(REVIEW_PNG);
  console.log(`[lyte-iap] review screenshot ${buf.length} bytes ${REVIEW_PNG}`);
  return buf;
}

function pickPricePoint(points, usd) {
  const parsed = points
    .map((p) => ({
      id: p.id,
      price: Number.parseFloat(p.attributes?.customerPrice ?? ""),
      raw: p.attributes?.customerPrice,
    }))
    .filter((p) => Number.isFinite(p.price));
  const exact = parsed.find((p) => Math.abs(p.price - usd) < 0.001);
  if (exact) return exact;
  parsed.sort((a, b) => Math.abs(a.price - usd) - Math.abs(b.price - usd));
  return parsed[0] ?? null;
}

async function ensureLocalization(iapId, sku) {
  const locs = await apiAll(`/v2/inAppPurchases/${iapId}/inAppPurchaseLocalizations`);
  if (locs.some((l) => l.attributes?.locale === "en-US")) {
    console.log(`[lyte-iap]   en-US localization already set`);
    return;
  }
  await api("POST", "/v1/inAppPurchaseLocalizations", {
    data: {
      type: "inAppPurchaseLocalizations",
      attributes: {
        name: sku.name,
        locale: "en-US",
        description: sku.description,
      },
      relationships: {
        inAppPurchaseV2: { data: { type: "inAppPurchases", id: iapId } },
      },
    },
  });
  console.log(`[lyte-iap]   en-US localization set`);
}

async function ensurePrice(iapId, sku) {
  let hasUsa = false;
  try {
    const sched = await api("GET", `/v2/inAppPurchases/${iapId}/iapPriceSchedule`);
    const schedId = sched.data?.id;
    if (schedId) {
      const prices = await apiAll(
        `/v1/inAppPurchasePriceSchedules/${schedId}/manualPrices?limit=50&include=inAppPurchasePricePoint`,
      );
      hasUsa = prices.length > 0;
    }
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  if (hasUsa) {
    console.log(`[lyte-iap]   price schedule already set`);
    return;
  }

  const points = await apiAll(
    `/v2/inAppPurchases/${iapId}/pricePoints?filter[territory]=USA&limit=200`,
  );
  const pick = pickPricePoint(points, sku.usd);
  if (!pick) {
    console.warn(`[lyte-iap]   no USA price point near $${sku.usd} (${points.length} points)`);
    return;
  }
  await api("POST", "/v1/inAppPurchasePriceSchedules", {
    data: {
      type: "inAppPurchasePriceSchedules",
      relationships: {
        inAppPurchase: { data: { type: "inAppPurchases", id: iapId } },
        baseTerritory: { data: { type: "territories", id: "USA" } },
        manualPrices: { data: [{ type: "inAppPurchasePrices", id: "${price0}" }] },
      },
    },
    included: [
      {
        type: "inAppPurchasePrices",
        id: "${price0}",
        relationships: {
          inAppPurchaseV2: { data: { type: "inAppPurchases", id: iapId } },
          inAppPurchasePricePoint: { data: { type: "inAppPurchasePricePoints", id: pick.id } },
        },
      },
    ],
  });
  console.log(`[lyte-iap]   USA price $${pick.raw} (target $${sku.usd})`);
}

async function ensureScreenshot(iapId, png) {
  try {
    const existing = await api("GET", `/v2/inAppPurchases/${iapId}/appStoreReviewScreenshot`);
    const state = existing.data?.attributes?.assetDeliveryState?.state;
    if (state === "COMPLETE" || state === "UPLOAD_COMPLETE") {
      console.log(`[lyte-iap]   review screenshot ${state}`);
      return;
    }
    if (existing.data?.id && state === "FAILED") {
      await api("DELETE", `/v1/inAppPurchaseAppStoreReviewScreenshots/${existing.data.id}`);
      console.log(`[lyte-iap]   deleted FAILED screenshot`);
    } else if (existing.data?.id) {
      console.log(`[lyte-iap]   review screenshot ${state ?? "pending"}`);
      return;
    }
  } catch (err) {
    if (err.status !== 404) throw err;
  }

  const created = await api("POST", "/v1/inAppPurchaseAppStoreReviewScreenshots", {
    data: {
      type: "inAppPurchaseAppStoreReviewScreenshots",
      attributes: { fileName: "iap-review-lyte.png", fileSize: png.length },
      relationships: {
        inAppPurchaseV2: { data: { type: "inAppPurchases", id: iapId } },
      },
    },
  });
  const assetId = created.data.id;
  for (const op of created.data.attributes.uploadOperations ?? []) {
    const headers = {};
    for (const h of op.requestHeaders ?? []) headers[h.name] = h.value;
    const chunk = png.subarray(op.offset, op.offset + op.length);
    const put = await fetch(op.url, { method: op.method, headers, body: chunk });
    if (!put.ok) throw new Error(`screenshot PUT ${put.status} ${await put.text()}`);
  }
  const md5 = createHash("md5").update(png).digest("hex");
  await api("PATCH", `/v1/inAppPurchaseAppStoreReviewScreenshots/${assetId}`, {
    data: {
      type: "inAppPurchaseAppStoreReviewScreenshots",
      id: assetId,
      attributes: { uploaded: true, sourceFileChecksum: md5 },
    },
  });
  console.log(`[lyte-iap]   review screenshot uploaded, polling…`);
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const check = await api("GET", `/v1/inAppPurchaseAppStoreReviewScreenshots/${assetId}`);
    const state = check.data?.attributes?.assetDeliveryState?.state;
    const err0 = check.data?.attributes?.assetDeliveryState?.errors?.[0];
    console.log(`[lyte-iap]     assetDeliveryState=${state}${err0 ? ` ${err0.code}` : ""}`);
    if (state === "COMPLETE") return;
    if (state === "FAILED") {
      console.warn(`[lyte-iap]   screenshot processing failed: ${err0?.code ?? "unknown"}`);
      return;
    }
  }
}

async function ensureAvailability(iapId, territories) {
  try {
    const existing = await api("GET", `/v2/inAppPurchases/${iapId}/inAppPurchaseAvailability`);
    if (existing.data?.id) {
      console.log(`[lyte-iap]   availability already set`);
      return;
    }
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  await api("POST", "/v1/inAppPurchaseAvailabilities", {
    data: {
      type: "inAppPurchaseAvailabilities",
      attributes: { availableInNewTerritories: true },
      relationships: {
        inAppPurchase: { data: { type: "inAppPurchases", id: iapId } },
        availableTerritories: {
          data: territories.map((id) => ({ type: "territories", id })),
        },
      },
    },
  });
  console.log(`[lyte-iap]   available in ${territories.length} territories`);
}

async function createIap(appId, sku) {
  const created = await api("POST", "/v2/inAppPurchases", {
    data: {
      type: "inAppPurchases",
      attributes: {
        name: sku.name,
        productId: sku.productId,
        inAppPurchaseType: "CONSUMABLE",
        reviewNote: sku.reviewNote,
      },
      relationships: {
        app: { data: { type: "apps", id: appId } },
      },
    },
  });
  return created.data.id;
}

async function rc(path, { method = "GET", secret, body } = {}) {
  const res = await fetch(`https://api.revenuecat.com/v2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function rcAll(path, secret) {
  const items = [];
  let url = `https://api.revenuecat.com/v2${path}${path.includes("?") ? "&" : "?"}limit=100`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`RC ${url} → ${res.status} ${JSON.stringify(json)}`);
    items.push(...(json.items ?? []));
    url = json.next_page ?? null;
  }
  return items;
}

async function discoverRcProject(secret) {
  const listed = await rc("/projects", { secret });
  if (!listed.ok) {
    console.warn(`[lyte-iap] RC projects ${listed.status}: ${JSON.stringify(listed.json)}`);
    return { projectId: null, appId: null };
  }
  const projects = listed.json.items ?? [];
  for (const p of projects) {
    console.log(`[lyte-iap] RC project ${p.id} name=${p.name ?? p.id}`);
  }
  let projectId = process.env.REVENUECAT_PROJECT_ID;
  if (!projectId) {
    const match = projects.find((p) => /notico/i.test(p.name ?? ""));
    projectId = match?.id ?? null;
  }
  if (!projectId) {
    console.warn("[lyte-iap] no NoticoMax RevenueCat project found — set REVENUECAT_PROJECT_ID");
    return { projectId: null, appId: null };
  }
  const apps = await rc(`/projects/${projectId}/apps?limit=50`, { secret });
  const apple = (apps.json.items ?? []).find(
    (a) =>
      a.type === "app_store" ||
      a.type === "apple_app_store" ||
      a.store === "app_store" ||
      /apple|app_store/i.test(a.type ?? ""),
  );
  const appId = process.env.REVENUECAT_APP_ID ?? apple?.id ?? null;
  console.log(`[lyte-iap] RC using project=${projectId} app=${appId ?? "?"}`);
  return { projectId, appId };
}

async function maybeRevenueCat() {
  const secret = process.env.REVENUECAT_SECRET_API_KEY;
  if (!secret) {
    console.log("[lyte-iap] RevenueCat skipped — REVENUECAT_SECRET_API_KEY missing (need v2 sk_)");
    return;
  }
  const { projectId, appId } = await discoverRcProject(secret);
  if (!projectId || !appId) return;

  const products = await rcAll(`/projects/${projectId}/products`, secret);
  const have = new Map(products.map((p) => [p.store_identifier, p]));

  const createdIds = {};
  for (const sku of SKUS) {
    const existing = have.get(sku.productId);
    if (existing) {
      console.log(`[lyte-iap] RC already has ${sku.productId} id=${existing.id}`);
      createdIds[sku.productId] = existing.id;
      continue;
    }
    if (DRY_RUN) {
      console.log(`[lyte-iap] DRY_RUN would create RC ${sku.productId}`);
      continue;
    }
    const res = await rc(`/projects/${projectId}/products`, {
      method: "POST",
      secret,
      body: {
        store_identifier: sku.productId,
        app_id: appId,
        type: "consumable",
        display_name: sku.name,
      },
    });
    if (res.ok) {
      console.log(`[lyte-iap] RC created ${sku.productId} id=${res.json.id}`);
      createdIds[sku.productId] = res.json.id;
    } else {
      console.warn(`[lyte-iap] RC create ${sku.productId} → ${res.status} ${JSON.stringify(res.json)}`);
    }
  }

  const offerings = await rcAll(`/projects/${projectId}/offerings`, secret);
  const current = offerings.find((o) => o.is_current) ?? offerings[0];
  if (!current) {
    console.warn("[lyte-iap] RC has no offering — packages not attached");
    return;
  }
  console.log(`[lyte-iap] RC offering ${current.id} lookup=${current.lookup_key ?? current.id}`);

  const packages = await rcAll(`/projects/${projectId}/offerings/${current.id}/packages`, secret);
  const pkgByKey = new Map(packages.map((p) => [p.lookup_key, p]));

  for (const sku of SKUS) {
    const productId = createdIds[sku.productId];
    if (!productId) continue;
    let pkg = pkgByKey.get(sku.lookupKey);
    if (!pkg) {
      if (DRY_RUN) {
        console.log(`[lyte-iap] DRY_RUN would create RC package ${sku.lookupKey}`);
        continue;
      }
      const res = await rc(`/projects/${projectId}/offerings/${current.id}/packages`, {
        method: "POST",
        secret,
        body: { lookup_key: sku.lookupKey, display_name: sku.name },
      });
      if (!res.ok) {
        console.warn(`[lyte-iap] RC package ${sku.lookupKey} → ${res.status} ${JSON.stringify(res.json)}`);
        continue;
      }
      pkg = res.json;
      console.log(`[lyte-iap] RC package ${sku.lookupKey} id=${pkg.id}`);
    } else {
      console.log(`[lyte-iap] RC package ${sku.lookupKey} already exists`);
    }
    if (DRY_RUN) continue;
    const attach = await rc(`/projects/${projectId}/packages/${pkg.id}/actions/attach_products`, {
      method: "POST",
      secret,
      body: { products: [{ product_id: productId, eligibility_criteria: "all" }] },
    });
    if (attach.ok || attach.status === 409) {
      console.log(`[lyte-iap] RC attached ${sku.productId} → ${sku.lookupKey}`);
    } else {
      console.warn(`[lyte-iap] RC attach ${sku.lookupKey} → ${attach.status} ${JSON.stringify(attach.json)}`);
    }
  }
}

try {
  readFileSync(KEY_PATH, "utf8");
} catch (err) {
  fail(`could not read APPLE_API_KEY at ${KEY_PATH}: ${err.message}`);
}

const apps = await api("GET", `/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}`);
const app = apps.data?.[0];
if (!app) fail(`no app for ${BUNDLE_ID}`);
console.log(`[lyte-iap] app ${app.attributes.name} id=${app.id}`);

let listed = [];
try {
  listed = await apiAll(`/v1/apps/${app.id}/inAppPurchasesV2?limit=50`);
} catch (err) {
  console.warn(`[lyte-iap] list IAPs failed (${err.message}) — falling back to known SKUs`);
}
const existing = new Map();
for (const row of listed) {
  existing.set(row.attributes.productId, row);
  console.log(
    `[lyte-iap] have ${row.attributes.productId}  ${row.attributes.state ?? ""}  id=${row.id}`,
  );
}

if (DRY_RUN) {
  for (const sku of SKUS) {
    console.log(
      `[lyte-iap] DRY_RUN ${existing.has(sku.productId) ? "exists" : "would create"} ${sku.productId} $${sku.usd}`,
    );
  }
  await maybeRevenueCat();
  process.exit(0);
}

const png = ensureReviewPng();
const territories = (await apiAll("/v1/territories?limit=200")).map((t) => t.id);
console.log(`[lyte-iap] ${territories.length} territories`);

for (const sku of SKUS) {
  let row = existing.get(sku.productId);
  if (!row) {
    const id = await createIap(app.id, sku);
    console.log(`[lyte-iap] created ${sku.productId} id=${id}`);
    row = { id, attributes: { productId: sku.productId } };
  } else {
    console.log(`[lyte-iap] complete ${sku.productId} id=${row.id}`);
  }
  try {
    await ensureLocalization(row.id, sku);
    await ensurePrice(row.id, sku);
    await ensureScreenshot(row.id, png);
    await ensureAvailability(row.id, territories);
  } catch (err) {
    console.error(`[lyte-iap] ${sku.productId} incomplete: ${err.message}`);
  }
}

await maybeRevenueCat();

try {
  const after = await apiAll(`/v1/apps/${app.id}/inAppPurchasesV2?limit=50`);
  console.log("\n[lyte-iap] current IAPs:");
  for (const row of after) {
    console.log(`  ${row.attributes.productId}  ${row.attributes.state ?? ""}  id=${row.id}`);
  }
} catch (err) {
  console.warn(`[lyte-iap] final list failed: ${err.message}`);
}

console.log(`
[lyte-iap] App Store Connect side is done via API.
  First consumable on an app must ship with a new app version.
  Paid Apps Agreement + bank + tax must be Active or sandbox returns no products.
  Do not attach these consumables to an entitlement or restore them.
`);
