# NoticoMax

A cross-platform note-taking and organization app with cloud sync.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Desktop**: Electron 40 with auto-updater
- **Mobile**: Capacitor 8 (iOS/Android)
- **Database**: MongoDB (Mongoose 9) + IndexedDB (Dexie) for offline
- **Styling**: Tailwind CSS 4, shadcn/ui, Radix UI
- **Auth**: License-key based via Gumroad (replaced NextAuth/Stripe)

## Project Structure

- `electron/` - Electron main process (main.js, preload.js, logger.js)
- `src/app/` - Next.js app router pages and API routes
- `src/components/` - React components (shadcn/ui based)
- `src/lib/` - Utilities (mongodb, sync engine, platform detection, capacitor bridges)
- `src/models/` - Mongoose models
- `scripts/` - Build helpers (inject-env.js, fix-standalone.js)
- `ios/`, `android/` - Capacitor native projects

## Key Patterns

- Electron spawns a Next.js standalone server on port 3099 in production
- Sync engine uses IndexedDB locally, syncs to MongoDB for licensed users
- Middleware runs in edge runtime - do NOT import Node.js modules (mongoose, bcrypt, etc.)
- The `scripts/inject-env.js` injects .env values into electron/main.js for builds, `restore` reverts them
- Capacitor loads the live URL (www.noticomax.com), not a static export

## Build & Release

- Electron installer artifact format: `Notico-Max-Setup-X.Y.Z.exe` (hyphens required for auto-updater)
- GitHub releases must include: `.exe`, `.exe.blockmap`, and `latest.yml`
- Always restore env vars after building: `node scripts/inject-env.js restore`

## Custom Skills

- `/build-electron [patch|minor|major]` - Full build, version bump, and GitHub release pipeline
- `/sync-skills [push|pull|list] [skill-name]` - Sync Claude Code skills to/from NoticoMax cloud

## Claude Skills Sync (cross-computer setup)

On a new computer, run this one-liner in your terminal to bootstrap the NoticoMax skill:

```bash
curl -s https://www.noticomax.com/api/skills/bootstrap | mkdir -p ~/.claude/skills/noticomax && cat > ~/.claude/skills/noticomax/SKILL.md
```

Then in Claude Code, run `/noticomax pull` to download all your skills from the cloud.

### Skills API endpoints

- `GET /api/skills/bootstrap` - Public, no auth. Returns the bootstrap SKILL.md
- `GET /api/skills` - List skills (session auth via Bearer token)
- `POST /api/skills` - Create/upsert skill
- `GET/PUT/DELETE /api/skills/:skillId` - Single skill CRUD

## Common Gotchas

- Middleware must be edge-compatible (no mongoose, bcrypt, or Node.js crypto)
- MongoDB connections can go stale; dbConnect() checks readyState before reusing
- GitHub converts spaces to dots in release asset URLs; use hyphens in artifact names
- `next build` output goes to `.next/`, Electron packages from `standalone/`
