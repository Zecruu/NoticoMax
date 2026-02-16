import { isCapacitorNative } from "@/lib/platform";

export async function initPushNotifications() {
  if (!isCapacitorNative()) return;

  const { PushNotifications } = await import(
    "@capacitor/push-notifications"
  );

  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive !== "granted") return;

  await PushNotifications.register();

  // Send token to server for push targeting
  PushNotifications.addListener("registration", (token) => {
    fetch("/api/user/push-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: token.value,
        platform: window.Capacitor?.getPlatform(),
      }),
    }).catch(console.error);
  });

  // Handle notification received while app is open
  PushNotifications.addListener(
    "pushNotificationReceived",
    (notification) => {
      console.log("Push received:", notification);
    }
  );

  // Handle notification tap
  PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action) => {
      const data = action.notification.data;
      if (data?.url) {
        window.location.href = data.url;
      }
    }
  );
}
