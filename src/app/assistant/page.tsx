"use client";

import Link from "next/link";
import { ArrowLeft, Bot, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SecondaryBottomNav } from "@/components/layout/secondary-nav";

/**
 * Notico assistant — placeholder screen. The conversational AI backend is not
 * built yet (and the "Hey Notico" wake word is a later App Store feature), so
 * this page introduces the assistant and keeps the footer nav consistent. The
 * input is intentionally disabled until the assistant ships.
 */
export default function AssistantPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Notico</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 pt-16 pb-[calc(8rem+env(safe-area-inset-bottom))] text-center md:pb-24">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Bot className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mt-5 text-xl font-semibold">Meet Notico</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Your personal assistant for notes, reminders, and everything in NOTICO MAX.
          It&apos;s coming soon — you&apos;ll be able to ask Notico to find, create,
          and organize things for you right here.
        </p>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Coming soon
        </span>
      </main>

      {/* Disabled composer — gives the screen its eventual shape without wiring
          up the AI backend (out of scope for now). Sits above the footer nav. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t bg-background/95 px-4 py-3 backdrop-blur md:bottom-0">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <Input
            disabled
            placeholder="Ask Notico anything… (coming soon)"
            className="flex-1"
          />
          <Button disabled size="icon">
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <SecondaryBottomNav active="assistant" />
    </div>
  );
}
