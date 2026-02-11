"use client";

import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";
import { useSubscription } from "@/hooks/use-subscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Crown, LogIn, Download, Upload, Key, Copy, RefreshCw } from "lucide-react";
import { exportData, importData } from "@/lib/import-export";
import { toast } from "sonner";
import Link from "next/link";

export default function SettingsPage() {
  const { session, isAuthenticated, isProUser, tier } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetch("/api/user/token")
        .then((r) => r.json())
        .then((d) => setApiToken(d.token))
        .catch(() => {});
    }
  }, [isAuthenticated]);

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const data = await res.json();
    setPortalLoading(false);
    if (data.url) {
      window.location.href = data.url;
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
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
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
        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
          </CardHeader>
          <CardContent>
            {isAuthenticated && session ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {session.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={session.user.image}
                      alt=""
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                      {(session.user.name || "U")[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">{session.user.name}</p>
                    <p className="text-xs text-muted-foreground">{session.user.email}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  Sign out
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Sign in to sync your data across devices.
                </p>
                <Link href="/auth/sign-in">
                  <Button size="sm" className="gap-1.5">
                    <LogIn className="h-3.5 w-3.5" />
                    Sign in
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscription</CardTitle>
          </CardHeader>
          <CardContent>
            {isProUser ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Pro Plan</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Active
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Cloud sync is enabled. Your data syncs across all your devices.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                >
                  {portalLoading ? "Loading..." : "Manage Subscription"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Free Plan</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {tier === "anonymous"
                    ? "Sign in and upgrade to Pro to sync your data across devices."
                    : "Your data is stored locally on this device. Upgrade to sync across devices."}
                </p>
                <Link href="/pricing">
                  <Button size="sm" className="gap-1.5">
                    <Crown className="h-3.5 w-3.5" />
                    Upgrade to Pro
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Data */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data & Storage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isProUser
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
        {/* API Token for Web Clipper */}
        {isAuthenticated && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Web Clipper</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Use this API token with the NOTICO MAX browser extension to save clips from any webpage.
              </p>
              {apiToken ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono truncate">
                      {apiToken}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(apiToken);
                        toast.success("Token copied");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={tokenLoading}
                    onClick={async () => {
                      setTokenLoading(true);
                      const res = await fetch("/api/user/token", { method: "POST" });
                      const data = await res.json();
                      setApiToken(data.token);
                      setTokenLoading(false);
                      toast.success("Token regenerated");
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regenerate
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={tokenLoading}
                  onClick={async () => {
                    setTokenLoading(true);
                    const res = await fetch("/api/user/token", { method: "POST" });
                    const data = await res.json();
                    setApiToken(data.token);
                    setTokenLoading(false);
                    toast.success("Token generated");
                  }}
                >
                  <Key className="h-3.5 w-3.5" />
                  Generate API Token
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
