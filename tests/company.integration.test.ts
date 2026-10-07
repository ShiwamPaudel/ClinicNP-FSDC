/**
 * The company profile: saving it, reading it back, and changing it again.
 *
 * This suite exists because `saveCompany` shipped with a malformed INSERT —
 * fourteen columns against fifteen values — and no test ever called it, so
 * every check was green while the clinic's own name could not be saved. The
 * lesson is not "count placeholders more carefully"; it is that a repo
 * function nothing exercises is a repo function nobody knows is broken.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `company.${process.pid}-${Date.now()}.db`);

function split(sql: string): string[] {
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

beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
  const { __resetDbForTests } = await import("@/lib/db");
  __resetDbForTests();
  for (const s of ["", "-wal", "-shm"]) rmSync(`${DB_FILE}${s}`, { force: true });

  const c = createClient({ url: `file:${DB_FILE}` });
  const migrations = join(__dirname, "..", "db", "migrations");
  const { readdirSync } = await import("node:fs");
  for (const f of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of split(readFileSync(join(migrations, f), "utf8"))) {
      await c.execute(stmt);
    }
  }
  c.close();
});

describe("the company profile", () => {
  it("saves a profile onto an empty database and reads it back", async () => {
    const { saveCompany, getCompany } = await import("@/lib/repos/company");

    await saveCompany({
      name: "Family Smile Dental Care Center",
      address: "Bhaktapur, Suryabinayak-4",
      phone: "01-6612345",
      panNo: "601234567",
      ddaNo: "DDA-99",
      vatRegistered: true,
      vatInclusive: true,
      invoiceFooter: "Get well soon",
      logoUrl: null,
      printFormat: "a5",
      roundingOn: true,
      expiryAlertDays: 90,
      minRateIsCost: true,
      rackDisplay: "off",
      dateCalendar: "ad",
    });

    const saved = await getCompany();
    expect(saved.name).toBe("Family Smile Dental Care Center");
    expect(saved.address).toBe("Bhaktapur, Suryabinayak-4");
    expect(saved.phone).toBe("01-6612345");
    expect(saved.panNo).toBe("601234567");
    expect(saved.ddaNo).toBe("DDA-99");
    expect(saved.vatRegistered).toBe(true);
    expect(saved.vatInclusive).toBe(true);
    expect(saved.printFormat).toBe("a5");
    expect(saved.roundingOn).toBe(true);
    expect(saved.expiryAlertDays).toBe(90);
    expect(saved.minRateIsCost).toBe(true);
    expect(saved.dateCalendar).toBe("ad");
  });

  it("changing the name a second time updates the same single row", async () => {
    const { saveCompany, getCompany } = await import("@/lib/repos/company");
    const { db } = await import("@/lib/db");

    const before = await getCompany();
    await saveCompany({ ...before, name: "Family Smile Dental Care" });

    const after = await getCompany();
    expect(after.name).toBe("Family Smile Dental Care");
    // everything else survives the rename
    expect(after.panNo).toBe(before.panNo);
    expect(after.printFormat).toBe(before.printFormat);

    const rows = await db().execute("SELECT COUNT(*) AS n FROM company");
    expect(Number(rows.rows[0]?.n)).toBe(1);
  });

  it("keeps the booleans apart instead of shifting them along by one", async () => {
    // A wrong placeholder count does not always throw — it can silently write
    // each value into its neighbour's column. Setting the three flags to
    // different values is what catches that.
    const { saveCompany, getCompany } = await import("@/lib/repos/company");

    await saveCompany({
      name: "Flag Check",
      address: "a",
      phone: "p",
      panNo: "1",
      ddaNo: "2",
      vatRegistered: true,
      vatInclusive: false,
      invoiceFooter: "f",
      logoUrl: null,
      printFormat: "thermal",
      roundingOn: false,
      expiryAlertDays: 30,
      minRateIsCost: true,
      rackDisplay: "off",
      dateCalendar: "bs",
    });

    const c = await getCompany();
    expect(c.vatRegistered).toBe(true);
    expect(c.roundingOn).toBe(false);
    expect(c.minRateIsCost).toBe(true);
    expect(c.expiryAlertDays).toBe(30);
    expect(c.invoiceFooter).toBe("f");
    expect(c.dateCalendar).toBe("bs");
  });
});

describe("the calendar the date boxes open in (0020)", () => {
  it("is read on its own for the layout, and follows what was saved", async () => {
    const { saveCompany, getCompany, getDateCalendar } = await import(
      "@/lib/repos/company"
    );
    const before = await getCompany();
    await saveCompany({ ...before, dateCalendar: "ad" });
    expect(await getDateCalendar()).toBe("ad");
    await saveCompany({ ...before, dateCalendar: "bs" });
    expect(await getDateCalendar()).toBe("bs");
  });

  it("is Nepali for a shop that never chose, which is what every box showed before", async () => {
    const { db } = await import("@/lib/db");
    const { getDateCalendar } = await import("@/lib/repos/company");
    // A company row written without the column — an old backup being
    // restored, or a row that predates 0020 — takes the column default.
    await db().execute("DELETE FROM company");
    await db().execute(
      "INSERT INTO company (id, name, updated_at) VALUES (1, 'Old row', '2026-01-01T00:00:00Z')",
    );
    expect(await getDateCalendar()).toBe("bs");
  });

  it("refuses anything but the two calendars at the database", async () => {
    const { db } = await import("@/lib/db");
    await expect(
      db().execute("UPDATE company SET date_calendar = 'nepali' WHERE id = 1"),
    ).rejects.toThrow();
  });
});
