"use client";

import { useState } from "react";
import { useLocations } from "@/hooks/use-locations";
import { type LocalLocation } from "@/lib/db/indexed-db";
import { getCurrentCoords, mapsUrl, formatCoords } from "@/lib/geolocation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MapPin,
  Plus,
  Crosshair,
  ExternalLink,
  Trash2,
  Pencil,
  Pin,
  PinOff,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/native-toast";

type DraftLocation = {
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  notes: string;
};

const EMPTY_DRAFT: DraftLocation = {
  name: "",
  address: "",
  latitude: "",
  longitude: "",
  notes: "",
};

function parseCoord(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function LocationsView() {
  const [searchQuery, setSearchQuery] = useState("");
  const { locations, addLocation, editLocation, removeLocation, togglePin } = useLocations(searchQuery);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LocalLocation | null>(null);
  const [draft, setDraft] = useState<DraftLocation>(EMPTY_DRAFT);
  const [capturing, setCapturing] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  };

  const openEdit = (loc: LocalLocation) => {
    setEditing(loc);
    setDraft({
      name: loc.name,
      address: loc.address ?? "",
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      notes: loc.notes ?? "",
    });
    setDialogOpen(true);
  };

  const captureCurrentLocation = async () => {
    setCapturing(true);
    try {
      const coords = await getCurrentCoords();
      setDraft((d) => ({
        ...d,
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
      }));
      toast.success("Captured current location");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get location");
    } finally {
      setCapturing(false);
    }
  };

  const saveCurrentLocationDirect = async () => {
    setCapturing(true);
    try {
      const coords = await getCurrentCoords();
      const stamp = new Date().toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      await addLocation({
        name: `Spot · ${stamp}`,
        latitude: coords.latitude,
        longitude: coords.longitude,
        tags: [],
        pinned: false,
      });
      toast.success("Current location saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save location");
    } finally {
      setCapturing(false);
    }
  };

  const handleSave = async () => {
    const name = draft.name.trim();
    const lat = parseCoord(draft.latitude);
    const lng = parseCoord(draft.longitude);
    if (!name) {
      toast.error("Name is required");
      return;
    }
    if (lat === null || lng === null) {
      toast.error("Latitude and longitude must be numbers");
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast.error("Coordinates are out of range");
      return;
    }

    const payload = {
      name,
      address: draft.address.trim() || undefined,
      latitude: lat,
      longitude: lng,
      notes: draft.notes.trim() || undefined,
    };

    if (editing) {
      await editLocation(editing.clientId, payload);
      toast.success("Location updated");
    } else {
      await addLocation({ ...payload, tags: [], pinned: false });
      toast.success("Location saved");
    }

    setDialogOpen(false);
    setEditing(null);
    setDraft(EMPTY_DRAFT);
  };

  const handleDelete = async (loc: LocalLocation) => {
    if (!confirm(`Delete "${loc.name}"?`)) return;
    await removeLocation(loc.clientId);
    toast.success("Location deleted");
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8 space-y-6">
      <div className="flex items-start gap-3">
        <MapPin className="h-6 w-6 text-primary mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Locations</h1>
            <span className="rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
              Beta
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Save your favorite spots and quick-snapshots of where you are. Open any saved spot in Maps with one tap.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={saveCurrentLocationDirect} disabled={capturing} className="gap-1.5">
          {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          Save Current Location
        </Button>
        <Button variant="outline" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Manually
        </Button>
      </div>

      <Input
        placeholder="Search by name, address, notes, or tag…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {locations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {searchQuery
              ? "No locations match your search."
              : <>No locations yet. Hit <strong>Save Current Location</strong> to pin where you are.</>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {locations.map((loc) => (
            <Card key={loc.clientId} className="overflow-hidden">
              <CardContent className="flex items-start gap-3 py-3">
                <button
                  onClick={() => togglePin(loc.clientId, loc.pinned)}
                  className={cn(
                    "shrink-0 mt-0.5 transition-colors",
                    loc.pinned ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-label={loc.pinned ? "Unpin" : "Pin"}
                >
                  {loc.pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{loc.name}</p>
                  {loc.address && (
                    <p className="text-xs text-muted-foreground truncate">{loc.address}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/70 tabular-nums">
                    {formatCoords(loc.latitude, loc.longitude)}
                  </p>
                  {loc.notes && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{loc.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={mapsUrl(loc.latitude, loc.longitude)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1.5 text-xs font-medium transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in Maps
                  </a>
                  <button
                    onClick={() => openEdit(loc)}
                    className="text-muted-foreground hover:text-foreground p-1.5 rounded-md transition-colors"
                    aria-label="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(loc)}
                    className="text-muted-foreground hover:text-destructive p-1.5 rounded-md transition-colors"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Location" : "New Location"}</DialogTitle>
            <DialogDescription>
              Pin a favorite spot, or grab your current coordinates with one tap.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="loc-name">Name</Label>
              <Input
                id="loc-name"
                placeholder="Mom's house, Favorite coffee shop…"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-address">Address (optional)</Label>
              <Input
                id="loc-address"
                placeholder="123 Main St, San Francisco"
                value={draft.address}
                onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="loc-lat">Latitude</Label>
                <Input
                  id="loc-lat"
                  inputMode="decimal"
                  placeholder="37.7749"
                  value={draft.latitude}
                  onChange={(e) => setDraft({ ...draft, latitude: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-lng">Longitude</Label>
                <Input
                  id="loc-lng"
                  inputMode="decimal"
                  placeholder="-122.4194"
                  value={draft.longitude}
                  onChange={(e) => setDraft({ ...draft, longitude: e.target.value })}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={captureCurrentLocation}
              disabled={capturing}
              className="w-full gap-1.5"
            >
              {capturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />}
              Use Current Location
            </Button>
            <div className="space-y-1.5">
              <Label htmlFor="loc-notes">Notes (optional)</Label>
              <Textarea
                id="loc-notes"
                placeholder="What makes this spot worth saving?"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Save Changes" : "Save Location"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
