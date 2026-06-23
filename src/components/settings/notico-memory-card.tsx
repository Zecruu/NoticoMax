"use client";

import { useEffect, useState } from "react";
import { Brain, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/native-toast";
import {
  clearNoticoLocalMemory,
  containsSensitiveNoticoMemory,
  emptyNoticoLocalMemory,
  getNoticoLocalMemory,
  hasNoticoLocalMemory,
  saveNoticoLocalMemory,
  type NoticoLocalMemory,
} from "@/lib/notico-local-memory";

export function NoticoMemoryCard() {
  const [memory, setMemory] = useState<NoticoLocalMemory>(() => emptyNoticoLocalMemory());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setMemory(getNoticoLocalMemory());
    setLoaded(true);
  }, []);

  const updateField =
    (field: keyof Pick<NoticoLocalMemory, "preferredName" | "likes" | "dislikes" | "preferences">) =>
    (value: string) => {
      setMemory((prev) => ({ ...prev, [field]: value }));
    };

  const handleSave = () => {
    if (containsSensitiveNoticoMemory(memory)) {
      toast.error("Notico memory is for preferences, not passwords, secrets, or tokens.");
      return;
    }
    const saved = saveNoticoLocalMemory(memory);
    setMemory(saved);
    toast.success("Notico memory saved on this device");
  };

  const handleClear = () => {
    if (!hasNoticoLocalMemory(memory)) return;
    if (!confirm("Clear Notico's local memory on this device?")) return;
    clearNoticoLocalMemory();
    setMemory(emptyNoticoLocalMemory());
    toast.success("Notico memory cleared");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Notico Memory
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Saved only on this device. Use this for your name, preferences, likes, and dislikes.
          Do not store passwords, API keys, payment details, or private credentials here.
        </p>

        <div className="space-y-2">
          <Label htmlFor="notico-preferred-name">Preferred name</Label>
          <Input
            id="notico-preferred-name"
            value={memory.preferredName}
            onChange={(e) => updateField("preferredName")(e.target.value)}
            placeholder="What should Notico call you?"
            autoComplete="name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notico-likes">Likes</Label>
          <Textarea
            id="notico-likes"
            value={memory.likes}
            onChange={(e) => updateField("likes")(e.target.value)}
            placeholder="Foods, workflows, formats, topics, routines..."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notico-dislikes">Dislikes</Label>
          <Textarea
            id="notico-dislikes"
            value={memory.dislikes}
            onChange={(e) => updateField("dislikes")(e.target.value)}
            placeholder="Things to avoid, formats you dislike, pet peeves..."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notico-preferences">Preferences / notes</Label>
          <Textarea
            id="notico-preferences"
            value={memory.preferences}
            onChange={(e) => updateField("preferences")(e.target.value)}
            placeholder="Lightweight preferences Notico should honor."
            rows={4}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button className="gap-1.5" onClick={handleSave} disabled={!loaded}>
            <Save className="h-3.5 w-3.5" />
            Save Memory
          </Button>
          <Button
            variant="outline"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={handleClear}
            disabled={!loaded || !hasNoticoLocalMemory(memory)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
