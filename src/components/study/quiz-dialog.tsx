"use client";

import { useState, useEffect } from "react";
import { type QuizQuestion, type LocalQuiz } from "@/lib/db/indexed-db";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, Check } from "lucide-react";

function emptyQuestion(): QuizQuestion {
  return {
    question: "",
    options: [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
      { text: "", isCorrect: false },
    ],
  };
}

interface QuizDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; questions: QuizQuestion[] }) => void;
  onUpdate?: (clientId: string, updates: Partial<LocalQuiz>) => void;
  editingQuiz?: LocalQuiz | null;
}

export function QuizDialog({ open, onClose, onSave, onUpdate, editingQuiz }: QuizDialogProps) {
  const [name, setName] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([emptyQuestion(), emptyQuestion()]);

  useEffect(() => {
    if (editingQuiz) {
      setName(editingQuiz.name);
      setQuestions(editingQuiz.questions.map((q) => ({
        ...q,
        options: [...q.options],
      })));
    } else if (open) {
      setName("");
      setQuestions([emptyQuestion(), emptyQuestion()]);
    }
  }, [editingQuiz, open]);

  const updateQuestion = (qi: number, text: string) => {
    setQuestions((prev) => prev.map((q, i) => (i === qi ? { ...q, question: text } : q)));
  };

  const updateOption = (qi: number, oi: number, text: string) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qi
          ? { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, text } : o)) }
          : q
      )
    );
  };

  const setCorrect = (qi: number, oi: number) => {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qi
          ? { ...q, options: q.options.map((o, j) => ({ ...o, isCorrect: j === oi })) }
          : q
      )
    );
  };

  const addQuestion = () => setQuestions((prev) => [...prev, emptyQuestion()]);

  const removeQuestion = (qi: number) => {
    if (questions.length <= 2) return;
    setQuestions((prev) => prev.filter((_, i) => i !== qi));
  };

  const validCount = questions.filter(
    (q) => q.question.trim() && q.options.every((o) => o.text.trim()) && q.options.some((o) => o.isCorrect)
  ).length;

  const canSave = name.trim() && validCount >= 2;

  const handleSubmit = () => {
    const valid = questions.filter(
      (q) => q.question.trim() && q.options.every((o) => o.text.trim())
    );
    if (editingQuiz && onUpdate) {
      onUpdate(editingQuiz.clientId, { name: name.trim(), questions: valid });
    } else {
      onSave({ name: name.trim(), questions: valid });
    }
    onClose();
  };

  const labels = ["A", "B", "C", "D"];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{editingQuiz ? "Edit Quiz" : "Create Quiz"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="space-y-2">
            <Label>Quiz Name</Label>
            <Input
              placeholder="e.g., Biology Chapter 5 Test"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Questions ({validCount} valid)</Label>
          </div>

          {questions.map((q, qi) => (
            <div key={qi} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Question {qi + 1}</span>
                <button
                  type="button"
                  onClick={() => removeQuestion(qi)}
                  disabled={questions.length <= 2}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <Input
                placeholder="Enter question..."
                value={q.question}
                onChange={(e) => updateQuestion(qi, e.target.value)}
              />

              <div className="space-y-1.5">
                {q.options.map((opt, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCorrect(qi, oi)}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        opt.isCorrect
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30 hover:border-primary/50"
                      }`}
                    >
                      {opt.isCorrect && <Check className="h-3 w-3" />}
                    </button>
                    <span className="text-xs font-medium text-muted-foreground w-4">{labels[oi]}</span>
                    <Input
                      className="h-8 text-sm"
                      placeholder={`Option ${labels[oi]}`}
                      value={opt.text}
                      onChange={(e) => updateOption(qi, oi, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/60">Click the circle to mark the correct answer</p>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" onClick={addQuestion}>
            <Plus className="h-3.5 w-3.5" />
            Add Question
          </Button>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!canSave} onClick={handleSubmit}>
            {editingQuiz ? "Update" : "Create"} Quiz
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
