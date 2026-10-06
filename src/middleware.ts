import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Edge-safe: uses only the base config (no DB/providers).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Protect everything except Next internals, auth endpoints, and static assets.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.json|icons|.*\\.png$).*)", // sweep-ok: a URL pattern, never on screen
  ],
};
