# Claude Handoff — Windows ↔ Mac

Shared conversation log between Claude Code instances collaborating on NoticoMax.

**Preferred mechanism:** use the `/noticomaxclaude` slash command. It reads and writes
numbered resumes via the `/api/claude-handoff` endpoint (MongoDB-backed, secured by
`ADMIN_SECRET`). Run `/noticomaxclaude` at the start of a session to see the latest
update; run `/noticomaxclaude post` at the end to leave a resume for the next Claude.

This markdown file is the fallback / pinned-context doc. Use it for things that never
change (protocol, identities, known gotchas) — but put session-to-session updates in the
API via `/noticomax post` instead.

## Identities

- **windows-claude** — running on the user's Windows 11 machine. Handles Next.js / Electron /
  server code, Windows builds, GitHub releases. Cannot run Xcode or build `.ipa` / `.dmg`.
- **mac-claude** — running on the user's Mac. Handles Xcode, iOS native, CocoaPods,
  `cap sync`, TestFlight, and macOS DMG builds. Can also do everything windows-claude does.

## Protocol

Both instances MUST follow this to avoid stomping each other:

1. **Pull first:** `git pull --rebase origin master`
2. **Read the full Message Log** below so you have the latest context.
3. **Append** a new entry — do NOT edit prior entries. Format:
   ```
   ### <ISO 8601 UTC> — <your-id> → <recipient>
   (your message)
   ```
4. **Commit** only this file (not unrelated changes in the same commit):
   ```
   git add CLAUDE_HANDOFF.md
   git commit -m "handoff: <brief subject>"
   git push origin master
   ```
5. If you make *code* changes in response to a handoff, commit those separately with a
   normal `feat:` / `fix:` / `chore:` message, then add a handoff entry referencing the
   commit hash.

## Current state (as of 2026-04-23)

- Latest release: **v2.4.0** (Sign in with Apple)
- Phases 1–2 complete; Phases 3–5 pending (IAP, AdMob, store submission).
- Apple Developer setup:
  - Team ID: `XJ2JD24RGF`
  - App ID: `com.noticomax.app` (with Sign In with Apple, Push, Time Sensitive capabilities)
  - Service ID: `com.noticomax.signin`
  - Sign in with Apple Key ID: `SSLPY85DSK`
  - `.p8` saved as base64 in `.env` under `APPLE_PRIVATE_KEY_BASE64` (gitignored)
  - App Store Connect: app shell created (no pricing / screenshots yet)
- iOS plugin `@capacitor-community/apple-sign-in` installed in `package.json`,
  but **NOT yet synced into the iOS Xcode project**.
- Electron BrowserWindow OAuth flow works on Windows for Mac/desktop sign-in.

## Open tasks for mac-claude

- [ ] `npx cap sync ios` — adds the Apple sign-in plugin to the iOS project
- [ ] Open Xcode via `npx cap open ios` → `App` target → **Signing & Capabilities**:
  - [ ] Set Team to `XJ2JD24RGF`
  - [ ] Click **+ Capability** → add **Sign In with Apple**
  - [ ] Verify **Push Notifications** and **Time Sensitive Notifications** capabilities are present
- [ ] Build to iOS Simulator, tap "Sign in with Apple" on the auth screen, verify it reaches `/api/auth/apple`
- [ ] If a physical iPhone is available, test there too
- [ ] Add a `.dmg` Mac build to the release pipeline (currently Windows-only)
- [ ] Report outcomes back in this file under a new log entry

## Known gotchas

- `next build` output goes to `.next/`; Electron packages from `standalone/` via `scripts/fix-standalone.js`.
- Middleware is edge-runtime — do NOT import `mongoose`, `bcrypt`, or `crypto` there.
- Installer artifact MUST be named `Notico-Max-Setup-X.Y.Z.{exe,dmg}` (hyphens, not spaces)
  or the auto-updater's URL parsing breaks.
- The `.p8` private key was pasted into this repo once as `AuthKey_SSLPY85DSK.p8` (gitignored).
  Consider rotating it once everything is verified working.
- CocoaPods is required for `cap sync ios`. Install with `sudo gem install cocoapods` or
  `brew install cocoapods` on the Mac before running sync.

---

## Message log

### 2026-04-23T00:00Z — windows-claude → mac-claude

Hi mac-claude. I'm the Windows instance — I've been with this user since the start of the
NoticoMax monetization overhaul. Here's what you need to pick up:

**The user's goal:** ship NoticoMax to the App Store. Apple-exclusive. $2.99/mo Pro tier
(unlocks sync + removes ads). Free tier is local-only. User email
`nomnk5138@gmail.com` is grandfathered as lifetime Pro.

**Phase 2 (Sign in with Apple) is code-complete and released as v2.4.0**, but the iOS side
of it needs your Mac — I can't run Xcode or CocoaPods from Windows. The Electron path
works on my end; I haven't been able to verify the iOS native flow end-to-end.

**Please handle the "Open tasks for mac-claude" checklist above.** The code for the iOS
Apple button lives in `src/lib/auth/apple-signin-client.ts` — it dynamically imports
`@capacitor-community/apple-sign-in` and calls `SignInWithApple.authorize(...)`. After you
run `cap sync ios`, the plugin's native code gets added to the iOS project; then the
Xcode capability toggle wires the entitlement.

**When you report back**, please include:
- Did `cap sync` succeed? Any warnings?
- Did the Xcode build succeed after adding the capability?
- Did tapping "Sign in with Apple" in the Simulator actually open the Apple UI?
- If yes, did it complete a round-trip to `/api/auth/apple` and log the user in?
- Any new `.env` vars or Xcode config that should be documented here?

**One more thing:** consider adding a `.dmg` build target. Right now `electron:build:mac`
exists but has never been run since the user is on Windows. If you get the DMG building,
update the `/build-electron` skill (at `~/.claude/skills/build-electron`) to also produce
and upload the `.dmg` + `latest-mac.yml` for auto-updates. Windows-me can't test that.

Good luck. Ping me here when you've got results — I'll see them next time the user runs
`claude` on Windows.

— windows-claude
