import type { LocalFolder } from "@/lib/db/indexed-db";

export const DEFAULT_NOTES_FOLDER_NAME = "Default";
export const DEFAULT_NOTES_FOLDER_COLOR = "#eab308";
export const DEFAULT_FOLDER_CREATE_ERROR = "Default is reserved for notes. Choose a different folder name.";
export const DEFAULT_FOLDER_RENAME_ERROR = "The Default notes folder cannot be renamed.";
export const DEFAULT_FOLDER_DELETE_ERROR = "The Default notes folder cannot be deleted.";

export function isReservedDefaultFolderName(name: string): boolean {
  return name.trim().toLowerCase() === DEFAULT_NOTES_FOLDER_NAME.toLowerCase();
}

export function isDefaultNotesFolder(folder: LocalFolder): boolean {
  return !folder.deleted && !folder.householdId && isReservedDefaultFolderName(folder.name);
}

export function getCanonicalDefaultNotesFolder(folders: LocalFolder[]): LocalFolder | undefined {
  return folders
    .filter(isDefaultNotesFolder)
    .sort((a, b) => {
      const createdCompare = a.createdAt.localeCompare(b.createdAt);
      return createdCompare || a.clientId.localeCompare(b.clientId);
    })[0];
}

export function resolveDefaultNoteFolderId(
  folderId: string | undefined,
  folders: LocalFolder[],
): string | undefined {
  return folderId ?? getCanonicalDefaultNotesFolder(folders)?.clientId;
}
