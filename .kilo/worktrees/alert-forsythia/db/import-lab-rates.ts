/**
 * import-lab-rates.ts — load the laboratory and ultrasound price list into
 * Settings → Services.
 *
 * Reads the rows prepared from "Laboratory Service - RATE LIST HHC.pdf"
 * (name, short code, rate, sample) and writes them as services in the
 * Laboratory group, every one of them sent to the outside laboratory.
 *
 * Safety, because this runs against the live clinic:
 *   - dry run unless --commit is passed; the dry run prints exactly what would
 *     change and touches nothing
 *   - every existing service row is written to a timestamped backup file
 *     before the first write
 *   - a service whose name already exists in its group is skipped, so running
 *     it twice cannot produce duplicates
 *   - the whole thing goes in as one batch: all of it lands, or none of it
 *
 * Run:
 *   pnpm tsx db/import-lab-rates.ts --from <rows.json>
 *   pnpm tsx db/import-lab-rates.ts --from <rows.json> --commit
 */
import { createClient, type InStatement } from "@libsql/client";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ulid } from "ulid";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* absent — fine */
  }
}

const args = process.argv.slice(2);
const COMMIT = args.includes("--commit");
const fromIdx = args.indexOf("--from");
if (fromIdx === -1 || !args[fromIdx + 1]) {
  throw new Error("pass --from <rows.json>");
}
const ROWS_FILE = args[fromIdx + 1]!;

/** One laboratory test as prepared from the price list. */
interface LabRow {
  no: number;
  name: string;
  code: string;
  ratePaisa: number;
  sampleType: string;
  method: string;
  rawSample: string;
}

/** The six ultrasound services, as given by the clinic. */
const ULTRASOUND: { name: string; code: string; ratePaisa: number }[] = [
  { name: "Ultrasound (A+P)", code: "usgap", ratePaisa: 100000 },
  { name: "Ultrasound (Soft-Tissue)", code: "usgsoft", ratePaisa: 150000 },
  { name: "Ultrasound (Thyroid)", code: "usgthy", ratePaisa: 150000 },
  { name: "Ultrasound (Breast)", code: "usgbreast", ratePaisa: 150000 },
  { name: "Ultrasound (Obs)", code: "usgobs", ratePaisa: 100000 },
  { name: "Ultrasound (NT/NO)", code: "usgntno", ratePaisa: 120000 },
];

const SAMPLE_TYPES = new Set([
  "Blood", "Urine", "Stool", "Swab", "Sputum", "Semen", "Fluid", "Tissue", "",
]);

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");
  const c = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  const labRows: LabRow[] = JSON.parse(readFileSync(ROWS_FILE, "utf8"));

  // ---- validate the input before looking at the database -----------------
  for (const r of labRows) {
    if (!r.name) throw new Error(`row ${r.no}: empty name`);
    if (!Number.isInteger(r.ratePaisa) || r.ratePaisa <= 0) {
      throw new Error(`row ${r.no} (${r.name}): bad rate ${r.ratePaisa}`);
    }
    if (!SAMPLE_TYPES.has(r.sampleType)) {
      throw new Error(`row ${r.no} (${r.name}): sample "${r.sampleType}" is not one the app offers`);
    }
  }

  // ---- the groups and the partner laboratory must already exist ----------
  const groups = await c.execute("SELECT id, name FROM service_groups");
  const groupByName = new Map(
    groups.rows.map((g) => [String(g.name).toLowerCase(), String(g.id)]),
  );
  const labGroup = groupByName.get("laboratory");
  const usgGroup = groupByName.get("ultrasound");
  if (!labGroup) throw new Error("no service group named Laboratory");
  if (!usgGroup) throw new Error("no service group named Ultrasound");

  const partners = await c.execute(
    "SELECT id, name FROM lab_partners WHERE active = 1",
  );
  const proton = partners.rows.find((p) =>
    String(p.name).toLowerCase().includes("proton"),
  );
  if (!proton) throw new Error("no active lab partner matching 'Proton'");
  const protonId = String(proton.id);

  const admin = await c.execute(
    "SELECT id FROM users WHERE username = 'admin' LIMIT 1",
  );
  const adminId = admin.rows[0]?.id ? String(admin.rows[0].id) : null;

  // ---- what is already there --------------------------------------------
  const existing = await c.execute(
    "SELECT id, name, group_id, rate_paisa, partner_cost_paisa FROM services",
  );
  const key = (groupId: string, name: string) =>
    `${groupId}::${name.trim().toLowerCase()}`;
  const existingByKey = new Map(
    existing.rows.map((s) => [
      key(String(s.group_id), String(s.name)),
      {
        id: String(s.id),
        name: String(s.name),
        rate: Number(s.rate_paisa),
      },
    ]),
  );
  // The CBC already configured for this clinic, whatever it is called.
  const existingCbc = existing.rows.find(
    (s) =>
      String(s.group_id) === labGroup &&
      /\bcbc\b|complete blood count/i.test(String(s.name)),
  );

  const now = new Date().toISOString();
  const statements: InStatement[] = [];
  const planned: string[] = [];
  const skipped: string[] = [];

  // ---- laboratory --------------------------------------------------------
  for (const r of labRows) {
    const isCbc = /complete blood count/i.test(r.name);

    if (isCbc && existingCbc) {
      // Update the row the clinic already has rather than adding a second CBC.
      statements.push({
        sql: `UPDATE services
                 SET name = ?, code = ?, group_id = ?, rate_paisa = ?,
                     doctor_required = 0, default_doctor_id = NULL,
                     outsourced = 1, default_lab_partner_id = ?,
                     partner_cost_paisa = ?, keeps_file = 1,
                     followup_days = 0, followup_rate_paisa = 0,
                     vat_applicable = 0, sample_rate = 0, active = 1,
                     sample_type = ?, updated_at = ?
               WHERE id = ?`,
        args: [r.name, r.code, labGroup, r.ratePaisa, protonId, r.ratePaisa,
          r.sampleType, now, String(existingCbc.id)],
      });
      planned.push(
        `UPDATE  ${String(existingCbc.name)} -> ${r.name}  ` +
        `Rs ${Number(existingCbc.rate_paisa) / 100} -> ${r.ratePaisa / 100}`,
      );
      continue;
    }

    if (existingByKey.has(key(labGroup, r.name))) {
      skipped.push(`already present: ${r.name}`);
      continue;
    }

    statements.push({
      sql: `INSERT INTO services
              (id, name, code, group_id, rate_paisa, doctor_required,
               default_doctor_id, outsourced, default_lab_partner_id,
               partner_cost_paisa, keeps_file, followup_days,
               followup_rate_paisa, vat_applicable, sample_rate, active,
               sample_type, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, NULL, 1, ?, ?, 1, 0, 0, 0, 0, 1, ?, ?, ?)`,
      args: [ulid(), r.name, r.code, labGroup, r.ratePaisa, protonId,
        r.ratePaisa, r.sampleType, now, now],
    });
    planned.push(
      `INSERT  ${r.name.padEnd(46)} Rs ${String(r.ratePaisa / 100).padStart(5)}  ` +
      `${r.code.padEnd(11)} ${r.sampleType}`,
    );
  }

  // ---- ultrasound --------------------------------------------------------
  for (const u of ULTRASOUND) {
    if (existingByKey.has(key(usgGroup, u.name))) {
      skipped.push(`already present: ${u.name}`);
      continue;
    }
    statements.push({
      sql: `INSERT INTO services
              (id, name, code, group_id, rate_paisa, doctor_required,
               default_doctor_id, outsourced, default_lab_partner_id,
               partner_cost_paisa, keeps_file, followup_days,
               followup_rate_paisa, vat_applicable, sample_rate, active,
               sample_type, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, NULL, 0, NULL, 0, 0, 0, 0, 0, 0, 1, '', ?, ?)`,
      args: [ulid(), u.name, u.code, usgGroup, u.ratePaisa, now, now],
    });
    planned.push(
      `INSERT  ${u.name.padEnd(46)} Rs ${String(u.ratePaisa / 100).padStart(5)}  ` +
      `${u.code.padEnd(11)} (ultrasound, nothing collected)`,
    );
  }

  // ---- report ------------------------------------------------------------
  console.log(`rows read from the price list : ${labRows.length}`);
  console.log(`ultrasound services           : ${ULTRASOUND.length}`);
  console.log(`services already in ClinicNP  : ${existing.rows.length}`);
  console.log(`statements to run             : ${statements.length}`);
  console.log(`skipped (already present)     : ${skipped.length}`);
  console.log(`laboratory group id           : ${labGroup}`);
  console.log(`ultrasound group id           : ${usgGroup}`);
  console.log(`partner laboratory            : ${String(proton.name)}\n`);

  for (const line of planned.slice(0, 12)) console.log("  " + line);
  if (planned.length > 12) console.log(`  ... and ${planned.length - 12} more`);
  for (const s of skipped) console.log("  SKIP    " + s);

  // The full plan goes to a file either way, so a 250-row change can be read
  // through before it is applied and checked against afterwards.
  const planDir = join(process.cwd(), "backups");
  mkdirSync(planDir, { recursive: true });
  const planPath = join(
    planDir,
    `rate-import-plan-${now.replace(/[:.]/g, "-")}.txt`,
  );
  writeFileSync(planPath, planned.concat(skipped.map((s) => "SKIP " + s)).join("\n"));
  console.log(`\nfull plan written → ${planPath}`);

  if (!COMMIT) {
    console.log("\nDRY RUN — nothing was written. Re-run with --commit to apply.");
    c.close();
    return;
  }

  // ---- back up every existing service before touching anything ----------
  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const stamp = now.replace(/[:.]/g, "-");
  const backupPath = join(dir, `services-before-rate-import-${stamp}.json`);
  const full = await c.execute("SELECT * FROM services");
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        takenAt: now,
        note: "every services row as it stood before import-lab-rates.ts ran",
        serviceGroups: groups.rows,
        services: full.rows,
      },
      null,
      1,
    ),
  );
  console.log(`\nbackup written → ${backupPath}`);

  // One audit entry, so a 250-row change is not invisible in a system that
  // records who did what.
  statements.push({
    sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
          VALUES (?, ?, 'services.rates_imported', ?, ?)`,
    args: [ulid(), adminId, JSON.stringify({
      source: "Laboratory Service - RATE LIST HHC.pdf",
      laboratoryTests: labRows.length,
      ultrasoundServices: ULTRASOUND.length,
      statements: statements.length,
      partnerLaboratory: String(proton.name),
      backup: `services-before-rate-import-${stamp}.json`,
    }), now],
  });

  await c.batch(statements, "write");
  console.log(`applied ${statements.length} statements.`);

  const after = await c.execute(
    `SELECT g.name AS grp, COUNT(*) AS n
       FROM services s JOIN service_groups g ON g.id = s.group_id
      GROUP BY g.name ORDER BY g.name`,
  );
  console.log("\nservices now:");
  for (const r of after.rows) console.log(`  ${String(r.grp).padEnd(12)} ${r.n}`);

  c.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
