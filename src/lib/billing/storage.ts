/** Existing cloud storage allowances; shared by settings and Lyte history. */
export const STORAGE_TIERS = {
  free: { label: "Included (100 MB)", bytes: 100 * 1024 ** 2 },
  personal_5gb: { label: "Personal 5 GB", bytes: 5 * 1024 ** 3 },
  personal_50gb: { label: "Personal 50 GB", bytes: 50 * 1024 ** 3 },
  personal_200gb: { label: "Personal 200 GB", bytes: 200 * 1024 ** 3 },
  family_20gb: { label: "Family 20 GB", bytes: 20 * 1024 ** 3 },
  family_100gb: { label: "Family 100 GB", bytes: 100 * 1024 ** 3 },
  family_500gb: { label: "Family 500 GB", bytes: 500 * 1024 ** 3 },
} as const;

export function storageTier(plan: string | null | undefined) {
  return STORAGE_TIERS[plan as keyof typeof STORAGE_TIERS] ?? STORAGE_TIERS.free;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
