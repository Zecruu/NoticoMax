"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Search, Settings, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SyncStatus } from "@/components/sync-status";
import Link from "next/link";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  syncing: boolean;
  onSync: () => void;
  isActivated: boolean;
  onMenuClick?: () => void;
}

export function Header({ searchQuery, onSearchChange, syncing, onSync, isActivated, onMenuClick }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="z-40 shrink-0 border-b bg-background pt-[env(safe-area-inset-top)]">
      <div className="flex h-16 items-center gap-2 px-4 md:gap-4 md:px-6">
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 md:hidden -ml-2"
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}

        <div className="relative min-w-0 flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search notes, links, and reminders"
            placeholder="Search your space"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-11 rounded-xl border-transparent bg-muted/60 pl-9 shadow-none"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
          <SyncStatus syncing={syncing} onSync={onSync} isActivated={isActivated} />

            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              aria-label="Toggle theme"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              <Sun className="hidden h-4 w-4 dark:block" />
              <Moon className="h-4 w-4 dark:hidden" />
            </Button>

          <Link href="/settings" aria-label="Settings" className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
              <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
