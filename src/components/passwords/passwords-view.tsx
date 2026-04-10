"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Lock,
  UserCheck,
  Variable,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Cloud,
  CloudOff,
  FolderOpen,
  Pencil,
  Check,
  X,
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
  removeCredential,
  type Credential,
} from "@/lib/sync/sync-engine";

export function PasswordsView() {
  const [tab, setTab] = useState<"logins" | "envvars">("logins");

  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [newEnvProject, setNewEnvProject] = useState("");
  const [newEnvName, setNewEnvName] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [visibleEnvKeys, setVisibleEnvKeys] = useState<Set<string>>(new Set());
  const [editingEnvId, setEditingEnvId] = useState<string | null>(null);
  const [editEnvProject, setEditEnvProject] = useState("");
  const [editEnvName, setEditEnvName] = useState("");
  const [editEnvValue, setEditEnvValue] = useState("");

  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [newCredLabel, setNewCredLabel] = useState("");
  const [newCredUser, setNewCredUser] = useState("");
  const [newCredPass, setNewCredPass] = useState("");
  const [visibleCredKeys, setVisibleCredKeys] = useState<Set<number>>(new Set());

  const [syncEnabled, setSyncEnabled] = useState(false);

  useEffect(() => {
    getEnvVars().then(setEnvVars);
    getCredentials().then(setCredentials);
    const stored = localStorage.getItem("noticomax_env_sync");
    setSyncEnabled(stored === "true");
  }, []);

  const refreshEnvVars = async () => setEnvVars(await getEnvVars());
  const refreshCredentials = async () => setCredentials(await getCredentials());

  const toggleSync = () => {
    const next = !syncEnabled;
    setSyncEnabled(next);
    localStorage.setItem("noticomax_env_sync", String(next));
    toast.success(next ? "Secrets will sync to cloud" : "Secrets are local only");
  };

  const envVarsByProject = useMemo(() => {
    const groups = new Map<string, EnvVar[]>();
    for (const env of envVars) {
      const key = env.project || "Default";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(env);
    }
    return Array.from(groups.entries())
      .map(([project, vars]) => ({ project, vars }))
      .sort((a, b) => a.project.localeCompare(b.project));
  }, [envVars]);

  const projectNames = useMemo(
    () => Array.from(new Set(envVars.map((v) => v.project))).sort(),
    [envVars]
  );

  const handleAddEnvVar = async () => {
    const name = newEnvName.trim();
    const value = newEnvValue.trim();
    const project = newEnvProject.trim() || "Default";
    if (!name || !value) return;
    if (envVars.some((v) => v.name === name && v.project === project)) {
      toast.error(`${name} already exists in ${project}`);
      return;
    }
    await addEnvVar(name, value, project, syncEnabled);
    await refreshEnvVars();
    setNewEnvName("");
    setNewEnvValue("");
    toast.success(`Added ${name} to ${project}`);
  };

  const handleRemoveEnvVar = async (env: EnvVar) => {
    await removeEnvVar(env.clientId, syncEnabled);
    setVisibleEnvKeys((prev) => {
      const next = new Set(prev);
      next.delete(env.clientId);
      return next;
    });
    await refreshEnvVars();
    toast.success(`Removed ${env.name}`);
  };

  const handleCopyEnvVar = (env: EnvVar) => {
    navigator.clipboard.writeText(`${env.name}=${env.value}`);
    toast.success(`Copied ${env.name}`);
  };

  const handleCopyProjectEnvVars = (project: string, vars: EnvVar[]) => {
    if (vars.length === 0) return;
    const text = vars.map((v) => `${v.name}=${v.value}`).join("\n");
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${project} (${vars.length} vars)`);
  };

  const toggleEnvVisibility = (clientId: string) => {
    setVisibleEnvKeys((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const startEditEnvVar = (env: EnvVar) => {
    setEditingEnvId(env.clientId);
    setEditEnvProject(env.project);
    setEditEnvName(env.name);
    setEditEnvValue(env.value);
  };

  const cancelEditEnvVar = () => {
    setEditingEnvId(null);
    setEditEnvProject("");
    setEditEnvName("");
    setEditEnvValue("");
  };

  const handleSaveEditEnvVar = async () => {
    if (!editingEnvId) return;
    const name = editEnvName.trim();
    const value = editEnvValue.trim();
    const project = editEnvProject.trim() || "Default";
    if (!name || !value) return;
    if (
      envVars.some(
        (v) =>
          v.clientId !== editingEnvId &&
          v.name === name &&
          v.project === project
      )
    ) {
      toast.error(`${name} already exists in ${project}`);
      return;
    }
    await updateEnvVar(editingEnvId, name, value, project, syncEnabled);
    await refreshEnvVars();
    cancelEditEnvVar();
    toast.success(`Updated ${name}`);
  };

  const handleAddCredential = async () => {
    const label = newCredLabel.trim();
    const username = newCredUser.trim();
    const password = newCredPass.trim();
    if (!label || !username || !password) return;
    await addCredential(label, username, password, syncEnabled);
    await refreshCredentials();
    setNewCredLabel("");
    setNewCredUser("");
    setNewCredPass("");
    toast.success(`Added ${label}`);
  };

  const handleRemoveCredential = async (index: number) => {
    const cred = credentials[index];
    await removeCredential(cred.clientId, syncEnabled);
    setVisibleCredKeys((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    await refreshCredentials();
    toast.success(`Removed ${cred.label}`);
  };

  const handleCopyCredential = (cred: Credential) => {
    navigator.clipboard.writeText(`${cred.username}\n${cred.password}`);
    toast.success(`Copied ${cred.label} credentials`);
  };

  const toggleCredVisibility = (index: number) => {
    setVisibleCredKeys((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6 space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Passwords & Secrets
            </CardTitle>
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={syncEnabled}
                title={syncEnabled ? "Cloud sync on" : "Cloud sync off"}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  syncEnabled ? "bg-primary" : "bg-muted"
                }`}
                onClick={toggleSync}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                    syncEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              {syncEnabled ? (
                <Cloud className="h-3.5 w-3.5 text-primary" />
              ) : (
                <CloudOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tabs */}
          <div className="flex rounded-md border p-0.5 w-fit">
            <button
              type="button"
              onClick={() => setTab("logins")}
              className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "logins"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Logins
              {credentials.length > 0 && (
                <span className="rounded-full bg-primary-foreground/20 px-1.5 text-[10px]">
                  {credentials.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab("envvars")}
              className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "envvars"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Variable className="h-3.5 w-3.5" />
              Env Variables
              {envVars.length > 0 && (
                <span className="rounded-full bg-primary-foreground/20 px-1.5 text-[10px]">
                  {envVars.length}
                </span>
              )}
            </button>
          </div>

          {/* Logins */}
          {tab === "logins" && (
            <div className="space-y-3">
              {credentials.length > 0 && (
                <div className="space-y-2">
                  {credentials.map((cred, index) => (
                    <div key={index} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{cred.label}</p>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => toggleCredVisibility(index)}
                            title={visibleCredKeys.has(index) ? "Hide" : "Show"}
                          >
                            {visibleCredKeys.has(index) ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleCopyCredential(cred)}
                            title="Copy username & password"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveCredential(index)}
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div
                          className="rounded bg-muted px-3 py-1.5 cursor-pointer hover:bg-muted/80 transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(cred.username);
                            toast.success("Username copied");
                          }}
                          title="Click to copy username"
                        >
                          <p className="text-[10px] text-muted-foreground mb-0.5">User</p>
                          <p className="text-xs font-mono truncate">{cred.username}</p>
                        </div>
                        <div
                          className="rounded bg-muted px-3 py-1.5 cursor-pointer hover:bg-muted/80 transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(cred.password);
                            toast.success("Password copied");
                          }}
                          title="Click to copy password"
                        >
                          <p className="text-[10px] text-muted-foreground mb-0.5">Password</p>
                          <p className="text-xs font-mono truncate">
                            {visibleCredKeys.has(index)
                              ? cred.password
                              : "\u2022".repeat(Math.min(cred.password.length, 20))}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2 rounded-md border border-dashed p-3">
                <Input
                  placeholder="Service name (e.g., Gmail, GitHub)..."
                  value={newCredLabel}
                  onChange={(e) => setNewCredLabel(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Input
                    placeholder="Username / Email..."
                    value={newCredUser}
                    onChange={(e) => setNewCredUser(e.target.value)}
                    className="flex-1 h-8 text-sm"
                  />
                  <Input
                    placeholder="Password..."
                    type="password"
                    value={newCredPass}
                    onChange={(e) => setNewCredPass(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddCredential();
                    }}
                    className="flex-1 h-8 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  disabled={!newCredLabel.trim() || !newCredUser.trim() || !newCredPass.trim()}
                  onClick={handleAddCredential}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Login
                </Button>
              </div>
            </div>
          )}

          {/* Env Variables */}
          {tab === "envvars" && (
            <div className="space-y-4">
              {envVarsByProject.length > 0 && (
                <div className="space-y-4">
                  {envVarsByProject.map(({ project, vars }) => (
                    <div key={project} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                        <h3 className="text-sm font-semibold">{project}</h3>
                        <span className="text-xs text-muted-foreground">
                          ({vars.length} {vars.length === 1 ? "var" : "vars"})
                        </span>
                        <div className="flex-1 h-px bg-border" />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 gap-1 text-xs"
                          onClick={() => handleCopyProjectEnvVars(project, vars)}
                          title="Copy all in this project"
                        >
                          <Copy className="h-3 w-3" />
                          Copy all
                        </Button>
                      </div>
                      <div className="space-y-1.5 pl-1">
                        {vars.map((env) =>
                          editingEnvId === env.clientId ? (
                            <div
                              key={env.clientId}
                              className="space-y-2 rounded-md border border-primary p-2"
                            >
                              <Input
                                placeholder="Project"
                                value={editEnvProject}
                                onChange={(e) => setEditEnvProject(e.target.value)}
                                list="env-project-suggestions"
                                className="h-8 text-sm"
                              />
                              <div className="flex gap-2">
                                <Input
                                  placeholder="VARIABLE_NAME"
                                  value={editEnvName}
                                  onChange={(e) =>
                                    setEditEnvName(
                                      e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "")
                                    )
                                  }
                                  className="flex-1 h-8 text-sm font-mono"
                                />
                                <Input
                                  placeholder="Value..."
                                  value={editEnvValue}
                                  onChange={(e) => setEditEnvValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveEditEnvVar();
                                    if (e.key === "Escape") cancelEditEnvVar();
                                  }}
                                  className="flex-1 h-8 text-sm"
                                />
                              </div>
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1"
                                  onClick={cancelEditEnvVar}
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 gap-1"
                                  disabled={!editEnvName.trim() || !editEnvValue.trim()}
                                  onClick={handleSaveEditEnvVar}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Save
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div
                              key={env.clientId}
                              className="flex items-center gap-2 rounded-md border p-2"
                            >
                              <div
                                className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => handleCopyEnvVar(env)}
                                title="Click to copy as NAME=VALUE"
                              >
                                <p className="text-xs font-medium text-muted-foreground">
                                  {env.name}
                                </p>
                                <p className="text-sm font-mono truncate">
                                  {visibleEnvKeys.has(env.clientId)
                                    ? env.value
                                    : "\u2022".repeat(Math.min(env.value.length, 32))}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => toggleEnvVisibility(env.clientId)}
                                title={visibleEnvKeys.has(env.clientId) ? "Hide" : "Show"}
                              >
                                {visibleEnvKeys.has(env.clientId) ? (
                                  <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0"
                                onClick={() => startEditEnvVar(env)}
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                                onClick={() => handleRemoveEnvVar(env)}
                                title="Remove"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2 rounded-md border border-dashed p-3">
                <Input
                  placeholder="Project name (e.g., Project 1, my-app)..."
                  value={newEnvProject}
                  onChange={(e) => setNewEnvProject(e.target.value)}
                  list="env-project-suggestions"
                  className="h-8 text-sm"
                />
                <datalist id="env-project-suggestions">
                  {projectNames.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
                <div className="flex gap-2">
                  <Input
                    placeholder="VARIABLE_NAME"
                    value={newEnvName}
                    onChange={(e) =>
                      setNewEnvName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))
                    }
                    className="flex-1 h-8 text-sm font-mono"
                  />
                  <Input
                    placeholder="Value..."
                    type="password"
                    value={newEnvValue}
                    onChange={(e) => setNewEnvValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddEnvVar();
                    }}
                    className="flex-1 h-8 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  disabled={!newEnvName.trim() || !newEnvValue.trim()}
                  onClick={handleAddEnvVar}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add to {newEnvProject.trim() || "Default"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
