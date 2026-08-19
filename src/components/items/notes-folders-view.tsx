"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Folder, FolderPlus, Plus, Users } from "lucide-react";
import type { LocalFolder, LocalItem } from "@/lib/db/indexed-db";
import {
  DEFAULT_FOLDER_CREATE_ERROR,
  isReservedDefaultFolderName,
  resolveDefaultNoteFolderId,
} from "@/lib/note-folders";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NotesFoldersViewProps {
  folders: LocalFolder[];
  notes: LocalItem[];
  loading: boolean;
  onOpenFolder: (folderId: string) => void;
  onCreateFolder: (folder: { name: string; color: string }) => Promise<void>;
  onCreateNote: () => void;
}

const NEW_FOLDER_COLOR = "#eab308";

export function NotesFoldersView({
  folders,
  notes,
  loading,
  onOpenFolder,
  onCreateFolder,
  onCreateNote,
}: NotesFoldersViewProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [folderError, setFolderError] = useState("");

  const personalFolders = useMemo(
    () => folders.filter((folder) => !folder.householdId),
    [folders],
  );
  const sharedFolders = useMemo(
    () => folders.filter((folder) => !!folder.householdId),
    [folders],
  );
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const note of notes) {
      if (note.type !== "note") continue;
      const folderId = resolveDefaultNoteFolderId(note.folderId, personalFolders);
      if (folderId) counts[folderId] = (counts[folderId] ?? 0) + 1;
    }

    return counts;
  }, [notes, personalFolders]);

  const createFolder = async () => {
    const name = folderName.trim();
    if (!name || creating) return;
    if (isReservedDefaultFolderName(name)) {
      setFolderError(DEFAULT_FOLDER_CREATE_ERROR);
      return;
    }
    setCreating(true);
    setFolderError("");
    try {
      await onCreateFolder({ name, color: NEW_FOLDER_COLOR });
      setFolderName("");
      setCreateOpen(false);
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : "Folder could not be created.");
    } finally {
      setCreating(false);
    }
  };

  const renderFolderSection = (title: string, sectionFolders: LocalFolder[], shared = false) => (
    <section className="space-y-2" aria-labelledby={`notes-${shared ? "shared" : "personal"}-folders`}>
      <h2
        id={`notes-${shared ? "shared" : "personal"}-folders`}
        className="px-4 text-xs font-medium uppercase text-muted-foreground md:px-0"
      >
        {title}
      </h2>
      <div className="divide-y border-y bg-muted/15 md:overflow-hidden md:rounded-lg md:border">
        {sectionFolders.map((folder) => (
          <button
            key={folder.clientId}
            type="button"
            onClick={() => onOpenFolder(folder.clientId)}
            className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-4"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
              {shared ? (
                <Users className="h-5 w-5" style={{ color: folder.color || undefined }} />
              ) : (
                <Folder className="h-5 w-5" style={{ color: folder.color || undefined }} />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-base font-medium">{folder.name}</span>
            <span className="text-sm tabular-nums text-muted-foreground">{folderCounts[folder.clientId] ?? 0}</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="pb-4 md:p-6">
      <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 md:px-0 md:pt-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold md:text-3xl">Folders</h1>
          <p className="text-xs text-muted-foreground">
            {loading ? "Loading…" : `${notes.length} ${notes.length === 1 ? "note" : "notes"}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={() => setCreateOpen(true)}
            aria-label="Create folder"
            title="Create folder"
          >
            <FolderPlus className="h-5 w-5" />
          </Button>
          <Button type="button" size="sm" className="hidden gap-1.5 md:inline-flex" onClick={onCreateNote}>
            <Plus className="h-4 w-4" />
            New note
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="divide-y border-y md:overflow-hidden md:rounded-lg md:border">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="space-y-6 md:max-w-3xl">
          {renderFolderSection("My folders", personalFolders)}
          {sharedFolders.length > 0 && renderFolderSection("Shared", sharedFolders, true)}
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setFolderError("");
        }}
      >
        <DialogContent className="top-[calc(var(--visual-viewport-height,100vh)/2)] w-[calc(100vw-2rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="notes-folder-name">Name</Label>
            <Input
              id="notes-folder-name"
              value={folderName}
              onChange={(event) => {
                setFolderName(event.target.value);
                setFolderError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createFolder();
              }}
              placeholder="Folder name"
              autoFocus
            />
            {folderError && <p className="text-sm text-destructive">{folderError}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="button" disabled={!folderName.trim() || creating} onClick={() => void createFolder()}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
