"use client";

import { useState } from "react";
import { type QuizQuestion } from "@/lib/db/indexed-db";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

interface QuizPlayerProps {
  questions: QuizQuestion[];
  quizName: string;
  onDone: (answers: number[]) => void;
  onBack: () => void;
}

export function QuizPlayer({ questions, quizName, onDone, onBack }: QuizPlayerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(
    () => new Array(questions.length).fill(null)
  );

  const current = questions[currentIndex];
  const selected = answers[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const allAnswered = answers.every((a) => a !== null);

  const selectOption = (optionIndex: number) => {
    setAnswers((prev) => prev.map((a, i) => (i === currentIndex ? optionIndex : a)));
  };

  const labels = ["A", "B", "C", "D"];

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <span className="text-sm text-muted-foreground">{quizName}</span>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Question {currentIndex + 1} of {questions.length}</span>
          <span>{answers.filter((a) => a !== null).length} answered</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
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
            onClick={() => onDone(answers as number[])}
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
    </div>
  );
}
