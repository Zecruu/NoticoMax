"use client";

import { useState } from "react";
import { type LocalQuiz } from "@/lib/db/indexed-db";
import { Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface QuizShareButtonProps {
  quiz: LocalQuiz;
}

export function QuizShareButton({ quiz }: QuizShareButtonProps) {
  const [sharing, setSharing] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSharing(true);

    try {
      const res = await fetch("/api/share-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: quiz.clientId,
          name: quiz.name,
          questions: quiz.questions,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to share quiz");
        return;
      }

      const { shareId } = await res.json();
      const url = `${window.location.origin}/shared/quiz/${shareId}`;
      await navigator.clipboard.writeText(url);
      toast.success("Quiz link copied to clipboard!");
    } catch {
      toast.error("Failed to share quiz");
    } finally {
      setSharing(false);
    }
  };

  return (
    <button
      onClick={handleShare}
      disabled={sharing}
      className="rounded-md p-1.5 text-muted-foreground hover:text-primary hover:bg-muted transition-colors disabled:opacity-50"
    >
      {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
    </button>
  );
}
