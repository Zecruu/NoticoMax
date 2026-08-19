export interface OpenedWindowLike {
  opener: unknown;
}

export interface ExternalBrowserDependencies {
  native: boolean;
  openNative: (url: string) => Promise<void>;
  openWindow: (
    url: string,
    target: "_blank",
    features: "noopener,noreferrer",
  ) => OpenedWindowLike | null;
}

function normalizeExternalHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function openExternalBrowserUrl(
  value: string,
  dependencies: ExternalBrowserDependencies,
): Promise<boolean> {
  const url = normalizeExternalHttpUrl(value);
  if (!url) return false;

  if (dependencies.native) {
    await dependencies.openNative(url);
    return true;
  }

  const opened = dependencies.openWindow(url, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
  return !!opened;
}

