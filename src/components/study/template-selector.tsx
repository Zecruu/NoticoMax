"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layers, ClipboardCheck } from "lucide-react";

export type StudyTemplate = "flashcards" | "quiz";

interface TemplateSelectorProps {
  value: StudyTemplate;
  onChange: (value: StudyTemplate) => void;
}

export function TemplateSelector({ value, onChange }: TemplateSelectorProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as StudyTemplate)}>
      <TabsList>
        <TabsTrigger value="flashcards" className="gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          Flashcards
        </TabsTrigger>
        <TabsTrigger value="quiz" className="gap-1.5">
          <ClipboardCheck className="h-3.5 w-3.5" />
          Multiple Choice
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
