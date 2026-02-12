/**
 * Post-build script to fix Turbopack's hashed external module names.
 * Turbopack renames "mongoose" to "mongoose-8b99e611e7552af3" etc.
 * We patch both externalImport (ESM) and externalRequire (CJS) in the
 * Turbopack runtime to strip hash suffixes before loading modules.
 */
const fs = require("fs");
const path = require("path");

const RUNTIME_PATH = path.join(
  __dirname, "..", ".next", "standalone", ".next", "server", "chunks",
  "[turbopack]_runtime.js"
);

console.log("Patching Turbopack runtime to handle hashed module names...");

if (!fs.existsSync(RUNTIME_PATH)) {
  console.error("ERROR: Turbopack runtime not found at", RUNTIME_PATH);
  process.exit(1);
}

let content = fs.readFileSync(RUNTIME_PATH, "utf-8");

if (content.includes("PATCHED_HASH_STRIP")) {
  console.log("Already patched. Skipping.");
  process.exit(0);
}

let patches = 0;

// Patch 1: externalImport (ESM) — uses `await import(id)`
// Strip the hash from id before the import call
const ESM_ORIGINAL = `async function externalImport(id) {
    let raw;
    try {
        raw = await import(id);`;

const ESM_PATCHED = `async function externalImport(id) {
    // PATCHED_HASH_STRIP: strip Turbopack hash suffix from module name
    const _m = id.match(/^(.+)-[a-f0-9]{8,}$/);
    if (_m) id = _m[1];
    let raw;
    try {
        raw = await import(id);`;

while (content.includes(ESM_ORIGINAL)) {
  content = content.replace(ESM_ORIGINAL, ESM_PATCHED);
  patches++;
}

// Patch 2: externalRequire (CJS) — uses thunk() which calls require(hashedName)
// Replace both id and thunk to use the clean module name
const CJS_ORIGINAL = `function externalRequire(id, thunk, esm = false) {
    let raw;
    try {
        raw = thunk();`;

const CJS_PATCHED = `function externalRequire(id, thunk, esm = false) {
    // PATCHED_HASH_STRIP: strip Turbopack hash suffix from module name
    const _m = id.match(/^(.+)-[a-f0-9]{8,}$/);
    if (_m) { id = _m[1]; thunk = () => require(_m[1]); }
    let raw;
    try {
        raw = thunk();`;

while (content.includes(CJS_ORIGINAL)) {
  content = content.replace(CJS_ORIGINAL, CJS_PATCHED);
  patches++;
}

if (patches === 0) {
  console.error("ERROR: Could not find expected patterns in runtime!");
  process.exit(1);
}

fs.writeFileSync(RUNTIME_PATH, content);
console.log(`Done! Patched ${patches} function(s) in Turbopack runtime.`);
