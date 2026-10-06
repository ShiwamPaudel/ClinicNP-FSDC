/**
 * users.ts — all SQL for the users table. No SQL lives outside lib/repos (Rules.md §6).
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import { hashPassword, hashPin, verifyPassword, verifyPin } from "@/lib/crypto";
import type { Row } from "@/lib/db";

/**
 * Accountant is read-only: all reports, all years, no billing (PRD §4B.8).
 * Doctor is narrower still: their own booked consultations and their own
 * details, on their own phone, and nothing else in the back office.
 */
export type Role = "admin" | "staff" | "accountant" | "doctor";

export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  canEditRate: boolean;
  active: boolean;
  hasPin: boolean;
  createdAt: string;
}

function mapUser(r: Row): User {
  return {
    id: r.id as string,
    name: r.name as string,
    username: r.username as string,
    role: r.role as Role,
    canEditRate: Number(r.can_edit_rate) === 1,
    active: Number(r.active) === 1,
    hasPin: r.pin_hash != null,
    createdAt: r.created_at as string,
  };
}

export async function listUsers(): Promise<User[]> {
  const res = await db().execute(
    "SELECT * FROM users ORDER BY active DESC, name ASC",
  );
  return res.rows.map(mapUser);
}

export async function getUserById(id: string): Promise<User | null> {
  const res = await db().execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? mapUser(res.rows[0]) : null;
}

export async function countUsers(): Promise<number> {
  const res = await db().execute("SELECT COUNT(*) AS n FROM users");
  return Number(res.rows[0]!.n);
}

/** Verify username + password; returns the user on success, else null. */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<User | null> {
  const res = await db().execute({
    sql: "SELECT * FROM users WHERE username = ? AND active = 1",
    args: [username],
  });
  const row = res.rows[0];
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash as string)) return null;
  return mapUser(row);
}

/** Verify a 4-digit PIN for quick-switch; returns matching active user or null. */
export async function verifyUserPin(
  userId: string,
  pin: string,
): Promise<User | null> {
  const res = await db().execute({
    sql: "SELECT * FROM users WHERE id = ? AND active = 1",
    args: [userId],
  });
  const row = res.rows[0];
  if (!row) return null;
  if (!verifyPin(pin, row.pin_hash as string | null)) return null;
  return mapUser(row);
}

export interface NewUser {
  name: string;
  username: string;
  password: string;
  pin?: string;
  role: Role;
  canEditRate: boolean;
}

export async function createUser(input: NewUser): Promise<User> {
  const id = ulid();
  await db().execute({
    sql: `INSERT INTO users
            (id, name, username, password_hash, pin_hash, role, can_edit_rate, active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    args: [
      id,
      input.name,
      input.username,
      hashPassword(input.password),
      input.pin ? hashPin(input.pin) : null,
      input.role,
      input.canEditRate ? 1 : 0,
      new Date().toISOString(),
    ],
  });
  const u = await getUserById(id);
  if (!u) throw new Error("failed to create user");
  return u;
}

export interface UpdateUser {
  name?: string;
  role?: Role;
  canEditRate?: boolean;
  active?: boolean;
  password?: string;
  pin?: string;
}

export async function updateUser(id: string, patch: UpdateUser): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    args.push(patch.name);
  }
  if (patch.role !== undefined) {
    sets.push("role = ?");
    args.push(patch.role);
  }
  if (patch.canEditRate !== undefined) {
    sets.push("can_edit_rate = ?");
    args.push(patch.canEditRate ? 1 : 0);
  }
  if (patch.active !== undefined) {
    sets.push("active = ?");
    args.push(patch.active ? 1 : 0);
  }
  if (patch.password) {
    sets.push("password_hash = ?");
    args.push(hashPassword(patch.password));
  }
  if (patch.pin) {
    sets.push("pin_hash = ?");
    args.push(hashPin(patch.pin));
  }
  if (sets.length === 0) return;
  args.push(id);
  await db().execute({
    sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });
}

export async function usernameExists(username: string): Promise<boolean> {
  const res = await db().execute({
    sql: "SELECT 1 FROM users WHERE username = ? LIMIT 1",
    args: [username],
  });
  return res.rows.length > 0;
}
