/**
 * The dental demo clinic for "ClinicNP Dental.pdf" — a throwaway file
 * database, filled through the app's own code (bills by `ingestBill`, payouts,
 * salaries, tooth marks), so every screenshot shows what the software really
 * does. All names are clearly fake (Rules §1.10). Never the live database.
 *
 *   DEMO_DB=file:tests/demo-dental.db pnpm vitest run --config .pitch-build/dental/vitest.config.ts
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { ulid } from "ulid";

const URL_ = process.env.DEMO_DB ?? "";
if (!URL_.startsWith("file:")) throw new Error(`refusing to seed anything but a file: database (${URL_})`);
process.env.TURSO_DATABASE_URL = URL_;
process.env.TURSO_AUTH_TOKEN = "";

const NOW = new Date().toISOString();
const rs = (rupees: number) => Math.round(rupees * 100);

describe("dental demo clinic", () => {
  it("is filled", async () => {
    const { __resetDbForTests } = await import("@/lib/db");
    __resetDbForTests();
    const { adToIso, toBS, bsToDbText } = await import("@/lib/bs");
    const day = (back: number) => {
      const ad = new Date(Date.now() - back * 86_400_000);
      return { ad: adToIso(ad), bs: bsToDbText(toBS(ad)) };
    };
    const raw = createClient({ url: URL_ });
    const q = async (sql: string, args: (string | number | null)[] = []) => (await raw.execute({ sql, args })).rows;

    const admin = (await q("SELECT id FROM users WHERE username='admin'"))[0]!.id as string;
    const staffUser = (await q("SELECT id FROM users WHERE role='staff' LIMIT 1"))[0]!.id as string;

    // --- clear the generic sample shop the seed made ---
    for (const t of [
      "item_locations", "stock_moves", "batches", "item_units", "items", "racks",
      "services", "doctors", "lab_partners", "suppliers",
    ]) {
      await q(`DELETE FROM ${t}`);
    }
    await q("UPDATE users SET name='Sample Owner' WHERE id=?", [admin]);
    await q("UPDATE users SET name='Sample Front Desk' WHERE id=?", [staffUser]);

    // --- the clinic: dental, no pharmacy ---
    await q(
      `UPDATE company SET name=?, address=?, phone=?, pan_no=?, module_pharmacy=0, module_clinic=1,
              vat_registered=0, invoice_footer=?, updated_at=? WHERE id=1`,
      ["Demo Dental Clinic", "Sample Tole, Kathmandu", "01-5555555", "300111222", "Smile on!", NOW],
    );

    // --- groups and services (rates are placeholders) ---
    await q("UPDATE service_groups SET active=0, sort_order=900");
    const groups: [string, string, number, boolean][] = [
      ["g_consult", "Consultation", 10, true],
      ["g_xray", "X-Ray", 20, false],
      ["g_scaling", "Scaling & Gum Treatment", 30, false],
      ["g_rct", "Root Canal Treatment (RCT)", 40, false],
      ["g_filling", "Filling", 50, false],
      ["g_extraction", "Extraction", 60, false],
      ["g_denture", "Denture", 70, false],
      ["g_crown", "Crown & Veneer", 80, false],
      ["g_ortho", "Orthodontics", 90, false],
      ["g_implant", "Implant", 100, false],
      ["g_cosmetic", "Cosmetic", 110, false],
    ];
    for (const [id, name, order, consult] of groups) {
      await q(
        `INSERT INTO service_groups (id, name, sort_order, is_consultation, active, created_at) VALUES (?,?,?,?,1,?)`,
        [id, name, order, consult ? 1 : 0, NOW],
      );
    }

    // --- doctors with their share terms, and a login for one ---
    const { createUser } = await import("@/lib/repos/users");
    const { createDoctor } = await import("@/lib/repos/doctors");
    const doctorLogin = await createUser({
      name: "Dr. Sample Karki", username: "karki", password: "doctor123", role: "doctor", canEditRate: false,
    });
    const doc = (name: string, qualification: string, specialty: string, sharePct: number, userId: string | null = null) =>
      createDoctor({
        name, qualification, specialty, nmcNo: "", phone: "", shareBasis: "pct_services",
        shareValue: sharePct * 100, active: true, email: "", userId, notifyPush: false, notifyEmail: false,
      });
    const dKarki = await doc("Dr. Sample Karki", "BDS", "General dentistry", 35, doctorLogin.id);
    const dShrestha = await doc("Dr. Sample Shrestha", "BDS, MDS (Orthodontics)", "Orthodontics", 40);
    const dGurung = await doc("Dr. Sample Gurung", "BDS, MDS (Endodontics)", "Root canal & restorations", 30);

    // --- dental laboratories ---
    const lab = async (id: string, name: string) =>
      q(
        `INSERT INTO lab_partners (id, name, pan_no, phone, address, contact_person, terms, active, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,1,?,?)`,
        [id, name, "300444555", "01-4222333", "Sample Marg, Lalitpur", "Sample contact", "Monthly", NOW, NOW],
      );
    await lab("lab_1", "Sample Dental Lab");
    await lab("lab_2", "Sample Ceramic Studio");

    type Svc = [id: string, group: string, name: string, code: string, rate: number, lab?: string, cost?: number, doctorReq?: boolean];
    const services: Svc[] = [
      ["s_consult", "g_consult", "Consultation / Checkup", "con", 500],
      ["s_opg", "g_xray", "X-ray (IOPA)", "xr", 300, undefined, undefined, false],
      ["s_scaling", "g_scaling", "Scaling & polishing", "sc", 2000],
      ["s_curettage", "g_scaling", "Gum treatment – Curettage", "gum", 6000],
      ["s_rct_ant", "g_rct", "RCT – Anterior", "rcta", 6000],
      ["s_rct_post", "g_rct", "RCT – Posterior", "rctp", 9000],
      ["s_fill_ant", "g_filling", "Composite filling – Anterior", "fa", 2000],
      ["s_fill_post", "g_filling", "Composite filling – Posterior", "fp", 2500],
      ["s_ext", "g_extraction", "Extraction – Simple", "exs", 2000],
      ["s_ext_surg", "g_extraction", "Surgical extraction", "exsur", 8000],
      ["s_rpd", "g_denture", "Removable partial denture – Acrylic", "rpd", 6000, "lab_1", 2000],
      ["s_cd", "g_denture", "Complete denture", "cd", 25000, "lab_1", 8000],
      ["s_crown_metal", "g_crown", "Crown – Metal", "crm", 8000, "lab_1", 2500],
      ["s_crown_ceramic", "g_crown", "Crown – Ceramic", "crc", 11000, "lab_2", 4000],
      ["s_crown_zr", "g_crown", "Crown – Zirconia", "crz", 15000, "lab_2", 6500],
      ["s_braces", "g_ortho", "Braces – Metal", "brace", 60000],
      ["s_aligner", "g_ortho", "Clear aligners", "align", 150000, "lab_2", 55000],
      ["s_implant", "g_implant", "Implant (single tooth)", "imp", 95000, "lab_2", 30000],
      ["s_bleach", "g_cosmetic", "Teeth whitening", "bl", 10000],
      ["s_postcore", "g_rct", "Post & core", "pc", 3000],
    ];
    for (const [id, group, name, code, rate, labId, cost, docReq] of services) {
      await q(
        `INSERT INTO services (id, name, code, group_id, rate_paisa, doctor_required, default_doctor_id,
            outsourced, default_lab_partner_id, partner_cost_paisa, keeps_file, followup_days,
            followup_rate_paisa, vat_applicable, sample_rate, active, sample_type, created_at, updated_at)
         VALUES (?,?,?,?,?,?,NULL,?,?,?,0,0,0,0,1,1,'',?,?)`,
        [id, name, code, group, rs(rate), docReq === false ? 0 : 1, labId ? 1 : 0, labId ?? null, rs(cost ?? 0), NOW, NOW],
      );
    }

    // --- patients ---
    const { createPatient } = await import("@/lib/repos/patients");
    type P = [name: string, sex: "f" | "m", age: number, phone: string, address: string, note?: string];
    const people: P[] = [
      ["Sample Anita Shrestha", "f", 34, "9800000001", "Baneshwor, Kathmandu", "Allergic to penicillin"],
      ["Sample Ramesh Adhikari", "m", 52, "9800000002", "Lalitpur-5"],
      ["Sample Sita Gurung", "f", 27, "9800000003", "Bhaktapur"],
      ["Sample Bikash Thapa", "m", 15, "9800000004", "Kirtipur"],
      ["Sample Maya Tamang", "f", 61, "9800000005", "Budhanilkantha"],
      ["Sample Hari Bhandari", "m", 43, "9800000006", "Chabahil"],
      ["Sample Pooja Rai", "f", 22, "9800000007", "Koteshwor"],
      ["Sample Aarav Poudel", "m", 8, "9800000008", "Thimi", "Nervous patient — go slow"],
      ["Sample Nabin Karki", "m", 48, "9800000009", "Sanepa, Lalitpur"],
      ["Sample Rekha Joshi", "f", 19, "9800000010", "Maharajgunj"],
      ["Sample Suman Lama", "m", 37, "9800000011", "Boudha"],
      ["Sample Kabita Magar", "f", 29, "9800000012", "Kalanki"],
    ];
    const pid: string[] = [];
    for (const [name, sex, age, phone, address, note] of people) {
      const p = await createPatient({
        name, sex, ageValue: age, ageUnit: "y", ageAsOfAd: day(0).ad, dobAd: null, phone, address,
        note: note ?? "", userId: admin,
      });
      pid.push(p.id);
    }

    // --- bills, through the counter's own code ---
    const { ingestBill } = await import("@/lib/repos/bills");
    const rate = Object.fromEntries(services.map((s) => [s[0], rs(s[4])]));
    const labOf = Object.fromEntries(services.map((s) => [s[0], s[5] ?? null]));
    type Line = [service: string, doctor: string | null, qty?: number, discount?: number];
    type Pay = { method: "cash" | "qr" | "credit"; paidNow?: number };
    // Queued, then saved oldest first, so invoice numbers run in date order.
    const bills: { id: string; back: number; patient: number; lines: Line[]; pay: Pay }[] = [];
    const bill = (back: number, patient: number, lines: Line[], pay: Pay = { method: "cash" }) => {
      const id = ulid();
      bills.push({ id, back, patient, lines, pay });
      return id;
    };
    const save = async ({ id, back, patient, lines, pay }: (typeof bills)[number]) => {
      const d = day(back);
      await ingestBill({
        id, dateBs: d.bs, dateAd: d.ad, patientName: people[patient]![0], patientId: pid[patient],
        paymentMethod: pay.method, tenderedPaisa: 0,
        paidNowPaisa: pay.paidNow !== undefined ? rs(pay.paidNow) : undefined,
        paidNowMethod: pay.method === "credit" ? "cash" : undefined,
        billDiscountPaisa: 0, userId: staffUser, clientCreatedAt: NOW, lines: [],
        serviceLines: lines.map(([s, doctor, qty, disc]) => ({
          id: ulid(), serviceId: s, qty: qty ?? 1, ratePaisa: rate[s]!, rateOverridden: false,
          discountPaisa: rs(disc ?? 0), doctorId: doctor, labPartnerId: labOf[s] ?? null, followupApplied: false,
        })),
      });
    };

    // Anita: the featured patient — RCT, post & core, ceramic crown sent to the lab
    bill(22, 0, [["s_consult", dGurung], ["s_opg", null]]);
    bill(21, 0, [["s_rct_post", dGurung]], { method: "credit", paidNow: 5000 });
    bill(14, 0, [["s_postcore", dGurung], ["s_crown_ceramic", dGurung]], { method: "qr" });
    bill(2, 0, [["s_scaling", dKarki]]);
    // Ramesh: complete denture, part paid
    bill(20, 1, [["s_consult", dKarki], ["s_ext", dKarki, 2]]);
    bill(12, 1, [["s_cd", dKarki]], { method: "credit", paidNow: 10000 });
    // Sita: braces
    bill(18, 2, [["s_consult", dShrestha], ["s_opg", null]]);
    bill(16, 2, [["s_braces", dShrestha]], { method: "credit", paidNow: 30000 });
    // Bikash: fillings
    bill(10, 3, [["s_consult", dKarki], ["s_fill_post", dKarki, 2]], { method: "qr" });
    // Maya: partial denture and a metal crown
    bill(9, 4, [["s_rpd", dKarki], ["s_crown_metal", dKarki]], { method: "credit", paidNow: 8000 });
    // Hari: implant
    bill(8, 5, [["s_consult", dGurung], ["s_opg", null], ["s_implant", dGurung]], { method: "credit", paidNow: 50000 });
    // Pooja: whitening and zirconia crown
    bill(5, 6, [["s_bleach", dKarki], ["s_crown_zr", dGurung]], { method: "qr" });
    // Aarav: a milk tooth out
    bill(3, 7, [["s_consult", dKarki], ["s_ext", dKarki]]);
    // the rest of the month's work
    bill(19, 8, [["s_consult", dKarki], ["s_opg", null], ["s_implant", dKarki]], { method: "qr" });
    bill(17, 9, [["s_consult", dShrestha], ["s_braces", dShrestha]], { method: "credit", paidNow: 40000 });
    bill(15, 10, [["s_rct_post", dKarki], ["s_crown_metal", dKarki]]);
    bill(13, 11, [["s_bleach", dKarki], ["s_scaling", dKarki]], { method: "qr" });
    bill(11, 3, [["s_scaling", dKarki]]);
    bill(7, 4, [["s_consult", dKarki], ["s_fill_ant", dKarki]]);
    bill(6, 10, [["s_consult", dKarki], ["s_postcore", dKarki]]);
    bill(4, 11, [["s_fill_post", dKarki, 2]], { method: "qr" });
    bill(1, 9, [["s_consult", dShrestha]]);
    // today
    bill(0, 2, [["s_consult", dShrestha]]);
    bill(0, 5, [["s_scaling", dKarki], ["s_fill_ant", dKarki]]);
    bill(0, 6, [["s_consult", dKarki]], { method: "qr" });
    for (const b of [...bills].sort((x, y) => y.back - x.back)) await save(b);

    // --- the dentist's notes on each visit (the patient history table) ---
    const { updateVisit } = await import("@/lib/repos/visits");
    const notes: Record<number, string[]> = {
      0: [
        "Pain on chewing, lower left. Deep caries 36, tender on percussion. IOPA taken. Advised RCT.",
        "RCT 36 — access opening, BMP, dressing placed. Review in one week.",
        "Obturation done. Post & core 36, impression for ceramic crown sent to lab.",
        "Scaling and polishing. Crown 36 fitting well.",
      ],
      1: ["Loose lower teeth 31, 41 — extracted under LA.", "Final impressions for complete denture; shade A3."],
      2: ["Crowding upper and lower, Class I. Records and OPG taken.", "Metal braces bonded, upper and lower arch. Review monthly.", "Monthly adjustment, wire changed."],
      3: ["Scaling and polishing; brushing advice.", "Caries 36, 46 — composite fillings done."],
      4: ["Missing 35, 36 — acrylic RPD. Crown 46 prepared, impression to lab.", "Small composite on 21."],
      5: ["Missing 46, bone adequate on IOPA. Implant placed; healing cap.", "Scaling; small composite on 11."],
      6: ["Whitening done, two sessions. Crown 21 zirconia prepared.", "Sensitivity after whitening — advised desensitising paste."],
      7: ["Over-retained milk tooth 75 extracted; first permanent molar erupting."],
      8: ["Missing 36, bone adequate on IOPA. Implant placed; healing cap."],
      9: ["Crowding, Class II. Metal braces bonded, upper and lower.", "Review; wire changed."],
      10: ["RCT 46 completed; metal crown prepared, impression to lab.", "Post & core 11 after an old fracture."],
      11: ["Whitening, two sessions; scaling.", "Composite fillings 36, 37."],
    };
    for (const [p, list] of Object.entries(notes)) {
      const visits = await q(
        "SELECT id FROM visits WHERE patient_id = ? AND status != 'cancelled' ORDER BY date_ad, created_at",
        [pid[Number(p)]!],
      );
      for (let i = 0; i < visits.length && i < list.length; i++) {
        await updateVisit({ id: visits[i]!.id as string, findings: list[i]!, status: "seen" });
      }
    }

    // --- the laboratory queue at every stage ---
    const { advanceLabLine } = await import("@/lib/repos/lab");
    const labLines = await q(
      `SELECT l.id, b.date_ad FROM bill_service_lines l JOIN bills b ON b.id = l.bill_id
        WHERE l.lab_partner_id IS NOT NULL ORDER BY b.date_ad`,
    );
    const stages = ["to_collect", "to_dispatch", "awaiting_report", "report_in"] as const;
    // oldest furthest along: handed over, back from the lab, two at the lab, two to send
    const target = [4, 4, 4, 3, 2, 2, 1, 1];
    for (let i = 0; i < labLines.length; i++) {
      const steps = target[i] ?? 0;
      for (let s = 0; s < steps; s++) await advanceLabLine(labLines[i]!.id as string, stages[s]!);
    }

    // --- a dues payment back, and a doctor payout ---
    const { receiveDuePayment } = await import("@/lib/repos/dues");
    const anitaRct = bills[1]!.id;
    await receiveDuePayment({
      receiptId: ulid(), billIds: [anitaRct], amountPaisa: rs(4000), method: "qr", note: "",
      dateAd: day(7).ad, dateBs: day(7).bs, userId: staffUser,
    });
    const { recordDoctorPayout } = await import("@/lib/repos/doctor-pay");
    await recordDoctorPayout({
      doctorId: dGurung, dateAd: day(6).ad, dateBs: day(6).bs, amountPaisa: rs(8000), method: "bank",
      note: "First week", userId: admin,
    });
    await recordDoctorPayout({
      doctorId: dKarki, dateAd: day(4).ad, dateBs: day(4).bs, amountPaisa: rs(5000), method: "cash",
      note: "", userId: admin,
    });

    // --- appointments today and tomorrow ---
    const { createAppointment } = await import("@/lib/repos/appointments");
    const appts: [number, string, number, string, string][] = [
      [0, dKarki, 0, "10:00", "Review — crown 36"],
      [0, dKarki, 3, "11:30", "Filling check"],
      [0, dShrestha, 2, "13:00", "Braces adjustment"],
      [0, dGurung, 5, "15:00", "Implant review"],
      [0, dKarki, 4, "16:00", "Denture trial"],
      [-1, dShrestha, 6, "10:30", "Consultation"],
      [-1, dGurung, 1, "12:00", "Denture fitting"],
    ];
    for (const [back, doctorId, p, time, reason] of appts) {
      const d = day(back);
      await createAppointment({
        doctorId, patientId: pid[p]!, dateAd: d.ad, dateBs: d.bs, timeHhmm: time, durationMin: 30, reason,
        bookedBy: staffUser,
      });
    }

    // --- the tooth chart of the featured patient, and a child's ---
    const { addToothRecords } = await import("@/lib/repos/teeth");
    const mark = async (p: number, teeth: number[], condition: string, surfaces: string, note: string, back: number) =>
      addToothRecords({
        patientId: pid[p]!, teeth, condition, surfaces, note, dateAd: day(back).ad, dateBs: day(back).bs, userId: admin,
      });
    await mark(0, [36], "caries", "OD", "deep, near pulp", 22);
    await mark(0, [36], "rct", "", "obturated", 14);
    await mark(0, [36], "crown", "", "ceramic crown", 2);
    await mark(0, [26], "filled", "MO", "", 22);
    await mark(0, [47], "caries", "O", "small — watch", 22);
    await mark(0, [18, 28, 38, 48], "impacted", "", "", 22);
    await mark(0, [14], "filled", "B", "cervical", 22);
    await mark(0, [11], "watch", "", "slight discolouration", 2);
    await mark(0, [46], "missing", "", "extracted years ago", 22);
    await mark(7, [75], "missing", "", "extracted", 3);
    await mark(7, [84], "caries", "OD", "", 3);
    await mark(7, [16, 26], "healthy", "", "erupting", 3);

    // --- supplies bought for the clinic's own use ---
    const { createSupplier } = await import("@/lib/repos/suppliers");
    const { createItem } = await import("@/lib/repos/items");
    const { createPurchase } = await import("@/lib/repos/purchases");
    const sup = await createSupplier({
      name: "Sample Dental Suppliers", panNo: "300777888", phone: "01-4333444", address: "Sample Bazar, Kathmandu",
      contactPerson: "Sample contact", terms: "30 days", active: true,
    });
    const item = (name: string, unit: string) =>
      createItem({
        brandName: name, genericName: "", category: "Consumable", manufacturer: "", minStockBaseQty: 0,
        controlledFlag: false, preferredSupplierId: sup, active: true, shape: "box",
        units: [{ level: 0, name: unit, factorToBase: 1, sellingRatePaisa: 0, isDefaultSelling: true }],
      });
    const gloves = await item("Sample Nitrile gloves (M)", "Box");
    const composite = await item("Sample Composite A2", "Syringe");
    const la = await item("Sample LA cartridges", "Box");
    const alginate = await item("Sample Alginate impression", "Pack");
    const { NO_EXPIRY_AD } = await import("@/lib/supplies");
    const line = (itemId: string, qty: number, cost: number) => ({
      itemId, batchNo: "", mfgDateAd: null, expiryDateAd: NO_EXPIRY_AD, unitLevel: 0, factorToBase: 1,
      qty, freeQty: 0, unitCostPaisa: rs(cost), discountPaisa: 0,
    });
    await createPurchase({
      supplierId: sup, supplierInvoiceNo: "SDS-1042", dateAd: day(15).ad, dateBs: day(15).bs, vatPaisa: 0,
      lines: [line(gloves, 10, 650), line(composite, 6, 1800), line(la, 4, 2200), line(alginate, 5, 900)],
      userId: admin, payment: { mode: "part", amountPaisa: rs(15000), method: "bank" },
    });
    await createPurchase({
      supplierId: sup, supplierInvoiceNo: "SDS-1077", dateAd: day(4).ad, dateBs: day(4).bs, vatPaisa: 0,
      lines: [line(gloves, 5, 650), line(la, 2, 2200)], userId: admin,
    });

    // --- staff and salaries: last month paid, this month under way ---
    const { createStaff, giveAdvance, paySalary, addSalaryLine } = await import("@/lib/repos/payroll");
    const month = day(0).bs.slice(0, 7);
    const { shiftMonth } = await import("@/lib/payroll");
    const last = shiftMonth(month, -1);
    const person = (name: string, designation: string, salary: number, ssf: boolean) =>
      createStaff(
        { name, designation, phone: "", panNo: "", ssfNo: ssf ? "SSF-SAMPLE" : "", bankAccount: "", note: "", joinedBs: null, leftBs: null },
        { fromMonthBs: shiftMonth(month, -3), monthlySalaryPaisa: rs(salary), ssfEnrolled: ssf, sstApplies: !ssf },
        admin,
      );
    const sunita = await person("Sample Sunita Tamang", "Dental assistant", 25000, true);
    const ramesh = await person("Sample Kiran Thapa", "Receptionist", 20000, false);
    const gita = await person("Sample Gita Rai", "Sterilisation & cleaning", 16000, false);
    const lastDay = day(26);
    for (const [id, net] of [[sunita, 22250], [ramesh, 19800], [gita, 15840]] as const) {
      await paySalary({
        staffId: id, monthBs: last, dateAd: lastDay.ad, dateBs: lastDay.bs, amountPaisa: rs(net), method: "bank",
        note: "", recoverAdvancePaisa: 0, userId: admin,
      });
    }
    await giveAdvance({ staffId: gita, dateAd: day(12).ad, dateBs: day(12).bs, amountPaisa: rs(5000), method: "cash", note: "", userId: admin });
    for (const id of [sunita, ramesh, gita]) {
      await addSalaryLine({ staffId: id, monthBs: month, kind: "bonus", label: "Dashain bonus", amountPaisa: rs(id === gita ? 16000 : id === ramesh ? 20000 : 25000), userId: admin });
    }
    await addSalaryLine({ staffId: ramesh, monthBs: month, kind: "deduction", label: "Unpaid leave, 1 day", amountPaisa: rs(650), userId: admin });
    await paySalary({
      staffId: sunita, monthBs: month, dateAd: day(1).ad, dateBs: day(1).bs, amountPaisa: rs(47250), method: "bank",
      note: "with Dashain bonus", recoverAdvancePaisa: 0, userId: admin,
    });
    await paySalary({
      staffId: gita, monthBs: month, dateAd: day(1).ad, dateBs: day(1).bs, amountPaisa: rs(26680), method: "cash",
      note: "", recoverAdvancePaisa: rs(5000), userId: admin,
    });

    const counts = await q(
      `SELECT (SELECT COUNT(*) FROM bills) b, (SELECT COUNT(*) FROM patients) p, (SELECT COUNT(*) FROM visits) v,
              (SELECT COUNT(*) FROM tooth_records) t, (SELECT COUNT(*) FROM appointments) a`,
    );
    console.log("demo:", JSON.stringify(counts[0]));
    expect(Number(counts[0]!.b)).toBe(25);
    raw.close();
  });
});
