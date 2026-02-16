import { isCapacitorNative } from "@/lib/platform";

export async function hapticImpact(
  style: "light" | "medium" | "heavy" = "light"
) {
  if (!isCapacitorNative()) return;
  const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
  const styleMap = {
    light: ImpactStyle.Light,
    medium: ImpactStyle.Medium,
    heavy: ImpactStyle.Heavy,
  };
  await Haptics.impact({ style: styleMap[style] });
}

export async function hapticNotification(
  type: "success" | "warning" | "error" = "success"
) {
  if (!isCapacitorNative()) return;
  const { Haptics, NotificationType } = await import("@capacitor/haptics");
  const typeMap = {
    success: NotificationType.Success,
    warning: NotificationType.Warning,
    error: NotificationType.Error,
  };
  await Haptics.notification({ type: typeMap[type] });
}
