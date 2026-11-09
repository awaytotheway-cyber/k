/**
 * Auth.js (NextAuth v5) configuration — email + password.
 *
 * Session strategy is JWT because the credentials provider does not support
 * database sessions. The Prisma Account/Session models exist in the schema
 * anyway, so adding Google or Microsoft sign-in later means adding a provider
 * and the Prisma adapter, not writing a migration.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyPassword } from "@/lib/password";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();
        const user = await db.user.findUnique({ where: { email } });

        // verifyPassword runs a bcrypt comparison even when the user does not
        // exist, so a missing account and a wrong password take the same time.
        const ok = await verifyPassword(parsed.data.password, user?.passwordHash);
        if (!ok || !user) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
