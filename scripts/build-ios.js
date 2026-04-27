/**
 * Build an iOS .ipa for App Store / TestFlight distribution.
 *
 * Steps:
 *   1. inject-env.js inject  (so electron/main.js env propagates — noop for iOS but kept for symmetry)
 *   2. next build + fix-standalone (so `out/` has fresh web assets for Capacitor)
 *   3. npx cap sync ios
 *   4. auto-bump CURRENT_PROJECT_VERSION (build number) in the pbxproj — App Store Connect
 *      rejects duplicate build numbers for a given marketing version
 *   5. xcodebuild archive -> .xcarchive
 *   6. xcodebuild -exportArchive -> App.ipa
 *   7. xcrun altool --validate-app (unless --skip-validate)
 *   8. Optional: xcrun altool --upload-app if --upload and APPLE_ID creds are set
 *   9. inject-env.js restore
 *
 * Usage:
 *   node scripts/build-ios.js           # archive + export + validate
 *   node scripts/build-ios.js --upload  # also upload to TestFlight (requires APPLE_ID creds)
 *   node scripts/build-ios.js --skip-validate
 *
 * Requirements on the host Mac:
 *   - Xcode installed, Apple ID with team XJ2JD24RGF logged into Xcode
 *   - An Apple Distribution cert (not Developer ID) in the keychain
 *   - App Store provisioning profile (Xcode's Automatic signing will fetch this)
 *   - For --upload: .env with APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
 */
const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const IOS_PROJECT = path.join(ROOT, "ios/App/App.xcodeproj");
const SCHEME = "App";
const BUILD_DIR = path.join(ROOT, "dist-ios");
const ARCHIVE_PATH = path.join(BUILD_DIR, "App.xcarchive");
const IPA_DIR = path.join(BUILD_DIR, "ipa");
const EXPORT_PLIST = path.join(BUILD_DIR, "export-options.plist");
const ENV_FILE = path.join(ROOT, ".env");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const UPLOAD = flag("--upload");
const SKIP_VALIDATE = flag("--skip-validate");
const METHOD = flag("--ad-hoc") ? "ad-hoc" : "app-store-connect";

function sh(cmd, cmdArgs, opts = {}) {
  console.log(`$ ${cmd} ${cmdArgs.join(" ")}`);
  return execFileSync(cmd, cmdArgs, { stdio: "inherit", ...opts });
}

function parseEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    vars[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return vars;
}

function bumpBuildNumber() {
  // Read CURRENT_PROJECT_VERSION from pbxproj, increment, write back.
  // Done in plain text since we want to avoid a Ruby dep here.
  const pbx = path.join(IOS_PROJECT, "project.pbxproj");
  let content = fs.readFileSync(pbx, "utf-8");
  const match = content.match(/CURRENT_PROJECT_VERSION = (\d+);/);
  if (!match) throw new Error("CURRENT_PROJECT_VERSION not found in pbxproj");
  const current = parseInt(match[1], 10);
  const next = current + 1;
  content = content.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${next};`);
  fs.writeFileSync(pbx, content);
  console.log(`build-ios: bumped CURRENT_PROJECT_VERSION ${current} -> ${next}`);
  return next;
}

function writeExportOptions(teamId) {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>${METHOD}</string>
    <key>teamID</key>
    <string>${teamId}</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>stripSwiftSymbols</key>
    <true/>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
</dict>
</plist>
`;
  fs.writeFileSync(EXPORT_PLIST, plist);
}

function main() {
  if (process.platform !== "darwin") {
    console.error("build-ios: iOS builds require macOS.");
    process.exit(1);
  }

  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const env = { ...parseEnv(ENV_FILE), ...process.env };
  const teamId = env.APPLE_TEAM_ID || "XJ2JD24RGF";

  console.log("build-ios: injecting env vars (for symmetry with electron build)...");
  try {
    sh("node", ["scripts/inject-env.js", "inject"], { cwd: ROOT });
  } catch (e) {
    console.warn("build-ios: inject-env failed (missing .env?) — continuing without injection");
  }

  try {
    console.log("build-ios: next build + fix-standalone...");
    sh("npx", ["next", "build"], { cwd: ROOT });
    if (fs.existsSync(path.join(ROOT, "scripts/fix-standalone.js"))) {
      sh("node", ["scripts/fix-standalone.js"], { cwd: ROOT });
    }

    console.log("build-ios: npx cap sync ios...");
    sh("npx", ["cap", "sync", "ios"], { cwd: ROOT });

    bumpBuildNumber();

    console.log("build-ios: archiving...");
    sh("xcodebuild", [
      "-project", IOS_PROJECT,
      "-scheme", SCHEME,
      "-configuration", "Release",
      "-destination", "generic/platform=iOS",
      "-archivePath", ARCHIVE_PATH,
      "archive",
      "-allowProvisioningUpdates",
    ]);

    console.log("build-ios: exporting .ipa...");
    writeExportOptions(teamId);
    sh("xcodebuild", [
      "-exportArchive",
      "-archivePath", ARCHIVE_PATH,
      "-exportOptionsPlist", EXPORT_PLIST,
      "-exportPath", IPA_DIR,
      "-allowProvisioningUpdates",
    ]);

    const ipa = fs.readdirSync(IPA_DIR).find((f) => f.endsWith(".ipa"));
    if (!ipa) throw new Error("no .ipa produced");
    const ipaPath = path.join(IPA_DIR, ipa);
    console.log(`build-ios: .ipa at ${ipaPath}`);

    if (!SKIP_VALIDATE) {
      const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD } = env;
      if (APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD) {
        console.log("build-ios: validating with App Store Connect...");
        sh("xcrun", [
          "altool", "--validate-app",
          "-f", ipaPath,
          "-t", "ios",
          "-u", APPLE_ID,
          "-p", APPLE_APP_SPECIFIC_PASSWORD,
        ]);
      } else {
        console.warn("build-ios: skipping validation — APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD missing");
      }
    }

    if (UPLOAD) {
      const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD } = env;
      if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD) {
        throw new Error("--upload requires APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD in .env");
      }
      console.log("build-ios: uploading to App Store Connect (may take several minutes)...");
      sh("xcrun", [
        "altool", "--upload-app",
        "-f", ipaPath,
        "-t", "ios",
        "-u", APPLE_ID,
        "-p", APPLE_APP_SPECIFIC_PASSWORD,
      ]);
    }

    console.log("build-ios: done.");
  } finally {
    try {
      sh("node", ["scripts/inject-env.js", "restore"], { cwd: ROOT });
    } catch {}
  }
}

main();
