import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/lib/repos/users";

/**
 * Edge-safe base config (no DB, no node crypto) so it can run in middleware.
 * The Credentials providers (which touch the DB) are added in ./auth.ts,
 * which runs only in the Node route handler.
 */
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // ~one business day
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      // Public: login page.
      if (pathname.startsWith("/login")) return true;
      // The offline notice is a static page with no data on it. It has to be
      // reachable without a session, because the service worker serves it when
      // there is no connection to check a session against.
      if (pathname === "/offline") return true;
      // API routes enforce their own auth (session check or cron secret) and
      // must return JSON, not an HTML redirect.
      if (pathname.startsWith("/api")) return true;
      // The service worker + PWA assets must be publicly fetchable.
      if (pathname === "/sw.js" || pathname.startsWith("/swe-worker")) return true;
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.role = user.role;
        token.canEditRate = user.canEditRate;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
        session.user.canEditRate = token.canEditRate as boolean;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
