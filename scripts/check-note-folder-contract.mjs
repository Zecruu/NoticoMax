import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getCanonicalDefaultNotesFolder,
  isReservedDefaultFolderName,
  resolveDefaultFolderId,
  resolveDefaultNoteFolderId,
} from "../src/lib/note-folders.ts";

const folder = (clientId, name, createdAt, extra = {}) => ({
  clientId,
  name,
  createdAt,
  updatedAt: createdAt,
  deleted: false,
  ...extra,
});

const legacyFolders = [
  folder("shared", "Default", "2025-01-01T00:00:00.000Z", { householdId: "household" }),
  folder("deleted", "Default", "2025-01-01T00:00:00.000Z", { deleted: true }),
  folder("z-default", " default ", "2026-01-01T00:00:00.000Z"),
  folder("a-default", "DEFAULT", "2026-01-01T00:00:00.000Z"),
  folder("work", "Work", "2024-01-01T00:00:00.000Z"),
];

assert.equal(isReservedDefaultFolderName("  dEfAuLt "), true, "Default matching is trimmed and case-insensitive");
assert.equal(isReservedDefaultFolderName("Default work"), false, "Only the reserved name is blocked");
assert.equal(
  getCanonicalDefaultNotesFolder(legacyFolders)?.clientId,
  "a-default",
  "Legacy duplicates use createdAt, then clientId, without deleting or merging records",
);
assert.equal(
  resolveDefaultNoteFolderId(undefined, legacyFolders),
  "a-default",
  "Legacy unfiled notes map to the deterministic canonical Default",
);
assert.equal(
  resolveDefaultNoteFolderId("work", legacyFolders),
  "work",
  "Assigned notes keep their existing folder",
);
assert.equal(
  resolveDefaultFolderId(undefined, legacyFolders),
  "a-default",
  "Legacy unfiled bookmarks use the same deterministic canonical Default",
);

const syncSource = readFileSync(new URL("../src/lib/sync/sync-engine.ts", import.meta.url), "utf8");
const section = (start, end) => syncSource.slice(syncSource.indexOf(start), syncSource.indexOf(end));
const createSection = section("export async function createFolder(", "export async function updateFolder(");
const updateSection = section("export async function updateFolder(", "export async function deleteFolder(");
const deleteSection = section("export async function deleteFolder(", "export async function getFolders(");
const createItemSection = section("export async function createItem(", "export async function updateItem(");
const updateItemSection = section("export async function updateItem(", "export async function deleteItem(");
const getItemsSection = section("export async function getItems(", "export async function getDeletedItems(");

assert.match(createSection, /isReservedDefaultFolderName\(folder\.name\)[\s\S]*DEFAULT_FOLDER_CREATE_ERROR/, "Public creation blocks reserved Default");
assert.match(updateSection, /canonicalDefault\?\.clientId === clientId[\s\S]*DEFAULT_FOLDER_RENAME_ERROR/, "Canonical Default rename is guarded");
assert.match(updateSection, /updates\.deleted === true[\s\S]*DEFAULT_FOLDER_DELETE_ERROR/, "Canonical Default cannot be soft-deleted through updateFolder");
assert.match(deleteSection, /canonicalDefault\?\.clientId === clientId[\s\S]*DEFAULT_FOLDER_DELETE_ERROR/, "Canonical Default delete is guarded");
assert.ok(
  deleteSection.indexOf("DEFAULT_FOLDER_DELETE_ERROR") < deleteSection.indexOf(".modify((f)"),
  "Delete guard runs before the folder record is modified",
);
assert.match(deleteSection, /folderItems[\s\S]*i\.deleted = true[\s\S]*entityType: "item"/, "Ordinary folder deletion retains item-trash behavior");
assert.match(createItemSection, /item\.type === "note" \|\| item\.type === "url"[\s\S]*ensureDefaultNotesFolder/, "New notes and bookmarks default into the canonical folder");
assert.match(updateItemSection, /item\.type === "note" \|\| item\.type === "url"[\s\S]*ensureDefaultNotesFolder/, "Updated notes and bookmarks cannot become unfiled");
assert.match(getItemsSection, /getCanonicalDefaultNotesFolder[\s\S]*item\.type === "note" \|\| item\.type === "url"[\s\S]*!item\.folderId/, "Canonical Default includes legacy unfiled notes and bookmarks");

for (const file of ["sidebar.tsx", "mobile-nav.tsx"]) {
  const source = readFileSync(new URL(`../src/components/layout/${file}`, import.meta.url), "utf8");
  assert.match(source, /canonicalDefaultFolder\?\.clientId !== folder\.clientId/, `${file} hides reserved mutations`);
  assert.match(source, /isReservedDefaultFolderName\(name\)/, `${file} blocks duplicate Default creation`);
}

const foldersView = readFileSync(new URL("../src/components/items/notes-folders-view.tsx", import.meta.url), "utf8");
assert.match(foldersView, /itemType: "note" \| "url"/, "Notes and bookmarks share the folder browser");
assert.match(foldersView, /isReservedDefaultFolderName\(name\)/, "Item folder dialog blocks duplicate Default creation");

console.log("Note folder contract checks passed");
