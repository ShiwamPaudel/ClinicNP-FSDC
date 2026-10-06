/**
 * db.ts — the single libSQL client. Server-only.
 * The client (browser) never talks to Turso directly (Rules.md §6, Architecture §6).
 */
import { createClient, type Client } from "@libsql/client";

let client: Client | null = null;

export function db(): Client {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is not set");
  }
  client = createClient({
    url,
    // authToken is required for remote Turso; unused for file: URLs in dev.
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });
  return client;
}

/** Test-only: drop the cached client so a new TURSO_DATABASE_URL takes effect. */
export function __resetDbForTests(): void {
  client = null;
}

export type {
  Client,
  InArgs,
  InValue,
  InStatement,
  Row,
} from "@libsql/client";
