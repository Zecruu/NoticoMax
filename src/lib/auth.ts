import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "@/lib/mongodb-client";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

const hasMongoDb = !!process.env.MONGODB_URI;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: hasMongoDb ? MongoDBAdapter(clientPromise) : undefined,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/sign-in",
  },
  providers: [
    ...(hasMongoDb && process.env.AUTH_GOOGLE_ID
      ? [Google({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
        })]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        if (!hasMongoDb) return null;

        try {
          await dbConnect();
          const user = await User.findOne({ email: credentials.email });
          if (!user || !user.hashedPassword) return null;

          const valid = await bcrypt.compare(
            credentials.password as string,
            user.hashedPassword
          );
          if (!valid) return null;

          return {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            image: user.image,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user && hasMongoDb) {
        try {
          await dbConnect();
          const dbUser = await User.findOne({ email: user.email });
          if (dbUser) {
            token.id = dbUser._id.toString();
            token.tier = dbUser.tier;
            token.stripeCustomerId = dbUser.stripeCustomerId;
          }
        } catch {}
      }
      // Allow client to trigger a session update (e.g. after subscription change)
      if (trigger === "update" && session?.tier) {
        token.tier = session.tier;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.tier = token.tier;
      session.user.stripeCustomerId = token.stripeCustomerId;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!hasMongoDb) return;
      try {
        await dbConnect();
        const existing = await User.findOne({ email: user.email ?? undefined });
        if (!existing) {
          await User.create({
            name: user.name || "User",
            email: user.email ?? undefined,
            image: user.image ?? undefined,
            tier: "free",
          });
        }
      } catch {}
    },
  },
});
