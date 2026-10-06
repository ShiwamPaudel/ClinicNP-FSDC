/**
 * seed.ts — bootstrap a usable pharmacy for local dev / first run.
 * Creates: the current fiscal year, a company row, an admin and a staff user.
 * All sample data is clearly fake (Rules.md §1.10). Idempotent: safe to re-run.
 *
 * Run: pnpm db:seed
 */
import { createClient } from "@libsql/client";
import { randomBytes, scryptSync } from "node:crypto";
import { ulid } from "ulid";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    // absent — fine
  }
}

function hash(secret: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(secret, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

// Minimal BS "today" fiscal-year derivation without importing app code.
// We just insert a plausible current fiscal year; the app re-derives precisely at runtime.
async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set (see .env.example)");
  const c = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
  });

  // --- fiscal year (2083/84: Shrawan 1 2083 -> Ashadh end 2084 in AD) ---
  const fy = await c.execute("SELECT id FROM fiscal_years WHERE bs_label = '2083/84'");
  if (fy.rows.length === 0) {
    await c.execute({
      sql: `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
            VALUES ('2083/84', '2026-07-17', '2027-07-16', 1, 'open')`,
      args: [],
    });
    console.log("seeded fiscal year 2083/84");
  }

  // --- company (sample pharmacy) ---
  const co = await c.execute("SELECT id FROM company WHERE id = 1");
  if (co.rows.length === 0) {
    await c.execute({
      sql: `INSERT INTO company (id, name, address, phone, pan_no, invoice_footer, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, ?)`,
      args: [
        "Green Cross Sample Pharmacy",
        "Kupondole, Lalitpur",
        "01-5555555",
        "301234567",
        "Get well soon",
        new Date().toISOString(),
      ],
    });
    console.log("seeded company profile");
  }

  // --- users ---
  async function ensureUser(
    username: string,
    name: string,
    password: string,
    pin: string,
    role: "admin" | "staff",
  ) {
    const exists = await c.execute({
      sql: "SELECT id FROM users WHERE username = ?",
      args: [username],
    });
    if (exists.rows.length > 0) return;
    await c.execute({
      sql: `INSERT INTO users
              (id, name, username, password_hash, pin_hash, role, can_edit_rate, active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      args: [
        ulid(),
        name,
        username,
        hash(password),
        hash(pin),
        role,
        new Date().toISOString(),
      ],
    });
    console.log(`seeded ${role} user: ${username}`);
  }

  const adminId = (
    await c.execute("SELECT id FROM users WHERE username = 'admin'")
  ).rows[0]?.id as string | undefined;
  await ensureUser("admin", "Sarita (Owner)", "admin123", "1234", "admin");
  await ensureUser("bikash", "Bikash (Counter)", "staff123", "5678", "staff");

  // --- demo catalog (clearly-fake sample data, Rules §1.10) ---
  const demoUser =
    adminId ??
    ((await c.execute("SELECT id FROM users WHERE username = 'admin'")).rows[0]
      ?.id as string);

  async function ensureSupplier(name: string): Promise<string> {
    const ex = await c.execute({
      sql: "SELECT id FROM suppliers WHERE name = ?",
      args: [name],
    });
    if (ex.rows[0]) return ex.rows[0].id as string;
    const id = ulid();
    await c.execute({
      sql: `INSERT INTO suppliers (id, name, pan_no, phone, address, contact_person, terms, active, created_at)
            VALUES (?, ?, '300999888', '01-4111222', 'Kalimati, Kathmandu', 'Hari', '30 days', 1, ?)`,
      args: [id, name, new Date().toISOString()],
    });
    return id;
  }

  function isoInDays(days: number): string {
    const d = new Date(Date.now() + days * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  async function ensureDemoItem(
    brand: string,
    generic: string,
    units: { name: string; factor: number; rate: number; def: boolean }[],
    batches: { batchNo: string; expDays: number; cost: number; baseQty: number }[],
    supplierId: string,
    shape: string,
  ) {
    const ex = await c.execute({
      sql: "SELECT id FROM items WHERE brand_name = ?",
      args: [brand],
    });
    if (ex.rows[0]) return;
    const itemId = ulid();
    const now = new Date().toISOString();
    await c.execute({
      sql: `INSERT INTO items (id, brand_name, generic_name, category, manufacturer,
              min_stock_base_qty, controlled_flag, preferred_supplier_id, active, shape, created_at, updated_at)
            VALUES (?, ?, ?, 'Medicine', 'Citizen Pharma', 100, 0, ?, 1, ?, ?, ?)`,
      args: [itemId, brand, generic, supplierId, shape, now, now],
    });
    for (let level = 0; level < units.length; level++) {
      const u = units[level]!;
      await c.execute({
        sql: `INSERT INTO item_units (id, item_id, level, name, factor_to_base, selling_rate_paisa, is_default_selling)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [ulid(), itemId, level, u.name, u.factor, u.rate, u.def ? 1 : 0],
      });
    }
    for (const b of batches) {
      const batchId = ulid();
      await c.execute({
        sql: `INSERT INTO batches (id, item_id, batch_no, mfg_date_ad, expiry_date_ad,
                purchase_cost_paisa_per_base, received_base_qty, remaining_base_qty, supplier_id, purchase_id, created_at)
              VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?)`,
        args: [batchId, itemId, b.batchNo, isoInDays(b.expDays), b.cost, b.baseQty, b.baseQty, supplierId, now],
      });
      await c.execute({
        sql: `INSERT INTO stock_moves (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
              VALUES (?, ?, ?, ?, 'purchase', 'seed', NULL, ?, ?)`,
        args: [ulid(), batchId, itemId, b.baseQty, demoUser, now],
      });
    }
    console.log(`seeded demo item: ${brand}`);
  }

  const supId = await ensureSupplier("Citizen Pharma Sample");
  await ensureDemoItem(
    "Sample Amoxicillin 500",
    "Amoxicillin 500mg",
    [
      { name: "Tablet", factor: 1, rate: 200, def: false },
      { name: "Strip", factor: 10, rate: 1800, def: true },
      { name: "Box", factor: 60, rate: 10500, def: false },
    ],
    [
      { batchNo: "AMX-2201", expDays: 45, cost: 150, baseQty: 30 }, // near expiry
      { batchNo: "AMX-2202", expDays: 400, cost: 150, baseQty: 300 },
    ],
    supId,
    "capsule",
  );
  await ensureDemoItem(
    "Sample Paracetamol 500",
    "Paracetamol 500mg",
    [
      { name: "Tablet", factor: 1, rate: 100, def: false },
      { name: "Strip", factor: 10, rate: 900, def: true },
    ],
    [{ batchNo: "PCM-3301", expDays: 500, cost: 60, baseQty: 500 }],
    supId,
    "tablet",
  );

  // --- two sample racks, with the demo medicines standing on them ---
  //
  // The map is worth nothing until something is on it, and a training database
  // that shows an empty floor plan teaches the wrong lesson: whoever is
  // learning the software concludes the feature does not work. Two racks and a
  // desk laid out as a small room, with the two demo medicines on different
  // shelves of the same rack so the highlight visibly moves as you search.
  // Position and size are centimetres from the room's top-left corner (0017),
  // not the grid squares 0011 used.
  async function ensureDemoRack(
    name: string,
    kind: string,
    rows: number,
    cols: number,
    xCm: number,
    yCm: number,
    widthCm: number,
    depthCm: number,
    note: string,
  ): Promise<string> {
    const ex = await c.execute({
      sql: "SELECT id FROM racks WHERE name = ?",
      args: [name],
    });
    if (ex.rows[0]) return ex.rows[0].id as string;
    const id = ulid();
    const at = new Date().toISOString();
    await c.execute({
      sql: `INSERT INTO racks (id, name, kind, rows_count, cols_count,
                               x_cm, y_cm, width_cm, depth_cm, rotation,
                               note, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?, ?)`,
      args: [id, name, kind, rows, cols, xCm, yCm, widthCm, depthCm, note, at, at],
    });
    console.log(`seeded sample ${kind}: ${name}`);
    return id;
  }

  // Where a shop keeps things is its own table since 0013 — not a column on
  // the product. See db/migrations/0013 for why.
  async function shelve(brand: string, rackId: string, row: number, col: number) {
    const now = new Date().toISOString();
    const item = await c.execute({
      sql: "SELECT id FROM items WHERE brand_name = ?",
      args: [brand],
    });
    const itemId = item.rows[0]?.id;
    if (!itemId) return;
    await c.execute({
      sql: `INSERT INTO item_locations
              (id, item_id, rack_id, rack_row, rack_col, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '', ?, ?)
            ON CONFLICT(item_id) DO UPDATE SET
              rack_id = excluded.rack_id,
              rack_row = excluded.rack_row,
              rack_col = excluded.rack_col,
              updated_at = excluded.updated_at`,
      args: [ulid(), itemId, rackId, row, col, now, now],
    });
  }

  const frontRack = await ensureDemoRack(
    "Sample Rack 1",
    "rack",
    4,
    5,
    20,
    20,
    100,
    45,
    "By the counter",
  );
  await ensureDemoRack("Sample Rack 2", "rack", 3, 4, 140, 20, 100, 45, "Back wall");
  // One of each kind, so the training database shows what the picker offers.
  await ensureDemoRack(
    "Sample Front Desk", "desk", 2, 4, 20, 200, 140, 70, "Where you bill",
  );
  await shelve("Sample Amoxicillin 500", frontRack, 2, 3);
  await shelve("Sample Paracetamol 500", frontRack, 4, 1);

  // --- sample clinic catalog (clearly-fake, Rules §1.10) ---
  //
  // Every rate here is a placeholder. They are marked `sample_rate` so the
  // counter can say "sample price" out loud and nobody bills a real patient at
  // a number that came from a seed script. Editing a service clears the mark.
  const nowIso = new Date().toISOString();

  async function ensureDoctor(
    id: string,
    name: string,
    qualification: string,
    specialty: string,
    shareBasis: string,
    shareValue: number,
  ) {
    const ex = await c.execute({
      sql: "SELECT id FROM doctors WHERE id = ?",
      args: [id],
    });
    if (ex.rows[0]) return;
    await c.execute({
      sql: `INSERT INTO doctors (id, name, qualification, specialty, nmc_no, phone,
                                 share_basis, share_value, active, created_at, updated_at)
            VALUES (?, ?, ?, ?, '', '', ?, ?, 1, ?, ?)`,
      args: [id, name, qualification, specialty, shareBasis, shareValue, nowIso, nowIso],
    });
    console.log(`seeded sample doctor: ${name}`);
  }

  await ensureDoctor(
    "sample_doc_1",
    "Dr. Sample Physician",
    "MBBS, MD",
    "General Medicine",
    "pct_consult",
    4000,
  );
  await ensureDoctor(
    "sample_doc_2",
    "Dr. Sample Radiologist",
    "MBBS, MD (Radiology)",
    "Radiology",
    "pct_services",
    2000,
  );

  const labId = "sample_lab_1";
  {
    const ex = await c.execute({
      sql: "SELECT id FROM lab_partners WHERE id = ?",
      args: [labId],
    });
    if (!ex.rows[0]) {
      await c.execute({
        sql: `INSERT INTO lab_partners (id, name, pan_no, phone, address,
                                        contact_person, terms, active, created_at, updated_at)
              VALUES (?, 'Sample Diagnostic Laboratory', '300111222', '01-4000000',
                      'Kathmandu', 'Sample contact', 'Monthly', 1, ?, ?)`,
        args: [labId, nowIso, nowIso],
      });
      console.log("seeded sample lab partner");
    }
  }

  async function ensureService(
    id: string,
    name: string,
    code: string,
    groupId: string,
    ratePaisa: number,
    opts: {
      doctorRequired?: boolean;
      defaultDoctorId?: string | null;
      outsourced?: boolean;
      partnerCostPaisa?: number;
      keepsFile?: boolean;
      followupDays?: number;
      followupRatePaisa?: number;
    } = {},
  ) {
    const ex = await c.execute({
      sql: "SELECT id FROM services WHERE id = ?",
      args: [id],
    });
    if (ex.rows[0]) return;
    await c.execute({
      sql: `INSERT INTO services
              (id, name, code, group_id, rate_paisa, doctor_required, default_doctor_id,
               outsourced, default_lab_partner_id, partner_cost_paisa, keeps_file,
               followup_days, followup_rate_paisa, vat_applicable, sample_rate,
               active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 1, ?, ?)`,
      args: [
        id,
        name,
        code,
        groupId,
        ratePaisa,
        opts.doctorRequired ? 1 : 0,
        opts.defaultDoctorId ?? null,
        opts.outsourced ? 1 : 0,
        opts.outsourced ? labId : null,
        opts.partnerCostPaisa ?? 0,
        opts.keepsFile ? 1 : 0,
        opts.followupDays ?? 0,
        opts.followupRatePaisa ?? 0,
        nowIso,
        nowIso,
      ],
    });
    console.log(`seeded sample service: ${name}`);
  }

  await ensureService(
    "sample_svc_opd",
    "Sample OPD Consultation",
    "opd",
    "grp_opd",
    50000,
    {
      doctorRequired: true,
      defaultDoctorId: "sample_doc_1",
      followupDays: 7,
      followupRatePaisa: 0,
    },
  );
  await ensureService(
    "sample_svc_usg",
    "Sample USG - Abdomen and Pelvis",
    "usgap",
    "grp_usg",
    120000,
    { defaultDoctorId: "sample_doc_2", keepsFile: true },
  );
  await ensureService("sample_svc_cbc", "Sample CBC", "cbc", "grp_lab", 60000, {
    outsourced: true,
    partnerCostPaisa: 40000,
    keepsFile: true,
  });
  await ensureService("sample_svc_ecg", "Sample ECG", "ecg", "grp_ecg", 45000, {
    keepsFile: true,
  });
  await ensureService(
    "sample_svc_dressing",
    "Sample Dressing",
    "dress",
    "grp_proc",
    25000,
  );

  c.close();
  console.log("\nseed complete. Log in with:");
  console.log("  admin  / admin123   (Owner)  PIN 1234");
  console.log("  bikash / staff123   (Staff)  PIN 5678");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
