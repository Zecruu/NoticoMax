# NoticoMax rebuild

Operator brief, 2026-10-29: work directly with the operator; there is no Hivemind for this project. Priorities are faster initial loading, cleaner design, better interaction feel, and keeping typing visible above the iPhone keyboard. Lyte uses GPT-6.1 Terra, superseding the older Gemini decision.

## Execution checklist

- [x] Trace startup, home navigation, keyboard handling, and the assistant provider.
- [x] Split feature views and the note editor out of the initial home bundle. Mount the editor only when opened.
- [x] Finish the startup loading state after the local session and account isolation are ready; refresh entitlements in the background.
- [x] Simplify the home screen and mobile header; make home search open results and keep one sidebar destination selected.
- [x] Initialize viewport handling on web and native; combine native keyboard events with visualViewport measurements, coalesce updates, and clean up timers/listeners.
- [x] Size the app, editor, and dialogs to the visible viewport. Keep Lyte's composer in the flex layout. Avoid double keyboard padding and iOS focus zoom.
- [x] Switch the active chat route to the server-side Responses API with `gpt-6.1-terra`, low reasoning, `store: false`, existing retrieval and write-intent validation, and updated token accounting.
- [x] Finish focused validation and production-build verification; record results below.
- [ ] Verify on a physical iPhone in Safari/PWA and the native app, including keyboard dismissal, switching fields, long notes, password forms, rotation, and dictation.
- [ ] Configure real server credentials and verify authenticated sync and a live Terra conversation.
- [ ] Measure production cold-load performance on an iPhone. No measured speed improvement is claimed from the import changes alone.

## Local validation

Focused regression tests (Node 24):

```sh
node --test tests/assistant.test.mjs tests/keyboard-avoidance.test.mjs
npx tsc --noEmit --incremental false
```

UI checks use an isolated local preview with placeholder Supabase public settings, no account, and no production data. Chromium viewport checks validate layout, not the physical iOS software keyboard. The preview's temporary environment file must be removed after validation.

Results, 2026-10-29:

- 14 focused regression tests passed. An initial keyboard-test fixture failed because mocked browser globals did not exist in Node; the fixture was corrected and all tests reran successfully.
- `npx tsc --noEmit --incremental false` passed.
- Focused ESLint passed after removing the header's existing mount-state effect. The final sidebar/header/assistant check exited 0 with the sidebar's existing unused `Tag` import warning.
- `npm run build -- --webpack` passed, including TypeScript and all 31 static pages. Webpack is used for the existing next-pwa integration. Build warnings cover the existing middleware convention, old Browserslist data, and webpack cache serialization.
- Chromium screenshots reviewed at 390x844, 390x500, and 1440x1000, including light/dark home layouts and the note editor. Search was checked opening the results view.
- `zecru-ide verify` ran but reported missing built-in standard-library types (`Date`, `Promise`, `Record`, etc.); its diagnostics conflict with the passing repository compiler and production build.
- The Impeccable detector reported only the existing Markdown blockquote border, which is semantic quote styling and was left in place.
- Authenticated sync, a live provider call, native builds, physical iPhone checks, and production load measurements were not run because this checkout lacks credentials and attached iPhone hardware. No deployment was requested.
- The preview at `http://127.0.0.1:5468` was verified and stopped; its placeholder environment file was removed.

## Server setup

Set `OPENAI_API_KEY` in the server environment. Keep it out of `NEXT_PUBLIC_*` variables. The active chat route no longer uses `GEMINI_API_KEY`; `src/lib/ai/gemini.ts` remains an unused legacy adapter. Existing Supabase settings and assistant migrations remain required. This change does not widen assistant access or change its spend caps.

The rate calculation uses standard Terra prices verified on 2026-10-29: $1 per million input tokens and $5 per million output tokens, including reasoning. Cached input is conservatively counted at the full input rate. Reference: https://developers.openai.com/api/docs/models/gpt-6.1-terra

No deployment, native binary build, schema migration, or production data change is part of this local implementation.

## Lyte ease-of-use pass, 2026-10-29

- [x] Replace the mobile push-only button with a prefetched link. Explicitly prefetch Lyte from the home entry, sidebar, and secondary navigation. Add a route loading shell for cold navigation.
- [x] Start status and profile requests together, enable chat as soon as status succeeds, and fetch memory only when its drawer opens. Handle sign-out, network failure, timeout, and stale navigation responses.
- [x] Show an immediately usable draft field while connecting; keep sending gated on server readiness. Add multiline composing, starter prompts, new chat, readable Markdown, copy with a webview fallback, and a focused memory/preferences drawer.
- [x] Keep failed drafts, exclude transport errors from model history, and avoid automatic replay of uncertain requests. Keep in-flight duplicate submits locked.
- [x] Verify the chat using an isolated temporary mock transport; remove that fixture and its placeholder environment after checking.

Validation: 19 focused tests passed, including five new startup tests that demonstrate readiness does not await a slow profile and no memory request is made on entry. TypeScript passed; focused ESLint passed. Chromium checks covered mobile 390x844, reduced-height 390x500, desktop 1440x900, light/dark themes, starter drafting, multiline send, formatted mock replies, copy confirmation, failed-send draft recovery, new chat, memory inspection, and the real signed-out route. The preview at `http://127.0.0.1:5468` was verified and stopped. The mock response was a visual/interaction fixture, not a live Terra call.

Impeccable guided this pass. No installed skill named Kim was found in the Codex, Agents, or Claude skill libraries; clarification was requested. No substitute was silently applied. The design detector again flagged only the existing Markdown quote border. ZecruAI's verifier again reported missing standard-library types while the repository TypeScript compiler passed.

The production build was not repeated for this frontend and startup-flow pass; focused tests, compilation, lint, and browser checks were used. Physical iPhone behavior, live provider response latency, authenticated sync, and production navigation timings remain unverified. Chat history is still session-local component state; persistent conversation history and response streaming are separate work.

## Main integration, 2026-10-29

The operator's standing delivery preference is to merge validated changes into `main` and push `main`. Integration was performed in an isolated worktree to preserve the original folder's unrelated staged files.

Resolved four conflicts against main at `886b57d`, retaining the new chat and viewport behavior together with main's plan-status card, shared six-item mobile footer, usage quotas, paid credits, offline fallback, and iOS version 2.5.12. The usage ledger now correctly labels Terra calls as provider `openai` while preserving the `assistant_chat` quota feature; a regression test covers this.

A clean install exposed main's existing lockfile mismatch. Regenerating the lockfile synchronized its package version to 2.5.12 and resolved the required `iconv-lite` version to 0.7.3. The subsequent `npm ci --no-audit --no-fund` succeeded.

The merged result passed all 20 focused tests, focused ESLint, and `npm run build -- --webpack`, including TypeScript and 34 generated pages. Build output retained `/~offline`, `/pricing`, and `/api/assistant/usage`. The generated service worker was excluded from the source commit. ZecruAI's verifier continued to report missing standard-library types; the production compiler passed. Physical iPhone and live provider checks remain outstanding. The server requires `OPENAI_API_KEY` for Lyte.

## Notes and links capture pass, 2026-10-29

- [x] Replace the crowded item cards with readable, tappable rows and one options menu. Keep pin, copy, share, trash, reminder completion, and bounded inline checklists available.
- [x] Give the library a contextual title, creation action, pinned/recent sections, accurate counts, and a search-specific empty state.
- [x] Keep one complete local library snapshot. Filter it in memory so typing and category changes do not restart database loading or sync listeners; keep counts, tags, and calendar data independent of the current search.
- [x] Give capture a visible optional title, a website-first link form, an uncluttered writing surface, accessible list tools, and optional folder/tag organization. Load Markdown rendering only for preview.
- [x] Save an address without requiring a title; normalize bare domains to HTTPS and reject unsupported URL schemes. Await saves, lock duplicate submissions, retain failed drafts, and avoid rewriting unchanged notes when they close.
- [x] Move notifications above the mobile navigation so save and copy feedback cannot block the next tap.

Validation: `node --test tests/items.test.mjs tests/assistant.test.mjs tests/assistant-session.test.mjs tests/keyboard-avoidance.test.mjs` passed all 32 tests (12 new item tests). Focused ESLint passed on the eight changed source files. `npm run build -- --webpack` passed, including TypeScript and all 34 generated pages. Its existing middleware and Browserslist warnings remain. The generated `public/sw.js` was excluded from source changes.

Browser checks at `http://127.0.0.1:5468` covered mobile 390x844, reduced-height 390x500, and desktop 1440x900 in light/dark themes. Checked note creation and title derivation, save-on-close, URL-only capture, invalid-link recovery, checklist updates, Markdown preview, pinning, pending tags saved without an extra Add tap, search/no-results recovery, stable counts across categories, reminder creation/completion, copy, and immediate navigation while a notification was showing. A temporary delayed/failing save harness verified draft retention, disabled save controls during writes, and successful retry; it was removed before building. The preview server was stopped.

Impeccable guided the refinement. Its source detector reported no findings in the four changed UI components, but explicitly skipped parsed-page contrast and text-size rules for TSX; visual review supplemented that limited scan. `zecru-ide verify` ran and again reported missing standard-library types, while the repository compiler and production build passed. Authenticated sync/sharing, native builds, physical iPhone keyboard behavior, and production performance measurements were intentionally not run; the local preview has no Supabase credentials or attached iPhone.

## Reminder clarification fix, 2026-10-29

- [x] Reproduce the conversation where an explicit reminder request is followed by Lyte asking for a time and the user answering `9am`.
- [x] Replace the latest-message-only write gate with a bounded conversation gate. Adjacent scheduling answers can complete the original reminder/alarm; cancellations, unrelated turns, completed requests, and other write tools remain blocked. Offer the model only the tools authorized for that turn.
- [x] Send the device IANA timezone with chat requests. Validate it before building instructions, account for the scheduled date's daylight-saving offset, and reject timezone-free reminder timestamps. Clients without timezone metadata must clarify it rather than assume UTC.
- [x] Extract the existing prompt and tool runner for direct testing; keep authenticated ownership, tool validation, the two-write limit, and audit logging.
- [x] Validate before merging/pushing main.

All 57 regression tests passed, including 25 clarification tests. Focused ESLint passed on the five changed source files. `npm run build -- --webpack` passed TypeScript and all 34 generated pages; generated `public/sw.js` was excluded. `zecru-ide verify` again reported unavailable built-in library types, inconsistent with the passing repository compiler.

Live Terra tests used the actual prompt, adapter, and tool runner with an in-memory database stub. For `Remind me on November 3 to call mom`, Terra asked for the time, then `9am` produced one authorized reminder. Verified `2026-11-03T13:00:00.000Z` for America/La_Paz and `2026-11-03T14:00:00.000Z` for America/New_York, covering its November daylight-saving change. No production reminders were written; the temporary live-test helper was removed. Physical iPhone notifications and a signed-in production database write were intentionally not tested.

## Saved Lyte conversations, 2026-10-29

- [x] Center the chat transcript and composer beside a desktop history sidebar. Use a left history drawer on mobile, retaining the shared six-item footer and viewport keyboard behavior.
- [x] Create chats on the first message, list/reopen earlier conversations, paginate older turns, and confirm deletion inline. Keep unsent drafts when switching chats; preserve storage-rejected drafts; recover uncertain replies by reading history rather than replaying tools.
- [x] Persist owner-bound turns in Supabase. Use request IDs to deduplicate retained requests and reject concurrent turns in one conversation. Load model history server-side, retaining the existing 20-message context bound and reminder clarification guard.
- [x] Count UTF-8 chat title/message bytes toward existing storage entitlements. Atomically reserve reply space before provider/tool calls, settle actual bytes, and reclaim storage on deletion. Leave history read/delete available when usage or storage is exhausted.
- [x] Share storage allowance definitions with Settings; replace its placeholder copy with actual chat-storage behavior. Keep curated memories separate and reset the in-memory workspace when the signed-in account changes.
- [x] Prepare migration 0015 and validate the release. Production installation was initially blocked by missing management access; the operator supplied it for the release recorded below.

All 70 regression tests passed, including 13 new history tests. The actual SQL migration was exercised in isolated PGlite with auth/entitlement prerequisite stubs, covering ownership/RLS, permission denial, UTF-8 bytes, quota rollback, competing reservations, request deduplication, interrupted/oversized replies, storage-full reads/deletes, and byte reclamation. PGlite uses one connection; a multi-connection production load test was not run. See `docs/LYTE_CONVERSATIONS.md` for the contract and release order.

The local mock-transport preview at `http://127.0.0.1:5468` was inspected at desktop 1440x900, mobile 390x844, and reduced-height 390x500 in light/dark themes. Creating, reopening, and deleting mock chats, the mobile drawer, reminder follow-up display, storage rejection, and retained drafts were checked. The temporary route was removed and the managed server stopped. Browser console checks showed no app errors during the interaction pass. These were simulated authenticated responses, not production database writes or live provider calls.

Impeccable's TSX source detector found no regex findings but explicitly did not run parsed-page contrast/element rules. ZecruAI's verifier again reported missing built-in library types; the repository compiler was used independently. A subsequent build caught implicit callback types in the account-change subscription; explicit Supabase callback types fixed that error. The final `npm run build -- --webpack` passed TypeScript and all 35 generated pages. Focused ESLint passed. Physical iPhone keyboard/notifications, authenticated production persistence, production latency measurements, and native binary builds remain intentionally unverified pending database setup and device access.

### Production database setup

On 2026-10-29 the operator supplied management access and authorized the prepared migration. Applied migration 0015 and its migration-ledger entry in one transaction, then reloaded the REST schema cache. Both conversation tables return HTTP 200 through the server's REST credentials; RLS is enabled on both. Mutation functions use fixed search paths, deny execution to authenticated clients, and allow the service role.

A live PostgreSQL rollback transaction exercised UTF-8 reservation accounting, reply settlement, duplicate-request recovery, and chat deletion/byte reclamation using a temporary conversation fixture. All assertions passed and the transaction rolled back, leaving no test chats or usage changes. No provider calls or note/reminder tools were invoked. The management credential was held only in process memory and was not added to app configuration or repository files. The existing 70-test regression set and previously validated production bundle remain the release checks; authenticated UI checks across reloads/devices and physical iPhone behavior remain separate live checks.

## Reminder schedule clarity, 2026-10-29

- [x] Put the scheduled date and local time/timezone directly beneath reminder titles. Show the full year, explicit repeat cadence, and an `Edited` label on the secondary modification timestamp.
- [x] For active repeating reminders, display the first occurrence at or after now. Passed yearly dates show the next year; one-time overdue reminders retain their overdue state. Completed reminders retain their saved-date display and existing completion behavior.
- [x] Add the same live schedule preview to the editor, with plain `Every day/week/month/year` choices and guidance for month ends and leap birthdays. Missing dates remain visibly unscheduled; no recurrence is inferred from titles.
- [x] Share anchored calendar calculations with calendar expansion and the dashboard's upcoming count. Daily/weekly schedules preserve local wall-clock time across DST. Monthly schedules clamp short months, then return to the original day; February 29 birthdays use February 28 in non-leap years and return to February 29 in leap years. Include occurrences late on the month's final day.
- [x] Keep stored reminder dates and completion flags unchanged by display calculations. No schema changes or data backfills are needed.

All 81 regression tests passed, including 11 new schedule tests covering annual rollover, same-day times, future anchors, one-time/completed/missing dates, month ends, leap years, calendar boundaries, and US DST transitions in a separate New York timezone process. Focused ESLint and the repository TypeScript compiler passed. ZecruAI's verifier again reported unavailable built-in types; its results conflict with the repository compiler. Impeccable's TSX regex scan returned no findings but did not perform parsed-page contrast/element checks.

The temporary fixture at `http://127.0.0.1:5468/reminder-preview` used the real list, editor, and calendar components with in-memory reminder examples. Reviewed light/dark screenshots at mobile 390x844 and desktop 1440x900; verified the May 13, 2027 birthday label, changing repeat settings and saving, the February 28 / March 31 monthly calendar entries, and the May 2027 annual calendar entry. Browser console checks showed no app errors during this pass. The fixture was removed and the managed server stopped before building. Native notification delivery, physical iPhone behavior, and authenticated sync were intentionally not tested in this display-focused change.

The final `npm run build -- --webpack` passed TypeScript and all 35 generated pages. The first build encountered a stale `.next/dev/types/validator.ts` reference to the removed preview; preserving that generated file under a non-TypeScript temporary filename resolved the cache issue. No source or compiler configuration workaround was needed. Generated `public/sw.js` was excluded from the source commit.
