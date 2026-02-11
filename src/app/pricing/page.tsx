"use client";

import { useState } from "react";
import { useSubscription } from "@/hooks/use-subscription";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Crown, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function PricingPage() {
  const { isAuthenticated, isProUser } = useSubscription();
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    if (!isAuthenticated) {
      window.location.href = "/auth/sign-in";
      return;
    }

    setLoading(true);
    const res = await fetch("/api/stripe/checkout", { method: "POST" });
    const data = await res.json();
    setLoading(false);

    if (data.url) {
      window.location.href = data.url;
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
          <h1 className="text-lg font-semibold">Pricing</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-4 md:p-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold tracking-tight">
            Choose your plan
          </h2>
          <p className="mt-2 text-muted-foreground">
            Free forever locally. Upgrade to sync across all your devices.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Free Tier */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Free</CardTitle>
              <p className="text-3xl font-bold">$0</p>
              <p className="text-sm text-muted-foreground">Forever</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Feature>Unlimited notes, URLs, reminders</Feature>
              <Feature>Offline access</Feature>
              <Feature>Folders & organization</Feature>
              <Feature>Full-text search</Feature>
              <Feature>Dark mode</Feature>
              <Feature muted>Data stored on this device only</Feature>

              <Button variant="outline" className="w-full mt-4" disabled>
                Current Plan
              </Button>
            </CardContent>
          </Card>

          {/* Pro Tier */}
          <Card className="border-primary">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Pro</CardTitle>
                <Crown className="h-4 w-4 text-primary" />
              </div>
              <p className="text-3xl font-bold">
                $5<span className="text-base font-normal text-muted-foreground">/mo</span>
              </p>
              <p className="text-sm text-muted-foreground">Cancel anytime</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Feature>Everything in Free</Feature>
              <Feature highlight>Cloud sync across all devices</Feature>
              <Feature highlight>Automatic backups</Feature>
              <Feature highlight>Access from any browser</Feature>
              <Feature>Priority support</Feature>

              {isProUser ? (
                <Button className="w-full mt-4" disabled>
                  You&apos;re on Pro
                </Button>
              ) : (
                <Button
                  className="w-full mt-4 gap-1.5"
                  onClick={handleSubscribe}
                  disabled={loading}
                >
                  <Crown className="h-3.5 w-3.5" />
                  {loading ? "Redirecting..." : isAuthenticated ? "Subscribe" : "Sign in to Subscribe"}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Feature({
  children,
  highlight,
  muted,
}: {
  children: React.ReactNode;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Check
        className={`h-4 w-4 shrink-0 ${
          highlight ? "text-primary" : muted ? "text-muted-foreground/50" : "text-muted-foreground"
        }`}
      />
      <span className={muted ? "text-muted-foreground/70" : ""}>{children}</span>
    </div>
  );
}
