import type { NextConfig } from "next";
import type { RuntimeCaching, StrategyName } from "workbox-build";
import withPWAInit from "@ducanh2912/next-pwa";

const cacheFirst: StrategyName = "CacheFirst";
const networkFirst: StrategyName = "NetworkFirst";
const networkOnly: StrategyName = "NetworkOnly";
const staleWhileRevalidate: StrategyName = "StaleWhileRevalidate";

const runtimeCaching: RuntimeCaching[] = [
  // HTML / navigation requests: prefer the network; if it fails offline,
  // fall back to the precached offline document instead of a blank screen.
  {
    urlPattern: ({ request, sameOrigin }: { request: Request; sameOrigin: boolean }) =>
      sameOrigin && request.mode === "navigate",
    handler: networkFirst,
    options: {
      cacheName: "html-pages",
      networkTimeoutSeconds: 5,
      expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
    },
  },
  // Next.js static assets use content-hashed filenames and are safe to cache.
  {
    urlPattern: /\/_next\/static\/.+/,
    handler: cacheFirst,
    options: {
      cacheName: "next-static",
      expiration: { maxEntries: 256, maxAgeSeconds: 30 * 24 * 60 * 60 },
    },
  },
  // Public images and fonts only. User data stays in IndexedDB, not static caches.
  {
    urlPattern: /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$/i,
    handler: cacheFirst,
    options: {
      cacheName: "static-media",
      expiration: { maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 },
    },
  },
  // API routes must never be cached; stale auth or sync data would be harmful.
  {
    urlPattern: /\/api\/.*/,
    handler: networkOnly,
  },
  {
    urlPattern: ({ sameOrigin }: { sameOrigin: boolean }) => sameOrigin,
    handler: staleWhileRevalidate,
    options: { cacheName: "misc" },
  },
];

const workboxOptions = {
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching,
};

const withPWA = withPWAInit({
  dest: "public",
  fallbacks: {
    document: "/~offline",
  },
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: workboxOptions as never,
});

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
};

export default withPWA(nextConfig);
