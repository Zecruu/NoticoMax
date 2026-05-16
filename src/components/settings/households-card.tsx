"use client";

import { useState } from "react";
import { useHouseholds, type Household } from "@/hooks/use-households";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Plus, Mail, LogOut, Crown, Loader2, Check, X } from "lucide-react";
import { toast } from "@/lib/native-toast";

export function HouseholdsCard() {
  const { households, pendingInvites, loading, refresh, createHousehold, invite, respond, leave } = useHouseholds();

  const [creatingName, setCreatingName] = useState("");
  const [creating, setCreating] = useState(false);

  const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const handleCreate = async () => {
    const name = creatingName.trim();
    if (!name) return;
    setCreating(true);
    const result = await createHousehold(name);
    setCreating(false);
    if (result.success) {
      setCreatingName("");
      toast.success(`Household "${name}" created`);
    } else {
      toast.error(result.error);
    }
  };

  const handleInvite = async (h: Household) => {
    const email = (inviteEmail[h.id] || "").trim();
    if (!email) {
      toast.error("Enter an email");
      return;
    }
    setInvitingId(h.id);
    const result = await invite(h.id, email);
    setInvitingId(null);
    if (result.success) {
      setInviteEmail((m) => ({ ...m, [h.id]: "" }));
      toast.success(`Invite sent to ${email}`);
    } else {
      toast.error(result.error);
    }
  };

  const handleLeave = async (h: Household) => {
    if (h.role === "owner") {
      if (!confirm(`You're the owner of "${h.name}". Leaving deletes the household for everyone. Continue?`)) return;
      const result = await leave(h.id, true);
      if (result.success) toast.success("Household deleted");
      else toast.error(result.error);
    } else {
      if (!confirm(`Leave "${h.name}"?`)) return;
      const result = await leave(h.id, false);
      if (result.success) toast.success("Left household");
      else toast.error(result.error);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Households
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          A household shares notes and a budget across members. Invite people by their Notico Max email.
        </p>

        {/* Pending invites — surfaced first */}
        {pendingInvites.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pending invites</Label>
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
                      const result = await respond(inv.token, "accept");
                      if (result.success) toast.success(`Joined ${inv.householdName}`);
                      else toast.error(result.error);
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
                      const result = await respond(inv.token, "decline");
                      if (result.success) toast.success("Invite declined");
                      else toast.error(result.error);
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
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-medium truncate">{h.name}</p>
                    {h.role === "owner" && (
                      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                        <Crown className="h-2.5 w-2.5" />
                        Owner
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

                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Members</Label>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {h.members.map((m) => (
                      <div key={m.userId} className="flex items-center gap-1.5">
                        <span className="truncate">{m.email ?? m.userId.slice(0, 8)}</span>
                        {m.role === "owner" && <Crown className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="invite by email…"
                    value={inviteEmail[h.id] || ""}
                    onChange={(e) => setInviteEmail((m) => ({ ...m, [h.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleInvite(h);
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => void handleInvite(h)}
                    disabled={invitingId === h.id}
                    className="gap-1 shrink-0"
                  >
                    {invitingId === h.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Mail className="h-3.5 w-3.5" />
                    )}
                    Invite
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !loading && (
            <p className="text-xs text-muted-foreground">No households yet. Create one below to share notes and a budget with someone else.</p>
          )
        )}

        {/* Create new */}
        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs">New household</Label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Apartment, Family, Roommates"
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
            <Button onClick={() => void handleCreate()} disabled={creating || !creatingName.trim()} className="gap-1 shrink-0">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
