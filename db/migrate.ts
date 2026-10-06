/**
 * migrate.ts — append-only migration runner.
 * Applies every db/migrations/*.sql in filename order that hasn't run yet.
 * Tracks applied files in a `_migrations` table. Never edit an applied migration.
 *
 * Each file runs inside ONE transaction together with its `_migrations` row, so a
 * failure rolls back completely rather than leaving the database half-migrated.
 *
 * Two directives may appear in a migration's comments:
 *   -- @rebuild             this file rebuilds a table, so foreign keys must be
 *                           switched off around the transaction (SQLite cannot
 *                           defer them for DROP TABLE; PRAGMA defer_foreign_keys
 *                           inside the transaction is NOT sufficient). A
 *                           foreign_key_check runs afterwards and fails the
 *                           migration if anything dangles.
 *   -- @verify a,b,c        row counts for these tables are captured before and
 *                           after and must match exactly (Rules.md §5).
 *
 * Run: pnpm db:migrate
 */
import { createClient, type Client } from "@libsql/client";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load env from .env.local / .env if present (Node 20.12+ built-in).
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    // file absent — fine
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "migrations");

/** Split a SQL file into individual statements. Our migrations are simple DDL
 * (no procedural bodies with embedded semicolons), so we strip line comments
 * then split on `;`. */
function splitStatements(sql: string): string[] {
  const withoutComments = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Statements are split on `;`, and only comments at the START of a line are
 * stripped. A trailing `-- comment; like this` therefore splits a statement in
 * half and SQLite reports a baffling "incomplete input". Catch it here and say
 * what actually happened.
 */
function assertWellFormed(file: string, statements: string[]): void {
  const ALLOWED = [
    "CREATE",
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "ALTER",
    "PRAGMA",
    "WITH",
    "REPLACE",
  ];
  for (const stmt of statements) {
    const head = stmt.trimStart().toUpperCase();
    if (!ALLOWED.some((k) => head.startsWith(k))) {
      throw new Error(
        `${file} produced a statement that doesn't begin with SQL:
  "${stmt.slice(0, 80)}…"
` +
          "A trailing '-- comment' containing a semicolon splits a statement. " +
          "Put comments on their own line.",
      );
    }
  }
}

function needsRebuild(sql: string): boolean {
  return /^--\s*@rebuild\b/m.test(sql);
}

function verifyTables(sql: string): string[] {
  const m = sql.match(/^--\s*@verify\s+(.+)$/m);
  if (!m) return [];
  return m[1]!
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

async function countRows(client: Client, tables: string[]) {
  const out: Record<string, number> = {};
  for (const t of tables) {
    const r = await client.execute(`SELECT COUNT(*) AS n FROM ${t}`);
    out[t] = Number(r.rows[0]!.n);
  }
  return out;
}

async function applyFile(client: Client, file: string, sql: string) {
  const statements = splitStatements(sql);
  assertWellFormed(file, statements);
  const rebuild = needsRebuild(sql);
  const toVerify = verifyTables(sql);

  const before = toVerify.length ? await countRows(client, toVerify) : {};
  if (toVerify.length) {
    console.log(
      `  rows before: ${Object.entries(before)
        .map(([t, n]) => `${t}=${n}`)
        .join(" ")}`,
    );
  }

  // PRAGMAs are connection-level and are no-ops inside a transaction: run them
  // outside it, in order, before the transactional body.
  const pragmas = statements.filter((s) => /^PRAGMA\b/i.test(s));
  const body = statements.filter((s) => !/^PRAGMA\b/i.test(s));

  for (const p of pragmas) await client.execute(p);
  if (rebuild) await client.execute("PRAGMA foreign_keys = OFF");

  const tx = await client.transaction("write");
  try {
    for (const stmt of body) await tx.execute(stmt);
    await tx.execute({
      sql: "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
      args: [file, new Date().toISOString()],
    });
    await tx.commit();
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      // already unwound
    }
    if (rebuild) await client.execute("PRAGMA foreign_keys = ON");
    throw new Error(
      `${file} failed and was rolled back — nothing was applied: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (rebuild) {
    const dangling = await client.execute("PRAGMA foreign_key_check");
    await client.execute("PRAGMA foreign_keys = ON");
    if (dangling.rows.length > 0) {
      throw new Error(
        `${file} left ${dangling.rows.length} dangling foreign key reference(s)`,
      );
    }
    console.log("  foreign keys checked: clean");
  }

  if (toVerify.length) {
    const after = await countRows(client, toVerify);
    console.log(
      `  rows after:  ${Object.entries(after)
        .map(([t, n]) => `${t}=${n}`)
        .join(" ")}`,
    );
    for (const t of toVerify) {
      if (before[t] !== after[t]) {
        throw new Error(
          `${file} changed the row count of ${t}: ${before[t]} -> ${after[t]}`,
        );
      }
    }
    console.log("  row counts match");
  }

  console.log(`applied ${file} (${body.length} statements)`);
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set (see .env.example)");

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });

  await client.execute(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );

  const applied = new Set(
    (await client.execute("SELECT name FROM _migrations")).rows.map(
      (r) => r.name as string,
    ),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    await applyFile(client, file, readFileSync(join(migrationsDir, file), "utf8"));
    ran++;
  }

  if (ran === 0) console.log("no new migrations");
  else console.log(`done — ${ran} migration(s) applied`);
  client.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
