import type { LocalItem } from "@/lib/db/indexed-db";

// Keep the library snapshot intact for counts, tags, and calendar views.
// Search and navigation filter that snapshot without another database read.
export function filterLibraryItems(
  library: LocalItem[],
  type?: string,
  query?: string,
  folderId?: string | null
): LocalItem[] {
  const terms = query?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  return library.filter((item) => {
    if (item.deleted || !["note", "url", "reminder"].includes(item.type))
      return false;
    if (type && type !== "all" && item.type !== type) return false;
    if (folderId && item.folderId !== folderId) return false;
    if (!terms.length) return true;
    const text = `${item.title} ${item.content} ${
      item.url ?? ""
    } ${item.tags.join(" ")}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
