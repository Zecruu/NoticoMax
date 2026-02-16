import { isCapacitorNative } from "@/lib/platform";

export async function updateAppBadge(count: number) {
  if (!isCapacitorNative()) return;

  const { Badge } = await import("@capawesome/capacitor-badge");
  if (count > 0) {
    await Badge.set({ count });
  } else {
    await Badge.clear();
  }
}
