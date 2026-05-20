import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Cache the GitHub lookup for 10 minutes so a flood of download clicks doesn't
// burn through the 60/hr unauthenticated GitHub API limit.
export const revalidate = 600;

interface RouteContext {
  params: Promise<{ platform: string }>;
}

interface GhAsset {
  name: string;
  browser_download_url: string;
}
interface GhRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: GhAsset[];
}

const REPO = "Zecruu/NoticoMax";

// Maps each public platform alias to a predicate that picks the installer asset
// out of a release. The blockmap files share extensions so we exclude them.
const matchers: Record<string, (name: string) => boolean> = {
  win: (n) => n.toLowerCase().endsWith(".exe") && !n.toLowerCase().endsWith(".blockmap"),
  windows: (n) => n.toLowerCase().endsWith(".exe") && !n.toLowerCase().endsWith(".blockmap"),
  mac: (n) => n.toLowerCase().endsWith(".dmg") && !n.toLowerCase().endsWith(".blockmap"),
  macos: (n) => n.toLowerCase().endsWith(".dmg") && !n.toLowerCase().endsWith(".blockmap"),
  osx: (n) => n.toLowerCase().endsWith(".dmg") && !n.toLowerCase().endsWith(".blockmap"),
};

export async function GET(request: Request, ctx: RouteContext) {
  const { platform } = await ctx.params;
  const match = matchers[platform.toLowerCase()];
  if (!match) {
    return NextResponse.json(
      { error: "Unknown platform — use 'win' or 'mac'" },
      { status: 404 },
    );
  }

  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "noticomax-download-redirect",
    },
    // Next will memoize this between requests within the revalidate window.
    next: { revalidate: 600 },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to query GitHub releases" },
      { status: 502 },
    );
  }

  const releases = (await res.json()) as GhRelease[];

  // Releases come back newest-first. Pick the first one that actually ships
  // an asset for this platform — Windows-only and Mac-only releases interleave
  // in this repo, so the latest tag isn't always the latest per-platform.
  for (const r of releases) {
    if (r.draft || r.prerelease) continue;
    const asset = r.assets.find((a) => match(a.name));
    if (asset) {
      const url = new URL(request.url);
      if (url.searchParams.get("format") === "json") {
        return NextResponse.json({
          platform,
          version: r.tag_name,
          asset: asset.name,
          url: asset.browser_download_url,
        });
      }
      return NextResponse.redirect(asset.browser_download_url, 302);
    }
  }

  return NextResponse.json(
    { error: `No ${platform} asset found in the last 30 releases` },
    { status: 404 },
  );
}
