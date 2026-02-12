import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "@/lib/mongodb-client";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

const mongoUri = process.env.MONGODB_URI || "";
const googleId = process.env.AUTH_GOOGLE_ID || "";
const googleSecret = process.env.AUTH_GOOGLE_SECRET || "";

const providers = [];

// Only add Google provider if properly configured
if (googleId && googleId !== "placeholder" && googleSecret && googleSecret !== "placeholder") {
  providers.push(
    Google({
      clientId: googleId,
      clientSecret: googleSecret,
    })
  );
}

// Always add credentials provider
providers.push(
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      if (!mongoUri) return null;

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
      } catch (err) {
        console.error("[auth] Login error:", err);
        return null;
      }
    },
  })
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: mongoUri ? MongoDBAdapter(clientPromise) : undefined,
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: "/auth/sign-in",
  },
  providers,
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user && mongoUri) {
        try {
          await dbConnect();
          const dbUser = await User.findOne({ email: user.email });
          if (dbUser) {
            token.id = dbUser._id.toString();
            token.tier = dbUser.tier;
            token.stripeCustomerId = dbUser.stripeCustomerId;
          }
        } catch (err) {
          console.error("[auth] JWT callback error:", err);
        }
      }
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
      if (!mongoUri) return;
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
      } catch (err) {
        console.error("[auth] createUser error:", err);
      }
    },
  },
});
