"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createItem } from "@/lib/sync/sync-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { type ItemType } from "@/lib/db/indexed-db";

function ShareTargetContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sharedTitle = searchParams.get("title") || "";
  const sharedText = searchParams.get("text") || "";
  const sharedUrl = searchParams.get("url") || "";

  const [title, setTitle] = useState(sharedTitle || sharedUrl || "Shared item");
  const [content, setContent] = useState(sharedText);
  const [url, setUrl] = useState(sharedUrl);
  const [type, setType] = useState<ItemType>(sharedUrl ? "url" : "note");
  const [saving, setSaving] = useState(false);

  // If text looks like a URL, auto-detect
  useEffect(() => {
    if (!sharedUrl && sharedText && /^https?:\/\//i.test(sharedText.trim())) {
      setUrl(sharedText.trim());
      setType("url");
      setContent("");
    }
  }, [sharedUrl, sharedText]);

  const handleSave = async () => {
    setSaving(true);
    await createItem({
      type,
      title: title || "Untitled",
      content,
      url: type === "url" ? url : undefined,
      tags: [],
      pinned: false,
    });
    toast.success("Saved to NOTICO MAX");
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="NOTICO MAX" className="h-6 w-6" />
            <CardTitle className="text-base">Save to NOTICO MAX</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {(["note", "url"] as const).map((t) => (
              <Button
                key={t}
                variant={type === t ? "default" : "outline"}
                size="sm"
                onClick={() => setType(t)}
                className="capitalize"
              >
                {t}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
            />
          </div>

          {type === "url" && (
            <div className="space-y-2">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add a note..."
              rows={4}
            />
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" onClick={() => router.push("/")}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ShareTargetPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <ShareTargetContent />
    </Suspense>
  );
}
