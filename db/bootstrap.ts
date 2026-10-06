/**
 * bootstrap.ts — the empty production start.
 *
 * `db:seed` fills a database with clearly-fake sample data so somebody can be
 * trained on it. This is the opposite: it creates the least a real clinic needs
 * to open its doors, and nothing else. No sample services, no sample doctors,
 * no sample medicines, no demo patients — because a placeholder price that
 * survives into a real bill is worse than an empty catalog.
 *
 * It writes exactly three things:
 *   1. the company row, with the details passed in
 *   2. the fiscal year that is current today, marked open
 *   3. one Admin user
 *
 * Everything else — services, doctors, laboratories, medicines, opening stock —
 * is entered by the clinic, and the go-live checklist walks through it.
 *
 * Running it twice is safe: it fills in only what is missing.
 *
 *   pnpm db:bootstrap --name "Chunidevi Health Polyclinic Pvt. Ltd." --pan 601234567 \
 *     --admin sarita --password "…" --pin 1234
 */
import { createClient } from "@libsql/client";
import { ulid } from "ulid";
import { randomBytes, scryptSync } from "node:crypto";
import { today, fiscalYearOf, fiscalYearAdRange, adToIso } from "../src/lib/bs";

// The same loader db/migrate.ts, db/check.ts and db/import-items.ts use, so
// they all look at the same database. Without this, bootstrap is the one script
// that cannot see .env.local and stops at "TURSO_DATABASE_URL is not set".
for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    // file absent — fine
  }
}

function arg(name: string, fallback = ""): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

/**
 * Exactly the hashing the app verifies against — salted scrypt, same format as
 * db/seed.ts. Anything else produces a user who cannot sign in, which is the
 * kind of mistake that is only discovered at the clinic on the first morning.
 */
function hash(secret: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(secret, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");

  // Which halves of the product this install is. The schema defaults to
  // pharmacy-only, which is wrong for anywhere that also runs a clinic — and
  // getting it wrong means every clinic route returns 404 on the first
  // morning with no obvious reason why. So it is stated, not inherited.
  const clinicOn = process.argv.includes("--clinic");
  const pharmacyOn = !process.argv.includes("--no-pharmacy");
  if (!clinicOn && !pharmacyOn) {
    throw new Error("An install needs at least one module. Drop --no-pharmacy, or add --clinic.");
  }

  const name = arg("name");
  const pan = arg("pan");
  const address = arg("address");
  const phone = arg("phone");
  const adminUser = arg("admin", "admin");
  const adminName = arg("admin-name", "Owner");
  const password = arg("password");
  const pin = arg("pin");

  const missing: string[] = [];
  if (!name) missing.push("--name");
  if (!pan) missing.push("--pan");
  if (!password) missing.push("--password");
  if (!pin) missing.push("--pin");
  if (missing.length > 0) {
    console.error(
      `\nThis needs ${missing.join(", ")}.\n\n` +
        `  pnpm db:bootstrap --name "Clinic name" --pan 601234567 \\\n` +
        `    --address "Ward, municipality" --phone "01-5555555" \\\n` +
        `    --admin sarita --admin-name "Sarita" --password "…" --pin 1234\n`,
    );
    process.exit(1);
  }
  if (!/^\d{4,6}$/.test(pin)) {
    console.error("The PIN should be 4 to 6 digits.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Use a password of at least 8 characters.");
    process.exit(1);
  }

  const c = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const now = new Date().toISOString();

  // --- 1. the company ---
  const company = await c.execute("SELECT id FROM company WHERE id = 1");
  if (company.rows.length === 0) {
    await c.execute({
      sql: `INSERT INTO company
              (id, name, address, phone, pan_no, module_pharmacy, module_clinic,
               updated_at)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
      args: [name, address, phone, pan, pharmacyOn ? 1 : 0, clinicOn ? 1 : 0, now],
    });
    console.log(`company: ${name}`);
  console.log(
    `modules: ${[pharmacyOn ? "pharmacy" : null, clinicOn ? "clinic" : null].filter(Boolean).join(" + ")}`,
  );
  } else {
    console.log("company: already set up, left alone");
  }

  // --- 2. the fiscal year that is current today ---
  const openYear = await c.execute(
    "SELECT bs_label FROM fiscal_years WHERE status = 'open'",
  );
  if (openYear.rows.length === 0) {
    const fy = fiscalYearOf(today());
    const range = fiscalYearAdRange(fy);
    await c.execute({
      sql: `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
            VALUES (?, ?, ?, 1, 'open')`,
      args: [fy.label, adToIso(range.startAd), adToIso(range.endAd)],
    });
    console.log(`fiscal year: ${fy.label}, open`);
  } else {
    console.log(`fiscal year: ${openYear.rows[0]!.bs_label} already open`);
  }

  // --- 3. one Admin ---
  const existing = await c.execute({
    sql: "SELECT id FROM users WHERE username = ?",
    args: [adminUser],
  });
  if (existing.rows.length === 0) {
    await c.execute({
      sql: `INSERT INTO users (id, name, username, password_hash, pin_hash, role,
                               can_edit_rate, active, created_at)
            VALUES (?, ?, ?, ?, ?, 'admin', 1, 1, ?)`,
      args: [ulid(), adminName, adminUser, hash(password), hash(pin), now],
    });
    console.log(`admin user: ${adminUser}`);
  } else {
    console.log(`admin user: ${adminUser} already exists, left alone`);
  }

  // --- what is deliberately not here ---
  const counts = await c.execute(
    `SELECT (SELECT COUNT(*) FROM items) items,
            (SELECT COUNT(*) FROM services) services,
            (SELECT COUNT(*) FROM patients) patients`,
  );
  const r = counts.rows[0]!;
  console.log(
    `\nCatalog is empty on purpose: ${r.items} medicines, ${r.services} services, ${r.patients} patients.`,
  );
  console.log(
    "Enter them from Settings, following prod-docs/Go-live-checklist.md.\n",
  );

  c.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
