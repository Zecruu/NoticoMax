"use client";

import type { Household } from "@/hooks/use-households";
import { useFamilyCheckins } from "@/hooks/use-family-checkins";
import { mapsUrl, formatCoords } from "@/lib/geolocation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, MapPin, Pause, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

export function FamilyCheckins({ household }: { household: Household }) {
  const state = useFamilyCheckins(household.id);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-primary" /> Family check-ins
          </CardTitle>
          <Button size="icon-sm" variant="ghost" aria-label="Refresh family check-ins"
            disabled={state.loading || !!state.pending} onClick={() => void state.refresh()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Share your current location only when you tap. Each check-in is visible to accepted
          members of {household.name} for up to 24 hours. This is not live tracking; there is no
          background location collection or arrival alert.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <ShieldCheck className="h-4 w-4" />
            {state.sharingEnabled ? "Manual check-ins enabled" : "Your location sharing is off"}
          </p>
          <p className="text-xs text-muted-foreground">
            {state.sharingEnabled
              ? "Pause to stop sharing and delete your last check-in. Enabling this never sends your location automatically."
              : "Choose to enable sharing first. Device location permission will only be requested when you share one check-in."}
          </p>
          {state.sharingEnabled ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!state.ready || !!state.pending} onClick={() => void state.share()}>
                {state.pending === "capture" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                {state.pending === "capture" ? "Getting your location…" : "Share one check-in"}
              </Button>
              <Button size="sm" variant="outline"
                disabled={!!state.pending && state.pending !== "capture"} onClick={() => void state.pause()}>
                {state.pending === "pause" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                Pause & delete my check-in
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" disabled={!state.ready || !!state.pending} onClick={() => void state.enable()}>
              {state.pending === "enable" && <Loader2 className="h-4 w-4 animate-spin" />}
              Enable my manual check-ins
            </Button>
          )}
        </div>
        {state.loading && <p className="text-xs text-muted-foreground" role="status">Loading check-ins…</p>}
        {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
        {state.notice && <p className="text-xs text-muted-foreground" role="status">{state.notice}</p>}
        {!state.loading && !state.error && state.checkins.length === 0 && (
          <p className="text-xs text-muted-foreground">No current check-ins. Members choose whether and when to share.</p>
        )}
        <div className="space-y-2">
          {state.checkins.map((checkin) => {
            const own = state.userId === checkin.userId;
            const member = household.members.find((m) => m.userId === checkin.userId);
            return (
              <div key={checkin.userId} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{own ? "You" : member?.email ?? "Family member"}</p>
                    <p className="text-xs text-muted-foreground">One-time check-in · not a live location</p>
                  </div>
                  {own && (
                    <Button variant="ghost" size="icon-sm" aria-label="Delete my check-in"
                      disabled={!!state.pending} onClick={() => void state.remove()}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatCoords(checkin.latitude, checkin.longitude)}
                  {checkin.accuracy !== null ? ` · accuracy ±${Math.round(checkin.accuracy)} m` : " · accuracy unavailable"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Captured <time dateTime={checkin.capturedAt}>{new Date(checkin.capturedAt).toLocaleString()}</time>
                  <br />
                  Expires <time dateTime={checkin.expiresAt}>{new Date(checkin.expiresAt).toLocaleString()}</time>
                </p>
                <a href={mapsUrl(checkin.latitude, checkin.longitude)} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> Open check-in in Maps
                </a>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Requires an internet connection. Location is never queued offline. Check-ins refresh
          every 30 seconds while this screen is visible; a missing check-in is not a safety alert.
        </p>
      </CardContent>
    </Card>
  );
}
