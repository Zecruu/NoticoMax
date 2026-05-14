/**
 * Post-build step: sign the DMG container with Developer ID, submit it to
 * Apple for notarization, then staple the ticket. electron-builder notarizes
 * the inner .app but does not separately sign/notarize the DMG, so Gatekeeper
 * rejects the downloaded DMG until we do this.
 *
 * Skips silently when signing env vars are absent (e.g. on Windows).
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DIST_DIR = path.join(__dirname, "..", "dist-electron");
const ENV_FILE = path.join(__dirname, "..", ".env");

function parseEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    vars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return vars;
}

if (process.platform !== "darwin") {
  console.log("notarize-dmg: not on macOS, skipping.");
  process.exit(0);
}

if (!fs.existsSync(DIST_DIR)) {
  console.log("notarize-dmg: no dist-electron dir, skipping.");
  process.exit(0);
}

// Prefer the DMG matching the current package.json version — otherwise
// stale DMGs from prior builds (alphabetically earlier filenames) get
// picked instead of the fresh one. Falls back to first match if no
// version-specific DMG is found.
const pkgVersion = require(path.join(__dirname, "..", "package.json")).version;
const dmgs = fs.readdirSync(DIST_DIR).filter((f) => f.endsWith(".dmg"));
const dmg = dmgs.find((f) => f.includes(`-${pkgVersion}.dmg`)) ?? dmgs[0];
if (!dmg) {
  console.log("notarize-dmg: no .dmg in dist-electron, skipping.");
  process.exit(0);
}

const dmgPath = path.join(DIST_DIR, dmg);
const env = { ...parseEnv(ENV_FILE), ...process.env };
const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = env;

if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
  console.warn(
    "notarize-dmg: missing APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID — skipping DMG notarization."
  );
  process.exit(0);
}

const identity = `Developer ID Application: Michael Demchak (${APPLE_TEAM_ID})`;

console.log(`notarize-dmg: signing ${dmg}...`);
execFileSync("codesign", ["--force", "--sign", identity, "--timestamp", dmgPath], {
  stdio: "inherit",
});

console.log(`notarize-dmg: submitting ${dmg} to Apple (can take a few min)...`);
execFileSync(
  "xcrun",
  [
    "notarytool", "submit", dmgPath,
    "--apple-id", APPLE_ID,
    "--password", APPLE_APP_SPECIFIC_PASSWORD,
    "--team-id", APPLE_TEAM_ID,
    "--wait",
  ],
  { stdio: "inherit" }
);

console.log(`notarize-dmg: stapling ticket to ${dmg}...`);
execFileSync("xcrun", ["stapler", "staple", dmgPath], { stdio: "inherit" });

// Regenerate blockmap + latest-mac.yml: signing + stapling modified the DMG
// bytes after electron-builder emitted them, so the sha512 and size inside
// latest-mac.yml are stale and auto-updater would reject the update.
console.log("notarize-dmg: regenerating blockmap + latest-mac.yml...");
const arch = process.arch === "arm64" ? "arm64" : "amd64";
const appBuilder = path.join(
  __dirname, "..", "node_modules", "app-builder-bin", "mac", `app-builder_${arch}`
);
execFileSync(appBuilder, [
  "blockmap", "--input", dmgPath, "--output", `${dmgPath}.blockmap`,
  "--compression", "gzip",
], { stdio: "inherit" });

const crypto = require("crypto");
function hashOf(buf) { return crypto.createHash("sha512").update(buf).digest("base64"); }

const dmgBuf = fs.readFileSync(dmgPath);
const dmgSha = hashOf(dmgBuf);
const dmgSize = dmgBuf.length;

// Squirrel.Mac (Electron's mac auto-updater) requires a .zip artifact, not
// .dmg. Include the zip entry in latest-mac.yml as the primary file (must
// come first under `files:`) — the DMG is still listed for direct download
// of the first-install artifact.
let zipEntry = null;
const zips = fs.readdirSync(DIST_DIR).filter((f) => f.endsWith(".zip") && f.includes(`-${pkgVersion}-`));
const zip = zips[0];
if (zip) {
  const zipBuf = fs.readFileSync(path.join(DIST_DIR, zip));
  zipEntry = { url: zip, sha512: hashOf(zipBuf), size: zipBuf.length };
} else {
  console.warn("notarize-dmg: no .zip found — auto-updater requires zip; build with mac.target including 'zip'.");
}

const version = pkgVersion;
const releaseDate = new Date().toISOString();
const lines = [`version: ${version}`, `files:`];
if (zipEntry) {
  lines.push(`  - url: ${zipEntry.url}`);
  lines.push(`    sha512: ${zipEntry.sha512}`);
  lines.push(`    size: ${zipEntry.size}`);
}
lines.push(`  - url: ${dmg}`);
lines.push(`    sha512: ${dmgSha}`);
lines.push(`    size: ${dmgSize}`);
// `path` + top-level sha512 must reference the FIRST file in `files`
// (Squirrel.Mac reads these). Prefer the zip when available.
const primary = zipEntry ?? { url: dmg, sha512: dmgSha };
lines.push(`path: ${primary.url}`);
lines.push(`sha512: ${primary.sha512}`);
lines.push(`releaseDate: '${releaseDate}'`);
fs.writeFileSync(path.join(DIST_DIR, "latest-mac.yml"), lines.join("\n") + "\n");

console.log("notarize-dmg: done.");
