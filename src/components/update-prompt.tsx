"use client";

import { useSWUpdate } from "@/hooks/use-sw-update";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function UpdatePrompt() {
  const { updateAvailable, applyUpdate } = useSWUpdate();

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2 shadow-lg">
        <span className="text-sm">A new version is available</span>
        <Button size="sm" onClick={applyUpdate} className="gap-1.5 rounded-full">
          <RefreshCw className="h-3.5 w-3.5" />
          Update
        </Button>
      </div>
    </div>
  );
}
