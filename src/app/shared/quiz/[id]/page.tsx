"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check, X, RotateCcw, ClipboardCheck } from "lucide-react";

interface QuizOption {
  text: string;
  isCorrect: boolean;
}

interface QuizQuestion {
  question: string;
  options: QuizOption[];
}

interface SharedQuizData {
  name: string;
  questions: QuizQuestion[];
  createdAt: string;
}

type PageState =
  | { screen: "loading" }
  | { screen: "not-found" }
  | { screen: "intro"; data: SharedQuizData }
  | { screen: "playing"; data: SharedQuizData }
  | { screen: "results"; data: SharedQuizData; answers: number[] };

export default function SharedQuizPage() {
  const params = useParams();
  const [state, setState] = useState<PageState>({ screen: "loading" });

  // Quiz player state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>([]);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/share-quiz/${params.id}`);
      if (!res.ok) {
        setState({ screen: "not-found" });
        return;
      }
      const data: SharedQuizData = await res.json();
      setState({ screen: "intro", data });
    }
    load();
  }, [params.id]);

  const startQuiz = (data: SharedQuizData) => {
    setCurrentIndex(0);
    setAnswers(new Array(data.questions.length).fill(null));
    setState({ screen: "playing", data });
  };

  const labels = ["A", "B", "C", "D"];

  // --- Loading ---
  if (state.screen === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <img src="/logo.png" alt="NOTICO MAX" className="h-12 w-12 mx-auto" />
          <p className="text-sm text-muted-foreground">Loading quiz...</p>
        </div>
      </div>
    );
  }

  // --- Not Found ---
  if (state.screen === "not-found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <img src="/logo.png" alt="NOTICO MAX" className="h-12 w-12 mx-auto" />
          <h1 className="text-lg font-semibold">Quiz not found</h1>
          <p className="text-sm text-muted-foreground">
            This shared quiz may have been removed or the link is invalid.
          </p>
        </div>
      </div>
    );
  }

  // --- Intro ---
  if (state.screen === "intro") {
    const { data } = state;
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-4 md:px-6">
            <img src="/logo.png" alt="NOTICO MAX" className="h-6 w-6" />
            <span className="text-sm font-semibold text-primary">NOTICO MAX</span>
          </div>
        </header>

        <main className="mx-auto max-w-md p-4 md:p-8">
          <div className="flex flex-col items-center text-center space-y-6 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10">
              <ClipboardCheck className="h-8 w-8 text-orange-500" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">{data.name}</h1>
              <p className="text-sm text-muted-foreground">
                {data.questions.length} questions &middot; Multiple choice
              </p>
            </div>
            <Button size="lg" className="gap-2" onClick={() => startQuiz(data)}>
              Start Quiz
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </main>

        <footer className="border-t py-6 text-center">
          <p className="text-xs text-muted-foreground">
            Shared with{" "}
            <a href="/" className="text-primary hover:underline font-medium">
              NOTICO MAX
            </a>
          </p>
        </footer>
      </div>
    );
  }

  // --- Playing ---
  if (state.screen === "playing") {
    const { data } = state;
    const current = data.questions[currentIndex];
    const selected = answers[currentIndex];
    const isLast = currentIndex === data.questions.length - 1;
    const allAnswered = answers.every((a) => a !== null);

    const selectOption = (optionIndex: number) => {
      setAnswers((prev) => prev.map((a, i) => (i === currentIndex ? optionIndex : a)));
    };

    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-4 md:px-6">
            <img src="/logo.png" alt="NOTICO MAX" className="h-6 w-6" />
            <span className="text-sm font-semibold text-primary">NOTICO MAX</span>
            <span className="ml-auto text-sm text-muted-foreground">{data.name}</span>
          </div>
        </header>

        <main className="mx-auto max-w-2xl p-4 md:p-8 space-y-6">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Question {currentIndex + 1} of {data.questions.length}</span>
              <span>{answers.filter((a) => a !== null).length} answered</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / data.questions.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Question */}
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-lg font-medium mb-6">{current.question}</h3>
            <div className="space-y-3">
              {current.options.map((opt, oi) => (
                <button
                  key={oi}
                  onClick={() => selectOption(oi)}
                  className={`w-full flex items-center gap-3 rounded-lg border p-4 text-left transition-all ${
                    selected === oi
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/40 hover:bg-muted/50"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                      selected === oi
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {labels[oi]}
                  </span>
                  <span className="text-sm">{opt.text}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => i - 1)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Previous
            </Button>

            {isLast ? (
              <Button
                size="sm"
                className="gap-1.5"
                disabled={!allAnswered}
                onClick={() => setState({ screen: "results", data, answers: answers as number[] })}
              >
                <Check className="h-3.5 w-3.5" />
                Submit Quiz
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setCurrentIndex((i) => i + 1)}
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </main>
      </div>
    );
  }

  // --- Results ---
  if (state.screen === "results") {
    const { data, answers: finalAnswers } = state;
    const correctCount = data.questions.reduce((count, q, i) => {
      return count + (q.options[finalAnswers[i]]?.isCorrect ? 1 : 0);
    }, 0);
    const percentage = Math.round((correctCount / data.questions.length) * 100);

    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-4 md:px-6">
            <img src="/logo.png" alt="NOTICO MAX" className="h-6 w-6" />
            <span className="text-sm font-semibold text-primary">NOTICO MAX</span>
          </div>
        </header>

        <main className="mx-auto max-w-2xl p-4 md:p-8 space-y-6">
          {/* Score */}
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold">Quiz Complete</h2>
            <p className="text-sm text-muted-foreground">{data.name}</p>
            <div className="flex items-center justify-center gap-3 py-4">
              <span
                className={`text-4xl font-bold ${
                  percentage >= 70 ? "text-green-500" : percentage >= 50 ? "text-yellow-500" : "text-red-500"
                }`}
              >
                {percentage}%
              </span>
              <span className="text-sm text-muted-foreground">
                {correctCount} / {data.questions.length} correct
              </span>
            </div>
          </div>

          {/* Review */}
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Question</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Your Answer</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Correct</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase w-12"></th>
                </tr>
              </thead>
              <tbody>
                {data.questions.map((q, i) => {
                  const userAnswer = q.options[finalAnswers[i]];
                  const correctOption = q.options.find((o) => o.isCorrect);
                  const isCorrect = userAnswer?.isCorrect;

                  return (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-3 font-medium">{q.question}</td>
                      <td className={`px-4 py-3 ${isCorrect ? "text-green-600" : "text-red-500"}`}>
                        {labels[finalAnswers[i]]}. {userAnswer?.text}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {!isCorrect && (
                          <>{labels[q.options.findIndex((o) => o.isCorrect)]}. {correctOption?.text}</>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isCorrect ? (
                          <Check className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-4 w-4 text-red-500 mx-auto" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-3">
            <Button className="gap-1.5" onClick={() => startQuiz(data)}>
              <RotateCcw className="h-3.5 w-3.5" />
              Retake Quiz
            </Button>
          </div>
        </main>

        <footer className="border-t py-6 text-center">
          <p className="text-xs text-muted-foreground">
            Shared with{" "}
            <a href="/" className="text-primary hover:underline font-medium">
              NOTICO MAX
            </a>
          </p>
        </footer>
      </div>
    );
  }

  return null;
}
