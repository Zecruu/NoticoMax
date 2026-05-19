"use client";

import { useState } from "react";
import { useHouseholds, type Household } from "@/hooks/use-households";
import { useLicense } from "@/hooks/use-license";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Users,
  Plus,
  LogOut,
  Crown,
  Loader2,
  Check,
  X,
  Copy,
  UserPlus,
  Hash,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import db from "@/lib/db/indexed-db";
import { performSync } from "@/lib/sync/sync-engine";
import { toast } from "@/lib/native-toast";

export function HouseholdsCard() {
  const {
    households,
    pendingInvites,
    loading,
    refresh,
    createHousehold,
    requestByCode,
    approveRequest,
    respond,
    leave,
  } = useHouseholds();
  const { entitlements } = useLicense();

  // Family Plan unlocks household creation. Lifetime Pro is grandfathered.
  const canCreateFamily = !!entitlements.familyPlanActive || !!entitlements.lifetimePro;

  const [creatingName, setCreatingName] = useState("");
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const [actingRequestToken, setActingRequestToken] = useState<string | null>(null);
  const [buyingSeatForHousehold, setBuyingSeatForHousehold] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const diagnose = async () => {
    setDiagnosing(true);
    try {
      // Snapshot local state BEFORE sync
      const before = await db.folders.toArray();
      const beforeShared = before.filter((f) => !!f.householdId && !f.deleted);
      const beforePersonal = before.filter((f) => !f.householdId && !f.deleted);

      // Pull from server
      await performSync();

      // Snapshot AFTER
      const after = await db.folders.toArray();
      const afterShared = after.filter((f) => !!f.householdId && !f.deleted);
      const afterPersonal = after.filter((f) => !f.householdId && !f.deleted);

      // Also hit the debug API to see what the server SAYS we should have
      let serverFolderCount = "?";
      let serverSharedCount = "?";
      let serverErr: string | undefined;
      try {
        const res = await fetch("/api/debug/folders", { credentials: "include" });
        if (res.ok) {
          const j = await res.json();
          serverFolderCount = String(j.folders?.count ?? "?");
          serverSharedCount = String(j.folders?.sharedCount ?? "?");
          if (j.folders?.error) serverErr = j.folders.error;
        } else {
          serverErr = `HTTP ${res.status}`;
        }
      } catch (e) {
        serverErr = e instanceof Error ? e.message : "fetch failed";
      }

      const lines = [
        `LOCAL before sync: ${beforePersonal.length} personal + ${beforeShared.length} shared folder(s)`,
        `LOCAL after sync:  ${afterPersonal.length} personal + ${afterShared.length} shared folder(s)`,
        `SERVER says:       ${serverFolderCount} total, ${serverSharedCount} shared`,
        serverErr ? `SERVER error:      ${serverErr}` : null,
        afterShared.length > 0
          ? `Shared folder ids: ${afterShared.map((f) => f.name).join(", ")}`
          : "(no shared folders pulled)",
      ].filter(Boolean).join("\n");

      alert(lines);
    } finally {
      setDiagnosing(false);
    }
  };

  const buyExtraSeat = async (householdId: string) => {
    setBuyingSeatForHousehold(householdId);
    try {
      // Dynamic-import so non-Capacitor environments don't try to load the SDK.
      const { purchase } = await import("@/lib/iap/revenuecat-client");
      const ok = await purchase("family_extra_seat_monthly");
      if (ok) {
        toast.success("Seat added — the webhook will bump your family in a moment");
        await refresh();
      } else {
        toast.error("Purchase cancelled or failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start purchase");
    } finally {
      setBuyingSeatForHousehold(null);
    }
  };

  const startFamilyPlanUpgrade = async () => {
    try {
      const { presentPaywall } = await import("@/lib/iap/revenuecat-client");
      const result = await presentPaywall();
      if (result === "purchased") {
        toast.success("Family Plan active — you can now create a family");
      } else if (result === "cancelled") {
        // No toast — user closed it intentionally
      } else if (result !== "not_presented") {
        toast.error("Couldn't open the paywall");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Paywall unavailable");
    }
  };

  const handleCreate = async () => {
    const name = creatingName.trim();
    if (!name) return;
    setCreating(true);
    const result = await createHousehold(name);
    setCreating(false);
    if (result.success) {
      setCreatingName("");
      toast.success(`Family "${name}" created`);
    } else {
      toast.error(result.error);
    }
  };

  const handleJoinByCode = async () => {
    const code = joinCode.trim();
    if (!code) {
      toast.error("Enter a family code");
      return;
    }
    setJoining(true);
    const result = await requestByCode(code);
    setJoining(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setJoinCode("");
    if (result.alreadyMember) {
      toast.success(`You're already in ${result.householdName}`);
    } else if (result.pending) {
      toast.success(`Request sent — ${result.householdName} admin will see it`);
    } else {
      toast.success(`Joined ${result.householdName}`);
    }
  };

  const handleApprove = async (token: string, action: "approve" | "decline", memberLabel: string) => {
    setActingRequestToken(token);
    const result = await approveRequest(token, action);
    setActingRequestToken(null);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(
      action === "approve" ? `${memberLabel} added to the family` : `Request from ${memberLabel} declined`,
    );
  };

  const handleLeave = async (h: Household) => {
    if (h.role === "owner") {
      if (!confirm(`You're the admin of "${h.name}". Leaving deletes the family for everyone. Continue?`)) return;
      const result = await leave(h.id, true);
      if (result.success) toast.success("Family deleted");
      else toast.error(result.error);
    } else {
      if (!confirm(`Leave "${h.name}"?`)) return;
      const result = await leave(h.id, false);
      if (result.success) toast.success("Left family");
      else toast.error(result.error);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Code ${code} copied`);
    } catch {
      toast.error("Couldn't copy — long-press to copy manually");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Family
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void diagnose()}
            disabled={diagnosing}
            title="Show sync state + force a pull from server"
          >
            {diagnosing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Share notes, reminders, lists and a budget with your family. Admin creates the family and
          shares a 6-character code; others paste it below to request to join.
        </p>

        {/* Legacy pending email invites (Ship 1a path) — only show if any are in flight */}
        {pendingInvites.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              You have a pending email invite
            </Label>
            {pendingInvites.map((inv) => (
              <div key={inv.token} className="rounded-md border p-3 space-y-2">
                <div className="text-sm">
                  <span className="font-semibold">{inv.householdName}</span>
                  {inv.invitedByEmail && (
                    <span className="text-muted-foreground"> · from {inv.invitedByEmail}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      const r = await respond(inv.token, "accept");
                      if (r.success) toast.success(`Joined ${inv.householdName}`);
                      else toast.error(r.error);
                    }}
                    className="gap-1"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const r = await respond(inv.token, "decline");
                      if (r.success) toast.success("Invite declined");
                      else toast.error(r.error);
                    }}
                    className="gap-1"
                  >
                    <X className="h-3.5 w-3.5" />
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Existing households */}
        {households.length > 0 ? (
          <div className="space-y-3">
            {households.map((h) => (
              <div key={h.id} className="rounded-md border p-3 space-y-3">
                {/* Title row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-medium truncate">{h.name}</p>
                    {h.role === "owner" && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                        <Crown className="h-2.5 w-2.5" />
                        Admin
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleLeave(h)}
                    className="text-muted-foreground hover:text-destructive gap-1"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    {h.role === "owner" ? "Delete" : "Leave"}
                  </Button>
                </div>

                {/* Family code — only show to the admin */}
                {h.role === "owner" && (
                  <div className="rounded-md bg-muted/50 p-2.5 space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Family code
                    </Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 font-mono text-lg font-bold tracking-[0.2em] text-foreground">
                        {h.familyCode}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void copyCode(h.familyCode)}
                        className="gap-1 shrink-0"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Share this code via Messages/WhatsApp. They&apos;ll paste it below to request to
                      join.
                    </p>
                  </div>
                )}

                {/* Seat counter + buy-extra-seat button */}
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="text-muted-foreground">
                    {h.currentSeats} of {h.maxSeats} seats used
                  </span>
                  {h.role === "owner" && (
                    <Button
                      size="sm"
                      variant={h.currentSeats >= h.maxSeats ? "default" : "ghost"}
                      onClick={() => void buyExtraSeat(h.id)}
                      disabled={buyingSeatForHousehold === h.id}
                      className="gap-1 h-7 px-2 text-xs"
                    >
                      {buyingSeatForHousehold === h.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      Add seat ($1/mo)
                    </Button>
                  )}
                </div>

                {/* Members */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Members
                  </Label>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {h.members.map((m) => (
                      <div key={m.userId} className="flex items-center gap-1.5">
                        <span className="truncate">{m.email ?? m.userId.slice(0, 8)}</span>
                        {m.role === "owner" && <Crown className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pending requests — admin only */}
                {h.role === "owner" && h.pendingRequests.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t">
                    <Label className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Pending requests ({h.pendingRequests.length})
                    </Label>
                    {h.pendingRequests.map((r) => {
                      const label = r.email ?? r.userId.slice(0, 8);
                      const isActing = actingRequestToken === r.token;
                      return (
                        <div key={r.token} className="flex items-center gap-2">
                          <span className="text-xs flex-1 truncate">{label}</span>
                          <Button
                            size="sm"
                            onClick={() => void handleApprove(r.token, "approve", label)}
                            disabled={isActing}
                            className="gap-1 h-7 px-2"
                          >
                            {isActing ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleApprove(r.token, "decline", label)}
                            disabled={isActing}
                            className="gap-1 h-7 px-2"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          !loading && (
            <p className="text-xs text-muted-foreground">
              No family yet. Create one below, or paste a family code if someone shared theirs with
              you.
            </p>
          )
        )}

        {/* Join by code */}
        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs flex items-center gap-1.5">
            <Hash className="h-3 w-3" />
            Join a family
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="Enter family code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={12}
              className="font-mono tracking-[0.2em] uppercase"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleJoinByCode();
                }
              }}
            />
            <Button
              onClick={() => void handleJoinByCode()}
              disabled={joining || !joinCode.trim()}
              className="gap-1 shrink-0"
            >
              {joining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              Request
            </Button>
          </div>
        </div>

        {/* Create new — gated on Family Plan entitlement */}
        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs">Create a new family</Label>
          {canCreateFamily ? (
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Demchak Family, Roommates"
                value={creatingName}
                onChange={(e) => setCreatingName(e.target.value)}
                maxLength={60}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreate();
                  }
                }}
              />
              <Button
                onClick={() => void handleCreate()}
                disabled={creating || !creatingName.trim()}
                className="gap-1 shrink-0"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Create
              </Button>
            </div>
          ) : (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Family Plan — $5/mo</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Includes everything in Pro + a shared family folder (notes, reminders, lists,
                passwords), 5 seats, and family cloud storage. Add more seats for $1/mo each.
              </p>
              <Button onClick={() => void startFamilyPlanUpgrade()} size="sm" className="gap-1.5 w-full">
                <Sparkles className="h-3.5 w-3.5" />
                Upgrade to Family Plan
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
