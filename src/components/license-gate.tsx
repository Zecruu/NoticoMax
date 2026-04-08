"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Key } from "lucide-react";

interface LicenseGateProps {
  onActivate: (key: string) => Promise<{ success: boolean; error?: string }>;
  onSkip: () => void;
}

export function LicenseGate({ onActivate, onSkip }: LicenseGateProps) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!key.trim()) {
      setError("Please enter a license key");
      return;
    }
    setLoading(true);
    const result = await onActivate(key);
    setLoading(false);
    if (!result.success) {
      setError(result.error || "Activation failed");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="NOTICO MAX" className="h-16 w-16 mx-auto mb-3" />
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-primary">NOTICO MAX</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          Enter your license key to activate cloud sync.
        </p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-lg flex items-center justify-center gap-2">
            <Key className="h-4 w-4" />
            Activate License
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="license-key">License Key</Label>
              <Input
                id="license-key"
                placeholder="NMAX-XXXX-XXXX-XXXX"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="font-mono text-sm"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Activating..." : "Activate"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            <button onClick={onSkip} className="text-primary hover:underline">
              Continue without activation
            </button>
            <br />
            <span className="text-xs">(local-only mode, no cloud sync)</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
