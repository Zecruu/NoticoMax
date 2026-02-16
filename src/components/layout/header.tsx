"use client";

import { useTheme } from "next-themes";
import { signOut } from "next-auth/react";
import { Moon, Sun, Search, LogIn, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SyncStatus } from "@/components/sync-status";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type UserTier } from "@/hooks/use-subscription";
import { type Session } from "next-auth";
import { useEffect, useState } from "react";
import Link from "next/link";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  syncing: boolean;
  onSync: () => void;
  tier: UserTier;
  session: Session | null | undefined;
}

export function Header({ searchQuery, onSearchChange, syncing, onSync, tier, session }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleManageSubscription = async () => {
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-4 px-4 md:px-6">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="NOTICO MAX" className="h-7 w-7" />
          <span className="text-xl font-bold tracking-tight text-primary">NOTICO MAX</span>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search notes, URLs, reminders..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <SyncStatus syncing={syncing} onSync={onSync} tier={tier} />

          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          )}

          {!session ? (
            <Link href="/auth/sign-in">
              <Button variant="outline" size="sm" className="gap-1.5">
                <LogIn className="h-3.5 w-3.5" />
                Sign in
              </Button>
            </Link>
          ) : tier === "free" ? (
            <div className="flex items-center gap-2">
              <Link href="/pricing">
                <Button size="sm" className="gap-1.5">
                  <Crown className="h-3.5 w-3.5" />
                  Upgrade
                </Button>
              </Link>
              <UserAvatar session={session} onManage={handleManageSubscription} />
            </div>
          ) : (
            <UserAvatar session={session} onManage={handleManageSubscription} isPro />
          )}
        </div>
      </div>
    </header>
  );
}

function UserAvatar({
  session,
  onManage,
  isPro,
}: {
  session: Session;
  onManage: () => void;
  isPro?: boolean;
}) {
  const initials = (session.user.name || session.user.email || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
          {session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt=""
              className="h-8 w-8 rounded-full"
            />
          ) : (
            initials
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{session.user.name}</p>
          <p className="text-xs text-muted-foreground">{session.user.email}</p>
          {isPro && (
            <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Pro
            </span>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        {isPro && (
          <DropdownMenuItem onClick={onManage}>
            Manage Subscription
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
