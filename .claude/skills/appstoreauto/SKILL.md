---
name: appstoreauto
description: >-
  Automate App Store Connect IAPs, prices, review screenshots, RevenueCat
  products, iOS archive/upload, and first-IAP version submission via the ASC
  REST API. Use when creating consumables or non-consumables, setting USA
  prices, generating 1320x2868 review PNGs, attaching IAPs to a version, or
  when the user mentions ASC API, crystals, Remove Ads, altool, or submit
  for review.
disable-model-invocation: false
argument-hint: "[phase: iap|price|screenshot|revenuecat|archive|submit]"
---

# App Store Auto — ASC + RevenueCat without the dashboard

There is no App Store Connect or RevenueCat MCP. Do it with the REST API,
the same path that created Lava Stairs crystals, priced them, attached
review images, uploaded build 25, and submitted **Lava Stairs v3**.

Read this before clicking App Store Connect. Dashboard clicks are the
fallback when an endpoint 409s, not the default.

## Credentials (never commit the .p8)

```
APPLE_API_KEY       path to AuthKey_XXXXXXXXXX.p8
APPLE_API_KEY_ID    10-char key id
APPLE_API_ISSUER    UUID from Users and Access → Integrations
APPLE_BUNDLE_ID     reverse-DNS (Lava Stairs: com.michael.lavastairs)
```

JWT: ES256, `aud: appstoreconnect-v1`, max 20 min. Node's default signature
is DER — Apple wants JOSE `r||s`:

```js
signer.sign({ key: pem, dsaEncoding: 'ieee-p1363' }, 'base64url')
```

`APPLE_APP_SPECIFIC_PASSWORD` is often stale. Upload with the API key:

```bash
API_PRIVATE_KEYS_DIR="$(dirname "$APPLE_API_KEY")" \
  xcrun altool --validate-app --type ios --file dist-ios/ipa/App.ipa \
  --apiKey "$APPLE_API_KEY_ID" --apiIssuer "$APPLE_API_ISSUER"
# only then:
API_PRIVATE_KEYS_DIR="$(dirname "$APPLE_API_KEY")" \
  xcrun altool --upload-app --type ios --file dist-ios/ipa/App.ipa \
  --apiKey "$APPLE_API_KEY_ID" --apiIssuer "$APPLE_API_ISSUER"
```

Always `--validate-app` before `--upload-app`.

## Scripts in this repo

| Command | What it does |
|---|---|
| `npm run asc:status` | versions, states, taken build numbers |
| `npm run asc:crystal-iaps` | create/complete crystal consumables |
| `npm run asc:removeads-iap` | locale, $2.99, screenshot, availability |
| `npm run asc:crystal-shots` | replace crystal review PNGs (`IAP_REPLACE_SCREENSHOT=1`) |
| `npm run asc:submit` | select build + attach; `ASC_SUBMIT=1` sends |
| `npm run ios:archive` | bump build, vite, cap sync, **clean** archive, plugin check, export |

Lava Stairs defaults (already in those scripts, also `docs/ACCOUNTS.md`):

- Key id `7R59R2ZU8U`, issuer `2bd59534-876a-4c05-b039-45f8f4b5bff3`
- Team `XJ2JD24RGF`, app id `6769828377`
- v3 version id `84aadc71-6225-4fb3-b229-42153a1d0c25`

## 1. Create IAPs

Consumables / non-consumables are **not** subscriptions.

```
GET  /v1/apps?filter[bundleId]={BUNDLE}
POST /v2/inAppPurchases
  attributes: name, productId, inAppPurchaseType: CONSUMABLE | NON_CONSUMABLE
  relationships.app = the app
POST /v1/inAppPurchaseLocalizations
  name ≤ 30, description ≤ 45, locale en-US
  relationships.inAppPurchaseV2
POST /v1/inAppPurchaseAvailabilities
  availableInNewTerritories: true + every /v1/territories id (~175)
```

`productId` is permanent. Deleted IDs stay reserved — pick a new one.

Lava Stairs SKUs:

| productId | type | USD |
|---|---|---|
| `com.michael.lavastairs.removeads` | NON_CONSUMABLE | 2.99 |
| `com.michael.lavastairs.crystals.100` | CONSUMABLE | 1 |
| `com.michael.lavastairs.crystals.500` | CONSUMABLE | 5 |
| `com.michael.lavastairs.crystals.1000` | CONSUMABLE | 10 |
| `com.michael.lavastairs.crystals.2000` | CONSUMABLE | 20 |

Client crystal rate is `100 crystals = $1` via `crystalsForUsd()` in `src/lib/premium.ts`. Never hand-write a pack's crystal price.

List endpoint `/v1/apps/{id}/inAppPurchasesV2` can 500. Fall back to known IAP ids and `GET /v2/inAppPurchases/{id}`.

## 2. Pricing (USA base, Apple equalizes)

```
GET /v2/inAppPurchases/{id}/pricePoints?filter[territory]=USA&limit=200
POST /v1/inAppPurchasePriceSchedules
```

Working body — do **not** add `startDate`, `territory`, or `preserveCurrentPrice`:

```json
{
  "data": {
    "type": "inAppPurchasePriceSchedules",
    "relationships": {
      "inAppPurchase": { "data": { "type": "inAppPurchases", "id": "IAP_ID" } },
      "baseTerritory": { "data": { "type": "territories", "id": "USA" } },
      "manualPrices": { "data": [{ "type": "inAppPurchasePrices", "id": "${price0}" }] }
    }
  },
  "included": [{
    "type": "inAppPurchasePrices",
    "id": "${price0}",
    "relationships": {
      "inAppPurchaseV2": { "data": { "type": "inAppPurchases", "id": "IAP_ID" } },
      "inAppPurchasePricePoint": { "data": { "type": "inAppPurchasePricePoints", "id": "POINT_ID" } }
    }
  }]
}
```

Pick the USA `customerPrice` that matches the target (exact $1 / $5 / $10 / $20 / $2.99 exist). `baseTerritory: USA` is required — the UI fills it, the API does not. Missing it → later 2.1(b).

Paid Apps Agreement + bank + tax must be **Active** or sandbox returns no products.

## 3. Review images (the dimension trap)

Two different slots:

| Slot | Size | Used for |
|---|---|---|
| **App Review Screenshot** | a size **this app already ships** | Reviewer only |
| **Promoted IAP Image** | **1024 × 1024** | Store page / win-back |

Lava Stairs iPhone shots are **1320 × 2868** (6.9" / iPhone 17 Pro Max). That is the review size that processed `COMPLETE`. **1290 × 2796 is a valid 6.9" spec but Apple rejected it** here because existing version screenshots were 1320 × 2868.

Official 6.9" allow-list: 1260×2736, 1290×2796, **1320×2868**. iPad 13": 2064×2752 or 2048×2732. RGB, 72 dpi, **no alpha**.

Flatten + resize:

```bash
sips -z 2868 1320 -s format jpeg -s formatOptions 90 SRC.png --out /tmp/iap.jpg
sips -s format png /tmp/iap.jpg --out screenshots/iap-review.png
# promo:
sips -z 1024 1024 -s format jpeg SRC.png --out /tmp/p.jpg
sips -s format png /tmp/p.jpg --out screenshots/iap-promo-1024.png
```

`sips -z` is **height then width**.

Upload (3-step):

```
GET  /v2/inAppPurchases/{id}/appStoreReviewScreenshot
     → 200 { data: null } means empty. Not 404.
DELETE /v1/inAppPurchaseAppStoreReviewScreenshots/{id}   # replace / FAILED
POST /v1/inAppPurchaseAppStoreReviewScreenshots
     fileName, fileSize as integer, relationships.inAppPurchaseV2
PUT  each uploadOperations url (copy requestHeaders, slice offset/length)
PATCH uploaded:true + sourceFileChecksum MD5
poll assetDeliveryState until COMPLETE (or FAILED + errors[0].code)
```

Files that worked:

- `screenshots/iap-review-remove-ads.png` + `iap-promo-remove-ads-1024.png`
- `screenshots/iap-review-crystals.png` + `iap-promo-crystals-1024.png`

## 4. RevenueCat REST v2 (no dashboard, no MCP)

ASC first. RevenueCat only mirrors SKUs that already exist in App Store Connect.
`store_identifier` **is** the Apple `productId`. A typo here = SDK `getProducts` returns [].

### Keys (three different things)

| Key | Prefix | Where | Can create catalog? |
|---|---|---|---|
| Public iOS SDK | `appl_` | device / `VITE_REVENUECAT_IOS_KEY` | **No** |
| Secret v1 | `sk_` (v1) | old dashboard keys | **No** — 401 on `/v2` |
| Secret **v2** | `sk_` created as version **V2** | `.env` `REVENUECAT_SECRET_API_KEY` | **Yes** |

```
Authorization: Bearer $REVENUECAT_SECRET_API_KEY
Accept: application/json
Content-Type: application/json          # required on every POST
```

v2 **requires** the `Bearer ` prefix (v1 allowed the raw key). Project-config endpoints share a **60 req/min** limit. List pages use `{ items, next_page, url }` with `?starting_after={last_id}&limit=100`.

Never commit the `sk_`. The public `appl_` **is** safe in the client (`src/lib/iap.ts` fallback `appl_KtcTknOqMhGDlpMjVHewJhhtpjc`).

Lava Stairs ids (already live):

```
REVENUECAT_PROJECT_ID   proja2610f74          # GET /v2/projects → LavaStairs
REVENUECAT_APP_ID       app508a9f11db         # type apple_app_store
default offering        ofrngd6658a7340
Remove Ads product      prod1ceda78ed5        # com.michael.lavastairs.removeads
RemoveAds entitlement   entl1a4129f4c8        # lookup_key RemoveAds
```

### Discover (do this before creating)

```
GET  https://api.revenuecat.com/v2/projects
GET  /v2/projects/{project}/apps?limit=50
GET  /v2/projects/{project}/products?limit=100
GET  /v2/projects/{project}/offerings?limit=50
GET  /v2/projects/{project}/entitlements?limit=50
GET  /v2/projects/{project}/offerings/{offering}/packages
```

Pick the App Store app (`type` / store is Apple, not the Test Store). The Test Store `lifetime` SKU was how `LavaStairs Pro` got attached to a fake product and never unlocked a real purchase.

`scripts/create-crystal-iaps.mjs` runs the product-create half when `REVENUECAT_SECRET_API_KEY` is in `.env`. Packages / entitlements were done with the same v2 calls below.

### Create products (one POST per SKU)

```
POST /v2/projects/{project}/products
{
  "store_identifier": "com.michael.lavastairs.crystals.100",
  "app_id": "app508a9f11db",
  "type": "consumable",
  "display_name": "100 Crystals"
}
```

`type` is `consumable` | `non_consumable` | `subscription`. Response `id` looks like `prod…`. 409 = already exists — list and reuse. Creating a product does **not** put it in an offering; the SDK still won't see a package until the next two steps.

What shipped:

| store_identifier | type | RC package lookup_key |
|---|---|---|
| `com.michael.lavastairs.crystals.100` | consumable | `crystals_100` |
| `com.michael.lavastairs.crystals.500` | consumable | `crystals_500` |
| `com.michael.lavastairs.crystals.1000` | consumable | `crystals_1000` |
| `com.michael.lavastairs.crystals.2000` | consumable | `crystals_2000` |
| `com.michael.lavastairs.removeads` | non_consumable | `remove_ads` |

### Packages on the current offering

Reuse the default offering (`is_current: true`). Do not create a second offering unless the client asks for it.

```
POST /v2/projects/{project}/offerings/{offering}/packages
{ "lookup_key": "crystals_100", "display_name": "100 Crystals" }
```

Then attach — **this body is not the same as entitlement attach**:

```
POST /v2/projects/{project}/packages/{package}/actions/attach_products
{
  "products": [
    { "product_id": "prod…", "eligibility_criteria": "all" }
  ]
}
```

`eligibility_criteria` is required. Use `"all"` on iOS. Detach is `…/actions/detach_products` with the same `products` shape.

### Entitlements (non-consumables only)

Consumable crystals get **no** entitlement. A crystal pile is a one-shot grant on `purchaseStoreProduct`. Attaching crystals to an entitlement would make restore re-grant them.

```
POST /v2/projects/{project}/entitlements
{ "lookup_key": "RemoveAds", "display_name": "Remove Ads" }
```

`lookup_key` **must** match the client string (`REMOVE_ADS_ENTITLEMENT` in `src/lib/iap.ts`). This project originally only had `LavaStairs Pro` on the Test Store `lifetime` SKU — `entitlements.active.RemoveAds` never flipped after a real purchase.

Attach uses **`product_ids`**, not the package `products` array:

```
POST /v2/projects/{project}/entitlements/{entitlement}/actions/attach_products
{ "product_ids": ["prod1ceda78ed5"] }
```

List attached: `GET …/entitlements/{id}/products`. Detach: `…/actions/detach_products` with the same `{ product_ids }`.

### Client flow (`src/lib/iap.ts` + `src/lib/ads.ts`)

1. `Purchases.configure({ apiKey: appl_… })` — static import, not dynamic. Dynamic plugin Proxy can hang on iPadOS 26.
2. `getCustomerInfo()` → `entitlements.active.RemoveAds` **or** `LavaStairs Pro` **or** `allPurchasedProductIdentifiers` contains `com.michael.lavastairs.removeads`.
3. **Remove Ads buy:** find the package whose `product.identifier` is that SKU across `offerings.current` **and** `offerings.all`. `purchasePackage`, else `getProducts` + `purchaseStoreProduct`. A resolved purchase **is** the unlock (`setEntitled(true)`). Never fall through to `offerings.current[0]` — after crystal packs landed on `default`, that bought a $1 pile instead of Remove Ads.
4. **Crystal buy:** `getProducts({ productIdentifiers: [sku] })` + `purchaseStoreProduct`. Grant via `storage.addCrystals`. Do **not** restore consumables.
5. Ads: skip / `hideBanner` + `removeBanner` when entitled. Cache the flag in storage so a cold launch before `getCustomerInfo` does not flash a banner.
6. Do not `Promise.race` StoreKit against a short timeout — the sheet can take longer than 12s.

### Probe without printing the secret

```bash
set -a && . ./.env && set +a
node --input-type=module <<'EOF'
const h = { Authorization: `Bearer ${process.env.REVENUECAT_SECRET_API_KEY}`, Accept: 'application/json' };
const p = process.env.REVENUECAT_PROJECT_ID;
for (const path of ['/products?limit=100', '/offerings', '/entitlements']) {
  const r = await fetch(`https://api.revenuecat.com/v2/projects/${p}${path}`, { headers: h });
  const j = await r.json();
  console.log(path, r.status, (j.items ?? []).map(x => x.store_identifier || x.lookup_key || x.id).join(', '));
}
EOF
```

A 401 on `/v2/projects` means the key is v1 or missing `Bearer`. A 403 means the key is for a different project.

## 5. Archive + upload a build Review will actually see

Anything Review must tap has to be in the **native IPA**, not only OTA.

```
DEBUG_TEST_CRYSTALS = 0          # BootScene overwrites balance if > 0
DEBUG_TEST_COINS = 0
DEBUG_INPUT_HUD = false
npm run ios:archive              # bump CURRENT_PROJECT_VERSION, clean archive
```

`scripts/build-ios.mjs` runs `clean archive` (stale DerivedData omitted SIWA on build 23) then `strings` for `SignInWithApple`, `AdMob`, `CapacitorUpdater`, `Purchases`, `StatusBar` on the **archive** binary before export.

Verify the IPA, not hope:

```bash
unzip -p dist-ios/ipa/App.ipa Payload/App.app/public/assets/index-*.js \
  | rg "crystals.100|removeads|100 Crystals"
plutil -p <(unzip -p dist-ios/ipa/App.ipa Payload/App.app/Info.plist) \
  | rg 'CFBundleShortVersionString|CFBundleVersion'
```

Then validate, upload, poll `npm run asc:status` until `BUILD VALID`. Selecting a build that predates the shop (build 24) makes Review miss the IAPs.

## 6. Submit the first consumable + first non-consumable

Apple: *Your first consumable / first non-consumable must be submitted with a new app version.* You cannot Submit on the IAP row alone.

1. Version must be `PREPARE_FOR_SUBMISSION` (Lava Stairs: **Lava Stairs v3**). Both live versions `READY_FOR_SALE` cannot take a new IAP.
2. `PATCH /v1/appStoreVersions/{id}/relationships/build` → the new VALID build.
3. **What's New cannot be empty** on an update. Empty `whatsNew` → `STATE_ERROR.ENTITY_STATE_INVALID` when adding the version to the review submission.
4. IAPs the user already tapped **Add for Review** show up as `GET /v2/inAppPurchases/{id}/versions` → `inAppPurchaseVersions` state `READY_FOR_REVIEW`. Those version UUIDs **are** the `reviewSubmissionItems`.
5. Add the app version to the **same** draft:

```
POST /v1/reviewSubmissionItems
  relationships.reviewSubmission + relationships.appStoreVersion
```

`inAppPurchase` / `inAppPurchases` are **not** valid relationship names on `reviewSubmissionItems` on this API version. Do not fight it if the IAP versions are already items.

6. `PATCH /v1/reviewSubmissions/{id}` `{ submitted: true }` → `WAITING_FOR_REVIEW`.

`scripts/submit-v3-iaps.mjs` selects the build. Adding IAP *items* via that script 409s; the dashboard Add-for-Review items + the version POST above is what shipped.

## Pagination

`links.next` is an absolute URL. Strip `https://api.appstoreconnect.apple.com` before reuse.

## Do not

- Commit `.p8`, `sk_`, or `.env`
- Ship `DEBUG_TEST_CRYSTALS > 0`
- Upload 1024×1024 to the review-screenshot slot
- Promise.race StoreKit against a short timeout
- Treat `cap sync` "Found N plugins" as proof they linked
- Submit build 23/24 for IAP review — they predate the shop
- Use a v1 `sk_` or a bare `Authorization: sk_…` against `/v2` (needs `Bearer` + a V2 key)
- Attach crystal consumables to an entitlement or restore them
- Fall through to `offerings.current[0]` when buying Remove Ads
