"use client";

import { useState, useEffect } from "react";
import { type StudyCard, type LocalStudySet } from "@/lib/db/indexed-db";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Upload } from "lucide-react";

interface StudySetDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; cards: StudyCard[] }) => void;
  onUpdate?: (clientId: string, updates: Partial<LocalStudySet>) => void;
  editingSet?: LocalStudySet | null;
}

export function StudySetDialog({ open, onClose, onSave, onUpdate, editingSet }: StudySetDialogProps) {
  const [name, setName] = useState("");
  const [cards, setCards] = useState<StudyCard[]>([{ term: "", definition: "" }, { term: "", definition: "" }]);
  const [importMode, setImportMode] = useState(false);
  const [importText, setImportText] = useState("");

  useEffect(() => {
    if (editingSet) {
      setName(editingSet.name);
      setCards(editingSet.cards.length > 0 ? [...editingSet.cards] : [{ term: "", definition: "" }, { term: "", definition: "" }]);
    } else {
      setName("");
      setCards([{ term: "", definition: "" }, { term: "", definition: "" }]);
    }
    setImportMode(false);
    setImportText("");
  }, [editingSet, open]);

  const handleAddCard = () => {
    setCards([...cards, { term: "", definition: "" }]);
  };

  const handleRemoveCard = (index: number) => {
    if (cards.length <= 2) return;
    setCards(cards.filter((_, i) => i !== index));
  };

  const handleCardChange = (index: number, field: "term" | "definition", value: string) => {
    const updated = [...cards];
    updated[index] = { ...updated[index], [field]: value };
    setCards(updated);
  };

  const handleImport = () => {
    const lines = importText.trim().split("\n").filter(Boolean);
    const imported: StudyCard[] = [];
    for (const line of lines) {
      const sep = line.includes("\t") ? "\t" : line.includes(" - ") ? " - " : ",";
      const parts = line.split(sep);
      if (parts.length >= 2) {
        imported.push({ term: parts[0].trim(), definition: parts.slice(1).join(sep).trim() });
      }
    }
    if (imported.length > 0) {
      setCards([...cards.filter(c => c.term || c.definition), ...imported]);
      setImportMode(false);
      setImportText("");
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const validCards = cards.filter((c) => c.term.trim() && c.definition.trim());
    if (validCards.length < 2) return;

    if (editingSet && onUpdate) {
      onUpdate(editingSet.clientId, { name: name.trim(), cards: validCards });
    } else {
      onSave({ name: name.trim(), cards: validCards });
    }
    onClose();
  };

  const validCount = cards.filter((c) => c.term.trim() && c.definition.trim()).length;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{editingSet ? "Edit Study Set" : "New Study Set"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          <div className="space-y-2">
            <Label htmlFor="setName">Set Name</Label>
            <Input
              id="setName"
              placeholder="e.g., Biology Chapter 5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Cards ({validCount} valid)</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-xs h-7"
                onClick={() => setImportMode(!importMode)}
              >
                <Upload className="h-3 w-3" />
                Import
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-xs h-7"
                onClick={handleAddCard}
              >
                <Plus className="h-3 w-3" />
                Add Card
              </Button>
            </div>
          </div>

          {importMode && (
            <div className="space-y-2 rounded-md border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Paste terms and definitions, one per line. Use tab, comma, or &quot; - &quot; to separate.
              </p>
              <Textarea
                placeholder={"apple\tA round fruit\ndog\tA loyal animal"}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={4}
              />
              <Button size="sm" onClick={handleImport}>Import Cards</Button>
            </div>
          )}

          <div className="space-y-3">
            {cards.map((card, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1 space-y-1.5">
                  <Input
                    placeholder="Term"
                    value={card.term}
                    onChange={(e) => handleCardChange(index, "term", e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="Definition"
                    value={card.definition}
                    onChange={(e) => handleCardChange(index, "definition", e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <button
                  onClick={() => handleRemoveCard(index)}
                  disabled={cards.length <= 2}
                  className="mt-1 rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors disabled:opacity-30 disabled:hover:text-muted-foreground disabled:hover:bg-transparent"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || validCount < 2}>
            {editingSet ? "Save Changes" : "Create Set"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
