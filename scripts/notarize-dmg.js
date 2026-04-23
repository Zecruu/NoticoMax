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

const dmg = fs.readdirSync(DIST_DIR).find((f) => f.endsWith(".dmg"));
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

console.log("notarize-dmg: done.");
