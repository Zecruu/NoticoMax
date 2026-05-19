"use client";

import { HouseholdsCard } from "@/components/settings/households-card";
import { StorageCard } from "@/components/settings/storage-card";
import { HeartHandshake } from "lucide-react";

export function FamilyView() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8 space-y-6">
      <div className="flex items-start gap-3">
        <HeartHandshake className="h-6 w-6 text-primary mt-0.5" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Family & Friends</h1>
          <p className="text-sm text-muted-foreground">
            Share notes, reminders, lists, and your budget with up to 5 people. Admin creates the
            family and shares a 6-char code; everyone joins from one place.
          </p>
        </div>
      </div>

      <HouseholdsCard />
      <StorageCard />
    </div>
  );
}
