/**
 * check.ts — refuse to build code the database is not ready for.
 *
 * On 2083-05-23 a deploy shipped code that read `item_locations` to a database
 * still at 0012. Every screen that touched it answered "Application error: a
 * server-side exception has occurred" with a digest and nothing else. The
 * software was correct, the schema was correct, and they were a migration
 * apart — which is a state nobody can diagnose from the outside.
 *
 * So the build asks first. `pnpm build` runs this, and Vercel runs `pnpm
 * build`, which means a deploy cannot get ahead of the schema again.
 *
 * It is deliberately hard to fail by accident. It only stops a build when it
 * can positively read `_migrations` AND find a file on disk that is not in it.
 * Anything else — no database configured, no network, no `_migrations` table
 * yet — prints a line and lets the build through, because a check that breaks
 * deploys for unrelated reasons gets deleted within a week and then protects
 * nothing.
 *
 * Run on its own:  pnpm db:check
 */
import { createClient } from "@libsql/client";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The same loader db/migrate.ts uses, so both look at the same database.
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    // file absent — fine
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Say why we are letting the build through, then let it through. */
function skip(why: string): never {
  console.log(`db:check — skipped (${why})`);
  process.exit(0);
}

async function main(): Promise<void> {
  const onDisk = readdirSync(join(__dirname, "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) skip("TURSO_DATABASE_URL is not set");

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });

  let applied: Set<string>;
  try {
    const res = await client.execute("SELECT name FROM _migrations");
    applied = new Set(res.rows.map((r) => String(r.name)));
  } catch {
    client.close();
    // No _migrations table, or the database is unreachable. Either way this is
    // not evidence of a mismatch, and a build is not the place to guess.
    skip("could not read _migrations");
  }
  client.close();

  const pending = onDisk.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log(`db:check — schema is up to date (${onDisk.length} migrations)`);
    return;
  }

  const where = url.startsWith("file:")
    ? url
    : url.replace(/^libsql:\/\//, "").split(".")[0];

  console.error("");
  console.error("db:check — REFUSING TO BUILD.");
  console.error("");
  console.error(`  ${where} has not run:`);
  for (const f of pending) console.error(`    ${f}`);
  console.error("");
  console.error("  Deploying this code would put the app in front of a database");
  console.error("  it does not match, and every screen that touches the new");
  console.error("  tables would answer with a server-side exception and a");
  console.error("  digest nobody can read.");
  console.error("");
  console.error("  Migrate first, then deploy:");
  console.error("");
  console.error("    (take a backup from Settings -> Backup)");
  console.error("    pnpm db:migrate");
  console.error("");
  process.exit(1);
}

main().catch((e) => {
  // A bug in this check must never be the reason a deploy fails.
  console.log(`db:check — skipped (${(e as Error).message})`);
  process.exit(0);
});
