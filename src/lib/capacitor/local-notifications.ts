import { isCapacitorNative } from "@/lib/platform";

function hashStringToNumber(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

export async function scheduleReminderNotification(
  id: string,
  title: string,
  body: string,
  scheduledDate: Date
) {
  if (!isCapacitorNative()) return;

  const { LocalNotifications } = await import(
    "@capacitor/local-notifications"
  );

  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return;

  await LocalNotifications.schedule({
    notifications: [
      {
        id: hashStringToNumber(id),
        title,
        body,
        schedule: { at: scheduledDate },
        sound: "default",
        extra: { clientId: id },
      },
    ],
  });
}

export async function cancelReminderNotification(id: string) {
  if (!isCapacitorNative()) return;

  const { LocalNotifications } = await import(
    "@capacitor/local-notifications"
  );
  await LocalNotifications.cancel({
    notifications: [{ id: hashStringToNumber(id) }],
  });
}
