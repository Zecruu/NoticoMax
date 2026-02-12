/**
 * Injects .env values into electron/main.js APP_ENV before build,
 * and restores placeholders after build.
 *
 * Usage:
 *   node scripts/inject-env.js inject   — replace placeholders with .env values
 *   node scripts/inject-env.js restore  — revert to placeholder values
 */
const fs = require("fs");
const path = require("path");

const MAIN_JS = path.join(__dirname, "..", "electron", "main.js");
const ENV_FILE = path.join(__dirname, "..", ".env");

const DEFAULTS = {
  MONGODB_URI: "placeholder",
  AUTH_SECRET: "placeholder",
  AUTH_GOOGLE_ID: "placeholder",
  AUTH_GOOGLE_SECRET: "placeholder",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
};

function parseEnv(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    vars[key] = val;
  }
  return vars;
}

function inject() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error("ERROR: .env file not found. Create one with your credentials.");
    process.exit(1);
  }

  const env = parseEnv(ENV_FILE);
  let content = fs.readFileSync(MAIN_JS, "utf-8");

  for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
    const realVal = env[key] || defaultVal;
    // Match the key: "currentValue" pattern inside APP_ENV
    const regex = new RegExp(`(${key}:\\s*)"[^"]*"`, "g");
    content = content.replace(regex, `$1"${realVal}"`);
  }

  fs.writeFileSync(MAIN_JS, content);
  console.log("Injected .env values into electron/main.js");
}

function restore() {
  let content = fs.readFileSync(MAIN_JS, "utf-8");

  for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
    const regex = new RegExp(`(${key}:\\s*)"[^"]*"`, "g");
    content = content.replace(regex, `$1"${defaultVal}"`);
  }

  fs.writeFileSync(MAIN_JS, content);
  console.log("Restored placeholders in electron/main.js");
}

const action = process.argv[2];
if (action === "inject") inject();
else if (action === "restore") restore();
else {
  console.error("Usage: node scripts/inject-env.js [inject|restore]");
  process.exit(1);
}
