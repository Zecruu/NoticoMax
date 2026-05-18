"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Plus, Trash2, KeyRound } from "lucide-react";
import { toast } from "@/lib/native-toast";

interface TokenRecord {
  id: string;
  name: string;
  last4: string;
  last_used_at: string | null;
  created_at: string;
}

interface ClaudeTokensCardProps {
  // Label tweaks so the same card serves the Claude and Codex integration sections.
  title?: string;
}

export function ClaudeTokensCard({ title = "API tokens" }: ClaudeTokensCardProps) {
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/claude-tokens", { credentials: "include" });
      if (!res.ok) {
        if (res.status !== 401) toast.error("Failed to load tokens");
        setTokens([]);
        return;
      }
      const data = await res.json();
      setTokens(data.tokens ?? []);
    } catch {
      toast.error("Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function generate() {
    setCreating(true);
    try {
      const res = await fetch("/api/claude-tokens", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Claude Code" }),
      });
      if (!res.ok) {
        toast.error("Failed to generate token");
        return;
      }
      const data = await res.json();
      setRevealed(data.token);
      setName("");
      refresh();
    } catch {
      toast.error("Failed to generate token");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this token? Any Claude Code instance using it will stop syncing.")) return;
    try {
      const res = await fetch(`/api/claude-tokens/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("Failed to revoke");
        return;
      }
      setTokens((prev) => prev.filter((t) => t.id !== id));
      toast.success("Token revoked");
    } catch {
      toast.error("Failed to revoke");
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <KeyRound className="h-3 w-3" />
        {title}
      </p>

      {revealed && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
          <p className="text-xs font-medium">Your new token (copy now — it won&apos;t be shown again):</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono break-all">
              {revealed}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(revealed);
                toast.success("Token copied");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRevealed(null)}>
            Done
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name (e.g. Work laptop)"
          className="h-8 text-sm"
          disabled={creating}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 shrink-0"
          onClick={generate}
          disabled={creating}
        >
          <Plus className="h-3.5 w-3.5" />
          Generate
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No tokens yet. Generate one to connect Claude Code / Codex CLI.
        </p>
      ) : (
        <div className="space-y-1.5">
          {tokens.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.name}</p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  sk_nm_…{t.last4}
                  {t.last_used_at
                    ? ` · used ${new Date(t.last_used_at).toLocaleDateString()}`
                    : " · never used"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                onClick={() => revoke(t.id)}
                title="Revoke"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
