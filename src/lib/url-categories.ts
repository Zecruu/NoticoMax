export const DEFAULT_URL_CATEGORIES = [
  "General",
  "Work",
  "Personal",
  "Shopping",
  "Reading",
  "Travel",
  "Reference",
] as const;

const URL_CATEGORY_PREFIX = "url-category:";

export function isUrlCategoryTag(tag: string): boolean {
  return tag.startsWith(URL_CATEGORY_PREFIX);
}

export function getUrlCategory(tags: string[]): string | null {
  const encoded = tags.find(isUrlCategoryTag)?.slice(URL_CATEGORY_PREFIX.length);
  if (!encoded) return null;

  try {
    return decodeURIComponent(encoded) || null;
  } catch {
    return encoded || null;
  }
}

export function getUrlCategoryLabel(tags: string[]): string {
  return getUrlCategory(tags) ?? "General";
}

export function withoutUrlCategoryTags(tags: string[]): string[] {
  return tags.filter((tag) => !isUrlCategoryTag(tag));
}

export function withUrlCategory(tags: string[], category: string): string[] {
  const ordinaryTags = withoutUrlCategoryTags(tags);
  const label = category.trim() || "General";
  return [...ordinaryTags, `${URL_CATEGORY_PREFIX}${encodeURIComponent(label)}`];
}
