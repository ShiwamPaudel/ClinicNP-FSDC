/**
 * demo-pitch.ts — TEMPORARY. Fills a throwaway database with clearly-fake
 * clinic data so the product document can be photographed from the real
 * software without ever showing a real patient.
 *
 * Run against a file DB only:
 *   TURSO_DATABASE_URL=file:tests/demo-pitch.db pnpm tsx db/demo-pitch.ts
 *
 * All names carry "Sample" (Rules.md §1.10). Delete this file when the
 * document is built.
 */
import { createClient } from "@libsql/client";
import { ulid } from "ulid";
import { today, toAD, toBS, bsToDbText, adToIso } from "../src/lib/bs";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* absent — fine */
  }
}

const url = process.env.TURSO_DATABASE_URL!;
if (!url.startsWith("file:")) {
  throw new Error(`refusing to run against a non-file database: ${url}`);
}
const c = createClient({ url });

const NOW = new Date().toISOString();

/** N days before today, as {ad, bs} text pairs. */
function dayBack(n: number): { ad: string; bs: string } {
  const ad = new Date(Date.now() - n * 86400000);
  return { ad: adToIso(ad), bs: bsToDbText(toBS(ad)) };
}

async function main() {
  const adminId = (await c.execute("SELECT id FROM users WHERE username='admin'"))
    .rows[0]!.id as string;
  const staffId = (await c.execute("SELECT id FROM users WHERE username='bikash'"))
    .rows[0]!.id as string;
  const fyId = (await c.execute("SELECT id FROM fiscal_years WHERE status='open'"))
    .rows[0]!.id as number;

  // ---------------------------------------------------------------
  // company — both modules on, so the product calls itself ClinicNP
  // ---------------------------------------------------------------
  await c.execute({
    sql: `UPDATE company SET name=?, address=?, phone=?, pan_no=?, dda_no=?,
            module_pharmacy=1, module_clinic=1, rack_display='visual',
            expiry_alert_days=60, invoice_footer=?, updated_at=? WHERE id=1`,
    args: [
      "Sample Polyclinic & Diagnostics",
      "Kupondole, Lalitpur",
      "01-5555555",
      "300111222",
      "DDA-SAMPLE-01",
      "Get well soon",
      NOW,
    ],
  });

  // ---------------------------------------------------------------
  // a third doctor, and logins linked to two of them (doctor portal)
  // ---------------------------------------------------------------
  await c.execute({
    sql: `INSERT OR IGNORE INTO doctors (id,name,qualification,specialty,nmc_no,phone,
            share_basis,share_value,active,created_at,updated_at,email)
          VALUES ('sample_doc_3','Dr. Sample Karki','MBBS, MD (Cardiology)','Cardiology',
                  '00000','98XXXXXXXX','fixed_consult',30000,1,?,?,'')`,
    args: [NOW, NOW],
  });
  // No doctor is linked to the owner's login here on purpose: the `doctor`
  // role has its own screens and is bounced out of the back office, so linking
  // the owner would only hide the back office from the person demonstrating
  // it. The doctor login is made separately (.pitch-build/capture-doctor.mjs).

  // ---------------------------------------------------------------
  // a second laboratory partner, so the statement screen shows a choice
  // ---------------------------------------------------------------
  await c.execute({
    sql: `INSERT OR IGNORE INTO lab_partners (id,name,pan_no,phone,address,
            contact_person,terms,active,created_at,updated_at)
          VALUES ('sample_lab_2','Sample Path Lab','300444555','01-4222333',
                  'Pulchowk, Lalitpur','Sample contact','Monthly',1,?,?)`,
    args: [NOW, NOW],
  });

  // ---------------------------------------------------------------
  // a fuller service catalogue — the thing a lab actually reads
  // ---------------------------------------------------------------
  interface Svc {
    id: string;
    name: string;
    code: string;
    group: string;
    rate: number;
    lab?: string;
    cost?: number;
    sample?: string;
    file?: boolean;
    doc?: string;
    docReq?: boolean;
    fuDays?: number;
  }
  const services: Svc[] = [
    { id: "sample_svc_fu", name: "Sample Follow-up Consultation", code: "fu",
      group: "grp_followup", rate: 25000, doc: "sample_doc_1", docReq: true },
    { id: "sample_svc_cardio", name: "Sample Cardiology Consultation", code: "cardio",
      group: "grp_opd", rate: 100000, doc: "sample_doc_3", docReq: true, fuDays: 7 },
    { id: "sample_svc_lft", name: "Sample Liver Function Test", code: "lft",
      group: "grp_lab", rate: 130000, lab: "sample_lab_1", cost: 90000,
      sample: "Blood", file: true },
    { id: "sample_svc_rft", name: "Sample Renal Function Test", code: "rft",
      group: "grp_lab", rate: 120000, lab: "sample_lab_1", cost: 85000,
      sample: "Blood", file: true },
    { id: "sample_svc_tsh", name: "Sample Thyroid Profile", code: "tsh",
      group: "grp_lab", rate: 150000, lab: "sample_lab_2", cost: 100000,
      sample: "Blood", file: true },
    { id: "sample_svc_urine", name: "Sample Urine Routine", code: "urine",
      group: "grp_lab", rate: 40000, lab: "sample_lab_2", cost: 25000,
      sample: "Urine", file: true },
    { id: "sample_svc_xray", name: "Sample X-Ray — Chest PA", code: "xraycp",
      group: "grp_xray", rate: 70000, file: true, doc: "sample_doc_2" },
    { id: "sample_svc_echo", name: "Sample ECHO", code: "echo",
      group: "grp_echo", rate: 250000, file: true, doc: "sample_doc_3" },
  ];
  for (const s of services) {
    await c.execute({
      sql: `INSERT OR IGNORE INTO services
              (id,name,code,group_id,rate_paisa,doctor_required,default_doctor_id,
               outsourced,default_lab_partner_id,partner_cost_paisa,keeps_file,
               followup_days,followup_rate_paisa,vat_applicable,sample_rate,active,
               sample_type,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,0,1,1,?,?,?)`,
      args: [s.id, s.name, s.code, s.group, s.rate, s.docReq ? 1 : 0,
        s.doc ?? null, s.lab ? 1 : 0, s.lab ?? null, s.cost ?? 0,
        s.file ? 1 : 0, s.fuDays ?? 0, s.sample ?? "", NOW, NOW],
    });
  }
  // The seeded CBC gains the sample type the collection screen groups by.
  await c.execute(
    "UPDATE services SET sample_type='Blood' WHERE id='sample_svc_cbc'",
  );

  // ---------------------------------------------------------------
  // patients
  // ---------------------------------------------------------------
  interface Pt {
    name: string; sex: "f" | "m"; age: number; unit: "y" | "m";
    phone: string; addr: string; note?: string; bg?: string; ref?: string;
    guardian?: string;
  }
  const pts: Pt[] = [
    { name: "Sample Anita Shrestha", sex: "f", age: 34, unit: "y", phone: "9800000001",
      addr: "Kupondole, Lalitpur — Ward 10", bg: "B+", ref: "Self",
      note: "Allergic to penicillin" },
    { name: "Sample Bikash Tamang", sex: "m", age: 47, unit: "y", phone: "9800000002",
      addr: "Sanepa, Lalitpur — Ward 2", bg: "O+", ref: "Sample Health Post" },
    { name: "Sample Gita Karki", sex: "f", age: 28, unit: "y", phone: "9800000003",
      addr: "Jawalakhel, Lalitpur — Ward 3", bg: "A+" },
    { name: "Sample Ramesh Thapa", sex: "m", age: 62, unit: "y", phone: "9800000004",
      addr: "Patan Dhoka, Lalitpur — Ward 16", bg: "AB+",
      note: "Diabetic — on metformin" },
    { name: "Sample Sunita Magar", sex: "f", age: 8, unit: "m", phone: "9800000005",
      addr: "Ekantakuna, Lalitpur — Ward 13", guardian: "Sample Kamala Magar (mother)" },
    { name: "Sample Dipak Gurung", sex: "m", age: 19, unit: "y", phone: "9800000006",
      addr: "Satdobato, Lalitpur — Ward 15", bg: "B-" },
    { name: "Sample Kamala Devi", sex: "f", age: 55, unit: "y", phone: "9800000007",
      addr: "Bhaisepati, Lalitpur — Ward 20", ref: "Dr. Sample Karki" },
    { name: "Sample Nabin Rai", sex: "m", age: 31, unit: "y", phone: "9800000008",
      addr: "Imadol, Lalitpur — Ward 6", bg: "O-" },
    { name: "Sample Puja Sharma", sex: "f", age: 24, unit: "y", phone: "9800000009",
      addr: "Lagankhel, Lalitpur — Ward 8" },
    { name: "Sample Hari Bahadur", sex: "m", age: 71, unit: "y", phone: "9800000010",
      addr: "Gwarko, Lalitpur — Ward 26", bg: "A-", note: "Hard of hearing" },
    // deliberate near-duplicate, so the duplicate screen has something to show
    { name: "Sample Anita Shrestha", sex: "f", age: 34, unit: "y", phone: "9800000001",
      addr: "Kupondole, Lalitpur", ref: "Self" },
  ];

  const ptIds: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const id = ulid();
    ptIds.push(id);
    const created = dayBack(pts.length - i + 20);
    await c.execute({
      sql: `INSERT INTO patients (id,patient_no,name,sex,age_value,age_unit,age_as_of_ad,
              phone,address,guardian_name,blood_group,note,referred_by,active,
              created_by,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`,
      args: [id, i + 1, p.name, p.sex, p.age, p.unit, created.ad, p.phone, p.addr,
        p.guardian ?? "", p.bg ?? "", p.note ?? "", p.ref ?? "",
        i % 3 === 0 ? adminId : staffId, created.ad + "T09:00:00.000Z", NOW],
    });
  }
  await c.execute({
    sql: "UPDATE counters SET next_value=? WHERE name='patient_no'",
    args: [pts.length + 1],
  });

  // ---------------------------------------------------------------
  // visits — a believable day, plus history
  // ---------------------------------------------------------------
  interface Vst {
    pt: number; back: number; type: "new" | "followup" | "report_review";
    doc: string | null; dept: string; complaint: string;
    status: "waiting" | "seen" | "closed";
    bp?: string; pulse?: number; temp?: number; wt?: number; spo2?: number;
    findings?: string; advice?: string;
  }
  const visits: Vst[] = [
    { pt: 0, back: 0, type: "new", doc: "sample_doc_1", dept: "General Medicine",
      complaint: "Fever and body ache for 3 days", status: "seen",
      bp: "118/76", pulse: 88, temp: 38.2, wt: 54, spo2: 98,
      findings: "Throat congested. Chest clear.",
      advice: "Paracetamol SOS. Review if fever persists beyond 48 hours." },
    { pt: 1, back: 0, type: "new", doc: "sample_doc_3", dept: "Cardiology",
      complaint: "Chest tightness on exertion", status: "seen",
      bp: "146/92", pulse: 96, wt: 78, spo2: 97,
      findings: "S1 S2 normal. No murmur.", advice: "ECHO and ECG advised." },
    { pt: 2, back: 0, type: "followup", doc: "sample_doc_1", dept: "General Medicine",
      complaint: "Review of blood report", status: "waiting" },
    { pt: 3, back: 0, type: "new", doc: "sample_doc_1", dept: "General Medicine",
      complaint: "Routine diabetic check-up", status: "waiting",
      bp: "132/84", pulse: 74, wt: 71 },
    { pt: 4, back: 0, type: "new", doc: "sample_doc_1", dept: "Paediatrics",
      complaint: "Cough and cold", status: "waiting", temp: 37.6, wt: 7.4 },
    { pt: 5, back: 0, type: "new", doc: null, dept: "Diagnostics",
      complaint: "Walk-in ECG", status: "closed", pulse: 72 },
    { pt: 6, back: 2, type: "new", doc: "sample_doc_3", dept: "Cardiology",
      complaint: "Palpitations", status: "closed", bp: "128/80", pulse: 102 },
    { pt: 7, back: 3, type: "new", doc: "sample_doc_1", dept: "General Medicine",
      complaint: "Abdominal pain", status: "closed", bp: "120/78", pulse: 80 },
    { pt: 8, back: 5, type: "new", doc: "sample_doc_1", dept: "General Medicine",
      complaint: "Headache, giddiness", status: "closed", bp: "110/70" },
    { pt: 9, back: 8, type: "new", doc: "sample_doc_1", dept: "General Medicine",
      complaint: "Knee pain", status: "closed", wt: 66 },
    { pt: 0, back: 12, type: "new", doc: "sample_doc_1", dept: "General Medicine",
      complaint: "Sore throat", status: "closed" },
    { pt: 3, back: 18, type: "new", doc: "sample_doc_1", dept: "General Medicine",
      complaint: "Diabetic review", status: "closed" },
  ];

  const vIds: string[] = [];
  let visitNo = 1;
  for (const v of visits) {
    const id = ulid();
    vIds.push(id);
    const d = dayBack(v.back);
    await c.execute({
      sql: `INSERT INTO visits (id,visit_no,fiscal_year_id,patient_id,date_ad,date_bs,
              type,doctor_id,department,complaint,findings,advice,bp,pulse,temp_c,
              weight_kg,spo2,status,user_id,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [id, visitNo++, fyId, ptIds[v.pt]!, d.ad, d.bs, v.type, v.doc, v.dept,
        v.complaint, v.findings ?? "", v.advice ?? "", v.bp ?? "", v.pulse ?? null,
        v.temp ?? null, v.wt ?? null, v.spo2 ?? null, v.status, staffId,
        `${d.ad}T09:30:00.000Z`, NOW],
    });
  }
  await c.execute({
    sql: "UPDATE fiscal_years SET next_visit_no=? WHERE id=?",
    args: [visitNo, fyId],
  });

  // ---------------------------------------------------------------
  // bills — service lines, medicine lines, and mixed
  // ---------------------------------------------------------------
  const amox = (await c.execute(
    "SELECT id FROM items WHERE brand_name='Sample Amoxicillin 500'",
  )).rows[0]!.id as string;
  const pcm = (await c.execute(
    "SELECT id FROM items WHERE brand_name='Sample Paracetamol 500'",
  )).rows[0]!.id as string;

  async function batchFor(itemId: string): Promise<string> {
    const r = await c.execute({
      sql: `SELECT id FROM batches WHERE item_id=? AND remaining_base_qty>0
            ORDER BY expiry_date_ad DESC LIMIT 1`,
      args: [itemId],
    });
    return r.rows[0]!.id as string;
  }

  interface SLine {
    svc: string; qty?: number; doc?: string | null; lab?: string | null;
    cost?: number; stage?: 0 | 1 | 2 | 3 | 4; note?: string; fu?: boolean;
  }
  interface MLine { item: string; level: number; qty: number; rate: number }
  interface Bl {
    pt: number; visit: number | null; back: number;
    pay: "cash" | "qr" | "credit"; svc?: SLine[]; med?: MLine[]; discount?: number;
  }

  const svcRate: Record<string, number> = {};
  for (const row of (await c.execute("SELECT id,rate_paisa FROM services")).rows) {
    svcRate[row.id as string] = row.rate_paisa as number;
  }
  const svcName: Record<string, string> = {};
  for (const row of (await c.execute("SELECT id,name FROM services")).rows) {
    svcName[row.id as string] = row.name as string;
  }

  const bills: Bl[] = [
    // today — a consultation plus the prescription on one bill
    { pt: 0, visit: 0, back: 0, pay: "cash",
      svc: [{ svc: "sample_svc_opd", doc: "sample_doc_1" }],
      med: [{ item: pcm, level: 1, qty: 1, rate: 900 },
            { item: amox, level: 1, qty: 2, rate: 1800 }] },
    // today — cardiology, ECHO, and blood sent out (sample not yet collected)
    { pt: 1, visit: 1, back: 0, pay: "qr",
      svc: [{ svc: "sample_svc_cardio", doc: "sample_doc_3" },
            { svc: "sample_svc_echo", doc: "sample_doc_3" },
            { svc: "sample_svc_lft", lab: "sample_lab_1", cost: 90000, stage: 0 }] },
    // today — collected, waiting to go out
    { pt: 3, visit: 3, back: 0, pay: "cash",
      svc: [{ svc: "sample_svc_cbc", lab: "sample_lab_1", cost: 40000, stage: 1 },
            { svc: "sample_svc_rft", lab: "sample_lab_1", cost: 85000, stage: 1 }] },
    // today — walk-in ECG, no doctor
    { pt: 5, visit: 5, back: 0, pay: "cash",
      svc: [{ svc: "sample_svc_ecg" }] },
    // today — free follow-up inside the window
    { pt: 2, visit: 2, back: 0, pay: "cash",
      svc: [{ svc: "sample_svc_fu", doc: "sample_doc_1", fu: true }] },
    // today — pharmacy only, anonymous walk-in
    { pt: -1, visit: null, back: 0, pay: "cash",
      med: [{ item: pcm, level: 1, qty: 2, rate: 900 }] },
    // 2 days ago — gone to the laboratory, report not back
    { pt: 6, visit: 6, back: 2, pay: "cash",
      svc: [{ svc: "sample_svc_tsh", lab: "sample_lab_2", cost: 100000, stage: 2 },
            { svc: "sample_svc_ecg" }] },
    // 3 days ago — report is here, patient has not collected it
    { pt: 7, visit: 7, back: 3, pay: "credit",
      svc: [{ svc: "sample_svc_opd", doc: "sample_doc_1" },
            { svc: "sample_svc_urine", lab: "sample_lab_2", cost: 25000, stage: 3 }] },
    // 5 days ago — finished end to end
    { pt: 8, visit: 8, back: 5, pay: "cash",
      svc: [{ svc: "sample_svc_opd", doc: "sample_doc_1" },
            { svc: "sample_svc_cbc", lab: "sample_lab_1", cost: 40000, stage: 4 }],
      discount: 5000 },
    // 8 days ago — ultrasound, keeps a file
    { pt: 9, visit: 9, back: 8, pay: "qr",
      svc: [{ svc: "sample_svc_usg", doc: "sample_doc_2" }] },
    // 12 days ago
    { pt: 0, visit: 10, back: 12, pay: "cash",
      svc: [{ svc: "sample_svc_opd", doc: "sample_doc_1" },
            { svc: "sample_svc_xray", doc: "sample_doc_2" }] },
    // 18 days ago — a stuck sample, with the reason written down
    { pt: 3, visit: 11, back: 18, pay: "cash",
      svc: [{ svc: "sample_svc_cbc", lab: "sample_lab_1", cost: 40000, stage: 1,
              note: "Sample haemolysed — patient called back for a fresh draw" }] },
    { pt: 4, visit: null, back: 22, pay: "cash",
      svc: [{ svc: "sample_svc_opd", doc: "sample_doc_1" }],
      med: [{ item: pcm, level: 0, qty: 6, rate: 100 }] },
  ];

  const docShare: Record<string, { basis: string; value: number }> = {};
  for (const row of (await c.execute(
    "SELECT id,share_basis,share_value FROM doctors",
  )).rows) {
    docShare[row.id as string] = {
      basis: row.share_basis as string,
      value: row.share_value as number,
    };
  }

  let invoiceNo = 1;
  const labLineIds: { id: string; svc: string; pt: number; visit: number | null }[] = [];

  for (const b of bills) {
    const d = dayBack(b.back);
    const billId = ulid();
    let subtotal = 0;

    const sLines: {
      id: string; svc: string; qty: number; rate: number; amount: number;
      doc: string | null; lab: string | null; cost: number; stage: number;
      note: string; fu: boolean;
    }[] = [];
    for (const s of b.svc ?? []) {
      const qty = s.qty ?? 1;
      const rate = s.fu ? 0 : svcRate[s.svc]!;
      const amount = rate * qty;
      subtotal += amount;
      sLines.push({
        id: ulid(), svc: s.svc, qty, rate, amount,
        doc: s.doc ?? null, lab: s.lab ?? null, cost: (s.cost ?? 0) * qty,
        stage: s.stage ?? -1, note: s.note ?? "", fu: !!s.fu,
      });
    }

    const mLines: { id: string; item: string; level: number; qty: number;
      rate: number; amount: number; base: number }[] = [];
    for (const m of b.med ?? []) {
      const factor = (await c.execute({
        sql: "SELECT factor_to_base FROM item_units WHERE item_id=? AND level=?",
        args: [m.item, m.level],
      })).rows[0]!.factor_to_base as number;
      const amount = m.rate * m.qty;
      subtotal += amount;
      mLines.push({ id: ulid(), item: m.item, level: m.level, qty: m.qty,
        rate: m.rate, amount, base: factor * m.qty });
    }

    const discount = b.discount ?? 0;
    const total = subtotal - discount;
    const patientId = b.pt >= 0 ? ptIds[b.pt]! : null;
    const patientName = b.pt >= 0
      ? (await c.execute({ sql: "SELECT name FROM patients WHERE id=?", args: [patientId] }))
        .rows[0]!.name as string
      : "";
    const visitId = b.visit !== null ? vIds[b.visit]! : null;
    const kind = sLines.length && mLines.length ? "mixed"
      : sLines.length ? "clinic" : "pharmacy";

    await c.execute({
      sql: `INSERT INTO bills (id,invoice_no,fiscal_year_id,date_ad,date_bs,patient_name,
              subtotal_paisa,discount_paisa,vat_paisa,total_paisa,payment_method,
              tendered_paisa,status,user_id,client_created_at,synced_at,
              patient_id,visit_id,kind)
            VALUES (?,?,?,?,?,?,?,?,0,?,?,?,'saved',?,?,?,?,?,?)`,
      args: [billId, invoiceNo++, fyId, d.ad, d.bs, patientName, subtotal, discount,
        total, b.pay, b.pay === "cash" ? total : 0, staffId,
        `${d.ad}T10:00:00.000Z`, `${d.ad}T10:00:01.000Z`, patientId, visitId, kind],
    });

    for (const s of sLines) {
      const share = s.doc ? docShare[s.doc] : undefined;
      let sharePaisa = 0;
      if (share && share.basis === "pct_consult") sharePaisa = Math.round(s.amount * share.value / 10000);
      else if (share && share.basis === "fixed_consult") sharePaisa = share.value * s.qty;
      else if (share && share.basis === "pct_services") sharePaisa = Math.round(s.amount * share.value / 10000);

      const collectedAt = s.stage >= 1 ? `${d.ad}T10:20:00.000Z` : null;
      const dispatchedAt = s.stage >= 2 ? `${d.ad}T12:00:00.000Z` : null;
      const reportRecvAt = s.stage >= 3 ? `${d.ad}T17:00:00.000Z` : null;
      const reportGivenAt = s.stage >= 4 ? `${d.ad}T18:00:00.000Z` : null;

      await c.execute({
        sql: `INSERT INTO bill_service_lines
                (id,bill_id,service_id,name_snapshot,qty,rate_paisa,rate_overridden,
                 discount_paisa,amount_paisa,vat_paisa,doctor_id,lab_partner_id,
                 partner_cost_paisa,doctor_share_basis,doctor_share_value,
                 doctor_share_paisa,followup_applied,followup_note,visit_id,
                 collected_at,dispatched_at,report_received_at,report_given_at,lab_note)
              VALUES (?,?,?,?,?,?,0,0,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [s.id, billId, s.svc, svcName[s.svc]!, s.qty, s.rate, s.amount,
          s.doc, s.lab, s.cost, share?.basis ?? null, share?.value ?? 0,
          sharePaisa, s.fu ? 1 : 0,
          s.fu ? "Follow-up within 7 days — no charge." : "",
          visitId, collectedAt, dispatchedAt, reportRecvAt, reportGivenAt, s.note],
      });
      if (s.lab) labLineIds.push({ id: s.id, svc: s.svc, pt: b.pt, visit: b.visit });
    }

    for (const m of mLines) {
      await c.execute({
        sql: `INSERT INTO bill_lines (id,bill_id,item_id,unit_level,qty,rate_paisa,
                rate_overridden,discount_paisa,amount_paisa,short_base_qty)
              VALUES (?,?,?,?,?,?,0,0,?,0)`,
        args: [m.id, billId, m.item, m.level, m.qty, m.rate, m.amount],
      });
      const batchId = await batchFor(m.item);
      await c.execute({
        sql: `INSERT INTO bill_line_batches (id,bill_line_id,batch_id,base_qty)
              VALUES (?,?,?,?)`,
        args: [ulid(), m.id, batchId, m.base],
      });
      await c.execute({
        sql: "UPDATE batches SET remaining_base_qty = remaining_base_qty - ? WHERE id=?",
        args: [m.base, batchId],
      });
      await c.execute({
        sql: `INSERT INTO stock_moves (id,batch_id,item_id,base_qty_delta,reason,
                ref_table,ref_id,user_id,at)
              VALUES (?,?,?,?,'sale','bills',?,?,?)`,
        args: [ulid(), batchId, m.item, -m.base, billId, staffId,
          `${d.ad}T10:00:00.000Z`],
      });
    }
  }
  await c.execute({
    sql: "UPDATE fiscal_years SET next_invoice_no=? WHERE id=?",
    args: [invoiceNo, fyId],
  }).catch(() => {/* column may be named differently; harmless for the demo */});

  // ---------------------------------------------------------------
  // one payment to a laboratory, so the statement has a balance
  // ---------------------------------------------------------------
  const pd = dayBack(4);
  await c.execute({
    sql: `INSERT INTO lab_partner_payments (id,lab_partner_id,date_ad,date_bs,
            amount_paisa,method,note,user_id,created_at)
          VALUES (?,'sample_lab_1',?,?,100000,'bank','Part settlement',?,?)`,
    args: [ulid(), pd.ad, pd.bs, adminId, NOW],
  });

  // ---------------------------------------------------------------
  // appointments — today and tomorrow, for the doctor's own screen
  // ---------------------------------------------------------------
  const t0 = dayBack(0);
  const tomorrowAd = new Date(Date.now() + 86400000);
  const t1 = { ad: adToIso(tomorrowAd), bs: bsToDbText(toBS(tomorrowAd)) };
  const appts: [string, number, string, string, string, string][] = [
    ["sample_doc_3", 1, t0.ad, t0.bs, "10:30", "arrived"],
    ["sample_doc_3", 6, t0.ad, t0.bs, "11:00", "booked"],
    ["sample_doc_1", 2, t0.ad, t0.bs, "11:30", "booked"],
    ["sample_doc_1", 4, t1.ad, t1.bs, "09:45", "booked"],
    ["sample_doc_3", 3, t1.ad, t1.bs, "10:15", "booked"],
  ];
  for (const [doc, pt, ad, bs, time, status] of appts) {
    await c.execute({
      sql: `INSERT INTO appointments (id,doctor_id,patient_id,date_ad,date_bs,
              time_hhmm,duration_min,reason,status,booked_by,created_at,updated_at)
            VALUES (?,?,?,?,?,?,15,'Sample booking',?,?,?,?)`,
      args: [ulid(), doc, ptIds[pt]!, ad, bs, time, status, staffId, NOW, NOW],
    });
  }

  // ---------------------------------------------------------------
  // a couple of audit entries, so the activity log is not empty
  // ---------------------------------------------------------------
  for (const [action, detail, back] of [
    ["rate_override", '{"line":"Sample Amoxicillin 500","from":1800,"to":1700}', 1],
    ["patient_merge", '{"kept":"P-000001","merged":"P-000011"}', 3],
    ["login", '{"username":"admin"}', 0],
  ] as [string, string, number][]) {
    const d = dayBack(back);
    await c.execute({
      sql: `INSERT INTO audit_log (id,user_id,action,detail_json,at)
            VALUES (?,?,?,?,?)`,
      args: [ulid(), adminId, action, detail, `${d.ad}T11:00:00.000Z`],
    });
  }

  c.close();
  console.log(
    `demo data in place: ${pts.length} patients, ${visits.length} visits, ` +
    `${bills.length} bills, ${labLineIds.length} laboratory lines, ` +
    `${appts.length} appointments`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
