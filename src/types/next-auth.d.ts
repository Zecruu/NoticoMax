import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      tier: "free" | "pro";
      stripeCustomerId?: string;
    };
  }

  interface User {
    tier?: "free" | "pro";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    tier: "free" | "pro";
    stripeCustomerId?: string;
  }
}
