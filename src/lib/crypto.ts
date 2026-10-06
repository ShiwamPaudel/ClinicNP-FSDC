/**
 * crypto.ts — password & PIN hashing. Server-only.
 * Uses Node's scrypt with a per-secret random salt. Format: scrypt$<salt>$<hash>.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

function hash(secret: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(secret, salt, KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verify(secret: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  const derived = scryptSync(secret, salt!, KEYLEN);
  const expectedBuf = Buffer.from(expected!, "hex");
  if (expectedBuf.length !== derived.length) return false;
  return timingSafeEqual(derived, expectedBuf);
}

export function hashPassword(password: string): string {
  return hash(password);
}

export function verifyPassword(password: string, stored: string | null): boolean {
  return verify(password, stored);
}

export function hashPin(pin: string): string {
  return hash(pin);
}

export function verifyPin(pin: string, stored: string | null): boolean {
  return verify(pin, stored);
}
