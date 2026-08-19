"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Search, Settings, Menu, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SyncStatus } from "@/components/sync-status";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  syncing: boolean;
  onSync: () => void;
  isActivated: boolean;
  onMenuClick?: () => void;
}

const subscribeToHydration = () => () => {};

export function Header({ searchQuery, onSearchChange, syncing, onSync, isActivated, onMenuClick }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const isDark = resolvedTheme === "dark";

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-2 px-3 md:gap-4 md:px-6">
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-1 h-11 w-11 md:hidden"
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}

        <div className="relative min-w-0 flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="sm:hidden">
            <SyncStatus compact syncing={syncing} onSync={onSync} isActivated={isActivated} />
          </div>
          <div className="hidden sm:block">
            <SyncStatus syncing={syncing} onSync={onSync} isActivated={isActivated} />
          </div>

          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={isDark ? "Use light theme" : "Use dark theme"}
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          )}

          <Link href="/settings" className="hidden sm:block">
            <Button variant="ghost" size="icon">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-11 w-11 sm:hidden" aria-label="More options">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              {mounted && (
                <DropdownMenuItem className="min-h-11" onClick={() => setTheme(isDark ? "light" : "dark")}>
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {isDark ? "Light theme" : "Dark theme"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild className="min-h-11">
                <Link href="/settings">
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
