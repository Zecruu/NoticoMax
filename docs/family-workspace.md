# Unified Family workspace — draft review

## Product behavior

Family is one mobile-first space beside Personal: Together, Lists, Notes, Reminders, and Places. The grocery flow is implemented, not a mockup: an accepted member creates a list in an editable shared folder, another member opens the same list and checks off individual entries. Every checkmark is an explicit state change to a stable row. Different entries can be updated independently; opposite stale intent on the same entry returns a conflict instead of silently overwriting it. Repeated same-state requests are idempotent. Read-only members can read but cannot change a list. Lists can be moved to shared trash. Existing notes/URLs/reminders retain document-level last-writer-wins semantics, not collaborative text merging.

Lists and shared places refresh after mutations and every **15 seconds while visible**, with a displayed last-refresh time and manual Refresh. They require a connection to change; there is no offline checklist-command queue and no claim of instant realtime. Network failure retains readable state but blocks edits. Revoked access or account changes clear it. Timeouts explicitly warn that a write may already have reached the server; stable IDs make supported retries safe. Shared notes still use the foundation's offline sync queue, realtime invalidation, and visible 30-second reconciliation.

The Personal feed, counts, tags, and calendar exclude household rows. Family folders open the same workspace. Family management stays available through its settings button. Existing billing and Personal Pro sync gates are unchanged. The mobile Family destination replaces the dedicated URLs bottom-tab slot; URLs remain available from Personal and the sidebar.

### Three distinct location concepts

1. **Personal places**: existing private `locations`, owner-only access and existing personal sync entitlement. Native Apple Maps picking/viewing added, never automatically shared.
2. **Family places**: new persistent `family_places` destination pins. All accepted household members can view, add, edit, and delete them, irrespective of folder-specific note permissions. The save dialog names this audience. Revision checks protect against stale edits. A picker or GPS tap only fills a draft; Save explicitly publishes it. No saved-place pricing quota was selected or changed.
3. **Member check-ins**: optional, one-time, consent-controlled coordinates with capture time, accuracy, and 24-hour visibility expiry. Saving a place does not enable or create a check-in. No background tracking, geofences, arrival alerts, or automatic child tracking exists.

## Native Apple Maps

`FamilyMapPlugin.swift` presents an actual `MKMapView` in a native modal. `FamilyBridgeViewController` registers the Capacitor plugin and is wired into the storyboard/Xcode source build phase. Both Family and Personal can view saved pins and choose a place with explicit search or a long press. Selection returns a draft to the web UI; it does not save/share by itself. Dismissal, scope changes, and navigation invalidate pending results. The map never enables user-location tracking. GPS remains a separate explicit one-shot web/native geolocation action.

No API key or external SDK package is required. Native search still depends on Apple/network availability and platform rate limits. The map limits one render request to 500 pins as a defensive UI bound, **not a storage/pricing quota**. Older iOS binaries and web retain manual/current-spot entry and external Maps links. This repository's iOS build must be rebuilt in Xcode to include the bridge; a web update alone cannot add it. Existing web support remains.

## Schema / server boundary

Apply `0016_family_foundation.sql` then `0017_family_workspace.sql` only in a separately authorized staging environment after review. Nothing has been applied to hosted Supabase.

Migration 0017 adds `items.is_checklist`, per-entry checklist rows, and the separate shared-places table. Direct authenticated writes to the new tables are revoked. Checked security-definer commands authenticate membership/folder edit access, preserve author identity, lock parent/entry rows, and enforce revision/size checks. The snapshot is a stable RLS-invoker JSON response; excessive snapshots fail closed rather than returning a partial list. Family API inputs do not accept caller-supplied author identity. All responses are private/no-store. Deleting a household cascades these tables via their parent records.

Implementation bounds: 200 entries per list; a workspace snapshot rejects over 1,000 visible lists or 10,000 places. These are safety limits, not newly chosen product pricing. A larger-scale workspace needs paginated/snapshot-versioned transport before removing those bounds.

## Verification and limitations

Local results (2026-10-30): **121/121 tests passed**, `npx tsc --noEmit` passed, focused lint on expanded application/test paths passed, and the production build passed with `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1`. Full repository lint remains failing at **51 errors / 12 warnings**, compared with **53 / 13** on the clean base. No TLS verification was disabled. `git diff --check` passed.

- Full Node suite includes actual PGlite/PostgreSQL RLS/trigger/RPC tests, the actual sync engine with adapters, actual check-in/workspace hooks with deterministic adapters, and actual Family screen server-rendered markup with React/Radix.
- Grocery database tests exercise two authorized identities, independent entries from stale snapshots, same-state retry, conflicting same-entry changes, read-only access, trash, and revocation. Place tests exercise membership, author stability, revisions, and separation from check-in consent.
- Workspace hook tests exercise concurrent per-entry requests, double taps, stale read failures, revoked membership, account/family changes during writes, and uncertain timeout handling.
- These are **not** simultaneous multi-connection hosted Supabase tests, full browser integration, native compilation, or iPhone QA.
- Browser/visual QA was attempted but unavailable: this executor denies Chromium sockets and Next dev network-interface inspection. Supported escalation failed in runtime setup on a read-only internal mount. No bypass was attempted, and no screenshots are claimed.
- A reusable, **not yet executed successfully**, actual-UI/PGlite browser harness is provided in `scripts/qa-family-workspace.mjs`. Install/use Playwright in a permitted development environment, then run `node --experimental-strip-types scripts/qa-family-workspace.mjs`. Optional `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, and `FAMILY_QA_ARTIFACTS` configure it. It creates a temporary review route (refuses overwrite), runs mobile/desktop grocery/place/cancel/Personal flows, and cleans it up. It intercepts local API requests into real PGlite SQL, not production services. Review fixture and mocks are under `tests/fixtures`, never shipped as a production route.
- Baseline `npm ci` lacks the existing `encoding` lock entry; installation was performed without changing the package/lock files. Repository-wide lint has pre-existing errors. See PR validation results for final counts.

## Required before merge/release

1. Review security/migration changes; run authorized staging migrations and hosted RLS/API tests with owner, editor, read-only, outsider, removed member, and switched account. Test truly concurrent entry writes, permission removal, deletion, and seat races with separate database connections.
2. Run the browser harness and visually inspect phone/desktop layouts, keyboard/safe-area behavior, dialogs/cancellation, navigation, stale/error/offline states, long content, and existing Personal flows. Screenshots are still outstanding.
3. On macOS, build the registered iOS target and test on an iPhone: native map open/close/search/pick/permission denial, Personal versus Family destination, returning from background, late GPS responses, plugin-unavailable fallback, and VoiceOver. No native/device verification has been performed here.
4. Verify real shared reminder scheduling/completion and notification permissions. These are reminders, not reliable background arrival alerts.
5. Review physical retention cleanup for expired check-ins (RLS hides them immediately), API abuse/rate limits, existing paid legacy Family behavior, and App Store privacy disclosures. No new deployment, provider purchase, production migration, or merge is authorized by this draft PR.
