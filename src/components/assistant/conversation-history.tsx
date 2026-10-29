"use client";

import { useState } from "react";
import Link from "next/link";
import { SquarePen, Trash2, Search } from "lucide-react";
import type { CloudStorage, Conversation } from "@/lib/ai/conversation-types";
import { formatBytes } from "@/lib/billing/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ConversationHistory({ conversations, selectedId, storage, loading, error, hasMore, disabled, onNew, onOpen, onDelete, onMore, onRetry }: {
  conversations: Conversation[];
  selectedId: string | null;
  storage: CloudStorage | null;
  loading: boolean;
  error: string;
  hasMore: boolean;
  disabled: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onMore: () => void;
  onRetry: () => void;
}) {
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const visible = conversations.filter((chat) => chat.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-4 px-3 pb-3">
        <Button variant="outline" className="min-h-11 w-full justify-start gap-3 bg-background transition-colors" disabled={disabled} onClick={onNew}>
          <SquarePen className="size-4" /> New chat
        </Button>
        {conversations.length > 5 && <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input aria-label="Find a loaded chat" placeholder="Find a chat" value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-11 border-transparent bg-background/60 pl-9" />
        </div>}
      </div>
      <nav aria-label="Past conversations" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
        {loading && !conversations.length && <p role="status" className="px-3 py-4 text-sm text-muted-foreground">Loading chats…</p>}
        {error && <div className="px-3 py-4 text-sm"><p role="alert" className="text-muted-foreground">{error}</p><button onClick={onRetry} className="min-h-11 underline underline-offset-4">Try again</button></div>}
        {!loading && !error && !conversations.length && <p className="px-3 py-4 text-sm leading-relaxed text-muted-foreground">Your conversations will appear here after your first message.</p>}
        {!!conversations.length && !visible.length && <p className="px-3 py-4 text-sm text-muted-foreground">No matching chats in this list.</p>}
        <ul className="space-y-1">
          {visible.map((chat) => <li key={chat.id}>
            <div className={`group flex items-center rounded-lg ${selectedId === chat.id ? "bg-muted" : "hover:bg-muted/60"}`}>
              <button type="button" disabled={disabled} onClick={() => onOpen(chat.id)} aria-current={selectedId === chat.id ? "page" : undefined} className="min-h-11 min-w-0 flex-1 rounded-lg px-3 py-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50" title={chat.title}>
                <span className="block truncate">{chat.title}</span>
              </button>
              <button type="button" disabled={disabled || deleting} onClick={() => setConfirmDelete(confirmDelete === chat.id ? null : chat.id)} aria-label={`Delete chat: ${chat.title}`} className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40">
                <Trash2 className="size-4" />
              </button>
            </div>
            {confirmDelete === chat.id && <div className="px-3 pb-3 text-sm">
              <p className="py-2 text-muted-foreground">Delete this chat and free its storage? Saved notes and reminders stay.</p>
              <div className="flex gap-2">
                <Button variant="destructive" className="min-h-11 transition-colors" disabled={disabled || deleting} onClick={async () => {
                  setDeleting(true);
                  try { await onDelete(chat.id); setConfirmDelete(null); } catch { /* Parent shows the error; keep confirmation open. */ } finally { setDeleting(false); }
                }}>{deleting ? "Deleting…" : "Delete"}</Button>
                <Button variant="ghost" className="min-h-11 transition-colors" disabled={deleting} onClick={() => setConfirmDelete(null)}>Keep chat</Button>
              </div>
            </div>}
          </li>)}
        </ul>
        {hasMore && <Button variant="ghost" className="mt-2 min-h-11 w-full transition-colors" disabled={loading} onClick={onMore}>{loading ? "Loading…" : "Load more chats"}</Button>}
      </nav>
      <div className="shrink-0 border-t border-border/60 px-5 py-4 text-xs leading-relaxed text-muted-foreground">
        {storage ? <>
          <Link href="/settings" className="flex min-h-11 items-center justify-between gap-2 underline-offset-4 hover:underline"><span>Cloud storage</span><span className="tabular-nums">{formatBytes(storage.used)} / {formatBytes(storage.limit)}</span></Link>
          <p>Saved chats count toward your allowance. Space is reserved while a reply is in progress.</p>
        </> : <p>Chats are saved to your account and count toward cloud storage.</p>}
      </div>
    </div>
  );
}
