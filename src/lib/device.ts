import { v4 as uuidv4 } from "uuid";
import { getPlatform } from "./platform";

const DEVICE_ID_KEY = "notico_device_id";
const DEVICE_NAME_KEY = "notico_device_name";
const DEVICE_NAMES_KEY = "notico_device_names"; // maps deviceId → user-chosen name

/**
 * Returns a persistent device ID for this browser/app instance.
 * Generated once and stored in localStorage.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * Returns the display name for the current device.
 * User can rename it; defaults to an auto-detected name.
 */
export function getDeviceName(): string {
  if (typeof window === "undefined") return "Unknown";
  const custom = localStorage.getItem(DEVICE_NAME_KEY);
  if (custom) return custom;
  return detectDeviceName();
}

/**
 * Rename the current device.
 */
export function setDeviceName(name: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEVICE_NAME_KEY, name.trim());
  // Also save in the device names map
  const id = getDeviceId();
  saveDeviceNameMapping(id, name.trim());
}

/**
 * Get a map of all known device names (deviceId → name).
 * Built from synced items + local overrides.
 */
export function getDeviceNamesMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DEVICE_NAMES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Save a device name mapping (deviceId → name).
 */
export function saveDeviceNameMapping(deviceId: string, name: string): void {
  if (typeof window === "undefined") return;
  const map = getDeviceNamesMap();
  map[deviceId] = name;
  localStorage.setItem(DEVICE_NAMES_KEY, JSON.stringify(map));
}

/**
 * Get display name for any device by ID.
 * Falls back to a short ID if unknown.
 */
export function getDeviceDisplayName(deviceId: string): string {
  if (!deviceId) return "Unknown Device";
  const map = getDeviceNamesMap();
  if (map[deviceId]) return map[deviceId];
  // Check if it's the current device
  if (deviceId === getDeviceId()) {
    const name = getDeviceName();
    saveDeviceNameMapping(deviceId, name);
    return name;
  }
  return `Device ${deviceId.slice(0, 6)}`;
}

/**
 * Auto-detect a friendly device name based on platform and user agent.
 */
function detectDeviceName(): string {
  const platform = getPlatform();

  switch (platform) {
    case "electron":
      return detectOSName();
    case "ios":
      return "iPhone";
    case "android":
      return "Android";
    case "web":
      return `${detectBrowserName()} (${detectOSName()})`;
    default:
      return "Unknown Device";
  }
}

function detectOSName(): string {
  if (typeof navigator === "undefined") return "Desktop";
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "Windows PC";
  if (ua.includes("Mac OS")) return "Mac";
  if (ua.includes("Linux")) return "Linux PC";
  if (ua.includes("CrOS")) return "Chromebook";
  return "Desktop";
}

function detectBrowserName(): string {
  if (typeof navigator === "undefined") return "Browser";
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  return "Browser";
}
