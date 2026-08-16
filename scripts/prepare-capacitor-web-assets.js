/**
 * Prepare the minimal static assets Capacitor needs when the app is configured
 * to load the remote web app.
 *
 * `next build` does not export `public/` into `out/` for this app, but
 * Capacitor copies only `webDir` into the native bundle. Keep this list small:
 * it is app shell/fallback UI only, not user data.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_DIR = path.join(ROOT, "out");

const FALLBACK_ASSETS = ["offline.html", "sw.js", "logo.png", "manifest.json"];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const asset of FALLBACK_ASSETS) {
  const source = path.join(PUBLIC_DIR, asset);
  const destination = path.join(OUT_DIR, asset);

  if (!fs.existsSync(source)) {
    throw new Error(`prepare-capacitor-web-assets: missing public/${asset}`);
  }

  fs.copyFileSync(source, destination);
  console.log(`prepare-capacitor-web-assets: copied public/${asset} -> out/${asset}`);
}
