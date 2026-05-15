export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export async function getCurrentCoords(): Promise<Coordinates> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Geolocation is not supported on this device.");
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Enable it in system settings to save your current spot."
            : err.code === err.POSITION_UNAVAILABLE
              ? "Could not determine your location right now."
              : err.code === err.TIMEOUT
                ? "Location request timed out. Try again."
                : err.message || "Failed to get location.";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

import { isIOS } from "./platform";

/**
 * "Open in maps" URL. On Apple devices we use the maps.apple.com universal
 * link, which jumps straight into the Apple Maps app on iOS / iPadOS /
 * macOS and falls back to the maps.apple.com web view on anything else.
 * Everywhere else we use Google Maps (Android opens the app natively;
 * desktop opens maps.google.com).
 */
function isAppleDevice(): boolean {
  if (isIOS()) return true; // Capacitor iOS app
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPhone / iPad / iPod web (Safari, in-app browsers)
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS reports as MacIntel + touch; macOS Safari proper has no touch points.
  // Either way, the universal link works on macOS too — open Apple Maps app.
  if (typeof navigator.platform === "string" && navigator.platform.startsWith("Mac")) return true;
  return false;
}

export function mapsUrl(lat: number, lng: number): string {
  if (isAppleDevice()) {
    return `https://maps.apple.com/?q=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
