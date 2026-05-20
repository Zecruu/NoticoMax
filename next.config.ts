import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  // skipWaiting + clientsClaim → a freshly-deployed service worker activates
  // immediately instead of waiting for every tab to close. Pairs with the
  // NetworkFirst HTML strategy below so users see new code on next refresh
  // instead of the "next browser restart."
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: true,
    clientsClaim: true,
    runtimeCaching: [
      // HTML / navigation requests — always try the network first; if that
      // fails (offline), fall back to the cached shell. Fixes the
      // "Failed to find Server Action" stale-deploy class of bug because the
      // HTML the client gets is always from the current deploy.
      {
        urlPattern: ({ request, sameOrigin }) =>
          sameOrigin && request.mode === "navigate",
        handler: "NetworkFirst",
        options: {
          cacheName: "html-pages",
          networkTimeoutSeconds: 5,
          expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // Next.js static assets — content-hashed filenames, safe to cache forever.
      {
        urlPattern: /\/_next\/static\/.+/,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static",
          expiration: { maxEntries: 256, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      // Images, fonts, other static assets in /public — long cache lifetime.
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "static-media",
          expiration: { maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
      // API routes — NEVER cache. Always go to the network. Stale auth or sync
      // data would silently corrupt the app's view of the world.
      {
        urlPattern: /\/api\/.*/,
        handler: "NetworkOnly",
      },
      // Fallback for everything else — try cache, fall back to network.
      {
        urlPattern: ({ sameOrigin }) => sameOrigin,
        handler: "StaleWhileRevalidate",
        options: { cacheName: "misc" },
      },
    ],
  },
});

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
};

export default withPWA(nextConfig);
