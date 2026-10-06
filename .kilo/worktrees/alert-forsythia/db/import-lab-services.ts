/**
 * import-lab-services.ts — load a laboratory test list into Settings → Services.
 *
 * The file this reads is a dump of another install's `services` table, so its
 * `id`, `group_id` and `default_lab_partner_id` all point at rows that do not
 * exist here. None of them are carried across: a fresh `ulid()` is minted for
 * each test, the group is named on the command line, and the laboratory is
 * named on the command line. Only the parts that describe the *test* are read —
 * name, code, sample type, and whether a report is expected back.
 *
 * **Rates are deliberately not read.** Every test is created at rate 0 with a
 * partner cost of 0, because a price list arrives after a test list does and a
 * rate carried over from another clinic is worse than no rate at all: the
 * counter refuses an unpriced service and says so, where a wrong price prints
 * on a real bill and is discovered by the patient.
 *
 * Safety, because this runs against a clinic that is already trading:
 *   - dry run unless --commit is passed; the dry run touches nothing
 *   - every existing `services` row is written to a timestamped backup file
 *     before the first write
 *   - a test whose name already exists **in the target group** is skipped, so
 *     running it twice cannot produce duplicates
 *   - the whole thing goes in as one batch: all of it lands, or none of it
 *
 * Run:
 *   pnpm tsx db/import-lab-services.ts --file services_lab.csv --group Laboratory --lab "NOVUS PATH LAB AND DIAGNOSTIC CENTER"
 *   pnpm tsx db/import-lab-services.ts --file services_lab.csv --group Laboratory --lab "NOVUS PATH LAB AND DIAGNOSTIC CENTER" --commit
 *
 * `--in-house` drops the laboratory and creates the tests as not outsourced.
 */
import { createClient, type InStatement } from "@libsql/client";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ulid } from "ulid";
import { readCsv, missingColumns } from "../src/lib/csv";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* absent — fine */
  }
}

function arg(name: string, fallback = ""): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

/** Hide the token, keep enough of the host to recognise the database. */
function describe(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

async function main(): Promise<void> {
  const commit = process.argv.includes("--commit");
  const inHouse = process.argv.includes("--in-house");
  const file = arg("file");
  const groupName = arg("group");
  const labName = arg("lab");

  const missing: string[] = [];
  if (!file) missing.push("--file");
  if (!groupName) missing.push("--group");
  if (!labName && !inHouse) missing.push("--lab (or --in-house)");
  if (missing.length > 0) {
    console.error(`\nThis needs ${missing.join(", ")}.\n`);
    process.exit(1);
  }

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.error("TURSO_DATABASE_URL is not set");
    process.exit(1);
  }

  const table = readCsv(readFileSync(file, "utf8"));
  const absent = missingColumns(table, ["name"]);
  if (absent.length > 0) {
    console.error(`${file} has no "${absent.join(", ")}" column.`);
    process.exit(1);
  }

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });

  // --- the group and the laboratory, resolved by name in THIS database ---
  const groups = await client.execute({
    sql: "SELECT id, name FROM service_groups WHERE lower(name) = lower(?)",
    args: [groupName],
  });
  if (groups.rows.length === 0) {
    console.error(`\nNo service group named "${groupName}" in this database.`);
    console.error("Create it in Settings → Services first, or name an existing one.\n");
    process.exit(1);
  }
  const groupId = String(groups.rows[0]!.id);

  let labId: string | null = null;
  if (!inHouse) {
    const labs = await client.execute({
      sql: "SELECT id, name FROM lab_partners WHERE lower(name) = lower(?)",
      args: [labName],
    });
    if (labs.rows.length === 0) {
      console.error(`\nNo laboratory named "${labName}" in this database.\n`);
      process.exit(1);
    }
    labId = String(labs.rows[0]!.id);
  }

  // Existing names **in this group**, lower-cased, so re-running skips rather
  // than duplicating. A name may legitimately repeat across groups.
  const existing = new Set(
    (
      await client.execute({
        sql: "SELECT name FROM services WHERE group_id = ?",
        args: [groupId],
      })
    ).rows.map((r) => String(r.name).trim().toLowerCase()),
  );

  const rows = table.records.filter((r) => r.get("name").trim() !== "");

  const toCreate = rows.filter(
    (r) => !existing.has(r.get("name").trim().toLowerCase()),
  );
  const skipped = rows.length - toCreate.length;

  console.log(`\nFile        ${file}`);
  console.log(`Database    ${describe(url)}`);
  console.log(`Group       ${groups.rows[0]!.name}  (${groupId})`);
  console.log(
    `Laboratory  ${inHouse ? "— none, created as in-house —" : `${labName}  (${labId})`}`,
  );
  console.log(`Rows read   ${rows.length}\n`);
  console.log(`Already in this group, left untouched   ${skipped}`);
  console.log(`New tests to create                     ${toCreate.length}`);
  console.log(`  every one at rate 0, partner cost 0\n`);

  if (toCreate.length === 0) {
    console.log("Nothing to do.\n");
    client.close();
    return;
  }

  if (!commit) {
    console.log("Sample of what would be created:");
    for (const r of toCreate.slice(0, 5)) {
      console.log(
        `  ${r.get("name").trim()}  [code ${r.get("code").trim() || "—"}, sample ${r.get("sample_type").trim() || "—"}, report ${r.get("keeps_file") === "1" ? "expected" : "not expected"}]`,
      );
    }
    console.log(`  …and ${Math.max(0, toCreate.length - 5)} more\n`);
    console.log("Nothing was written. Re-run with --commit to create them.\n");
    client.close();
    return;
  }

  // --- backup before the first write ---
  const all = await client.execute("SELECT * FROM services");
  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = join(dir, `services-before-lab-import-${stamp}.json`);
  writeFileSync(
    backup,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        note: "every services row as it stood before db/import-lab-services.ts ran",
        services: all.rows,
      },
      null,
      1,
    ),
    "utf8",
  );
  console.log(`Backed up ${all.rows.length} existing service row(s) to`);
  console.log(`  ${backup}\n`);

  const now = new Date().toISOString();
  const statements: InStatement[] = toCreate.map((r) => ({
    sql: `INSERT INTO services
            (id, name, code, group_id, rate_paisa, doctor_required,
             default_doctor_id, outsourced, default_lab_partner_id,
             partner_cost_paisa, keeps_file, followup_days, followup_rate_paisa,
             vat_applicable, sample_rate, active, created_at, updated_at,
             sample_type)
          VALUES (?, ?, ?, ?, 0, 0, NULL, ?, ?, 0, ?, 0, 0, 0, 0, 1, ?, ?, ?)`,
    args: [
      ulid(),
      r.get("name").trim(),
      r.get("code").trim() || null,
      groupId,
      inHouse ? 0 : 1,
      labId,
      r.get("keeps_file") === "1" ? 1 : 0,
      now,
      now,
      r.get("sample_type").trim(),
    ],
  }));

  await client.batch(statements, "write");
  console.log(`Created ${statements.length} tests in ${groups.rows[0]!.name}.`);
  console.log(
    "All of them at rate 0 — the counter refuses a service with no rate, so\n" +
      "set prices in Settings → Services before they can be billed.\n",
  );
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
