"use client";

import { useState, useCallback } from "react";
import { type LocalStudySet, type LocalQuiz } from "@/lib/db/indexed-db";
import { useStudySets } from "@/hooks/use-study-sets";
import { useQuizzes } from "@/hooks/use-quizzes";
import { TemplateSelector, type StudyTemplate } from "./template-selector";
import { StudySetDialog } from "./study-set-dialog";
import { FlashcardPlayer } from "./flashcard-player";
import { StudySummary } from "./study-summary";
import { QuizDialog } from "./quiz-dialog";
import { QuizPlayer } from "./quiz-player";
import { QuizSummary } from "./quiz-summary";
import { QuizShareButton } from "./quiz-share-button";
import { Button } from "@/components/ui/button";
import { BookOpen, Plus, Pencil, Trash2, Layers, ClipboardCheck } from "lucide-react";
import { toast } from "@/lib/native-toast";

type ViewState =
  | { screen: "list" }
  | { screen: "player"; set: LocalStudySet }
  | { screen: "summary"; set: LocalStudySet }
  | { screen: "quiz-player"; quiz: LocalQuiz }
  | { screen: "quiz-summary"; quiz: LocalQuiz; answers: number[] };

export function StudyView() {
  const { studySets, loading: setsLoading, addStudySet, editStudySet, removeStudySet } = useStudySets();
  const { quizzes, loading: quizzesLoading, addQuiz, editQuiz, removeQuiz } = useQuizzes();

  const [template, setTemplate] = useState<StudyTemplate>("flashcards");
  const [viewState, setViewState] = useState<ViewState>({ screen: "list" });

  // Flashcard dialog state
  const [setDialogOpen, setSetDialogOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<LocalStudySet | null>(null);

  // Quiz dialog state
  const [quizDialogOpen, setQuizDialogOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<LocalQuiz | null>(null);

  // Template change resets to list
  const handleTemplateChange = useCallback((t: StudyTemplate) => {
    setTemplate(t);
    setViewState({ screen: "list" });
  }, []);

  // --- Flashcard handlers ---
  const handleCreateSet = useCallback(() => { setEditingSet(null); setSetDialogOpen(true); }, []);
  const handleEditSet = useCallback((set: LocalStudySet, e: React.MouseEvent) => {
    e.stopPropagation(); setEditingSet(set); setSetDialogOpen(true);
  }, []);
  const handleDeleteSet = useCallback(async (clientId: string, e: React.MouseEvent) => {
    e.stopPropagation(); await removeStudySet(clientId); toast.success("Study set deleted");
  }, [removeStudySet]);
  const handleSaveSet = useCallback(async (data: { name: string; cards: { term: string; definition: string }[] }) => {
    await addStudySet(data); toast.success("Study set created");
  }, [addStudySet]);
  const handleUpdateSet = useCallback(async (clientId: string, updates: Partial<LocalStudySet>) => {
    await editStudySet(clientId, updates); toast.success("Study set updated");
  }, [editStudySet]);

  // --- Quiz handlers ---
  const handleCreateQuiz = useCallback(() => { setEditingQuiz(null); setQuizDialogOpen(true); }, []);
  const handleEditQuiz = useCallback((quiz: LocalQuiz, e: React.MouseEvent) => {
    e.stopPropagation(); setEditingQuiz(quiz); setQuizDialogOpen(true);
  }, []);
  const handleDeleteQuiz = useCallback(async (clientId: string, e: React.MouseEvent) => {
    e.stopPropagation(); await removeQuiz(clientId); toast.success("Quiz deleted");
  }, [removeQuiz]);
  const handleSaveQuiz = useCallback(async (data: { name: string; questions: LocalQuiz["questions"] }) => {
    await addQuiz(data); toast.success("Quiz created");
  }, [addQuiz]);
  const handleUpdateQuiz = useCallback(async (clientId: string, updates: Partial<LocalQuiz>) => {
    await editQuiz(clientId, updates); toast.success("Quiz updated");
  }, [editQuiz]);

  // --- Flashcard Player / Summary ---
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

  // --- Quiz Player / Summary ---
  if (viewState.screen === "quiz-player") {
    return (
      <QuizPlayer
        questions={viewState.quiz.questions}
        quizName={viewState.quiz.name}
        onDone={(answers) => setViewState({ screen: "quiz-summary", quiz: viewState.quiz, answers })}
        onBack={() => setViewState({ screen: "list" })}
      />
    );
  }
  if (viewState.screen === "quiz-summary") {
    return (
      <QuizSummary
        questions={viewState.quiz.questions}
        answers={viewState.answers}
        quizName={viewState.quiz.name}
        onRetake={() => setViewState({ screen: "quiz-player", quiz: viewState.quiz })}
        onBackToQuizzes={() => setViewState({ screen: "list" })}
      />
    );
  }

  // --- List views ---
  const loading = template === "flashcards" ? setsLoading : quizzesLoading;

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <TemplateSelector value={template} onChange={handleTemplateChange} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <TemplateSelector value={template} onChange={handleTemplateChange} />

      {/* ===== FLASHCARDS TAB ===== */}
      {template === "flashcards" && (
        <>
          {studySets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <BookOpen className="h-12 w-12 mb-4 opacity-40" />
              <p className="text-sm">No study sets yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Create flashcards to start studying</p>
              <Button size="sm" className="mt-4 gap-1.5" onClick={handleCreateSet}>
                <Plus className="h-3.5 w-3.5" />
                Create Study Set
              </Button>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Study Sets</h2>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCreateSet}>
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
                        <button onClick={(e) => handleEditSet(set, e)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={(e) => handleDeleteSet(set.clientId, e)} className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors">
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
            </>
          )}

          <StudySetDialog
            open={setDialogOpen}
            onClose={() => { setSetDialogOpen(false); setEditingSet(null); }}
            onSave={handleSaveSet}
            onUpdate={handleUpdateSet}
            editingSet={editingSet}
          />
        </>
      )}

      {/* ===== QUIZ TAB ===== */}
      {template === "quiz" && (
        <>
          {quizzes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mb-4 opacity-40" />
              <p className="text-sm">No quizzes yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Create a multiple choice quiz to test yourself</p>
              <Button size="sm" className="mt-4 gap-1.5" onClick={handleCreateQuiz}>
                <Plus className="h-3.5 w-3.5" />
                Create Quiz
              </Button>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Quizzes</h2>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCreateQuiz}>
                  <Plus className="h-3.5 w-3.5" />
                  New Quiz
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {quizzes.map((quiz) => (
                  <div
                    key={quiz.clientId}
                    onClick={() => setViewState({ screen: "quiz-player", quiz })}
                    className="group relative rounded-xl border bg-card p-5 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
                          <ClipboardCheck className="h-4 w-4 text-orange-500" />
                        </div>
                        <h3 className="font-medium text-sm">{quiz.name}</h3>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <QuizShareButton quiz={quiz} />
                        <button onClick={(e) => handleEditQuiz(quiz, e)} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={(e) => handleDeleteQuiz(quiz.clientId, e)} className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{quiz.questions.length} questions</span>
                      <span>{new Date(quiz.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <QuizDialog
            open={quizDialogOpen}
            onClose={() => { setQuizDialogOpen(false); setEditingQuiz(null); }}
            onSave={handleSaveQuiz}
            onUpdate={handleUpdateQuiz}
            editingQuiz={editingQuiz}
          />
        </>
      )}
    </div>
  );
}
