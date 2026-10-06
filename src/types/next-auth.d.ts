import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/repos/users";

declare module "next-auth" {
  interface User {
    role: Role;
    canEditRate: boolean;
  }
  interface Session {
    user: {
      id: string;
      role: Role;
      canEditRate: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    canEditRate: boolean;
  }
}
