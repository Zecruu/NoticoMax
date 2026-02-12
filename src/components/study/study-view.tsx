"use client";

import { useState, useCallback } from "react";
import { type LocalStudySet } from "@/lib/db/indexed-db";
import { useStudySets } from "@/hooks/use-study-sets";
import { StudySetDialog } from "./study-set-dialog";
import { FlashcardPlayer } from "./flashcard-player";
import { StudySummary } from "./study-summary";
import { Button } from "@/components/ui/button";
import { BookOpen, Plus, Pencil, Trash2, Layers } from "lucide-react";
import { toast } from "sonner";

type ViewState =
  | { screen: "list" }
  | { screen: "player"; set: LocalStudySet }
  | { screen: "summary"; set: LocalStudySet };

export function StudyView() {
  const { studySets, loading, addStudySet, editStudySet, removeStudySet } = useStudySets();
  const [viewState, setViewState] = useState<ViewState>({ screen: "list" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<LocalStudySet | null>(null);

  const handleCreate = useCallback(() => {
    setEditingSet(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((set: LocalStudySet, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSet(set);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async (clientId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await removeStudySet(clientId);
    toast.success("Study set deleted");
  }, [removeStudySet]);

  const handleSave = useCallback(async (data: { name: string; cards: { term: string; definition: string }[] }) => {
    await addStudySet(data);
    toast.success("Study set created");
  }, [addStudySet]);

  const handleUpdate = useCallback(async (clientId: string, updates: Partial<LocalStudySet>) => {
    await editStudySet(clientId, updates);
    toast.success("Study set updated");
  }, [editStudySet]);

  // Flashcard player view
  if (viewState.screen === "player") {
    return (
      <FlashcardPlayer
        cards={viewState.set.cards}
        setName={viewState.set.name}
        onDone={() => setViewState({ screen: "summary", set: viewState.set })}
        onBack={() => setViewState({ screen: "list" })}
      />
    );
  }

  // Summary view
  if (viewState.screen === "summary") {
    return (
      <StudySummary
        cards={viewState.set.cards}
        setName={viewState.set.name}
        onStudyAgain={() => setViewState({ screen: "player", set: viewState.set })}
        onBackToSets={() => setViewState({ screen: "list" })}
      />
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 md:p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // Empty state
  if (studySets.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <BookOpen className="h-12 w-12 mb-4 opacity-40" />
          <p className="text-sm">No study sets yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Create flashcards to start studying
          </p>
          <Button size="sm" className="mt-4 gap-1.5" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5" />
            Create Study Set
          </Button>
        </div>

        <StudySetDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditingSet(null); }}
          onSave={handleSave}
          onUpdate={handleUpdate}
          editingSet={editingSet}
        />
      </>
    );
  }

  // List view
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Study Sets</h2>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCreate}>
          <Plus className="h-3.5 w-3.5" />
          New Set
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {studySets.map((set) => (
          <div
            key={set.clientId}
            onClick={() => setViewState({ screen: "player", set })}
            className="group relative rounded-xl border bg-card p-5 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Layers className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-medium text-sm">{set.name}</h3>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => handleEdit(set, e)}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => handleDelete(set.clientId, e)}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{set.cards.length} cards</span>
              <span>{new Date(set.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      <StudySetDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingSet(null); }}
        onSave={handleSave}
        onUpdate={handleUpdate}
        editingSet={editingSet}
      />
    </div>
  );
}
