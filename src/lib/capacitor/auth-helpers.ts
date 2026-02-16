import { isCapacitorNative } from "@/lib/platform";

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

export async function openInBrowser(url: string) {
  if (!isCapacitorNative()) {
    window.location.href = url;
    return;
  }

  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url, presentationStyle: "popover" });
}
