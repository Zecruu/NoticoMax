"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Copy,
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ChevronDown,
  Lock,
} from "lucide-react";
import { toast } from "@/lib/native-toast";
import {
  getEnvVars,
  addEnvVar,
  removeEnvVar,
  updateEnvVar,
  type EnvVar,
  getCredentials,
  addCredential,
  updateCredential,
  removeCredential,
  type Credential,
} from "@/lib/sync/sync-engine";

type EntryTab = "logins" | "envvars";
type Removal = { id: string; label: string; tab: EntryTab };

export function PasswordsView({
  initialTab = "logins",
}: { initialTab?: EntryTab } = {}) {
  const [tab, setTab] = useState<EntryTab>(initialTab);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [project, setProject] = useState("");
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [logins, variables] = await Promise.all([
        getCredentials(),
        getEnvVars(),
      ]);
      setCredentials(logins);
      setEnvVars(variables);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    setSyncEnabled(localStorage.getItem("noticomax_env_sync") === "true");
    const conceal = () => {
      if (document.hidden) {
        setRevealedId(null);
        setExpandedId(null);
      }
    };
    document.addEventListener("visibilitychange", conceal);
    return () => document.removeEventListener("visibilitychange", conceal);
  }, []);

  useEffect(() => {
    if (!revealedId) return;
    const timer = window.setTimeout(() => setRevealedId(null), 30_000);
    return () => window.clearTimeout(timer);
  }, [revealedId]);

  const needle = query.trim().toLocaleLowerCase();
  // Only metadata is searchable. Secret values never participate in results.
  const logins = credentials.filter((c) =>
    `${c.label} ${c.username}`.toLocaleLowerCase().includes(needle)
  );
  const groups = useMemo(() => {
    const result = new Map<string, EnvVar[]>();
    for (const env of envVars) {
      const group = env.project || "Default";
      if (!`${group} ${env.name}`.toLocaleLowerCase().includes(needle))
        continue;
      result.set(group, [...(result.get(group) ?? []), env]);
    }
    return [...result.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [envVars, needle]);
  const count =
    tab === "logins"
      ? logins.length
      : groups.reduce((n, [, vars]) => n + vars.length, 0);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(
        "Couldn't copy. Try again, or reveal the value to copy it manually."
      );
    }
  };
  const closeEditor = () => {
    if (busyRef.current) return;
    setEditorOpen(false);
    setEditingId(null);
    setName("");
    setUsername("");
    setSecret("");
    setProject("");
  };
  const openEditor = (entry?: EnvVar | Credential) => {
    setRevealedId(null);
    setEditingId(entry?.clientId ?? null);
    setName(entry ? ("label" in entry ? entry.label : entry.name) : "");
    setSecret(
      entry ? ("password" in entry ? entry.password : entry.value) : ""
    );
    setProject(entry && "project" in entry ? entry.project : "");
    setUsername(entry && "username" in entry ? entry.username : "");
    setEditorOpen(true);
  };
  const save = async () => {
    if (
      busyRef.current ||
      !name.trim() ||
      !secret ||
      (tab === "logins" && !username.trim())
    )
      return;
    const projectName = project.trim() || "Default";
    if (
      tab === "envvars" &&
      envVars.some(
        (e) =>
          e.clientId !== editingId &&
          e.name === name.trim() &&
          e.project === projectName
      )
    ) {
      toast.error(`${name.trim()} already exists in ${projectName}`);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      if (tab === "logins" && editingId)
        await updateCredential(
          editingId,
          name.trim(),
          username.trim(),
          secret,
          syncEnabled
        );
      else if (tab === "logins")
        await addCredential(name.trim(), username.trim(), secret, syncEnabled);
      else if (editingId)
        await updateEnvVar(
          editingId,
          name.trim(),
          secret,
          projectName,
          syncEnabled
        );
      else await addEnvVar(name.trim(), secret, projectName, syncEnabled);
      // A refresh failure after a successful write must not invite a duplicate save.
      busyRef.current = false;
      closeEditor();
      await reload();
      toast.success(
        editingId
          ? tab === "logins"
            ? "Login updated"
            : "Variable updated"
          : tab === "logins"
          ? "Login saved"
          : "Variable saved"
      );
    } catch {
      toast.error("Couldn't save. Your entry is still here. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!removal || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (removal.tab === "logins")
        await removeCredential(removal.id, syncEnabled);
      else await removeEnvVar(removal.id, syncEnabled);
      setRevealedId(null);
      setExpandedId(null);
      setRemoval(null);
      await reload();
      toast.success("Entry removed");
    } catch {
      toast.error("Couldn't remove this entry. Try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const renderRow = (
    id: string,
    title: string,
    subtitle: string,
    value: string,
    env?: EnvVar
  ) => {
    const expanded = expandedId === id;
    const revealed = revealedId === id;
    return (
      <div key={id} className="border-b last:border-b-0">
        <div className="flex items-center gap-1 py-3">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => {
              setExpandedId(expanded ? null : id);
              setRevealedId(null);
            }}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <ChevronDown
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
            <span className="min-w-0">
              <span className="block truncate font-medium">{title}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {subtitle}
              </span>
            </span>
          </button>
          <Button
            variant="ghost"
            className="h-11 shrink-0 gap-2 px-3"
            onClick={() => void copy(value, env ? "Value" : "Password")}
            aria-label={`Copy ${env ? "value for" : "password for"} ${title}`}
          >
            <Copy className="size-4" />
            <span className="hidden sm:inline">
              Copy {env ? "value" : "password"}
            </span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="size-11 shrink-0"
                aria-label={`Options for ${title}`}
              >
                <MoreHorizontal className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {
                <DropdownMenuItem
                  className="min-h-11"
                  onSelect={() =>
                    openEditor(
                      env ?? credentials.find((c) => c.clientId === id)
                    )
                  }
                >
                  {env ? "Edit variable" : "Edit login"}
                </DropdownMenuItem>
              }
              <DropdownMenuItem
                className="min-h-11"
                onSelect={() =>
                  void copy(
                    env ? `${env.name}=${env.value}` : `${subtitle}\n${value}`,
                    env ? "Variable" : "Login"
                  )
                }
              >
                {env ? "Copy as NAME=VALUE" : "Copy username and password"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-11 text-destructive"
                onSelect={() => {
                  setRevealedId(null);
                  setRemoval({ id, label: title, tab });
                }}
              >
                Remove {env ? "variable" : "login"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {expanded && (
          <div className="space-y-3 pb-5 pl-2 sm:pl-8">
            <p className="break-words font-medium">{title}</p>
            {!env && (
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground">
                    Username or email
                  </p>
                  <p className="break-all text-sm">{subtitle}</p>
                </div>
                <Button
                  variant="ghost"
                  className="size-11 shrink-0"
                  aria-label={`Copy username for ${title}`}
                  onClick={() => void copy(subtitle, "Username")}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            )}
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">
                  {env ? "Value" : "Password"}
                </p>
                <p className="break-all font-mono text-sm select-text">
                  {revealed ? value : "••••••••••••"}
                </p>
              </div>
              <Button
                variant="ghost"
                className="size-11 shrink-0"
                aria-label={`${revealed ? "Hide" : "Reveal"} ${
                  env ? "value" : "password"
                } for ${title}`}
                onClick={() => setRevealedId(revealed ? null : id)}
              >
                {revealed ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            </div>
            {revealed && (
              <p className="text-xs text-muted-foreground">
                Hides automatically after 30 seconds.
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Passwords</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your logins and project secrets, easy to find.
          </p>
        </div>
        <Button
          className="min-h-11 shrink-0 gap-2"
          onClick={() => openEditor()}
        >
          <Plus className="size-4" />
          {tab === "logins" ? "Add login" : "Add variable"}
        </Button>
      </header>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as EntryTab);
          setQuery("");
          setRevealedId(null);
          setExpandedId(null);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <TabsList className="group-data-[orientation=horizontal]/tabs:h-12">
            <TabsTrigger className="min-h-11 px-3" value="logins">
              Logins ({credentials.length})
            </TabsTrigger>
            <TabsTrigger className="min-h-11 px-3" value="envvars">
              Variables ({envVars.length})
            </TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            className="size-11 shrink-0"
            aria-label="Sync settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings2 className="size-5" />
          </Button>
        </div>
        <TabsContent value={tab} className="space-y-6 mt-4">
          {settingsOpen && (
            <section
              className="space-y-2 rounded-xl bg-muted/50 p-4"
              aria-label="Sync settings"
            >
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 font-medium">
                <span>Sync changes to cloud</span>
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={syncEnabled}
                  onChange={(e) => {
                    try {
                      localStorage.setItem(
                        "noticomax_env_sync",
                        String(e.target.checked)
                      );
                      setSyncEnabled(e.target.checked);
                    } catch {
                      toast.error("Couldn't save your sync preference.");
                    }
                  }}
                />
              </label>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Applies to entries you add or change while account sync is
                available. Turning this off doesn&apos;t remove copies already
                in the cloud.
              </p>
            </section>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
            <Input
              className="h-11 pl-10"
              aria-label={
                tab === "logins" ? "Search logins" : "Search variables"
              }
              placeholder={
                tab === "logins"
                  ? "Search services or usernames"
                  : "Search variables or projects"
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setRevealedId(null);
                setExpandedId(null);
              }}
            />
          </div>
          {loading ? (
            <p
              role="status"
              className="py-10 text-center text-sm text-muted-foreground"
            >
              Loading your entries…
            </p>
          ) : loadError ? (
            <div role="alert" className="space-y-3 py-8 text-center">
              <p>Couldn&apos;t load your entries.</p>
              <Button variant="outline" onClick={() => void reload()}>
                Try again
              </Button>
            </div>
          ) : count === 0 ? (
            <div className="space-y-3 py-12 text-center">
              <Lock className="mx-auto size-6 text-muted-foreground" />
              <h2 className="font-medium">
                {needle
                  ? "No matching entries"
                  : tab === "logins"
                  ? "Keep your logins together"
                  : "Keep project variables together"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {needle
                  ? "Try a different service, username, or project."
                  : "Add your first entry. Values stay hidden until you reveal them."}
              </p>
              {needle && (
                <Button variant="outline" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              )}
            </div>
          ) : tab === "logins" ? (
            <div>
              {logins.map((c) =>
                renderRow(c.clientId, c.label, c.username, c.password)
              )}
            </div>
          ) : (
            <div className="space-y-7">
              {groups.map(([group, vars]) => (
                <section key={group}>
                  <div className="flex items-center justify-between gap-2 border-b pb-2">
                    <h2 className="min-w-0 break-words font-semibold">
                      {group}
                    </h2>
                    <Button
                      variant="ghost"
                      className="min-h-11 shrink-0 gap-2"
                      onClick={() =>
                        void copy(
                          vars.map((e) => `${e.name}=${e.value}`).join("\n"),
                          `${group} variables`
                        )
                      }
                    >
                      <Copy className="size-4" />
                      Copy {needle ? "matches" : "all"}
                    </Button>
                  </div>
                  {vars.map((e) =>
                    renderRow(
                      e.clientId,
                      e.name,
                      "Project variable",
                      e.value,
                      e
                    )
                  )}
                </section>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent
          className="sm:max-w-md [&_[data-slot=dialog-close]]:size-11 [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:right-2"
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? tab === "logins"
                  ? "Edit login"
                  : "Edit variable"
                : tab === "logins"
                ? "Add a login"
                : "Add a variable"}
            </DialogTitle>
            <DialogDescription>
              {tab === "logins"
                ? "Save a service, username, and password."
                : "Group variables by project so you can copy them together."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <fieldset
              disabled={busy}
              className="space-y-4"
              data-keyboard-keep-visible
            >
              {tab === "envvars" && (
                <div className="space-y-2">
                  <Label htmlFor="secret-project">Project (optional)</Label>
                  <Input
                    id="secret-project"
                    className="h-11"
                    list="secret-projects"
                    placeholder="Default"
                    value={project}
                    onChange={(e) => setProject(e.target.value)}
                  />
                  <datalist id="secret-projects">
                    {[...new Set(envVars.map((e) => e.project))].map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="secret-name">
                  {tab === "logins" ? "Service name" : "Variable name"}
                </Label>
                <Input
                  id="secret-name"
                  className="h-11"
                  autoFocus
                  required
                  placeholder={tab === "logins" ? "e.g. Gmail" : "e.g. API_KEY"}
                  value={name}
                  autoCapitalize={tab === "envvars" ? "characters" : "words"}
                  onChange={(e) =>
                    setName(
                      tab === "envvars"
                        ? e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9_]/g, "")
                        : e.target.value
                    )
                  }
                />
              </div>
              {tab === "logins" && (
                <div className="space-y-2">
                  <Label htmlFor="secret-username">Username or email</Label>
                  <Input
                    id="secret-username"
                    className="h-11"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="secret-value">
                  {tab === "logins" ? "Password" : "Value"}
                </Label>
                <Input
                  id="secret-value"
                  className="h-11"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  required
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                className="min-h-11"
                variant="outline"
                disabled={busy}
                onClick={closeEditor}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="min-h-11"
                disabled={
                  busy ||
                  !name.trim() ||
                  !secret ||
                  (tab === "logins" && !username.trim())
                }
              >
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!removal}
        onOpenChange={(open) => {
          if (!open && !busyRef.current) setRemoval(null);
        }}
      >
        <DialogContent className="sm:max-w-md [&_[data-slot=dialog-close]]:size-11 [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:right-2">
          <DialogHeader>
            <DialogTitle>Remove {removal?.label}?</DialogTitle>
            <DialogDescription>
              This removes the saved entry. You can&apos;t undo this action.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => setRemoval(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="min-h-11"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Removing…" : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
