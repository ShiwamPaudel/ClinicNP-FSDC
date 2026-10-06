/**
 * A backup is only worth having if it contains everything.
 *
 * A table added in some later phase and forgotten in the backup list would not
 * fail anything — it would simply not come back after a restore, and nobody
 * would find out until they needed it. So the list is compared against the
 * database's own list of tables, and anything deliberately left out has to say
 * why.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ulid } from "ulid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `backup.${process.pid}-${Date.now()}.db`);

process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

function splitStatements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${DB_FILE}${suffix}`, { force: true });
    } catch {
      // a lingering handle on Windows — the unique name makes it harmless
    }
  }
});

async function q(sql: string, args: unknown[] = []) {
  const { db } = await import("@/lib/db");
  const res = await db().execute({ sql, args: args as never });
  return res.rows;
}

beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
  const { __resetDbForTests } = await import("@/lib/db");
  __resetDbForTests();

  const raw = createClient({ url: `file:${DB_FILE}` });
  const migDir = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migDir).filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of splitStatements(readFileSync(join(migDir, f), "utf8"))) {
      await raw.execute(stmt);
    }
  }
  await raw.execute(
    `INSERT INTO users (id, name, username, password_hash, role, created_at)
     VALUES ('u1','Anita','anita','x','admin','t')`,
  );
  await raw.execute(
    `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
     VALUES ('2083/84','2026-07-17','2027-07-16',1,'open')`,
  );
  raw.close();
});

describe("what a backup contains", () => {
  it("covers every table in the database, or says why not", async () => {
    const { NOT_BACKED_UP } = await import("@/lib/repos/backup");
    const { exportAll } = await import("@/lib/repos/backup");

    const real = (
      await q(
        `SELECT name FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
          ORDER BY name`,
      )
    ).map((r) => r.name as string);

    const archive = await exportAll();
    const covered = new Set(Object.keys(archive.tables));

    const missing = real.filter(
      (t) => !covered.has(t) && !(t in NOT_BACKED_UP),
    );
    expect(missing).toEqual([]);
  });

  it("lists the clinic tables, not only the pharmacy ones", async () => {
    const { exportAll } = await import("@/lib/repos/backup");
    const archive = await exportAll();
    for (const t of [
      "patients",
      "visits",
      "attachments",
      "services",
      "doctors",
      "lab_partners",
      "bill_service_lines",
      "sale_return_service_lines",
      "lab_partner_payments",
      "counters",
    ]) {
      expect(Object.keys(archive.tables)).toContain(t);
    }
  });
});

describe("restoring", () => {
  it("puts the whole system back to the snapshot, fiscal-year status included", async () => {
    const { exportAll, restoreAll } = await import("@/lib/repos/backup");
    const { createPatient } = await import("@/lib/repos/patients");

    await createPatient({
      id: ulid(),
      name: "Before The Backup",
      sex: "f",
      ageValue: 30,
      ageUnit: "y",
      ageAsOfAd: "2026-08-29",
      dobAd: null,
      phone: "9800000001",
      address: "Patan",
      userId: "u1",
    });

    const snapshot = await exportAll();

    // ...then the day goes on: another patient, and the year gets closed.
    await createPatient({
      id: ulid(),
      name: "After The Backup",
      sex: "m",
      ageValue: 40,
      ageUnit: "y",
      ageAsOfAd: "2026-08-29",
      dobAd: null,
      phone: "9800000002",
      address: "Patan",
      userId: "u1",
    });
    const { closeYearAndOpenNext } = await import("@/lib/repos/fiscal");
    await closeYearAndOpenNext("u1");

    expect(Number((await q("SELECT COUNT(*) n FROM patients"))[0]!.n)).toBe(2);
    expect(
      Number((await q("SELECT COUNT(*) n FROM fiscal_years"))[0]!.n),
    ).toBe(2);

    await restoreAll(snapshot);

    // one patient, and the year is open again exactly as it was
    const people = await q("SELECT name FROM patients");
    expect(people).toHaveLength(1);
    expect(people[0]!.name).toBe("Before The Backup");

    const years = await q("SELECT bs_label, status FROM fiscal_years");
    expect(years).toHaveLength(1);
    expect(years[0]!.status).toBe("open");

    // and the counter went back too, so the next number is not a duplicate
    const counter = await q(
      "SELECT next_value FROM counters WHERE name = 'patient_no'",
    );
    expect(Number(counter[0]!.next_value)).toBe(2);
  });

  it("leaves the database usable: the next patient gets the next number", async () => {
    const { createPatient } = await import("@/lib/repos/patients");
    const p = await createPatient({
      id: ulid(),
      name: "After The Restore",
      sex: "f",
      ageValue: 25,
      ageUnit: "y",
      ageAsOfAd: "2026-08-29",
      dobAd: null,
      phone: "9800000003",
      address: "Patan",
      userId: "u1",
    });
    expect(p.patientNo).toBe(2);
  });
});
