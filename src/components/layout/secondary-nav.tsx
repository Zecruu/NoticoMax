"use client";

import Link from "next/link";
import { Home, Bot, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

type SecondaryNavKey = "home" | "assistant" | "settings";

const items: { key: SecondaryNavKey; label: string; href: string; icon: typeof Home }[] = [
  { key: "home", label: "Home", href: "/", icon: Home },
  { key: "assistant", label: "Notico", href: "/assistant", icon: Bot },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings },
];

/**
 * Bottom footer nav for secondary pages (Settings, Assistant) that don't carry
 * the main dashboard's MobileNav. Keeps the Notico assistant reachable from the
 * footer everywhere. Mobile-only — desktop uses the sidebar. Shares the
 * `mobile-bottom-nav` class so it auto-hides when the keyboard opens.
 */
export function SecondaryBottomNav({ active }: { active: SecondaryNavKey }) {
  return (
    <nav className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full">
              <Icon className="h-4 w-4" />
            </div>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
