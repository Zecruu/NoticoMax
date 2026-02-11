"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { FileText, Link2, Bell, ExternalLink } from "lucide-react";

interface SharedData {
  title: string;
  content: string;
  type: "note" | "url" | "reminder";
  url?: string;
  tags: string[];
  createdAt: string;
}

const typeIcons = {
  note: FileText,
  url: Link2,
  reminder: Bell,
};

export default function SharedNotePage() {
  const params = useParams();
  const [data, setData] = useState<SharedData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/share/${params.id}`);
      if (!res.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setData(await res.json());
      setLoading(false);
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-3">
          <img src="/logo.png" alt="NOTICO MAX" className="h-12 w-12 mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-3">
          <img src="/logo.png" alt="NOTICO MAX" className="h-12 w-12 mx-auto" />
          <h1 className="text-lg font-semibold">Note not found</h1>
          <p className="text-sm text-muted-foreground">
            This shared note may have been removed or the link is invalid.
          </p>
        </div>
      </div>
    );
  }

  const Icon = typeIcons[data.type];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-4 md:px-6">
          <img src="/logo.png" alt="NOTICO MAX" className="h-6 w-6" />
          <span className="text-sm font-semibold text-primary">NOTICO MAX</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4 md:p-8 space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs gap-1">
              <Icon className="h-3 w-3" />
              {data.type}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(data.createdAt).toLocaleDateString()}
            </span>
          </div>

          <h1 className="text-2xl font-bold">{data.title}</h1>
        </div>

        {data.type === "url" && data.url && (
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {data.url}
          </a>
        )}

        {data.content && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={data.content} />
          </div>
        )}

        {data.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
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
