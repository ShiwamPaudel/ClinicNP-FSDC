/**
 * scripts/sweep.mjs — the vocabulary sweep (Rules §7.4).
 *
 * Two checks, both mechanical so neither depends on anyone remembering:
 *
 *  1. The retired product name must not appear anywhere outside prod-docs/.
 *     The specification has to write the name in order to say it is retired;
 *     nothing else may.
 *
 *  2. No backend term may reach a user-facing string (Rules §1.1). Only string
 *     literals and JSX text are inspected — never identifiers, never comments —
 *     because `beginTransaction()` is fine and "the transaction failed" is not.
 *     SQL text is skipped, and a line carrying `sweep-ok` is exempt.
 *
 * Run: node scripts/sweep.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();

const RETIRED = /aushadhi/i;

/** Rules §1.1, verbatim. Matched whole-word, case-insensitive. */
const BANNED = [
  "database",
  "query",
  "sync payload",
  "endpoint",
  "null",
  "undefined",
  "transaction",
  "exception",
  "stack trace",
  "fetch failed",
  "blob",
  "upload failed",
];

/**
 * The names of things we happen to have built this on. A shopkeeper has no
 * idea what any of them are and should never have to find out: "could not
 * reach the database" and "Turso is unavailable" are the same unhelpful
 * sentence, and the second is worse, because it sounds like their fault for
 * not knowing what a Turso is.
 *
 * Kept apart from BANNED only so a failure can say which kind of problem it
 * is. Same rule, same escape hatch: `sweep-ok` on the line.
 */
const VENDORS = [
  "turso",
  "libsql",
  "sqlite",
  "vercel",
  "nextjs",
  "indexeddb",
  "serwist",
  "service worker",
  "postgres",
  "webhook",
  "localstorage",
  "tailwind",
  "playwright",
  "vitest",
  "typescript",
  "javascript",
];

/**
 * Words that describe how the software was built rather than what it does for
 * anybody. A migration, a schema and a deploy are all real, and all somebody
 * else's business.
 */
const PLUMBING = [
  "migration",
  "migrations",
  "schema",
  "deploy",
  "deployment",
  "backend",
  "frontend",
  "server-side",
  "client-side",
  "http",
  "json",
  "boolean",
  "integer",
  "timestamp",
];

/** All three lists, each labelled so a failure says what kind it is. */
const GROUPS = [
  ["banned word", BANNED],
  ["vendor name", VENDORS],
  ["plumbing word", PLUMBING],
];

/**
 * Words that are banned on screen but unavoidable in the codebase's own
 * plumbing, so they are only checked inside files that can render.
 * "record", "row", "cache", "API" and "500" live here: `apiRoute`, `cacheKey`
 * and HTTP 500 are legitimate everywhere, and the screen-facing use of each is
 * caught by review rather than by a grep that would cry wolf a hundred times.
 */
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "prod-docs",
  "playwright-report",
  "test-results",
  ".filestore",
  "public",
  "coverage",
]);

/** Files whose strings a user can actually see. */
const UI_GLOB = /\.tsx?$/;
/** Build configuration is not a screen: `blob:` in a CSP is a URL scheme. */
const ROOT_CONFIG = /^[\w.-]+\.config\.[cm]?ts$/;
/** Anything hand-written that a control character has no business being in. */
const SOURCE_EXT = /\.(tsx?|mjs|js|sql|json|css|md)$/;
const NON_UI_DIR = new RegExp(
  `(^|${sep === "\\" ? "\\\\" : sep})(db|scripts|tests?|e2e)(${sep === "\\" ? "\\\\" : sep}|$)`,
);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** Looks like SQL rather than prose? Then it is not a user-facing string. */
function isSql(s) {
  return /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|PRAGMA|BEGIN|COMMIT|ROLLBACK|JOIN|WHERE)\b/.test(
    s,
  );
}

/**
 * Pull out just the parts of a line a user could read: quoted strings and JSX
 * text. Deliberately crude — it over-collects rather than under-collects, and
 * the SQL and sweep-ok filters take care of the rest.
 */
function readableParts(line) {
  const parts = [];
  for (const m of line.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)) parts.push(m[1]);
  for (const m of line.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'/g)) parts.push(m[1]);
  for (const m of line.matchAll(/`([^`\\]*(?:\\.[^`\\]*)*)`/g)) parts.push(m[1]);
  // JSX text between tags, e.g. >Nothing here yet<
  for (const m of line.matchAll(/>([^<>{}]{4,})</g)) parts.push(m[1]);
  return parts;
}

const failures = [];

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // binary or unreadable — nothing to sweep
  }
  // A stray NUL or other control character in source is always a mistake —
  // usually a shell heredoc mangling an escape on its way into a file. It is
  // invisible in an editor and turns the file "binary" to grep, so it hides
  // whatever else is wrong with that line. It has happened twice.
  if (SOURCE_EXT.test(rel)) {
    // Escaped, not literal: this file must not contain the thing it hunts.
    const control = new RegExp("[\u0000-\u0008\u000B\u000C\u000E-\u001F]").exec(text);
    if (control) {
      const lineNo = text.slice(0, control.index).split(/\r?\n/).length;
      failures.push(
        `${rel}:${lineNo}  stray control character (code ${control[0].charCodeAt(0)}) in source`,
      );
    }
  }

  const lines = text.split(/\r?\n/);

  const isSelf = rel === join("scripts", "sweep.mjs");

  lines.forEach((line, i) => {
    const where = `${rel}:${i + 1}`;

    // This file has to write the retired name in order to look for it.
    if (!isSelf && RETIRED.test(line)) {
      failures.push(`${where}  retired product name: ${line.trim().slice(0, 90)}`);
    }

    if (line.includes("sweep-ok")) return;
    if (!UI_GLOB.test(rel) || NON_UI_DIR.test(rel) || ROOT_CONFIG.test(rel)) return;
    // An import specifier is a package name, not something anyone reads.
    if (/^\s*(import\b|export\b.*\bfrom\b|const .* = require\()/.test(line)) return;

    for (const part of readableParts(line)) {
      if (isSql(part)) continue;
      // A bare path, className or package specifier is not prose.
      if (/^[@\w./-]+$/.test(part.trim())) continue;
      for (const [label, list] of GROUPS) {
        for (const word of list) {
          const re = new RegExp(`\\b${word.replace(/ /g, "\\s+")}\\b`, "i");
          if (re.test(part)) {
            failures.push(
              `${where}  ${label} "${word}": ${part.trim().slice(0, 80)}`,
            );
          }
        }
      }
    }
  });
}

if (failures.length > 0) {
  console.error(`Vocabulary sweep found ${failures.length} problem(s):\n`);
  for (const f of failures) console.error("  " + f);
  console.error(
    "\nFix the wording, or add `sweep-ok` to the line if the word genuinely never reaches a screen.",
  );
  process.exit(1);
}

console.log("Vocabulary sweep clean: no retired name, no backend words on screen.");
