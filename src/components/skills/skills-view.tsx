"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Wand2,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  Globe,
  Lock,
  ChevronDown,
  ChevronRight,
  FileCode,
} from "lucide-react";
import { toast } from "@/lib/native-toast";
import { Badge } from "@/components/ui/badge";

interface SupportingFile {
  filename: string;
  content: string;
}

interface CloudSkill {
  skillId: string;
  name: string;
  description: string;
  frontmatter: Record<string, unknown>;
  content: string;
  supportingFiles: SupportingFile[];
  tags: string[];
  isPublic: boolean;
  updatedAt: string;
}

export function SkillsView() {
  const [skills, setSkills] = useState<CloudSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [showContent, setShowContent] = useState<Set<string>>(new Set());

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const sessionToken = localStorage.getItem("noticomax_session");
      if (!sessionToken) {
        setSkills([]);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      params.set("public", "true");

      const res = await fetch(`/api/skills?${params.toString()}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      if (!res.ok) {
        toast.error("Failed to load skills");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setSkills(data.skills || []);
    } catch {
      toast.error("Failed to connect");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const handleDelete = async (skillId: string, name: string) => {
    try {
      const sessionToken = localStorage.getItem("noticomax_session");
      if (!sessionToken) return;

      const res = await fetch(`/api/skills/${skillId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      if (res.ok) {
        setSkills((prev) => prev.filter((s) => s.skillId !== skillId));
        toast.success(`Deleted ${name}`);
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to connect");
    }
  };

  const handleCopySkill = (skill: CloudSkill) => {
    // Reconstruct the SKILL.md content
    const frontmatterLines = Object.entries(skill.frontmatter)
      .map(([key, value]) => {
        if (typeof value === "string") return `${key}: ${value}`;
        if (typeof value === "boolean") return `${key}: ${value}`;
        return `${key}: ${JSON.stringify(value)}`;
      })
      .join("\n");

    const skillMd = `---\n${frontmatterLines}\n---\n\n${skill.content}`;
    navigator.clipboard.writeText(skillMd);
    toast.success(`Copied ${skill.name} SKILL.md`);
  };

  const handleCopyBootstrap = () => {
    const cmd = `curl -s ${window.location.origin}/api/skills/bootstrap -o ~/.claude/skills/noticomax/SKILL.md --create-dirs`;
    navigator.clipboard.writeText(cmd);
    toast.success("Bootstrap command copied");
  };

  const toggleExpand = (skillId: string) => {
    setExpandedSkill((prev) => (prev === skillId ? null : skillId));
  };

  const toggleContent = (skillId: string) => {
    setShowContent((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  };

  const isLoggedIn = !!localStorage.getItem("noticomax_session");

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6 space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              Claude Skills
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={fetchSkills}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isLoggedIn ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Log in to view and manage your Claude Code skills.
            </p>
          ) : (
            <>
              {/* Setup hint */}
              <div className="rounded-md border border-dashed p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  To sync skills on a new computer, run this in your terminal:
                </p>
                <div className="flex gap-2">
                  <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 font-mono truncate">
                    curl -s {window.location.origin}/api/skills/bootstrap -o
                    ~/.claude/skills/noticomax/SKILL.md --create-dirs
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 shrink-0"
                    onClick={handleCopyBootstrap}
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Then use{" "}
                  <code className="bg-muted px-1 rounded text-[11px]">
                    /noticomax pull
                  </code>{" "}
                  in Claude Code to download all your skills.
                </p>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-sm pl-8"
                />
              </div>

              {/* Skills list */}
              {loading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : skills.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {searchQuery
                    ? "No skills match your search."
                    : "No skills synced yet. Use /noticomax push in Claude Code to upload skills."}
                </p>
              ) : (
                <div className="space-y-2">
                  {skills.map((skill) => (
                    <div
                      key={skill.skillId}
                      className="rounded-md border transition-colors"
                    >
                      {/* Skill header */}
                      <div
                        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleExpand(skill.skillId)}
                      >
                        {expandedSkill === skill.skillId ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium font-mono">
                              /{skill.name}
                            </span>
                            {skill.isPublic ? (
                              <Globe className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <Lock className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                          {skill.description && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {skill.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopySkill(skill);
                            }}
                            title="Copy SKILL.md"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(skill.skillId, skill.name);
                            }}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Expanded content */}
                      {expandedSkill === skill.skillId && (
                        <div className="border-t px-3 py-3 space-y-3">
                          {/* Tags */}
                          {skill.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {skill.tags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* Meta */}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>
                              Updated{" "}
                              {new Date(skill.updatedAt).toLocaleDateString()}
                            </span>
                            {skill.supportingFiles.length > 0 && (
                              <span>
                                {skill.supportingFiles.length} supporting file
                                {skill.supportingFiles.length !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>

                          {/* Content toggle */}
                          <button
                            onClick={() => toggleContent(skill.skillId)}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showContent.has(skill.skillId) ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                            {showContent.has(skill.skillId)
                              ? "Hide content"
                              : "Show content"}
                          </button>

                          {showContent.has(skill.skillId) && (
                            <pre className="rounded bg-muted p-3 text-xs font-mono overflow-auto max-h-64 whitespace-pre-wrap">
                              {skill.content}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
