"use client";

import { useState, useRef, useEffect } from "react";
import { useLicense } from "@/hooks/use-license";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, Upload, Key, Copy, RotateCw, Fingerprint, BellRing, CheckCircle2, XCircle, LogOut, User, Plus, Trash2, Eye, EyeOff, Cloud, CloudOff, Lock, Variable, UserCheck, Monitor } from "lucide-react";
import { exportData, importData } from "@/lib/import-export";
import { toast } from "@/lib/native-toast";
import Link from "next/link";
import { isCapacitorNative } from "@/lib/platform";
import { getEnvVars, addEnvVar, removeEnvVar, type EnvVar, getCredentials, addCredential, removeCredential, type Credential } from "@/lib/sync/sync-engine";
import { getDeviceName, setDeviceName } from "@/lib/device";
import { checkBiometricAvailability } from "@/lib/capacitor/biometric-auth";

export default function SettingsPage() {
  const { licenseKey, isActivated, isLoggedIn, email, activate, logout } = useLicense();
  const [licenseInput, setLicenseInput] = useState("");
  const [activating, setActivating] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDesktop = typeof window !== "undefined" && window.electronAPI?.isElectron;
  const isMobile = typeof window !== "undefined" && isCapacitorNative();
  const [appVersion, setAppVersion] = useState<string>("");
  const [updateInfo, setUpdateInfo] = useState<{ hasUpdate: boolean; latestVersion?: string; error?: string } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [newEnvName, setNewEnvName] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [visibleEnvKeys, setVisibleEnvKeys] = useState<Set<number>>(new Set());
  const [envSyncEnabled, setEnvSyncEnabled] = useState(false);
  const [passwordsTab, setPasswordsTab] = useState<"logins" | "envvars">("logins");
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [newCredLabel, setNewCredLabel] = useState("");
  const [newCredUser, setNewCredUser] = useState("");
  const [newCredPass, setNewCredPass] = useState("");
  const [visibleCredKeys, setVisibleCredKeys] = useState<Set<number>>(new Set());
  const [currentDeviceName, setCurrentDeviceName] = useState("");
  const [deviceNameInput, setDeviceNameInput] = useState("");

  useEffect(() => {
    if (window.electronAPI?.isElectron) {
      window.electronAPI.getAppVersion().then(setAppVersion);
      window.electronAPI.getOpenAtLogin().then(setOpenAtLogin);
    }
  }, []);

  useEffect(() => {
    getEnvVars().then(setEnvVars);
    getCredentials().then(setCredentials);
    const stored = localStorage.getItem("noticomax_env_sync");
    setEnvSyncEnabled(stored === "true");
    const name = getDeviceName();
    setCurrentDeviceName(name);
    setDeviceNameInput(name);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    checkBiometricAvailability().then(setBiometricAvailable);
    const stored = localStorage.getItem("noticomax_biometric_lock");
    setBiometricEnabled(stored === "true");
    const pushStored = localStorage.getItem("noticomax_push_enabled");
    setPushEnabled(pushStored !== "false");
  }, [isMobile]);

  useEffect(() => {
    if (!window.electronAPI?.isElectron) return;

    const cleanupProgress = window.electronAPI.onUpdateDownloadProgress((data) => {
      setDownloadProgress(Math.round(data.percent));
    });

    const cleanupDownloaded = window.electronAPI.onUpdateDownloaded(() => {
      setDownloading(false);
      setUpdateDownloaded(true);
      toast.success("Update downloaded! Click 'Install & Restart' to apply.");
    });

    const cleanupError = window.electronAPI.onUpdateError((data) => {
      setDownloading(false);
      toast.error(`Update error: ${data.message}`);
    });

    return () => {
      cleanupProgress();
      cleanupDownloaded();
      cleanupError();
    };
  }, []);

  const handleActivate = async () => {
    const key = licenseInput.trim();
    if (!key) return;
    setActivating(true);
    try {
      const result = await activate(key);
      if (result.success) {
        setLicenseInput("");
        toast.success("License activated! Cloud sync is now enabled.");
      } else {
        toast.error(result.error || "Activation failed");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Activation failed";
      toast.error(message);
    } finally {
      setActivating(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success("Signed out. Data remains stored locally.");
  };

  const refreshEnvVars = async () => {
    const vars = await getEnvVars();
    setEnvVars(vars);
  };

  const handleAddEnvVar = async () => {
    const name = newEnvName.trim();
    const value = newEnvValue.trim();
    if (!name || !value) return;
    if (envVars.some((v) => v.name === name)) {
      toast.error("Variable already exists");
      return;
    }
    await addEnvVar(name, value, envSyncEnabled);
    await refreshEnvVars();
    setNewEnvName("");
    setNewEnvValue("");
    toast.success(`Added ${name}`);
  };

  const handleRemoveEnvVar = async (index: number) => {
    const env = envVars[index];
    await removeEnvVar(env.clientId, envSyncEnabled);
    setVisibleEnvKeys((prev) => { const next = new Set(prev); next.delete(index); return next; });
    await refreshEnvVars();
    toast.success(`Removed ${env.name}`);
  };

  const handleCopyEnvVar = (env: EnvVar) => {
    navigator.clipboard.writeText(`${env.name} = ${env.value}`);
    toast.success(`Copied ${env.name}`);
  };

  const handleCopyAllEnvVars = () => {
    if (envVars.length === 0) return;
    const text = envVars.map((v) => `${v.name} = ${v.value}`).join("\n");
    navigator.clipboard.writeText(text);
    toast.success("All variables copied");
  };

  const toggleEnvVisibility = (index: number) => {
    setVisibleEnvKeys((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleEnvSync = () => {
    const newValue = !envSyncEnabled;
    setEnvSyncEnabled(newValue);
    localStorage.setItem("noticomax_env_sync", String(newValue));
    toast.success(newValue ? "Secrets will sync to cloud" : "Secrets are local only");
  };

  // Credential helpers
  const refreshCredentials = async () => {
    setCredentials(await getCredentials());
  };

  const handleAddCredential = async () => {
    const label = newCredLabel.trim();
    const username = newCredUser.trim();
    const password = newCredPass.trim();
    if (!label || !username || !password) return;
    await addCredential(label, username, password, envSyncEnabled);
    await refreshCredentials();
    setNewCredLabel("");
    setNewCredUser("");
    setNewCredPass("");
    toast.success(`Added ${label}`);
  };

  const handleRemoveCredential = async (index: number) => {
    const cred = credentials[index];
    await removeCredential(cred.clientId, envSyncEnabled);
    setVisibleCredKeys((prev) => { const next = new Set(prev); next.delete(index); return next; });
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

  const handleExport = async () => {
    const blob = await exportData();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `noticomax-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Data exported");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const result = await importData(text);
      toast.success(`Imported ${result.items} items and ${result.folders} folders`);
    } catch {
      toast.error("Failed to import data. Check the file format.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-4 px-4 md:px-6">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl p-4 md:p-6 space-y-6">
        {/* App (Desktop only) */}
        {isDesktop && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">App</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Version</p>
                  <p className="text-xs text-muted-foreground">{appVersion || "..."}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={checkingUpdate || downloading || updateDownloaded}
                  onClick={async () => {
                    setCheckingUpdate(true);
                    setUpdateInfo(null);
                    try {
                      const info = await window.electronAPI!.checkForUpdate();
                      setUpdateInfo(info);
                      if (!info.hasUpdate && !info.error) {
                        toast.success("You're on the latest version");
                      }
                    } catch {
                      toast.error("Failed to check for updates");
                    }
                    setCheckingUpdate(false);
                  }}
                >
                  <RotateCw className={`h-3.5 w-3.5 ${checkingUpdate ? "animate-spin" : ""}`} />
                  {checkingUpdate ? "Checking..." : "Check for Update"}
                </Button>
              </div>

              {updateInfo?.hasUpdate && !updateDownloaded && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-3">
                  <p className="text-sm font-medium">
                    Update available: v{updateInfo.latestVersion}
                  </p>

                  {downloading && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Downloading...</span>
                        <span>{downloadProgress}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                          style={{ width: `${downloadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {!downloading && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={async () => {
                        setDownloading(true);
                        setDownloadProgress(0);
                        const result = await window.electronAPI!.downloadUpdate();
                        if (!result.success) {
                          setDownloading(false);
                          toast.error(result.error || "Download failed");
                        }
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download Update
                    </Button>
                  )}
                </div>
              )}

              {updateDownloaded && (
                <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3 space-y-2">
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    Update ready to install
                  </p>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      window.electronAPI!.installUpdate();
                    }}
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    Install & Restart
                  </Button>
                </div>
              )}

              {updateInfo?.error && (
                <p className="text-sm text-destructive">
                  Could not check for updates: {updateInfo.error}
                </p>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Open on Startup</p>
                  <p className="text-xs text-muted-foreground">
                    Launch NOTICO MAX when you start your computer
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={openAtLogin}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    openAtLogin ? "bg-primary" : "bg-muted"
                  }`}
                  onClick={async () => {
                    const newValue = !openAtLogin;
                    setOpenAtLogin(newValue);
                    await window.electronAPI!.setOpenAtLogin(newValue);
                    toast.success(newValue ? "Will open on startup" : "Won't open on startup");
                  }}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                      openAtLogin ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mobile App */}
        {isMobile && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mobile App</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {biometricAvailable && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Fingerprint className="h-3.5 w-3.5" />
                      Biometric Lock
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Require Face ID / fingerprint to open the app
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={biometricEnabled}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      biometricEnabled ? "bg-primary" : "bg-muted"
                    }`}
                    onClick={() => {
                      const newValue = !biometricEnabled;
                      setBiometricEnabled(newValue);
                      localStorage.setItem("noticomax_biometric_lock", String(newValue));
                      toast.success(newValue ? "Biometric lock enabled" : "Biometric lock disabled");
                    }}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                        biometricEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <BellRing className="h-3.5 w-3.5" />
                    Push Notifications
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Receive reminders and updates
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={pushEnabled}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    pushEnabled ? "bg-primary" : "bg-muted"
                  }`}
                  onClick={async () => {
                    const newValue = !pushEnabled;
                    setPushEnabled(newValue);
                    localStorage.setItem("noticomax_push_enabled", String(newValue));
                    if (newValue) {
                      const { initPushNotifications } = await import("@/lib/capacitor/push-notifications");
                      await initPushNotifications();
                    }
                    toast.success(newValue ? "Push notifications enabled" : "Push notifications disabled");
                  }}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                      pushEnabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Device */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              Device
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Device Name</p>
              <div className="flex gap-2">
                <Input
                  value={deviceNameInput}
                  onChange={(e) => setDeviceNameInput(e.target.value)}
                  placeholder="Enter device name"
                  className="h-8 text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={!deviceNameInput.trim() || deviceNameInput.trim() === currentDeviceName}
                  onClick={() => {
                    const name = deviceNameInput.trim();
                    if (!name) return;
                    setDeviceName(name);
                    setCurrentDeviceName(name);
                    toast.success("Device renamed");
                  }}
                >
                  Save
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                This name identifies your device when syncing notes across multiple devices.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoggedIn ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{email}</span>
                </div>

                {isActivated ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium">License Active</span>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        Cloud Sync
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono truncate">
                        {licenseKey}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => {
                          if (licenseKey) {
                            navigator.clipboard.writeText(licenseKey);
                            toast.success("License key copied");
                          }
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Cloud sync is enabled. Your data syncs across all your devices.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">No License</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enter your product key to enable cloud sync across all your devices.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter license key..."
                        value={licenseInput}
                        onChange={(e) => setLicenseInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleActivate();
                        }}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={activating || !licenseInput.trim()}
                        onClick={handleActivate}
                      >
                        <Key className="h-3.5 w-3.5" />
                        {activating ? "Activating..." : "Activate"}
                      </Button>
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleLogout}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  You are not signed in. Sign in from the home screen to enable cloud sync.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Web Clipper */}
        {isActivated && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Web Clipper</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Use your license key with the NOTICO MAX browser extension to save clips from any webpage.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono truncate">
                  {licenseKey}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    if (licenseKey) {
                      navigator.clipboard.writeText(licenseKey);
                      toast.success("License key copied");
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data & Storage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isActivated
                ? "Your data is stored locally and synced to the cloud."
                : "Your data is stored locally on this device."}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {importing ? "Importing..." : "Import"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImport}
              />
            </div>
          </CardContent>
        </Card>
        {/* Passwords & Secrets */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Passwords
              </CardTitle>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={envSyncEnabled}
                  title={envSyncEnabled ? "Cloud sync on" : "Cloud sync off"}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    envSyncEnabled ? "bg-primary" : "bg-muted"
                  }`}
                  onClick={toggleEnvSync}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                      envSyncEnabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
                {envSyncEnabled ? <Cloud className="h-3.5 w-3.5 text-primary" /> : <CloudOff className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tabs */}
            <div className="flex rounded-md border p-0.5 w-fit">
              <button
                type="button"
                onClick={() => setPasswordsTab("logins")}
                className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                  passwordsTab === "logins" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <UserCheck className="h-3.5 w-3.5" />
                Logins
                {credentials.length > 0 && (
                  <span className="rounded-full bg-primary-foreground/20 px-1.5 text-[10px]">{credentials.length}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setPasswordsTab("envvars")}
                className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
                  passwordsTab === "envvars" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Variable className="h-3.5 w-3.5" />
                Env Variables
                {envVars.length > 0 && (
                  <span className="rounded-full bg-primary-foreground/20 px-1.5 text-[10px]">{envVars.length}</span>
                )}
              </button>
            </div>

            {/* Logins Tab */}
            {passwordsTab === "logins" && (
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
                              {visibleCredKeys.has(index) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
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
                              {visibleCredKeys.has(index) ? cred.password : "\u2022".repeat(Math.min(cred.password.length, 20))}
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

            {/* Env Variables Tab */}
            {passwordsTab === "envvars" && (
              <div className="space-y-3">
                {envVars.length > 0 && (
                  <div className="space-y-2">
                    {envVars.map((env, index) => (
                      <div key={index} className="flex items-center gap-2 rounded-md border p-2">
                        <div
                          className="flex-1 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => handleCopyEnvVar(env)}
                          title="Click to copy as NAME=VALUE"
                        >
                          <p className="text-xs font-medium text-muted-foreground">{env.name}</p>
                          <p className="text-sm font-mono truncate">
                            {visibleEnvKeys.has(index) ? env.value : "\u2022".repeat(Math.min(env.value.length, 32))}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => toggleEnvVisibility(index)}
                          title={visibleEnvKeys.has(index) ? "Hide" : "Show"}
                        >
                          {visibleEnvKeys.has(index) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveEnvVar(index)}
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {envVars.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={handleCopyAllEnvVars}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy All as NAME=VALUE
                  </Button>
                )}

                <div className="flex gap-2">
                  <Input
                    placeholder="VARIABLE_NAME"
                    value={newEnvName}
                    onChange={(e) => setNewEnvName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
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
                  <Button
                    size="sm"
                    className="gap-1.5 shrink-0"
                    disabled={!newEnvName.trim() || !newEnvValue.trim()}
                    onClick={handleAddEnvVar}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
