"use client";

import { useState, useRef, useEffect } from "react";
import { useLicense } from "@/hooks/use-license";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, Upload, Key, Copy, RotateCw, Fingerprint, BellRing, CheckCircle2, XCircle, LogOut, User, Monitor, Trash2, Wand2, Terminal, Eye, EyeOff } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { exportData, importData } from "@/lib/import-export";
import { toast } from "@/lib/native-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isCapacitorNative, isIOS } from "@/lib/platform";
import { getDeviceName, setDeviceName } from "@/lib/device";
import { checkBiometricAvailability } from "@/lib/capacitor/biometric-auth";
import { presentPaywall, presentCustomerCenter } from "@/lib/iap/revenuecat-client";
import { Sparkles, Settings as SettingsIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const router = useRouter();
  const { userId, licenseKey, isActivated, isPro, isLoggedIn, isLoading, email, activate, logout, deleteAccount } = useLicense();

  // Sign-out (or account deletion) doesn't unmount this page — push the user
  // back home where AuthGate gates them.
  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.replace("/");
    }
  }, [isLoading, isLoggedIn, router]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [licenseInput, setLicenseInput] = useState("");
  const [activating, setActivating] = useState(false);
  const showPaywallCTA = typeof window !== "undefined" && isIOS();
  const showManageSub = typeof window !== "undefined" && isIOS() && isPro;

  const handleUpgrade = async () => {
    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
      ]);
    try {
      toast.info("1: importing Purchases module...");
      const purchasesMod = await import("@revenuecat/purchases-capacitor");
      if (!purchasesMod.Purchases) throw new Error("Purchases export missing");

      const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY;
      toast.info(`2: API key present? ${apiKey ? "yes (" + apiKey.slice(0, 10) + "…)" : "NO"}`);
      if (!apiKey) throw new Error("NEXT_PUBLIC_REVENUECAT_IOS_KEY missing in bundle");

      toast.info("3: calling Purchases.configure()...");
      await withTimeout(purchasesMod.Purchases.configure({ apiKey }), 8000, "configure");
      toast.success("4: configure done");

      // CRITICAL: alias RC's anonymous ID to our Supabase userId BEFORE the
      // purchase. Without this, the webhook receives "$RCAnonymousID:..." and
      // can't link the receipt back to the signed-in user, so Pro never
      // shows up in the app.
      if (userId) {
        toast.info("4a: identifying user to RC...");
        try {
          await withTimeout(purchasesMod.Purchases.logIn({ appUserID: userId }), 8000, "logIn");
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          toast.error(`logIn failed: ${m.slice(0, 200)}`);
          throw e;
        }
      } else {
        toast.error("Not signed in — sign in first, then upgrade.");
        return;
      }

      toast.info("4b: getOfferings()...");
      try {
        const offerings = await withTimeout(purchasesMod.Purchases.getOfferings(), 10000, "getOfferings");
        const cur = offerings.current;
        toast.info(`offerings: current=${cur?.identifier ?? "NONE"}, packages=${cur?.availablePackages?.length ?? 0}`);
        if (cur?.availablePackages?.[0]) {
          const p = cur.availablePackages[0];
          toast.info(`pkg: ${p.identifier} → ${p.product.identifier} @ ${p.product.priceString}`);
        }
      } catch (e: unknown) {
        const m = e instanceof Error ? e.message : String(e);
        toast.error(`getOfferings failed: ${m.slice(0, 200)}`);
        throw e;
      }

      toast.info("5: importing RC UI module...");
      const uiMod = await import("@revenuecat/purchases-capacitor-ui");
      if (!uiMod.RevenueCatUI) throw new Error("RevenueCatUI export missing");

      toast.info("6: calling presentPaywall...");
      const res = await withTimeout(uiMod.RevenueCatUI.presentPaywall(), 30000, "presentPaywall");
      toast.success(`7: result = ${res.result}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Paywall error: ${msg.slice(0, 200)}`);
      console.error("[paywall debug]", err);
    }
  };
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
  const [currentDeviceName, setCurrentDeviceName] = useState("");
  const [deviceNameInput, setDeviceNameInput] = useState("");

  useEffect(() => {
    if (window.electronAPI?.isElectron) {
      window.electronAPI.getAppVersion().then(setAppVersion);
      window.electronAPI.getOpenAtLogin().then(setOpenAtLogin);
    }
  }, []);

  useEffect(() => {
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

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Password updated");
        setPasswordOpen(false);
        setNewPassword("");
        setConfirmNewPassword("");
      }
    } catch {
      toast.error("Failed to update password");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm.trim().toUpperCase() !== "DELETE") {
      toast.error('Type DELETE to confirm');
      return;
    }
    setDeleting(true);
    const result = await deleteAccount();
    setDeleting(false);
    if (result.success) {
      setDeleteOpen(false);
      setDeleteConfirm("");
      toast.success("Account deleted. All data has been removed.");
    } else {
      toast.error(result.error || "Account deletion failed");
    }
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
      // .ics calendar files (Apple Calendar, Google Calendar, etc.) — parse
      // VEVENTs into reminder items and preserve recurrence.
      if (file.name.toLowerCase().endsWith(".ics") || text.startsWith("BEGIN:VCALENDAR")) {
        const { parseIcs, importIcsEvents } = await import("@/lib/ics-import");
        const events = parseIcs(text);
        if (events.length === 0) {
          toast.error("No events found in this .ics file");
          return;
        }
        const { inserted, skipped } = await importIcsEvents(events);
        toast.success(
          `Imported ${inserted} event${inserted === 1 ? "" : "s"}` +
            (skipped > 0 ? ` (${skipped} duplicate${skipped === 1 ? "" : "s"} skipped)` : "")
        );
        return;
      }
      const result = await importData(text);
      toast.success(`Imported ${result.items} items and ${result.folders} folders`);
    } catch (err) {
      console.error("[settings] import failed:", err);
      toast.error("Failed to import. Check the file format.");
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

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-1">Wipe Local Data</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Permanently delete all notes, passwords, and settings stored on this Mac.
                  Uninstalling NOTICO MAX does <strong>not</strong> auto-delete your data on macOS,
                  so use this button if you want a clean slate. The app will restart.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={async () => {
                    const ok = window.confirm(
                      "This will permanently delete ALL local data on this Mac (notes, passwords, settings, etc.) and restart the app. This cannot be undone.\n\nContinue?"
                    );
                    if (!ok) return;
                    try {
                      await window.electronAPI?.wipeLocalData();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err);
                      toast.error(`Wipe failed: ${msg}`);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Wipe All Local Data
                </Button>
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
                    {licenseKey && (
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono truncate">
                          {licenseKey}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => {
                            navigator.clipboard.writeText(licenseKey);
                            toast.success("License key copied");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Cloud sync is enabled. Your data syncs across all your devices.
                    </p>
                    {showManageSub && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => presentCustomerCenter()}
                      >
                        <SettingsIcon className="h-3.5 w-3.5" />
                        Manage subscription
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">No License</span>
                    </div>
                    {showPaywallCTA && (
                      <Button
                        className="w-full gap-2"
                        onClick={handleUpgrade}
                      >
                        <Sparkles className="h-4 w-4" />
                        Upgrade to Pro
                      </Button>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {showPaywallCTA
                        ? "Or enter an existing license key:"
                        : "Enter your product key to enable cloud sync across all your devices."}
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

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setPasswordOpen(true)}
                  >
                    <Key className="h-3.5 w-3.5" />
                    Change Password
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign Out
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Account
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Deleting your account permanently removes your account, all
                  cloud-synced notes, folders, and shared items. This cannot be
                  undone. Active subscriptions are managed separately through
                  your App Store account.
                </p>
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

        {/* Claude Code Integration */}
        {isLoggedIn && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wand2 className="h-4 w-4" />
                Claude Code Integration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sync your Claude Code skills across computers. Use the session token below to connect Claude Code to your NoticoMax account.
              </p>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Session Token</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono truncate">
                    {localStorage.getItem("noticomax_session")
                      ? `${localStorage.getItem("noticomax_session")!.slice(0, 12)}...${localStorage.getItem("noticomax_session")!.slice(-6)}`
                      : "Not available"}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => {
                      const token = localStorage.getItem("noticomax_session");
                      if (token) {
                        navigator.clipboard.writeText(token);
                        toast.success("Session token copied");
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Quick Setup (run on a new computer)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono truncate">
                    curl -s {typeof window !== "undefined" ? window.location.origin : "https://www.noticomax.com"}/api/skills/bootstrap -o ~/.claude/skills/noticomax/SKILL.md --create-dirs
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => {
                      const origin = typeof window !== "undefined" ? window.location.origin : "https://www.noticomax.com";
                      navigator.clipboard.writeText(
                        `curl -s ${origin}/api/skills/bootstrap -o ~/.claude/skills/noticomax/SKILL.md --create-dirs`
                      );
                      toast.success("Setup command copied");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="rounded-md border border-dashed p-3 space-y-1.5">
                <p className="text-xs font-medium flex items-center gap-1.5">
                  <Terminal className="h-3 w-3" />
                  Usage
                </p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p><code className="bg-muted px-1 rounded">/noticomax push</code> — Upload skills to cloud</p>
                  <p><code className="bg-muted px-1 rounded">/noticomax pull</code> — Download Claude skills <em>and</em> Codex prompts</p>
                  <p><code className="bg-muted px-1 rounded">/noticomax list</code> — View all synced skills</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Codex CLI Integration */}
        {isLoggedIn && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Codex CLI Integration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Sync your Codex CLI prompts (<code className="bg-muted px-1 rounded text-xs">~/.codex/prompts/*.md</code>) across computers using the same NoticoMax session token.
              </p>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Quick Setup (run on a new computer)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono truncate">
                    curl -s {typeof window !== "undefined" ? window.location.origin : "https://www.noticomax.com"}/api/skills/bootstrap?tool=codex -o ~/.codex/prompts/noticomax.md --create-dirs
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => {
                      const origin = typeof window !== "undefined" ? window.location.origin : "https://www.noticomax.com";
                      navigator.clipboard.writeText(
                        `curl -s ${origin}/api/skills/bootstrap?tool=codex -o ~/.codex/prompts/noticomax.md --create-dirs`
                      );
                      toast.success("Setup command copied");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="rounded-md border border-dashed p-3 space-y-1.5">
                <p className="text-xs font-medium flex items-center gap-1.5">
                  <Terminal className="h-3 w-3" />
                  Usage (inside Codex CLI)
                </p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p><code className="bg-muted px-1 rounded">$noticomax push</code> — Upload prompts to cloud</p>
                  <p><code className="bg-muted px-1 rounded">$noticomax pull</code> — Download Codex prompts</p>
                  <p><code className="bg-muted px-1 rounded">$noticomax list</code> — View all synced items</p>
                </div>
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
                accept=".json,.ics,text/calendar"
                className="hidden"
                onChange={handleImport}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Import a NoticoMax JSON backup or an Apple/Google Calendar
              <code className="ml-1 px-1 py-0.5 rounded bg-muted text-foreground">.ics</code>
              file. Calendar events become reminders with recurrence preserved.
              Export your Apple Calendar via <em>Calendar → File → Export</em> on macOS.
            </p>
          </CardContent>
        </Card>
      </main>

      <Dialog open={passwordOpen} onOpenChange={(o) => { if (!savingPassword) { setPasswordOpen(o); if (!o) { setNewPassword(""); setConfirmNewPassword(""); } } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter a new password. You&apos;ll stay signed in on this device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">Confirm New Password</Label>
              <Input
                id="confirm-new-password"
                type={showNewPassword ? "text" : "password"}
                placeholder="Re-enter new password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={savingPassword} onClick={() => setPasswordOpen(false)}>
              Cancel
            </Button>
            <Button disabled={savingPassword} onClick={handleChangePassword}>
              {savingPassword ? "Saving..." : "Update Password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!deleting) { setDeleteOpen(o); if (!o) setDeleteConfirm(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              This permanently deletes your NOTICO MAX account and all
              cloud-synced data: notes, folders, reminders, and shared items.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              If you have an active subscription, cancel it from your App Store
              account settings first — deleting the account here does not
              cancel billing.
            </p>
            <div className="space-y-2">
              <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
              <Input
                id="delete-confirm"
                placeholder="DELETE"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDeleteAccount}>
              {deleting ? "Deleting..." : "Delete Account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
