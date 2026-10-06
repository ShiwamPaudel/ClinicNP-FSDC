/**
 * Phase 3 acceptance: services and clinic billing at the counter, against an
 * isolated file database. Walks the checklist in Phases.md Phase 3.
 *
 * Everything here goes through the real ingest path — the same code the outbox
 * posts to — so what is asserted is what a real bill would do.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ulid } from "ulid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `phase3-clinic.${process.pid}-${Date.now()}.db`);

process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
process.env.TURSO_AUTH_TOKEN = "";

const TODAY_AD = "2026-08-29";
const TODAY_BS = "2083-05-13";

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

let patientId = "";
let itemId = "";
let batchId = "";

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
     VALUES ('u1','Anita','anita','x','staff','t')`,
  );
  await raw.execute(
    `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
     VALUES ('2083/84','2026-07-17','2027-07-16',1,'open')`,
  );

  // --- a doctor on 40% of consultations ---
  await raw.execute(
    `INSERT INTO doctors (id, name, qualification, specialty, nmc_no, phone,
                          share_basis, share_value, active, created_at, updated_at)
     VALUES ('doc1','Dr. Sunita Karki','MBBS, MD','General Medicine','12345','9800000000',
             'pct_consult', 4000, 1, 't', 't')`,
  );
  await raw.execute(
    `INSERT INTO doctors (id, name, share_basis, share_value, active, created_at, updated_at)
     VALUES ('doc2','Dr. Ram Thapa','fixed_consult', 15000, 1, 't', 't')`,
  );

  // --- an outside laboratory ---
  await raw.execute(
    `INSERT INTO lab_partners (id, name, pan_no, phone, address, contact_person,
                               terms, active, created_at, updated_at)
     VALUES ('lab1','Everest Diagnostic Laboratory','300111222','01-4000000',
             'Kathmandu','Sita','monthly',1,'t','t')`,
  );

  // --- services ---
  await raw.execute(
    `INSERT INTO services (id, name, code, group_id, rate_paisa, doctor_required,
                           outsourced, partner_cost_paisa, keeps_file,
                           followup_days, followup_rate_paisa, vat_applicable,
                           active, created_at, updated_at)
     VALUES ('svc_opd','OPD Consultation','opd','grp_opd', 50000, 1,
             0, 0, 0, 7, 0, 0, 1, 't', 't')`,
  );
  await raw.execute(
    `INSERT INTO services (id, name, code, group_id, rate_paisa, doctor_required,
                           outsourced, default_lab_partner_id, partner_cost_paisa,
                           keeps_file, vat_applicable, active, created_at, updated_at)
     VALUES ('svc_cbc','CBC','cbc','grp_lab', 60000, 0,
             1, 'lab1', 40000, 1, 0, 1, 't', 't')`,
  );
  await raw.execute(
    `INSERT INTO services (id, name, group_id, rate_paisa, keeps_file,
                           vat_applicable, active, created_at, updated_at)
     VALUES ('svc_usg','USG — Abdomen and Pelvis','grp_usg', 120000, 1, 0, 1, 't', 't')`,
  );

  // --- one medicine with stock, so a mixed bill is possible ---
  itemId = ulid();
  batchId = ulid();
  await raw.execute({
    sql: `INSERT INTO items (id, brand_name, generic_name, category, controlled_flag,
                             shape, active, created_at, updated_at)
          VALUES (?, 'Cetamol', 'Paracetamol 500', 'Medicine', 0, 'tablet', 1, 't', 't')`,
    args: [itemId],
  });
  await raw.execute({
    sql: `INSERT INTO item_units (id, item_id, level, name, factor_to_base,
                                  selling_rate_paisa, is_default_selling)
          VALUES (?, ?, 0, 'Tablet', 1, 200, 0)`,
    args: [ulid(), itemId],
  });
  await raw.execute({
    sql: `INSERT INTO item_units (id, item_id, level, name, factor_to_base,
                                  selling_rate_paisa, is_default_selling)
          VALUES (?, ?, 1, 'Strip', 10, 1800, 1)`,
    args: [ulid(), itemId],
  });
  await raw.execute({
    sql: `INSERT INTO batches (id, item_id, batch_no, expiry_date_ad,
                               received_base_qty, remaining_base_qty,
                               purchase_cost_paisa_per_base, created_at)
          VALUES (?, ?, 'B1', '2027-12-31', 500, 500, 150, 't')`,
    args: [batchId, itemId],
  });

  raw.close();

  const { createPatient } = await import("@/lib/repos/patients");
  const p = await createPatient({
    name: "Anita Shrestha",
    sex: "f",
    ageValue: 34,
    ageUnit: "y",
    ageAsOfAd: TODAY_AD,
    dobAd: null,
    phone: "9841234567",
    address: "Bhaktapur",
    userId: "u1",
  });
  patientId = p.id;
});

interface ServiceLineArgs {
  serviceId: string;
  qty?: number;
  ratePaisa: number;
  rateOverridden?: boolean;
  discountPaisa?: number;
  doctorId?: string | null;
  labPartnerId?: string | null;
  followupApplied?: boolean;
}

async function bill(opts: {
  services?: ServiceLineArgs[];
  medicines?: { qty: number; unitLevel: number; ratePaisa: number }[];
  patientId?: string | null;
  dateAd?: string;
  dateBs?: string;
  billDiscountPaisa?: number;
}) {
  const { ingestBill } = await import("@/lib/repos/bills");
  return ingestBill({
    id: ulid(),
    dateBs: opts.dateBs ?? TODAY_BS,
    dateAd: opts.dateAd ?? TODAY_AD,
    patientName: "",
    paymentMethod: "cash",
    tenderedPaisa: 0,
    billDiscountPaisa: opts.billDiscountPaisa ?? 0,
    lines: (opts.medicines ?? []).map((m) => ({
      id: ulid(),
      itemId,
      unitLevel: m.unitLevel,
      qty: m.qty,
      ratePaisa: m.ratePaisa,
      rateOverridden: false,
      discountPaisa: 0,
    })),
    serviceLines: (opts.services ?? []).map((s) => ({
      id: ulid(),
      serviceId: s.serviceId,
      qty: s.qty ?? 1,
      ratePaisa: s.ratePaisa,
      rateOverridden: s.rateOverridden ?? false,
      discountPaisa: s.discountPaisa ?? 0,
      doctorId: s.doctorId ?? null,
      labPartnerId: s.labPartnerId ?? null,
      followupApplied: s.followupApplied ?? false,
    })),
    patientId: opts.patientId === undefined ? patientId : opts.patientId,
    userId: "u1",
    clientCreatedAt: new Date().toISOString(),
  });
}

async function q(sql: string, args: unknown[] = []) {
  const { db } = await import("@/lib/db");
  const res = await db().execute({ sql, args: args as never });
  return res.rows;
}

describe("Phase 3 — a mixed bill", () => {
  it("puts medicines and services on one bill with one set of totals", async () => {
    const res = await bill({
      services: [
        { serviceId: "svc_opd", ratePaisa: 50_000, doctorId: "doc1" },
        { serviceId: "svc_usg", ratePaisa: 120_000 },
      ],
      medicines: [{ qty: 1, unitLevel: 1, ratePaisa: 1_800 }],
    });

    // 50000 + 120000 + 1800
    expect(res.totalPaisa).toBe(171_800);

    const rows = await q("SELECT kind, patient_id, visit_id FROM bills WHERE id = ?", [
      res.id,
    ]);
    expect(rows[0]!.kind).toBe("mixed");
    expect(rows[0]!.patient_id).toBe(patientId);
    expect(rows[0]!.visit_id).not.toBeNull();
  });

  it("marks a service-only bill as clinic and a medicine-only bill as pharmacy", async () => {
    const clinic = await bill({
      services: [{ serviceId: "svc_usg", ratePaisa: 120_000 }],
    });
    const pharmacy = await bill({
      medicines: [{ qty: 1, unitLevel: 0, ratePaisa: 200 }],
      patientId: null,
    });

    const c = await q("SELECT kind FROM bills WHERE id = ?", [clinic.id]);
    const p = await q("SELECT kind FROM bills WHERE id = ?", [pharmacy.id]);
    expect(c[0]!.kind).toBe("clinic");
    expect(p[0]!.kind).toBe("pharmacy");
  });

  it("never touches stock for a service-only bill", async () => {
    const before = await q("SELECT COUNT(*) n FROM stock_moves");
    await bill({ services: [{ serviceId: "svc_usg", ratePaisa: 120_000 }] });
    const after = await q("SELECT COUNT(*) n FROM stock_moves");
    expect(Number(after[0]!.n)).toBe(Number(before[0]!.n));
  });

  it("decrements stock exactly once on the medicine part of a mixed bill", async () => {
    const before = await q("SELECT remaining_base_qty q FROM batches WHERE id = ?", [
      batchId,
    ]);
    await bill({
      services: [{ serviceId: "svc_usg", ratePaisa: 120_000 }],
      medicines: [{ qty: 2, unitLevel: 1, ratePaisa: 1_800 }],
    });
    const after = await q("SELECT remaining_base_qty q FROM batches WHERE id = ?", [
      batchId,
    ]);
    expect(Number(before[0]!.q) - Number(after[0]!.q)).toBe(20);
  });
});

describe("Phase 3 — a service belongs to somebody", () => {
  it("refuses a service line with no patient", async () => {
    await expect(
      bill({
        services: [{ serviceId: "svc_usg", ratePaisa: 120_000 }],
        patientId: null,
      }),
    ).rejects.toThrow();
  });

  it("still saves a medicine-only bill anonymously", async () => {
    const res = await bill({
      medicines: [{ qty: 1, unitLevel: 0, ratePaisa: 200 }],
      patientId: null,
    });
    expect(res.invoiceNo).toBeGreaterThan(0);
  });

  it("opens a visit for the patient, and reuses it for a second bill the same day", async () => {
    const { createPatient } = await import("@/lib/repos/patients");
    const p = await createPatient({
      name: "Visit Reuse",
      sex: "m",
      ageValue: 40,
      ageUnit: "y",
      ageAsOfAd: TODAY_AD,
      dobAd: null,
      phone: "9800000111",
      address: "",
      userId: "u1",
    });

    const first = await bill({
      services: [{ serviceId: "svc_usg", ratePaisa: 120_000 }],
      patientId: p.id,
    });
    const second = await bill({
      services: [{ serviceId: "svc_cbc", ratePaisa: 60_000, labPartnerId: "lab1" }],
      patientId: p.id,
    });

    const rows = await q(
      "SELECT visit_id FROM bills WHERE id IN (?, ?)",
      [first.id, second.id],
    );
    expect(rows[0]!.visit_id).toBe(rows[1]!.visit_id);

    const visits = await q("SELECT COUNT(*) n FROM visits WHERE patient_id = ?", [
      p.id,
    ]);
    expect(Number(visits[0]!.n)).toBe(1);
  });
});

describe("Phase 3 — a service that needs something", () => {
  it("refuses a consultation with no doctor", async () => {
    await expect(
      bill({ services: [{ serviceId: "svc_opd", ratePaisa: 50_000 }] }),
    ).rejects.toThrow(/needs a doctor/i);
  });

  it("refuses an outsourced test with no laboratory", async () => {
    await expect(
      bill({ services: [{ serviceId: "svc_cbc", ratePaisa: 60_000 }] }),
    ).rejects.toThrow(/laboratory/i);
  });

  it("snapshots what the laboratory charges, per test", async () => {
    const res = await bill({
      services: [
        { serviceId: "svc_cbc", qty: 2, ratePaisa: 60_000, labPartnerId: "lab1" },
      ],
    });
    const rows = await q(
      "SELECT partner_cost_paisa, qty FROM bill_service_lines WHERE bill_id = ?",
      [res.id],
    );
    expect(Number(rows[0]!.partner_cost_paisa)).toBe(40_000);
    expect(Number(rows[0]!.qty)).toBe(2);
  });
});

describe("Phase 3 — the follow-up rule", () => {
  let followPatient = "";

  it("charges the full rate for a first consultation", async () => {
    const { createPatient } = await import("@/lib/repos/patients");
    const p = await createPatient({
      name: "Follow Up",
      sex: "f",
      ageValue: 30,
      ageUnit: "y",
      ageAsOfAd: TODAY_AD,
      dobAd: null,
      phone: "9800000222",
      address: "",
      userId: "u1",
    });
    followPatient = p.id;

    const res = await bill({
      services: [{ serviceId: "svc_opd", ratePaisa: 50_000, doctorId: "doc1" }],
      patientId: p.id,
      dateAd: "2026-08-01",
      dateBs: "2083-04-16",
    });
    expect(res.totalPaisa).toBe(50_000);
  });

  it("makes a follow-up 4 days later free, and labels the line", async () => {
    const res = await bill({
      services: [
        {
          serviceId: "svc_opd",
          ratePaisa: 0,
          doctorId: "doc1",
          followupApplied: true,
        },
      ],
      patientId: followPatient,
      dateAd: "2026-08-05",
      dateBs: "2083-04-20",
    });
    expect(res.totalPaisa).toBe(0);

    const rows = await q(
      "SELECT followup_applied, followup_note, rate_paisa FROM bill_service_lines WHERE bill_id = ?",
      [res.id],
    );
    expect(Number(rows[0]!.followup_applied)).toBe(1);
    expect(String(rows[0]!.followup_note)).toContain("no charge");
    expect(Number(rows[0]!.rate_paisa)).toBe(0);
  });

  it("refuses a follow-up claim once the window has passed", async () => {
    await expect(
      bill({
        services: [
          {
            serviceId: "svc_opd",
            ratePaisa: 0,
            doctorId: "doc1",
            followupApplied: true,
          },
        ],
        patientId: followPatient,
        dateAd: "2026-08-20",
        dateBs: "2083-05-04",
      }),
    ).rejects.toThrow(/outside the follow-up period/i);
  });

  it("charges the full rate 9 days after the last paid consultation", async () => {
    const res = await bill({
      services: [{ serviceId: "svc_opd", ratePaisa: 50_000, doctorId: "doc1" }],
      patientId: followPatient,
      dateAd: "2026-08-10",
      dateBs: "2083-04-25",
    });
    expect(res.totalPaisa).toBe(50_000);
  });

  it("lets the counter charge the full rate inside the window, and stands by it", async () => {
    const res = await bill({
      services: [
        {
          serviceId: "svc_opd",
          ratePaisa: 50_000,
          doctorId: "doc1",
          rateOverridden: true,
          followupApplied: false,
        },
      ],
      patientId: followPatient,
      dateAd: "2026-08-11",
      dateBs: "2083-04-26",
    });
    expect(res.totalPaisa).toBe(50_000);
    const rows = await q(
      "SELECT rate_overridden, followup_applied FROM bill_service_lines WHERE bill_id = ?",
      [res.id],
    );
    expect(Number(rows[0]!.rate_overridden)).toBe(1);
    expect(Number(rows[0]!.followup_applied)).toBe(0);
  });

  it("does not let a free follow-up start a new follow-up window", async () => {
    // The window runs from the last consultation actually paid for. Otherwise
    // one visit would chain free follow-ups indefinitely.
    const { lastConsultationAd } = await import("@/lib/repos/services");
    const last = await lastConsultationAd(followPatient, "doc1", "2026-08-06");
    expect(last).toBe("2026-08-01");
  });
});

describe("Phase 3 — the doctor's share", () => {
  it("snapshots the basis and pays 40% of a consultation", async () => {
    const res = await bill({
      services: [{ serviceId: "svc_opd", ratePaisa: 50_000, doctorId: "doc1" }],
    });
    const rows = await q(
      `SELECT doctor_share_basis, doctor_share_value, doctor_share_paisa
         FROM bill_service_lines WHERE bill_id = ?`,
      [res.id],
    );
    expect(rows[0]!.doctor_share_basis).toBe("pct_consult");
    expect(Number(rows[0]!.doctor_share_value)).toBe(4000);
    expect(Number(rows[0]!.doctor_share_paisa)).toBe(20_000);
  });

  it("pays a fixed amount per consultation, times the quantity", async () => {
    const res = await bill({
      services: [
        { serviceId: "svc_opd", qty: 2, ratePaisa: 50_000, doctorId: "doc2" },
      ],
    });
    const rows = await q(
      "SELECT doctor_share_paisa FROM bill_service_lines WHERE bill_id = ?",
      [res.id],
    );
    expect(Number(rows[0]!.doctor_share_paisa)).toBe(30_000);
  });

  it("pays nothing on a non-consultation for a consultation-only basis", async () => {
    const res = await bill({
      services: [{ serviceId: "svc_usg", ratePaisa: 120_000, doctorId: "doc1" }],
    });
    const rows = await q(
      "SELECT doctor_share_paisa FROM bill_service_lines WHERE bill_id = ?",
      [res.id],
    );
    expect(Number(rows[0]!.doctor_share_paisa)).toBe(0);
  });

  it("does not change an earlier bill when the doctor's share is edited afterwards", async () => {
    const res = await bill({
      services: [{ serviceId: "svc_opd", ratePaisa: 50_000, doctorId: "doc1" }],
    });
    const { updateDoctor } = await import("@/lib/repos/doctors");
    await updateDoctor("doc1", {
      name: "Dr. Sunita Karki",
      qualification: "MBBS, MD",
      specialty: "General Medicine",
      nmcNo: "12345",
      phone: "9800000000",
      email: "",
      userId: null,
      notifyPush: true,
      notifyEmail: true,
      shareBasis: "pct_consult",
      shareValue: 1000, // dropped to 10%
      active: true,
    });
    const rows = await q(
      "SELECT doctor_share_paisa, doctor_share_value FROM bill_service_lines WHERE bill_id = ?",
      [res.id],
    );
    expect(Number(rows[0]!.doctor_share_paisa)).toBe(20_000);
    expect(Number(rows[0]!.doctor_share_value)).toBe(4000);

    // put it back so later tests read the original terms
    await updateDoctor("doc1", {
      name: "Dr. Sunita Karki",
      qualification: "MBBS, MD",
      specialty: "General Medicine",
      nmcNo: "12345",
      phone: "9800000000",
      email: "",
      userId: null,
      notifyPush: true,
      notifyEmail: true,
      shareBasis: "pct_consult",
      shareValue: 4000,
      active: true,
    });
  });
});

describe("Phase 3 — a rate change does not rewrite history", () => {
  it("leaves an earlier bill at the rate and the name it was billed under", async () => {
    const res = await bill({
      services: [{ serviceId: "svc_usg", ratePaisa: 120_000 }],
    });
    const { updateService } = await import("@/lib/repos/services");
    await updateService("svc_usg", {
      name: "USG — Whole Abdomen",
      code: "",
      groupId: "grp_usg",
      ratePaisa: 150_000,
      doctorRequired: false,
      defaultDoctorId: null,
      outsourced: false,
      defaultLabPartnerId: null,
      partnerCostPaisa: 0,
      sampleType: "",
      followupDays: 0,
      followupRatePaisa: 0,
      vatApplicable: false,
      active: true,
    });

    const rows = await q(
      "SELECT rate_paisa, amount_paisa, name_snapshot FROM bill_service_lines WHERE bill_id = ?",
      [res.id],
    );
    expect(Number(rows[0]!.rate_paisa)).toBe(120_000);
    expect(Number(rows[0]!.amount_paisa)).toBe(120_000);
    expect(rows[0]!.name_snapshot).toBe("USG — Abdomen and Pelvis");

    const bills = await q("SELECT total_paisa FROM bills WHERE id = ?", [res.id]);
    expect(Number(bills[0]!.total_paisa)).toBe(120_000);
  });
});

describe("Phase 3 — the laboratory ledger", () => {
  it("adds up what is owed from the tests sent, at partner cost times quantity", async () => {
    const { partnerBalancePaisa } = await import("@/lib/repos/lab-partners");
    const before = await partnerBalancePaisa("lab1");
    await bill({
      services: [
        { serviceId: "svc_cbc", qty: 3, ratePaisa: 60_000, labPartnerId: "lab1" },
      ],
    });
    const after = await partnerBalancePaisa("lab1");
    expect(after - before).toBe(120_000);
  });
});

describe("Phase 3 — the bill is idempotent", () => {
  it("saves exactly one bill however many times the same payload arrives", async () => {
    const { ingestBill } = await import("@/lib/repos/bills");
    const payload = {
      id: ulid(),
      dateBs: TODAY_BS,
      dateAd: TODAY_AD,
      patientName: "",
      paymentMethod: "cash" as const,
      tenderedPaisa: 0,
      billDiscountPaisa: 0,
      lines: [],
      serviceLines: [
        {
          id: ulid(),
          serviceId: "svc_usg",
          qty: 1,
          ratePaisa: 150_000,
          rateOverridden: false,
          discountPaisa: 0,
          doctorId: null,
          labPartnerId: null,
          followupApplied: false,
        },
      ],
      patientId,
      userId: "u1",
      clientCreatedAt: new Date().toISOString(),
    };

    const first = await ingestBill(payload);
    const second = await ingestBill(payload);
    const third = await ingestBill(payload);

    expect(second.alreadyExisted).toBe(true);
    expect(third.invoiceNo).toBe(first.invoiceNo);

    const rows = await q(
      "SELECT COUNT(*) n FROM bill_service_lines WHERE bill_id = ?",
      [first.id],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });
});
