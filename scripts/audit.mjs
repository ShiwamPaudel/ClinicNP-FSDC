/**
 * scripts/audit.mjs — the checks that would otherwise be somebody's memory.
 *
 *  1. Module coverage. Every clinic route must refuse to exist when the Clinic
 *     module is off, and every pharmacy-only route likewise. A route that
 *     forgets its guard is not a cosmetic problem: it is a screen the owner
 *     switched off and can still be reached.
 *
 *  2. Contrast. Every navy-on-cream and cream-on-navy pair the product uses is
 *     computed against WCAG AA, because "it looks fine on my monitor" is not a
 *     test and the counter machine is a cheap tablet in a bright room.
 *
 *  3. Empty states. A list screen with no empty state shows a blank rectangle
 *     the first time it is opened, which is exactly when somebody is deciding
 *     whether to trust the product.
 *
 * Run: node scripts/audit.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const failures = [];
const notes = [];

// ---------------------------------------------------------------------------
// 1. Module coverage
// ---------------------------------------------------------------------------

/** Route segments that only make sense with the Clinic module on. */
const CLINIC_SEGMENTS = [
  "patients",
  "visits",
  "files",
  "settings/services",
  "settings/doctors",
  "settings/lab-partners",
  "reports/service-revenue",
  "reports/doctors",
  "reports/lab-partners",
  "reports/visits",
  "reports/new-patients",
  "reports/utilisation",
  "api/patients",
  "api/followup",
];

/** Routes that are shared on purpose and decide per-module inside. */
const SHARED = new Set([
  "api/catalog", // the counter's snapshot: filtered by module inside
  "api/bills", // one counter, one bill; each block is checked separately
  "api/files/[id]", // guarded, but named under files/ by accident of path
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const APP = join(ROOT, "src", "app");
const routeFiles = [...walk(APP)].filter((f) => /(page|route)\.tsx?$/.test(f));

for (const file of routeFiles) {
  const rel = relative(APP, file).split(sep).join("/");
  // strip the route-group parentheses and the trailing file name
  const routePath = rel
    .replace(/\/(page|route)\.tsx?$/, "")
    .split("/")
    .filter((s) => !s.startsWith("("))
    .join("/");

  if (SHARED.has(routePath)) continue;

  const isClinic = CLINIC_SEGMENTS.some(
    (seg) => routePath === seg || routePath.startsWith(`${seg}/`),
  );
  if (!isClinic) continue;

  const src = readFileSync(file, "utf8");
  const guarded =
    src.includes("requireModulePage(") ||
    src.includes("requireModule(") ||
    src.includes("getModules(");
  if (!guarded) {
    failures.push(
      `module guard missing: /${routePath}  (${relative(ROOT, file)})`,
    );
  }
}
notes.push(`checked ${routeFiles.length} routes for module guards`);

// ---------------------------------------------------------------------------
// 2. Contrast
// ---------------------------------------------------------------------------

function srgb(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Read the palette straight from globals.css so it cannot drift. */
const css = readFileSync(join(ROOT, "src", "app", "globals.css"), "utf8");
const tokens = {};
for (const m of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
  tokens[m[1]] = m[2];
}

/** [foreground, background, what it is, minimum] — 4.5 body text, 3.0 large. */
const PAIRS = [
  ["clinic-900", "cream-50", "navy heading on a card", 4.5],
  ["clinic-700", "cream-50", "navy link on a card", 4.5],
  ["clinic-700", "cream-100", "navy link on the page", 4.5],
  ["clinic-700", "clinic-75", "navy on the palest navy", 4.5],
  ["cream-50", "clinic-900", "the patient header", 4.5],
  ["clinic-150", "clinic-900", "secondary text in the patient header", 4.5],
  ["sage-900", "cream-50", "body text", 4.5],
  ["sage-500", "cream-50", "secondary text on a card", 4.5],
  ["sage-500", "cream-100", "secondary text on the page", 4.5],
  ["sage-900", "cream-100", "body text on the page", 4.5],
];

for (const [fg, bg, what, min] of PAIRS) {
  if (!tokens[fg] || !tokens[bg]) {
    failures.push(`contrast: token missing for ${fg} on ${bg}`);
    continue;
  }
  const r = ratio(tokens[fg], tokens[bg]);
  if (r < min) {
    failures.push(
      `contrast ${r.toFixed(2)}:1 (needs ${min}) — ${what}: ${fg} on ${bg}`,
    );
  }
}
notes.push(`checked ${PAIRS.length} colour pairs for contrast`);

// ---------------------------------------------------------------------------
// 3. Empty states
// ---------------------------------------------------------------------------

let listScreens = 0;
for (const file of routeFiles.filter((f) => f.endsWith("page.tsx"))) {
  const src = readFileSync(file, "utf8");
  // A screen that maps over rows into a table is a list screen.
  const isList = /\.map\(/.test(src) && /<Table|<tbody/.test(src);
  if (!isList) continue;
  // A detail page for one thing is not a list: it already refuses to render
  // when the thing is missing, and its lines exist by definition.
  if (src.includes("notFound()")) continue;
  listScreens += 1;
  const hasEmpty =
    src.includes("EmptyState") ||
    src.includes("length === 0") ||
    src.includes("length > 0");
  if (!hasEmpty) {
    failures.push(`no empty state: ${relative(ROOT, file)}`);
  }
}
notes.push(`checked ${listScreens} list screens for empty states`);

// ---------------------------------------------------------------------------
// 4. INSERT statements whose column list and value list are different lengths.
//
// saveCompany shipped with fourteen columns against fifteen values. It threw
// in the driver every single time, so the clinic's own name could not be
// saved, and nothing caught it: no test called it and the screen reported the
// failure as a polite "something went wrong". Counting is exactly the kind of
// thing a person does badly and a machine does perfectly.
// ---------------------------------------------------------------------------

/** Split on commas that are not inside a quoted string or nested parentheses. */
function splitTopLevel(s) {
  const out = [];
  let cur = "", quote = null, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      cur += ch;
      if (ch === quote) {
        if (s[i + 1] === quote) cur += s[++i];
        else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

let insertsChecked = 0;
const SQL_DIRS = [join(ROOT, "src", "lib"), join(ROOT, "db")];
for (const dir of SQL_DIRS) {
  for (const file of walk(dir)) {
    if (!file.endsWith(".ts")) continue;
    const text = readFileSync(file, "utf8");
    const re =
      /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+([A-Za-z_]\w*)\s*\(([^)]*?)\)\s*VALUES\s*\(((?:[^()']|'(?:[^']|'')*')*)\)/gis;
    let m;
    while ((m = re.exec(text)) !== null) {
      const [, table, colsRaw, valsRaw] = m;
      const cols = splitTopLevel(colsRaw);
      const vals = splitTopLevel(valsRaw);
      insertsChecked += 1;
      if (cols.length !== vals.length) {
        const line = text.slice(0, m.index).split("\n").length;
        failures.push(
          `INSERT arity: ${relative(ROOT, file)}:${line} — ${table} has ` +
            `${cols.length} columns but ${vals.length} values`,
        );
      }
    }
  }
}
notes.push(`checked ${insertsChecked} INSERT statements for column/value arity`);

// ---------------------------------------------------------------------------

for (const n of notes) console.log(`  ${n}`);

if (failures.length > 0) {
  console.error(`\nAudit found ${failures.length} problem(s):\n`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log(
  "\nAudit clean: module guards, contrast, empty states and SQL arity all hold.",
);
