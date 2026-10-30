import { Capacitor, registerPlugin } from "@capacitor/core";

export interface MapPlace { title: string; address: string; latitude: number; longitude: number }
interface FamilyMapPlugin {
  open(options: { title: string; pick: boolean; pins: MapPlace[] }): Promise<{ cancelled: boolean; place?: MapPlace }>;
  close(): Promise<void>;
}
const FamilyMap = registerPlugin<FamilyMapPlugin>("FamilyMap");
export function hasNativeFamilyMap(): boolean {
  return Capacitor.getPlatform() === "ios" && Capacitor.isPluginAvailable("FamilyMap");
}
export async function openFamilyMap(pins: MapPlace[], pick = false, title = pick ? "Choose a family place" : "Family places"): Promise<MapPlace | null> {
  if (!hasNativeFamilyMap()) throw new Error("Native Apple Maps requires the updated iOS app. You can still enter a place below or open saved places in Maps.");
  const result = await FamilyMap.open({ title, pick, pins });
  return result.cancelled ? null : result.place ?? null;
}
export async function closeFamilyMap(): Promise<void> {
  if (hasNativeFamilyMap()) await FamilyMap.close();
}
