# Family foundation — local review build

Branch: `feat/family-foundation`, based on `de1fcd262d0523f17819f264ca28283cb637dc37`.
This is a draft review build, not a deployment. No production migration, billing change, paid map service, or credentials were added. Publication is limited to the feature branch and a draft PR.

## Included

- A signed-in user can create one free family with five total members. Existing paid Family/lifetime allowances and purchased extra seats remain unchanged. A family code is a **request**, not membership; the owner approves. Existing email invitations require the addressed account's acceptance. Seat checks and membership creation are atomic.
- Free collaboration sync is limited to household folders and notes, links, and reminders. Personal Pro sync remains a separate gate. Private saved places, budgets, credentials, and other personal paid features do not become free cloud-sync features. The separate Family workspace adds shared lists and shared destination pins.
- Collaborator edits preserve the original author. Read-only permissions are reflected in the UI and enforced by RLS; permission replacement is atomic. Collaborators cannot transfer ownership or move someone else's note into a more widely visible folder. Shared items cannot be moved through this first increment's editor.
- Full, single-database-snapshot Family reconciliation sees newly granted old content and revocations. It evicts revoked shared cache and outgoing edits only after a successful complete response, never after a network error. It preserves personal rows and authorized unsent new notes. A read-only downgrade retains pending local edits but blocks upload. Queues acknowledge only successfully sent IDs from the captured batch; newer concurrent edits survive.
- Shared reminders are visible to authorized members and update with the shared note. On native devices, incoming reminders schedule only if notification permission was already granted; sync never opens an unsolicited notification prompt. Delivery still depends on device/platform behavior and app sync. No emergency, geofence, or background-location alert is implemented.
- Each member controls their **own** manual location check-ins. Sharing is initially off. Enabling consent does not request GPS or send coordinates. A separate tap captures and sends one check-in, with the actual device capture time, accuracy, and 24-hour expiry. Pause deletes that person's last check-in and prevents subsequent writes until explicitly enabled again. Delete, leaving, and family deletion revoke the relevant data.
- Coordinates are online-only: no IndexedDB, sync queue, HTTP cache, or automatic retry. The view refreshes every 30 seconds while visible and hides locations offline or when hidden. Pending captures cannot send after pause, navigation, family switch, or unmount. Failed pause explicitly warns that revocation was not confirmed. Opening an external Maps link is a separate user action.

## Saved places are not member check-ins

Existing saved-location pins are persistent user-selected places, not another person's whereabouts. They retain owner-only database access and now offer native Apple Maps viewing/picking in the updated iOS app. This migration only adds the missing `locations.household_id` column already referenced by the existing sync client; it does **not** make saved places shared. The launch priority is the iOS App Store; existing web support is retained. No saved-pin quota or pricing limit was selected or changed. The expanded workspace uses native Apple MapKit and explicit MKLocalSearch; no provider credential, paid-service subscription, or live tracking is added. See `family-workspace.md` for the new shared-place table and native QA requirements.

## Security and data semantics

- `0016_family_foundation.sql` supplies bounded, authenticated membership/permission helpers to avoid the existing RLS recursion, checked RPCs, provenance/scope guards, and check-in consent tables.
- The Family snapshot is a scalar JSON response built under RLS in one stable database snapshot. More than 10,000 visible folders or supported items causes an explicit error rather than partial data or destructive cache reconciliation. Personal Pro pulls use keyset paging separately.
- Account changes invalidate in-flight sync and clear Family caches. Shared notes can be used offline; a device cannot learn about remote revocation until it reconnects and successfully refreshes. Already copied content, notifications, screenshots, or exported locations cannot be retracted. Check-ins are not available offline.
- Deleting a family deletes its shared notes/folders and all member check-in preferences/check-ins. Personal items are preserved. Existing paid budget-table deletion semantics are not changed. The UI's existing confirmation says the family is deleted for everyone.
- Check-in expiry immediately prevents authenticated reads. Expired rows are retained internally until overwritten, explicitly deleted/paused, or membership/family deletion. A separately reviewed retention cleanup schedule is still needed before a production location-data launch.
- Concurrent document edits remain last-writer-wins; this is not a CRDT/editor conflict-resolution implementation. Permission-revoked cached edits are purged rather than silently republished as private copies.

## Validation

Commands used (no production services required):

```sh
node --experimental-strip-types --test tests/*.test.mjs
npx tsc --noEmit
npm run lint
NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1 npm run build
```

- `family-database.test.mjs` executes the new migration unchanged against PGlite/PostgreSQL policies and triggers. The fixture loads relevant prior migrations and moves the **pre-existing** `0007` household-read policy after its forward-referenced `household_members` table. This does not prove that the full historical migration chain initializes a fresh hosted Supabase project without repair.
- `family-sync.test.mjs` executes the actual engine with in-memory database/network adapters: free-vs-Pro isolation, author preservation, queue failures/concurrent writes, revocation, incomplete responses, read-only downgrade, new grants, account switching, create-then-delete, permanent shared deletion.
- `family-checkin-flow.test.mjs` executes the actual hook with deterministic hook/network/clock adapters: explicit consent, repeated taps, denial, capture interrupted by pause/hide/offline/family change/unmount, and failed-pause messaging. This is **not** rendered-browser/native-device testing.
- `family-checkins.test.mjs` covers payload validity, capture age, identity/expiry injection, and safe API errors.
- The first ordinary production build failed to fetch Google Fonts due to this executor's TLS trust configuration. The same build with Next's system-CA flag succeeded. No TLS verification was disabled and no app font/config files were changed.
- Foundation checkpoint: **110 tests passed**; TypeScript passed. Baseline repository-wide lint has existing failures (53 errors / 13 warnings on the clean base), compared with 52 errors / 12 warnings on this branch. The modified application paths are clean except the unchanged cached-hydration effect violation in `use-license.ts` (that file's only edit is an entitlement comment). See the local handoff for final counts.
- Initial `npm ci` failed on the pre-existing missing `encoding` lockfile entry. Dependencies were installed with `npm install --ignore-scripts --no-audit --no-fund --package-lock=false`; neither package manifest nor lockfile was changed. Installation/postinstall reproducibility remains a baseline issue.

## Before any release

1. Review the SQL and all permission/deletion semantics. Back up staging and apply the migration only to an authorized staging Supabase project, after its prior schema is confirmed. This build has applied no hosted migrations.
2. Exercise actual Supabase/PostgREST/RLS with owner, editor, read-only member, outsider, and removed member accounts. Verify RPC shapes, realtime subscriptions, expired invites, concurrent last-seat joins, simultaneous pause/share/removal, grant/revoke, network interruption, account switching, and more-than-one-page data.
3. Perform rendered UI QA at phone/desktop widths and on native devices: geolocation allowed/denied, OS prompts interrupted, repeated taps, Back/Close, offline transitions, exact expiry, Maps handoff, notification permission/delivery, shared reminder completion, and native storage cleanup. No authenticated browser or device integration run was available in this workspace.
4. Review database retention cleanup, abuse/rate limiting for family-code lookups/requests, and existing paid-family budget/credential legacy behavior before a broad launch. Shared passwords are not part of this increment. Persistent shared-place pins are implemented separately in migration 0017, never by widening private-location access.
5. Future live location/arrival alerts require a separate design and authorization: per-member opt-in, visible background-sharing state, platform permissions, battery/refresh guarantees, consent withdrawal, geofences, retention, and reliability messaging. Nothing here should be presented as live or child tracking.
