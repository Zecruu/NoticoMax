"use client";

import { type StudyCard } from "@/lib/db/indexed-db";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw } from "lucide-react";

interface StudySummaryProps {
  cards: StudyCard[];
  setName: string;
  onStudyAgain: () => void;
  onBackToSets: () => void;
}

export function StudySummary({ cards, setName, onStudyAgain, onBackToSets }: StudySummaryProps) {
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">Study Complete</h2>
        <p className="text-sm text-muted-foreground">
          {setName} &mdash; {cards.length} cards reviewed
        </p>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Term
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Definition
              </th>
            </tr>
          </thead>
          <tbody>
            {cards.map((card, index) => (
              <tr
                key={index}
                className="border-b last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3 text-sm font-medium">{card.term}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{card.definition}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={onBackToSets} className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Sets
        </Button>
        <Button onClick={onStudyAgain} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          Study Again
        </Button>
      </div>
    </div>
  );
}
