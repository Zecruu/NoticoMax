/**
 * Post-build script to fix Turbopack's hashed external module names
 * in the standalone output. Turbopack renames modules like "mongoose"
 * to "mongoose-8b99e611e7552af3" but standalone node_modules only
 * has the original "mongoose" package.
 */
const fs = require("fs");
const path = require("path");

const STANDALONE_CHUNKS = path.join(
  __dirname,
  "..",
  ".next",
  "standalone",
  ".next",
  "server",
  "chunks"
);

// Known packages that Turbopack hashes
const PACKAGES = [
  "mongoose",
  "mongodb",
  "bcryptjs",
  "stripe",
  "@auth/mongodb-adapter",
];

function fixChunks(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`Directory not found: ${dir}`);
    return;
  }

  let totalFixed = 0;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      totalFixed += fixChunksInDir(filePath);
      continue;
    }

    if (!file.endsWith(".js")) continue;

    let content = fs.readFileSync(filePath, "utf-8");
    let modified = false;

    for (const pkg of PACKAGES) {
      // Match require("package-hexhash") or require("package-hexhash")
      const escapedPkg = pkg.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
      const regex = new RegExp(
        `require\\("${escapedPkg}-[a-f0-9]{8,}"\\)`,
        "g"
      );
      const matches = content.match(regex);
      if (matches) {
        content = content.replace(regex, `require("${pkg}")`);
        modified = true;
        console.log(`  Fixed ${matches.length}x ${pkg} in ${file}`);
        totalFixed += matches.length;
      }

      // Also fix the e.x("package-hash", ...) pattern
      const xRegex = new RegExp(
        `\\.x\\("${escapedPkg}-[a-f0-9]{8,}"`,
        "g"
      );
      const xMatches = content.match(xRegex);
      if (xMatches) {
        content = content.replace(
          xRegex,
          `.x("${pkg}"`
        );
        modified = true;
        console.log(`  Fixed ${xMatches.length}x ${pkg} (x-pattern) in ${file}`);
        totalFixed += xMatches.length;
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, content);
    }
  }

  return totalFixed;
}

function fixChunksInDir(dir) {
  let total = 0;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      total += fixChunksInDir(filePath);
    } else if (file.endsWith(".js")) {
      let content = fs.readFileSync(filePath, "utf-8");
      let modified = false;
      for (const pkg of PACKAGES) {
        const escapedPkg = pkg.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
        const regex = new RegExp(`require\\("${escapedPkg}-[a-f0-9]{8,}"\\)`, "g");
        const matches = content.match(regex);
        if (matches) {
          content = content.replace(regex, `require("${pkg}")`);
          modified = true;
          console.log(`  Fixed ${matches.length}x ${pkg} in ${path.relative(STANDALONE_CHUNKS, filePath)}`);
          total += matches.length;
        }
        const xRegex = new RegExp(`\\.x\\("${escapedPkg}-[a-f0-9]{8,}"`, "g");
        const xMatches = content.match(xRegex);
        if (xMatches) {
          content = content.replace(xRegex, `.x("${pkg}"`);
          modified = true;
          console.log(`  Fixed ${xMatches.length}x ${pkg} (x-pattern) in ${path.relative(STANDALONE_CHUNKS, filePath)}`);
          total += xMatches.length;
        }
      }
      if (modified) fs.writeFileSync(filePath, content);
    }
  }
  return total;
}

console.log("Fixing Turbopack hashed module names in standalone build...");
console.log(`Scanning: ${STANDALONE_CHUNKS}`);
const fixed = fixChunks(STANDALONE_CHUNKS);
console.log(`Done! Fixed ${fixed} hashed requires.`);
