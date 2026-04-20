"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn, UserPlus, Apple } from "lucide-react";
import { triggerAppleSignIn, type AppleSignInPayload } from "@/lib/auth/apple-signin-client";

interface AuthGateProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onLoginWithApple: (payload: AppleSignInPayload & { email?: string }) => Promise<{ success: boolean; error?: string }>;
  onRegister: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onSkip: () => void;
}

export function AuthGate({ onLogin, onLoginWithApple, onRegister, onSkip }: AuthGateProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const handleAppleSignIn = async () => {
    setError("");
    setAppleLoading(true);
    const result = await triggerAppleSignIn();
    if (!result.success || !result.payload) {
      setAppleLoading(false);
      if (result.error && result.error !== "Sign-in cancelled") {
        setError(result.error);
      }
      return;
    }
    const authResult = await onLoginWithApple(result.payload);
    setAppleLoading(false);
    if (!authResult.success) {
      setError(authResult.error || "Apple sign-in failed");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (mode === "register" && password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const result = mode === "login"
      ? await onLogin(email.trim(), password)
      : await onRegister(email.trim(), password);
    setLoading(false);

    if (!result.success) {
      setError(result.error || "Something went wrong");
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
          {mode === "login" ? "Sign in to sync your data across devices." : "Create an account to get started."}
        </p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-lg flex items-center justify-center gap-2">
            {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {mode === "login" ? "Sign In" : "Create Account"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            onClick={handleAppleSignIn}
            disabled={appleLoading || loading}
            className="w-full bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
          >
            <Apple className="h-4 w-4 mr-2" />
            {appleLoading ? "Opening Apple…" : "Sign in with Apple"}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? (mode === "login" ? "Signing in..." : "Creating account...")
                : (mode === "login" ? "Sign In" : "Create Account")}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <p>
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => { setMode("register"); setError(""); }}
                  className="text-primary hover:underline"
                >
                  Create one
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{" "}
                <button
                  onClick={() => { setMode("login"); setError(""); }}
                  className="text-primary hover:underline"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>

          <p className="text-center text-sm text-muted-foreground">
            <button onClick={onSkip} className="text-primary hover:underline">
              Continue without account
            </button>
            <br />
            <span className="text-xs">(local-only mode, no cloud sync)</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
