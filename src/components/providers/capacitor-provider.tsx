"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isCapacitorNative, isIOS } from "@/lib/platform";

export function CapacitorProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!isCapacitorNative()) return;

    const html = document.documentElement;
    if (isIOS()) html.classList.add("capacitor-ios");
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

    if (isIOS()) {
      import("@/lib/iap/revenuecat-client").then(({ initIAP }) => {
        initIAP();
      });
    }

    import("@/lib/ads/admob-client").then(({ initAdMob }) => {
      initAdMob();
    });

    // iOS Share Sheet → ShareExtension opens noticomax://share?title=&text=&url=.
    // Capacitor's App plugin fires `appUrlOpen` for any URL with our scheme;
    // we route the share params through to the existing /share-target page
    // which already handles preview + save.
    let removeUrlListener: { remove: () => void } | null = null;
    import("@capacitor/app").then(({ App }) => {
      App.addListener("appUrlOpen", (event) => {
        try {
          const url = new URL(event.url);
          if (url.protocol !== "noticomax:") return;
          const host = url.host || url.pathname.replace(/^\/+/, "").split("/")[0];
          if (host === "share") {
            const qs = url.search.startsWith("?") ? url.search : `?${url.search.replace(/^\?/, "")}`;
            router.push(`/share-target${qs}`);
          }
        } catch (err) {
          console.warn("[appUrlOpen] failed to parse:", event.url, err);
        }
      }).then((handle) => { removeUrlListener = handle; });
    });

    return () => {
      removeUrlListener?.remove();
    };
  }, [router]);

  return <>{children}</>;
}
