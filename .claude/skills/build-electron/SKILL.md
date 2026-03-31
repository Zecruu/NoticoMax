---
name: build-electron
description: Build the Electron app, bump version, commit, push, and create a GitHub release with installer artifacts. Use when deploying a new desktop release.
disable-model-invocation: true
argument-hint: "[patch|minor|major] (default: patch)"
allowed-tools: Bash, Read, Edit, Glob, Grep
---

# Build Electron App & Release

Current version: !`node -p "require('./package.json').version"`
Current branch: !`git rev-parse --abbrev-ref HEAD`
Last commit: !`git log -1 --pretty="%h %s"`

## Instructions

You are building, packaging, and releasing the NoticoMax Electron desktop app.

### Step 1: Bump version

Bump the version in `package.json` based on the argument:
- `patch` (default if no argument): increment patch (e.g., 2.1.1 -> 2.1.2)
- `minor`: increment minor (e.g., 2.1.1 -> 2.2.0)
- `major`: increment major (e.g., 2.1.1 -> 3.0.0)

Argument provided: `$ARGUMENTS`

### Step 2: Build

Run the full Electron build pipeline:
```
node scripts/inject-env.js inject
npx next build
node scripts/fix-standalone.js
npx electron-builder --win --publish never
node scripts/inject-env.js restore
```

Run each step sequentially. If any step fails, stop and report the error.
Use a timeout of 600000ms (10 minutes) for the electron-builder step.

### Step 3: Commit & push

1. Stage `package.json`
2. Commit with message: `chore: bump version to X.Y.Z`
3. Push to `master` and push `master:main`

### Step 4: Create GitHub release

1. Determine the new version tag: `vX.Y.Z`
2. Generate release notes from commits since the last tag:
   ```
   gh release list --limit 1
   ```
   Then get commits between the last release tag and HEAD.
3. Create the release with artifacts:
   ```
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "..." \
     "dist-electron/Notico-Max-Setup-X.Y.Z.exe" \
     "dist-electron/Notico-Max-Setup-X.Y.Z.exe.blockmap" \
     "dist-electron/latest.yml"
   ```

### Step 5: Report

Output a summary:
- Old version -> New version
- GitHub release URL
- Artifacts uploaded

### Important notes

- ALWAYS use `npx` for `next build` and `electron-builder`
- The artifact name format is `Notico-Max-Setup-X.Y.Z.exe` (hyphens, not spaces)
- The `latest.yml` file is required for the auto-updater to work
- After building, ALWAYS run `node scripts/inject-env.js restore` to clean secrets from source
- If `git push origin master:main` is rejected, pull first with `git pull origin main --rebase` then retry
