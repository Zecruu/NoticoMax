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

/**
 * Universal "open in maps" URL. Google Maps' web URL works everywhere:
 * - iOS Safari prompts to open in Google Maps app or Apple Maps
 * - Android opens Google Maps natively
 * - Desktop opens maps.google.com
 */
export function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
