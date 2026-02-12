"use client";

import { useSession } from "next-auth/react";

export type UserTier = "free" | "pro" | "anonymous";

export function useSubscription() {
  const { data: session, status, update } = useSession();

  const tier: UserTier = !session?.user
    ? "anonymous"
    : session.user.tier === "pro"
      ? "pro"
      : "free";

  const isProUser = tier === "pro";
  const isAuthenticated = status === "authenticated";
  const isLoading = status === "loading";

  return {
    tier,
    isProUser,
    isAuthenticated,
    isLoading,
    session,
    updateSession: update,
  };
}
