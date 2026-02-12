"use client";

import { useState, useCallback } from "react";
import { type StudyCard } from "@/lib/db/indexed-db";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Shuffle, Check, RotateCcw } from "lucide-react";

interface FlashcardPlayerProps {
  cards: StudyCard[];
  setName: string;
  onDone: () => void;
  onBack: () => void;
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function FlashcardPlayer({ cards, setName, onDone, onBack }: FlashcardPlayerProps) {
  const [mode, setMode] = useState<"choose" | "playing">("choose");
  const [termFirst, setTermFirst] = useState(true);
  const [shuffledCards, setShuffledCards] = useState<StudyCard[]>(cards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const startStudy = useCallback((showTermFirst: boolean) => {
    setTermFirst(showTermFirst);
    setShuffledCards([...cards]);
    setCurrentIndex(0);
    setFlipped(false);
    setMode("playing");
  }, [cards]);

  const handleFlip = () => setFlipped(!flipped);

  const handleNext = () => {
    if (currentIndex < shuffledCards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setFlipped(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setFlipped(false);
    }
  };

  const handleShuffle = () => {
    setShuffledCards(shuffleArray(shuffledCards));
    setCurrentIndex(0);
    setFlipped(false);
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setFlipped(false);
  };

  if (mode === "choose") {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 max-w-md mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">{setName}</h2>
          <p className="text-sm text-muted-foreground">{cards.length} cards</p>
        </div>

        <div className="space-y-3 w-full">
          <p className="text-sm font-medium text-center text-muted-foreground">
            What do you want to see first?
          </p>
          <Button
            className="w-full h-12 text-base"
            onClick={() => startStudy(true)}
          >
            Start with Term
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 text-base"
            onClick={() => startStudy(false)}
          >
            Start with Definition
          </Button>
        </div>

        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Sets
        </Button>
      </div>
    );
  }

  const card = shuffledCards[currentIndex];
  const front = termFirst ? card.term : card.definition;
  const back = termFirst ? card.definition : card.term;
  const frontLabel = termFirst ? "Term" : "Definition";
  const backLabel = termFirst ? "Definition" : "Term";
  const isLast = currentIndex === shuffledCards.length - 1;

  return (
    <div className="flex flex-col items-center py-8 px-4 max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="w-full flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <span className="text-sm text-muted-foreground font-medium">
          {currentIndex + 1} / {shuffledCards.length}
        </span>
        <Button variant="ghost" size="sm" onClick={handleShuffle} className="gap-1.5">
          <Shuffle className="h-3.5 w-3.5" />
          Shuffle
        </Button>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / shuffledCards.length) * 100}%` }}
        />
      </div>

      {/* Flashcard */}
      <div
        className="w-full cursor-pointer"
        style={{ perspective: "1000px" }}
        onClick={handleFlip}
      >
        <div
          className="relative w-full transition-transform duration-500"
          style={{
            transformStyle: "preserve-3d",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0)",
          }}
        >
          {/* Front */}
          <div
            className="w-full min-h-[280px] rounded-2xl border-2 bg-card p-8 flex flex-col items-center justify-center text-center shadow-lg"
            style={{ backfaceVisibility: "hidden" }}
          >
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-4">
              {frontLabel}
            </span>
            <p className="text-2xl font-semibold leading-relaxed">{front}</p>
            <p className="text-xs text-muted-foreground mt-6">Tap to flip</p>
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 w-full min-h-[280px] rounded-2xl border-2 border-primary/30 bg-primary/5 p-8 flex flex-col items-center justify-center text-center shadow-lg"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <span className="text-[10px] font-medium text-primary uppercase tracking-wider mb-4">
              {backLabel}
            </span>
            <p className="text-xl leading-relaxed">{back}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3 w-full">
        <Button
          variant="outline"
          size="lg"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="flex-1 gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {isLast ? (
          <Button
            size="lg"
            onClick={onDone}
            className="flex-1 gap-1.5"
          >
            <Check className="h-4 w-4" />
            Done
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={handleNext}
            className="flex-1 gap-1.5"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Restart */}
      <Button variant="ghost" size="sm" onClick={handleRestart} className="gap-1.5 text-muted-foreground">
        <RotateCcw className="h-3 w-3" />
        Start Over
      </Button>
    </div>
  );
}
