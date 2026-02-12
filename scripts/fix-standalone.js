/**
 * Post-build script to fix Turbopack's hashed external module names
 * in the standalone output. Turbopack renames modules like "mongoose"
 * to "mongoose-8b99e611e7552af3" but standalone node_modules only
 * has the original "mongoose" package.
 *
 * Instead of patching every chunk file, we patch the Turbopack runtime's
 * externalRequire function to auto-strip hashes on require failure.
 */
const fs = require("fs");
const path = require("path");

const RUNTIME_PATH = path.join(
  __dirname,
  "..",
  ".next",
  "standalone",
  ".next",
  "server",
  "chunks",
  "[turbopack]_runtime.js"
);

// The original throw in externalRequire
const ORIGINAL = `throw new Error(\`Failed to load external module \${id}: \${err}\`);`;

// Replacement: try stripping the hash and requiring the base module name
const PATCHED = `// Patched: try stripping Turbopack hash suffix and re-requiring
        const hashMatch = id.match(/^(.+)-[a-f0-9]{8,}$/);
        if (hashMatch) {
            try {
                raw = require(hashMatch[1]);
            } catch (e2) {
                throw new Error(\`Failed to load external module \${id} (also tried \${hashMatch[1]}): \${err}\`);
            }
        } else {
            throw new Error(\`Failed to load external module \${id}: \${err}\`);
        }`;

console.log("Patching Turbopack runtime to handle hashed module names...");
console.log(`File: ${RUNTIME_PATH}`);

if (!fs.existsSync(RUNTIME_PATH)) {
  console.error("ERROR: Turbopack runtime not found!");
  process.exit(1);
}

let content = fs.readFileSync(RUNTIME_PATH, "utf-8");

if (content.includes("Patched: try stripping Turbopack hash")) {
  console.log("Already patched. Skipping.");
  process.exit(0);
}

if (!content.includes(ORIGINAL)) {
  console.error("ERROR: Could not find the externalRequire throw pattern!");
  console.error("Expected:", ORIGINAL);
  process.exit(1);
}

// Replace ALL occurrences (there are multiple externalRequire/externalImport functions)
const count = (content.match(new RegExp(ORIGINAL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
content = content.replaceAll(ORIGINAL, PATCHED);
fs.writeFileSync(RUNTIME_PATH, content);
console.log(`Replaced ${count} occurrence(s).`);

console.log("Done! Turbopack runtime patched successfully.");
console.log("Hashed module names will now auto-fallback to base module names.");
