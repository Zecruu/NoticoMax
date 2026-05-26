"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, Plus, Trash2, KeyRound, Wand2, Variable } from "lucide-react";
import { toast } from "@/lib/native-toast";

type Scope = "skills" | "envvars";

interface TokenRecord {
  id: string;
  name: string;
  last4: string;
  scopes: Scope[];
  last_used_at: string | null;
  created_at: string;
}

interface ClaudeTokensCardProps {
  title?: string;
}

const SCOPE_LABELS: Record<Scope, { label: string; description: string; Icon: typeof Wand2 }> = {
  skills: {
    label: "Skills",
    description: "/noticomax push/pull — Claude Code skills & Codex prompts",
    Icon: Wand2,
  },
  envvars: {
    label: "Env vars",
    description: "/noticomax-env push/pull — environment variables & secrets",
    Icon: Variable,
  },
};

export function ClaudeTokensCard({ title = "API tokens" }: ClaudeTokensCardProps) {
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<Set<Scope>>(new Set(["skills"]));

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

  function toggleScope(scope: Scope) {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        // Don't let the user uncheck the last remaining scope — a zero-scope token is useless
        if (next.size === 1) return prev;
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  }

  async function generate() {
    if (selectedScopes.size === 0) {
      toast.error("Select at least one scope");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/claude-tokens", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Claude Code",
          scopes: Array.from(selectedScopes),
        }),
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

      <div className="space-y-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name (e.g. Work laptop)"
          className="h-8 text-sm"
          disabled={creating}
        />

        <div className="rounded-md border p-2 space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Scopes
          </p>
          {(Object.entries(SCOPE_LABELS) as [Scope, typeof SCOPE_LABELS[Scope]][]).map(([scope, meta]) => {
            const ScopeIcon = meta.Icon;
            const checked = selectedScopes.has(scope);
            return (
              <label
                key={scope}
                className="flex items-start gap-2 cursor-pointer rounded p-1.5 hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleScope(scope)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer"
                  disabled={creating}
                />
                <ScopeIcon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{meta.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{meta.description}</p>
                </div>
              </label>
            );
          })}
          <p className="text-[10px] text-muted-foreground px-1.5">
            Grant the minimum a given machine needs — a skills-only token can&apos;t read your
            env vars, and vice versa.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 w-full"
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
          {tokens.map((t) => {
            const scopes = (t.scopes ?? []) as Scope[];
            return (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-md border px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    {scopes.length === 0 ? (
                      <Badge variant="outline" className="h-4 text-[9px] px-1 font-mono">
                        no scopes
                      </Badge>
                    ) : (
                      scopes.map((s) => (
                        <Badge
                          key={s}
                          variant="secondary"
                          className="h-4 text-[9px] px-1 font-mono"
                        >
                          {s}
                        </Badge>
                      ))
                    )}
                  </div>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
