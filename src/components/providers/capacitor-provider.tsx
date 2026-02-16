"use client";

import { useEffect } from "react";
import { isCapacitorNative, isIOS, isAndroid } from "@/lib/platform";

export function CapacitorProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!isCapacitorNative()) return;

    const html = document.documentElement;
    if (isIOS()) html.classList.add("capacitor-ios");
    if (isAndroid()) html.classList.add("capacitor-android");
    html.classList.add("capacitor-native");

    import("@/lib/capacitor/native-bridge").then(
      ({ initCapacitorPlugins }) => {
        initCapacitorPlugins();
      }
    );

    import("@/lib/capacitor/push-notifications").then(
      ({ initPushNotifications }) => {
        initPushNotifications();
      }
    );
  }, []);

  return <>{children}</>;
}
