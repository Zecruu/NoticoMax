"use client";

import { type QuizQuestion } from "@/lib/db/indexed-db";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Check, X } from "lucide-react";

interface QuizSummaryProps {
  questions: QuizQuestion[];
  answers: number[];
  quizName: string;
  onRetake: () => void;
  onBackToQuizzes: () => void;
}

export function QuizSummary({ questions, answers, quizName, onRetake, onBackToQuizzes }: QuizSummaryProps) {
  const correctCount = questions.reduce((count, q, i) => {
    return count + (q.options[answers[i]]?.isCorrect ? 1 : 0);
  }, 0);

  const percentage = Math.round((correctCount / questions.length) * 100);
  const labels = ["A", "B", "C", "D"];

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      {/* Score */}
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold">Quiz Complete</h2>
        <p className="text-sm text-muted-foreground">{quizName}</p>
        <div className="flex items-center justify-center gap-3 py-4">
          <span
            className={`text-4xl font-bold ${
              percentage >= 70 ? "text-green-500" : percentage >= 50 ? "text-yellow-500" : "text-red-500"
            }`}
          >
            {percentage}%
          </span>
          <span className="text-sm text-muted-foreground">
            {correctCount} / {questions.length} correct
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
            {questions.map((q, i) => {
              const userAnswer = q.options[answers[i]];
              const correctOption = q.options.find((o) => o.isCorrect);
              const isCorrect = userAnswer?.isCorrect;

              return (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{q.question}</td>
                  <td className={`px-4 py-3 ${isCorrect ? "text-green-600" : "text-red-500"}`}>
                    {labels[answers[i]]}. {userAnswer?.text}
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
        <Button variant="outline" className="gap-1.5" onClick={onBackToQuizzes}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Quizzes
        </Button>
        <Button className="gap-1.5" onClick={onRetake}>
          <RotateCcw className="h-3.5 w-3.5" />
          Retake Quiz
        </Button>
      </div>
    </div>
  );
}
