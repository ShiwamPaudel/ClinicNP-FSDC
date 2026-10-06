import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { verifyCredentials, verifyUserPin } from "@/lib/repos/users";
import {
  checkLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
} from "@/lib/repos/security";
import { loginSchema, pinSchema } from "@/lib/validators";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    // Full login: username + password.
    Credentials({
      id: "password",
      name: "Password",
      credentials: { username: {}, password: {} },
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const ident = parsed.data.username;
        // Brute-force gate: refuse while locked (don't even check the password).
        const gate = await checkLoginAllowed(ident);
        if (!gate.allowed) return null;
        const u = await verifyCredentials(ident, parsed.data.password);
        if (!u) {
          await recordLoginFailure(ident);
          return null;
        }
        await clearLoginFailures(ident);
        return {
          id: u.id,
          name: u.name,
          role: u.role,
          canEditRate: u.canEditRate,
        };
      },
    }),
    // Quick-switch on the shared counter device: a 4-digit PIN.
    Credentials({
      id: "pin",
      name: "PIN",
      credentials: { userId: {}, pin: {} },
      async authorize(raw) {
        const parsed = pinSchema.safeParse(raw);
        if (!parsed.success) return null;
        // A 4-digit PIN has only 10k combinations — throttle hard.
        const ident = `pin:${parsed.data.userId}`;
        const gate = await checkLoginAllowed(ident);
        if (!gate.allowed) return null;
        const u = await verifyUserPin(parsed.data.userId, parsed.data.pin);
        if (!u) {
          await recordLoginFailure(ident);
          return null;
        }
        await clearLoginFailures(ident);
        return {
          id: u.id,
          name: u.name,
          role: u.role,
          canEditRate: u.canEditRate,
        };
      },
    }),
  ],
});
