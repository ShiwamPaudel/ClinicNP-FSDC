/**
 * reset.ts — empty a database that was filled with sample data, so a real
 * clinic can start on it.
 *
 * `db:seed` puts clearly-fake data in for training: Green Cross Sample
 * Pharmacy, Sample CBC, Dr. Sample Physician, two demo patients. That is
 * exactly right for learning the software and exactly wrong for the day the
 * clinic opens, because a sample price that survives into a real bill is a
 * real bill with a made-up number on it.
 *
 * This deletes every row of business data and leaves the schema alone. It does
 * NOT bootstrap — run `pnpm db:bootstrap` afterwards with the clinic's own
 * details. Two steps, deliberately, so an accidental run of one does not
 * quietly reinstate an Admin with a password somebody has forgotten about.
 *
 * It refuses to run without --yes, and prints the database it is about to
 * empty first, because "which database am I pointed at" is the question you
 * only ask afterwards.
 *
 *   pnpm db:reset --yes
 *   pnpm db:bootstrap --name "…" --pan … --admin … --password "…" --pin ….
 *
 * --keep-setup is the one for going live: it deletes the afternoon of test
 * bills, patients and visits, and leaves everything somebody typed to make the
 * software theirs — the item catalogue, the shelves, the shop layout, the test
 * list, the outside laboratories, the suppliers, the logins and the company
 * details. A catalogue of five hundred medicines is not sample data.
 *
 * --keep-access leaves `users`, `company` and `fiscal_years` alone, for the
 * case this was written for second: a shop that has already typed its own
 * name, address and PAN into Settings and only wants the sample catalogue and
 * an afternoon of test bills gone. Everything else still goes.
 *
 * Do not use it to skip the password conversation — a seeded Admin left on a
 * public URL is the reason that conversation exists.
 */
import { createClient } from "@libsql/client";

// The same loader db/migrate.ts and db/check.ts use. Without it this script
// could only ever empty a database whose URL was already exported by hand,
// which is not the database anybody needs to empty.
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    // file absent — fine
  }
}

/**
 * Every table holding business data, children before parents so foreign keys
 * never block a delete.
 *
 * `_migrations` is deliberately absent: the schema stays exactly where it is,
 * and re-running migrations against a reset database must be a no-op.
 *
 * `counters` is deliberately absent too, and for a sharper reason. The
 * patient_no row is created by migration 0006, not by bootstrap, and
 * migrations do not run twice. Deleting it left a database where registering
 * the very first patient threw, because createPatient reads rows[0] of an
 * UPDATE ... RETURNING that matched nothing. It is reset below instead.
 */
const TABLES_CHILD_FIRST = [
  // money, deepest first
  "due_payments",
  "sale_return_service_lines",
  "sale_return_lines",
  "sale_returns",
  "bill_line_batches",
  "bill_service_lines",
  "bill_lines",
  "bills",
  "lab_partner_payments",
  "supplier_payments",

  // stock movements
  "stock_adjustment_lines",
  "stock_adjustments",
  "stock_moves",
  "purchase_return_lines",
  "purchase_returns",
  "purchase_lines",
  "batches",
  "purchases",

  // clinic records
  "alerts_sent",
  "appointments",
  "attachments",
  "visits",
  "patients",

  // catalogs
  "services",
  "service_groups",
  "doctors",
  "lab_partners",
  "item_units",
  "item_locations",
  "items",
  "racks",
  "suppliers",

  // housekeeping and settings
  "audit_log",
  "backups",
  "push_devices",
  "rate_limits",
  "fiscal_years",
  "users",
  "company",
];

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");

  const confirmed = process.argv.includes("--yes");
  const keepAccess = process.argv.includes("--keep-access");
  const keepSetup = process.argv.includes("--keep-setup");

  // Kept out of the delete list, not deleted and restored: a window where the
  // company row is missing is a window where the app has no name to print.
  // A fiscal year is a calendar, not a dummy entry. `bills.ts` would recreate
  // one on the first bill anyway, but until then reports would have no year to
  // stand in, which looks like breakage rather than a fresh start.
  // --keep-setup is the one for going live: the afternoon of test bills goes,
  // and everything the shop typed to make the software theirs stays. A
  // catalogue of five hundred medicines, the shelves they were placed on, the
  // room those shelves stand in, the test list and the outside laboratory are
  // all work somebody did with a keyboard, and none of it is a transaction.
  const SETUP_TABLES = [
    "services",
    "service_groups",
    "doctors",
    "lab_partners",
    "suppliers",
    "item_units",
    "item_locations",
    "items",
    "racks",
  ];
  const KEPT_BY_FLAG = [
    ...(keepAccess || keepSetup ? ["users", "company", "fiscal_years"] : []),
    ...(keepSetup ? SETUP_TABLES : []),
  ];
  const doomed = TABLES_CHILD_FIRST.filter((t) => !KEPT_BY_FLAG.includes(t));

  // Say which database, every time. A reset pointed at the wrong one is not
  // something you can take back.
  const where = url.startsWith("file:")
    ? url
    : url.replace(/^libsql:\/\//, "").split(".")[0];
  console.log(`\nAbout to empty: ${where}`);

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // What is actually there, so the count is real rather than a promise.
  const present = new Set(
    (
      await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
    ).rows.map((r) => r.name as string),
  );

  let total = 0;
  const counts: [string, number][] = [];
  for (const t of doomed) {
    if (!present.has(t)) continue;
    const n = Number(
      (await client.execute(`SELECT COUNT(*) AS n FROM "${t}"`)).rows[0]?.n ?? 0,
    );
    if (n > 0) counts.push([t, n]);
    total += n;
  }

  for (const [t, n] of counts) console.log(`   ${t.padEnd(26)} ${n}`);
  console.log(`   ${"—".repeat(26)} ${total} row(s)\n`);

  if (keepSetup) {
    console.log(
      "   --keep-setup: users, company, fiscal years, the item catalogue,",
    );
    console.log(
      "                 shelves, the shop layout, services, doctors, outside",
    );
    console.log(
      "                 laboratories and suppliers are all left alone.",
    );
  } else if (keepAccess) {
    console.log("   --keep-access: users, company and fiscal years are left alone.");
    console.log(
      "   Change the Admin password afterwards if it is still the seeded one.\n",
    );
  }

  // Anything holding data that this script does not know about is a table
  // added since it was written. Say so rather than leaving it behind silently.
  // counters is handled separately below, not left behind.
  const HANDLED_ELSEWHERE = ["_migrations", "counters"];
  const unknown = [...present].filter(
    (t) => !HANDLED_ELSEWHERE.includes(t) && !TABLES_CHILD_FIRST.includes(t),
  );
  const leftBehind: string[] = [];
  for (const t of unknown) {
    const n = Number(
      (await client.execute(`SELECT COUNT(*) AS n FROM "${t}"`)).rows[0]?.n ?? 0,
    );
    if (n > 0) leftBehind.push(`${t} (${n} rows)`);
  }
  if (leftBehind.length > 0) {
    console.error("Refusing to run. These tables hold data and this script");
    console.error("does not know about them — add them to TABLES_CHILD_FIRST:");
    for (const t of leftBehind) console.error("   " + t);
    process.exit(1);
  }

  if (!confirmed) {
    console.log("Nothing was deleted. Add --yes to actually empty it.\n");
    client.close();
    return;
  }

  // One transaction: either the database is empty afterwards or it is
  // untouched. A half-emptied database is the worst of the three outcomes.
  await client.batch(
    doomed.filter((t) => present.has(t)).map((t) => ({
      sql: `DELETE FROM "${t}"`,
      args: [],
    })),
    "write",
  );

  // Counters are reset, not deleted — see the note on TABLES_CHILD_FIRST. A
  // clinic starting fresh should start at patient 1.
  if (present.has("counters")) {
    await client.execute(
      "INSERT INTO counters (name, next_value) VALUES ('patient_no', 1) " +
        "ON CONFLICT(name) DO UPDATE SET next_value = 1",
    );
  }

  console.log(`Emptied ${total} row(s); patient numbering restarts at 1.`);
  if (keepAccess) {
    console.log("Users and company were kept. Check Settings → Company still");
    console.log("reads right, and change the Admin password if it is seeded.\n");
  } else {
    console.log("Now run: pnpm db:bootstrap --name \"…\" --pan … --admin … --password \"…\" --pin ….\n");
  }
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
