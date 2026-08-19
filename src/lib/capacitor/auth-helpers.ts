import { isCapacitorNative } from "@/lib/platform";
import { openExternalBrowserUrl } from "@/lib/external-browser";

export async function openOAuthInBrowser(provider: string): Promise<boolean> {
  if (!isCapacitorNative()) return false;

  const { Browser } = await import("@capacitor/browser");
  const baseUrl = window.location.origin;

  await Browser.open({
    url: `${baseUrl}/api/auth/signin/${provider}?callbackUrl=${encodeURIComponent(baseUrl)}`,
    presentationStyle: "popover",
  });

  return true;
}

export async function openInBrowser(url: string): Promise<boolean> {
  return openExternalBrowserUrl(url, {
    native: isCapacitorNative(),
    openNative: async (externalUrl) => {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: externalUrl, presentationStyle: "popover" });
    },
    openWindow: (externalUrl, target, features) =>
      window.open(externalUrl, target, features),
  });
}
