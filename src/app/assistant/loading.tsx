/** Immediate route feedback while a cold navigation downloads the chat code. */
export default function LoadingAssistant() {
  return (
    <div
      className="app-viewport flex flex-col bg-background pb-[var(--bottom-nav-height)]"
      role="status"
      aria-label="Opening Lyte"
    >
      <div className="flex h-16 shrink-0 items-center border-b border-border/60 px-6 pt-[env(safe-area-inset-top)] font-semibold">
        Lyte
      </div>
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Opening Lyte…
      </div>
      <div
        aria-hidden="true"
        className="mx-auto mb-4 h-28 w-[calc(100%-2rem)] max-w-3xl rounded-2xl border bg-muted/30"
      />
    </div>
  );
}
