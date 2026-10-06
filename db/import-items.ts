/**
 * import-items.ts — load a catalogue of medicines from a spreadsheet.
 *
 * A pharmacy switching to ClinicNP has three or four hundred products, and
 * typing them in one form at a time is a week of somebody's life before the
 * software has sold anything. So the catalogue arrives as a file.
 *
 * Two rules, and everything here follows from them:
 *
 *   1. It only ever CREATES. A brand name already in the database is skipped
 *      whole — never re-priced, never re-shaped, never moved off its shelf.
 *      An import that overwrites is an import nobody dares run twice, and the
 *      one thing this must survive is being run again with ten more rows on
 *      the end (D-084).
 *
 *   2. It shows before it writes. Plain `pnpm db:import-items <file>` reads,
 *      checks and reports, and touches nothing. `--commit` writes. The
 *      database it is pointed at is printed first, because "which database
 *      was that" is a question people only ask afterwards.
 *
 *   pnpm db:import-items import-templates/pharmacy-items.STARTER.csv
 *   pnpm db:import-items import-templates/pharmacy-items.STARTER.csv --commit
 *
 * Prices may be blank. An item with no price is created unsellable rather than
 * free: the counter refuses it and says why, and Items -> Set prices is where
 * it gets one. That is deliberate — a catalogue usually arrives before a price
 * list does, and the alternative is a real bill with Rs 0 on it.
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { ulid } from "ulid";
import { readCsv, missingColumns } from "../src/lib/csv";
import { parseItemFile, REQUIRED_ITEM_COLUMNS } from "../src/lib/item-import";

// The same loader db/migrate.ts, db/check.ts and db/reset.ts use, so all four
// look at the same database.
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    // file absent — fine
  }
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
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const file = args.find((a) => !a.startsWith("--"));

  if (!file) {
    console.error("Usage: pnpm db:import-items <file.csv> [--commit]");
    process.exit(1);
  }

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.error("TURSO_DATABASE_URL is not set (see .env.example)");
    process.exit(1);
  }

  const table = readCsv(readFileSync(file, "utf8"));
  const missing = missingColumns(table, REQUIRED_ITEM_COLUMNS);
  if (missing.length > 0) {
    console.error(`\n${file} is missing these columns: ${missing.join(", ")}`);
    console.error("Do not rename or delete the header row.\n");
    process.exit(1);
  }

  const { items, errors } = parseItemFile(table);

  console.log(`\nFile      ${file}`);
  console.log(`Database  ${describe(url)}`);
  console.log(`Rows read ${table.records.length}\n`);

  if (errors.length > 0) {
    console.log(`${errors.length} row${errors.length === 1 ? "" : "s"} could not be read:\n`);
    for (const e of errors) {
      console.log(`  row ${e.rowNumber}  ${e.label} — ${e.message}`);
    }
    console.log("");
  }

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });

  // Existing names, lower-cased, so "cetamol 500mg" and "Cetamol 500mg" are
  // recognised as the same medicine rather than imported twice.
  const existing = new Set(
    (await client.execute("SELECT brand_name FROM items")).rows.map((r) =>
      String(r.brand_name).trim().toLowerCase(),
    ),
  );

  const toCreate = items.filter((i) => !existing.has(i.brandName.toLowerCase()));
  const skipped = items.length - toCreate.length;
  const unpriced = toCreate.filter((i) =>
    i.units.every((u) => u.sellingRatePaisa === 0),
  ).length;

  console.log(`Already in the database, left untouched   ${skipped}`);
  console.log(`New medicines to create                   ${toCreate.length}`);
  if (unpriced > 0) {
    console.log(`  ...of those, with no price yet          ${unpriced}`);
  }
  console.log("");

  if (!commit) {
    console.log("Nothing was written. Re-run with --commit to create them.\n");
    client.close();
    return;
  }

  const now = new Date().toISOString();
  let created = 0;

  /**
   * Written in batches, and the batch size is the point. A catalogue of a
   * thousand products is three thousand statements; sent one at a time over
   * the network that is thousands of round trips, which is slow enough that a
   * real import was cut off part way through. A batch is one round trip and
   * one transaction: it either lands whole or not at all, and a medicine can
   * never end up in the catalogue without its units.
   *
   * It stays safe to re-run: only names that are not already there are sent,
   * so finishing an import that stopped half way is the same command again.
   */
  const PER_BATCH = 50;
  for (let from = 0; from < toCreate.length; from += PER_BATCH) {
    const slice = toCreate.slice(from, from + PER_BATCH);
    const statements = [];
    for (const item of slice) {
      const id = ulid();
      statements.push({
        sql: `INSERT INTO items
                (id, brand_name, generic_name, category, manufacturer,
                 min_stock_base_qty, controlled_flag, preferred_supplier_id,
                 active, shape, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?, ?)`,
        args: [
          id,
          item.brandName,
          item.genericName,
          item.category,
          item.manufacturer,
          item.minStockBaseQty,
          item.controlledFlag ? 1 : 0,
          item.shape,
          now,
          now,
        ],
      });
      for (const u of item.units) {
        statements.push({
          sql: `INSERT INTO item_units
                  (id, item_id, level, name, factor_to_base, selling_rate_paisa, is_default_selling)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            ulid(),
            id,
            u.level,
            u.name,
            u.factorToBase,
            u.sellingRatePaisa,
            u.isDefaultSelling ? 1 : 0,
          ],
        });
      }
    }
    await client.batch(statements, "write");
    created += slice.length;
    process.stdout.write(`\r  written ${created} of ${toCreate.length}…`);
  }
  if (created > 0) process.stdout.write("\r");

  console.log(`Created ${created} medicine${created === 1 ? "" : "s"}.`);
  if (unpriced > 0) {
    console.log(
      `${unpriced} of them have no price and cannot be sold until they do — Items -> Set prices.`,
    );
  }
  console.log("");
  client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
