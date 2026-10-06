/**
 * bills.ts — sale ingest (the outbox target) and bill reads.
 *
 * Ingest is IDEMPOTENT on the bill ULID (Rules §1.8): retrying the same bill
 * twice creates exactly one bill. The server is authoritative for FEFO: it
 * re-allocates batches transactionally on receipt (Architecture §2.1/2.2).
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import { allocate, type FefoBatch } from "@/lib/fefo";
import { vatOf, roundToRupee } from "@/lib/money";
import { fiscalYearOf, bsFromDbText } from "@/lib/bs";
import {
  ensureFiscalYear,
  getOpenFiscalYear,
  getFiscalYearByLabel,
  assertYearOpen,
  assertBillYearOpen,
} from "@/lib/repos/fiscal";
import { getCompany } from "@/lib/repos/company";
import { createPatient } from "@/lib/repos/patients";
import { getServiceForBilling, lastConsultationAd } from "@/lib/repos/services";
import { getDoctor } from "@/lib/repos/doctors";
import { resolveFollowup, doctorSharePaisa } from "@/lib/clinic-calc";
import { splitAtSale, type MoneyMethod } from "@/lib/dues";
import { DUE_FACTS_SQL, balanceOfRow } from "@/lib/repos/dues";

export interface IngestLine {
  id: string;
  itemId: string;
  unitLevel: number;
  qty: number;
  ratePaisa: number;
  rateOverridden: boolean;
  discountPaisa: number;
  overrideBatchId?: string;
}

/** A service line as it arrives from the counter. */
export interface IngestServiceLine {
  id: string;
  serviceId: string;
  qty: number;
  ratePaisa: number;
  rateOverridden: boolean;
  discountPaisa: number;
  doctorId: string | null;
  labPartnerId: string | null;
  /** what the counter believed about the follow-up rule */
  followupApplied: boolean;
}

export interface IngestBillInput {
  id: string; // client ULID
  dateBs: string;
  dateAd: string;
  patientName: string;
  paymentMethod: "cash" | "qr" | "credit";
  tenderedPaisa: number;
  /**
   * On a bill on dues ('credit'), what was paid at the counter; the rest is
   * owed. Absent on a bill queued before dues could be part-paid, which is
   * read as nothing paid — exactly what 'credit' meant then.
   */
  paidNowPaisa?: number;
  /** how the part paid at the counter was paid */
  paidNowMethod?: MoneyMethod;
  billDiscountPaisa: number;
  lines: IngestLine[];
  serviceLines?: IngestServiceLine[];
  /** the registered patient, when the bill names one */
  patientId?: string | null;
  /**
   * The patient's own details, carried when the bill may have overtaken their
   * registration. `createPatient` is idempotent on the id, so whichever
   * arrives first creates the person and the other finds them already there.
   */
  patient?: {
    id: string;
    name: string;
    sex: "f" | "m" | "o";
    ageValue: number | null;
    ageUnit: "y" | "m" | "d" | null;
    ageAsOfAd: string | null;
    phone: string;
    address: string;
  } | null;
  /** an existing visit to hang the services on; one is opened if absent */
  visitId?: string | null;
  userId: string;
  clientCreatedAt: string;
}

/** Raised when a service line names something that is not billable. */
export class ServiceLineError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string) {
    super(userMessage);
    this.name = "ServiceLineError";
    this.userMessage = userMessage;
  }
}

/** Raised when a bill on dues does not say who owes it. */
export class DueBillError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string) {
    super(userMessage);
    this.name = "DueBillError";
    this.userMessage = userMessage;
  }
}

export interface IngestResult {
  id: string;
  invoiceNo: number;
  fiscalLabel: string;
  totalPaisa: number;
  alreadyExisted: boolean;
  /** Units this bill priced for the first time, so it can be said out loud. */
  firstPriced?: { itemId: string; unitLevel: number; ratePaisa: number }[];
}

/**
 * Thrown when a bill would sell more than the on-hand (non-expired) stock.
 * The counter blocks this before it reaches here; the server enforces it too
 * (defense-in-depth + the rare two-device offline race). Rolls the sale back.
 */
export class InsufficientStockError extends Error {
  readonly code = "insufficient_stock";
  constructor(public readonly itemIds: string[]) {
    super("insufficient stock for one or more items");
    this.name = "InsufficientStockError";
  }
}

/** Look up an existing bill's invoice number + fiscal label (for idempotent replies). */
async function existingBill(id: string): Promise<IngestResult | null> {
  const res = await db().execute({
    sql: `SELECT b.id, b.invoice_no, b.total_paisa, f.bs_label
          FROM bills b LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
          WHERE b.id = ?`,
    args: [id],
  });
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    invoiceNo: Number(r.invoice_no ?? 0),
    fiscalLabel: (r.bs_label as string) ?? "",
    totalPaisa: Number(r.total_paisa),
    alreadyExisted: true,
  };
}

/**
 * Ingest a bill: assign an invoice number, run authoritative FEFO, decrement
 * stock (guarded), and write the sale + ledger — all in one transaction.
 */
export async function ingestBill(input: IngestBillInput): Promise<IngestResult> {
  // Idempotency: if this ULID is already stored, return it unchanged.
  const existing = await existingBill(input.id);
  if (existing) return existing;

  const company = await getCompany();

  // Numbering always draws from the OPEN year (Architecture §2.4). A bill dated
  // inside a year that has been closed is refused; a bill dated in a year that
  // does not exist yet (the counter carried on past the year end before anyone
  // ran the close) is booked into the year that is actually open.
  const dateFy = fiscalYearOf(bsFromDbText(input.dateBs));
  const openFy = await getOpenFiscalYear();
  let fy;
  if (!openFy) {
    fy = await ensureFiscalYear(dateFy); // fresh install: bootstrap the first year
  } else if (openFy.bsLabel === dateFy.label) {
    fy = openFy;
  } else {
    const dated = await getFiscalYearByLabel(dateFy.label);
    if (dated) {
      await assertYearOpen(dated.id); // an existing, closed year -> refuse
      fy = dated;
    } else {
      fy = openFy;
    }
  }

  // Resolve unit factors for every line up front (factors don't change mid-sale).
  // The stored rate is read at the same time: a unit that still costs nothing
  // is one this bill is allowed to price, once (D-105).
  const factorByLine = new Map<string, number>();
  const storedRateByLine = new Map<string, number>();
  for (const line of input.lines) {
    const u = await db().execute({
      sql: `SELECT factor_to_base, selling_rate_paisa FROM item_units
            WHERE item_id = ? AND level = ?`,
      args: [line.itemId, line.unitLevel],
    });
    const f = u.rows[0];
    if (!f) throw new Error(`missing unit for item ${line.itemId}`);
    factorByLine.set(line.id, Number(f.factor_to_base));
    storedRateByLine.set(line.id, Number(f.selling_rate_paisa));
  }

  // Price every service line against the catalog as it stands NOW, not as the
  // counter remembered it. The counter's numbers are a preview; these are the
  // ones that go on the invoice (Architecture §5.3).
  const resolvedServices: {
    line: IngestServiceLine;
    nameSnapshot: string;
    ratePaisa: number;
    amountPaisa: number;
    partnerCostPaisa: number;
    doctorShareBasis: string | null;
    doctorShareValue: number;
    doctorSharePaisa: number;
    followupApplied: boolean;
    followupNote: string;
    vatApplicable: boolean;
  }[] = [];

  // A bill that brought its patient with it creates them first, under the id
  // the counter minted. Idempotent: if the registration already landed, this
  // finds that person and changes nothing.
  let patientId = input.patientId ?? null;
  if (input.patient) {
    const created = await createPatient({
      id: input.patient.id,
      name: input.patient.name,
      sex: input.patient.sex,
      ageValue: input.patient.ageValue,
      ageUnit: input.patient.ageUnit,
      ageAsOfAd: input.patient.ageAsOfAd,
      dobAd: null,
      phone: input.patient.phone,
      address: input.patient.address,
      userId: input.userId,
    });
    patientId = created.id;
  }

  // A service is something done to a person: it cannot be billed to nobody
  // (PRD §4B.4). Checked here as well as at the route, because this is the
  // last place before the money is written down.
  if ((input.serviceLines?.length ?? 0) > 0 && !patientId) {
    throw new ServiceLineError(
      "This bill has a service on it, so it needs a patient.",
    );
  }

  // Money owed has to be owed by somebody. Checked only on a bill that carries
  // `paidNowPaisa`, which every counter since dues could be part-paid sends: a
  // credit bill queued on a counter before that, with no name on it, must still
  // land rather than sit stuck in a queue nobody can edit. The Dues screen lists
  // such a bill as having no name, so it is never lost.
  if (
    input.paymentMethod === "credit" &&
    input.paidNowPaisa !== undefined &&
    !patientId &&
    input.patientName.trim() === ""
  ) {
    throw new DueBillError(
      "A bill on dues needs the name of whoever owes it.",
    );
  }

  for (const line of input.serviceLines ?? []) {
    const service = await getServiceForBilling(line.serviceId);
    if (!service) {
      throw new ServiceLineError(
        "One of the services on this bill is no longer set up. Open the bill again and re-add it.",
      );
    }
    if (service.doctorRequired && !line.doctorId) {
      throw new ServiceLineError(`${service.name} needs a doctor on the bill.`);
    }
    if (service.outsourced && !line.labPartnerId) {
      throw new ServiceLineError(
        `${service.name} needs the laboratory it was sent to.`,
      );
    }

    // The follow-up rule, recomputed here where it is authoritative.
    let ratePaisa = line.ratePaisa;
    let followupApplied = line.followupApplied;
    let followupNote = "";
    if (service.isConsultation && service.followupDays > 0 && patientId) {
      const lastAd = await lastConsultationAd(
        patientId,
        line.doctorId,
        input.dateAd,
      );
      const outcome = resolveFollowup(
        {
          ratePaisa: service.ratePaisa,
          followupDays: service.followupDays,
          followupRatePaisa: service.followupRatePaisa,
        },
        input.dateAd,
        lastAd,
      );
      // The counter can deliberately charge the full rate instead — a person
      // made that call, it is marked on the line and it stands. What the
      // server refuses is a rate nobody chose: a line claiming the follow-up
      // discount when the rule does not actually allow it.
      if (line.followupApplied && !outcome.applied) {
        throw new ServiceLineError(
          `${service.name} was billed as a follow-up, but this patient is outside the follow-up period. Take the line off and add it again.`,
        );
      }
      if (line.followupApplied && outcome.applied) {
        ratePaisa = outcome.ratePaisa;
        followupNote = outcome.note;
      }
      followupApplied = line.followupApplied && outcome.applied;
    }

    // A rate the counter did not mark as edited must be one the catalog knows.
    if (!line.rateOverridden && !followupApplied && ratePaisa !== service.ratePaisa) {
      ratePaisa = service.ratePaisa;
    }

    const amountPaisa = Math.max(0, line.qty * ratePaisa - line.discountPaisa);

    // The doctor's terms are snapshotted: editing them later must not move
    // money that has already been earned.
    const doctor = line.doctorId ? await getDoctor(line.doctorId) : null;
    const share = doctor
      ? doctorSharePaisa(
          { basis: doctor.shareBasis, value: doctor.shareValue },
          amountPaisa,
          line.qty,
          service.isConsultation,
        )
      : 0;

    resolvedServices.push({
      line,
      nameSnapshot: service.name,
      ratePaisa,
      amountPaisa,
      partnerCostPaisa: service.outsourced ? service.partnerCostPaisa : 0,
      doctorShareBasis: doctor?.shareBasis ?? null,
      doctorShareValue: doctor?.shareValue ?? 0,
      doctorSharePaisa: share,
      followupApplied,
      followupNote,
      vatApplicable: service.vatApplicable,
    });
  }

  const now = new Date().toISOString();
  const tx = await db().transaction("write");
  try {
    // --- invoice number (serialized inside the write transaction) ---
    const seqRes = await tx.execute({
      sql: "SELECT next_invoice_no FROM fiscal_years WHERE id = ?",
      args: [fy.id],
    });
    const invoiceNo = Number(seqRes.rows[0]!.next_invoice_no);
    await tx.execute({
      sql: "UPDATE fiscal_years SET next_invoice_no = ? WHERE id = ?",
      args: [invoiceNo + 1, fy.id],
    });

    // --- line allocation + stock decrement ---
    let subtotal = 0;
    const shortItemIds: string[] = [];
    /** Units this bill gave a price to for the first time, for the audit log. */
    const firstPriced: {
      itemId: string;
      unitLevel: number;
      ratePaisa: number;
    }[] = [];
    const lineInserts: {
      lineId: string;
      itemId: string;
      unitLevel: number;
      qty: number;
      ratePaisa: number;
      rateOverridden: boolean;
      discountPaisa: number;
      amount: number;
      shortBase: number;
      allocations: { batchId: string; baseQty: number }[];
    }[] = [];

    for (const line of input.lines) {
      const factor = factorByLine.get(line.id)!;
      const neededBase = line.qty * factor;

      const live = await tx.execute({
        sql: `SELECT id, expiry_date_ad, remaining_base_qty FROM batches
              WHERE item_id = ? AND remaining_base_qty > 0 AND expiry_date_ad >= ?
              ORDER BY expiry_date_ad ASC, id ASC`,
        args: [line.itemId, input.dateAd],
      });
      const fefoBatches: FefoBatch[] = live.rows.map((r) => ({
        id: r.id as string,
        expiryDateAd: r.expiry_date_ad as string,
        remainingBaseQty: Number(r.remaining_base_qty),
      }));

      const { allocations, shortfallBaseQty } = allocate(
        neededBase,
        fefoBatches,
        input.dateAd,
        line.overrideBatchId ? { overrideBatchId: line.overrideBatchId } : {},
      );

      // Hard block: never sell more than the on-hand, non-expired stock.
      if (shortfallBaseQty > 0) {
        if (!shortItemIds.includes(line.itemId)) shortItemIds.push(line.itemId);
        continue; // skip decrement; we'll roll back and reject below
      }

      // Guarded decrement per allocation (guard always holds inside the txn).
      for (const a of allocations) {
        await tx.execute({
          sql: `UPDATE batches SET remaining_base_qty = remaining_base_qty - ?
                WHERE id = ? AND remaining_base_qty >= ?`,
          args: [a.baseQty, a.batchId, a.baseQty],
        });
        await tx.execute({
          sql: `INSERT INTO stock_moves
                  (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
                VALUES (?, ?, ?, ?, 'sale', 'bills', ?, ?, ?)`,
          args: [ulid(), a.batchId, line.itemId, -a.baseQty, input.id, input.userId, now],
        });
      }

      // The first price a medicine is ever sold at becomes its price.
      //
      // 478 medicines arrived from a catalogue with no prices, and making
      // somebody stop and open Items for each one the first time it is asked
      // for is how a counter ends up not using the software. So a unit that
      // still costs nothing takes the rate typed on this bill and keeps it.
      //
      // Once, and only once. `AND selling_rate_paisa = 0` is what makes that
      // true rather than merely intended: the second sale's UPDATE matches no
      // row, so a rate typed later is this bill's business alone and does not
      // quietly rewrite the shop's price list. Doing it in SQL rather than by
      // reading first also means two counters selling the same new medicine in
      // the same second cannot both win.
      //
      // Only the unit actually sold is priced. A strip at Rs 18 does not make
      // a tablet Rs 1.80 — shops round loose sales up — and a derived price is
      // a made-up price.
      if (storedRateByLine.get(line.id) === 0 && line.ratePaisa > 0) {
        const set = await tx.execute({
          sql: `UPDATE item_units SET selling_rate_paisa = ?
                 WHERE item_id = ? AND level = ? AND selling_rate_paisa = 0`,
          args: [line.ratePaisa, line.itemId, line.unitLevel],
        });
        if (Number(set.rowsAffected) > 0) {
          firstPriced.push({
            itemId: line.itemId,
            unitLevel: line.unitLevel,
            ratePaisa: line.ratePaisa,
          });
          // The counter caches the catalogue, and catalogVersion() reads this.
          // Without the bump every other till keeps offering the medicine at
          // nothing.
          await tx.execute({
            sql: "UPDATE items SET updated_at = ? WHERE id = ?",
            args: [now, line.itemId],
          });
        }
      }

      const amount = Math.max(0, line.qty * line.ratePaisa - line.discountPaisa);
      subtotal += amount;
      lineInserts.push({
        lineId: line.id,
        itemId: line.itemId,
        unitLevel: line.unitLevel,
        qty: line.qty,
        ratePaisa: line.ratePaisa,
        rateOverridden: line.rateOverridden,
        discountPaisa: line.discountPaisa,
        amount,
        shortBase: shortfallBaseQty,
        allocations,
      });
    }

    // Reject the whole sale if any line couldn't be fully covered by stock.
    if (shortItemIds.length > 0) {
      throw new InsufficientStockError(shortItemIds);
    }

    // --- totals ---
    // Medicines and services under one set of totals. With no service lines
    // this is arithmetically identical to what v1 did.
    const serviceSubtotal = resolvedServices.reduce(
      (acc, r) => acc + r.amountPaisa,
      0,
    );
    subtotal += serviceSubtotal;

    const afterBillDiscount = Math.max(0, subtotal - input.billDiscountPaisa);

    let vatPaisa = 0;
    if (company.vatRegistered) {
      // Medicines are always VAT-able; a service only when its own flag is on.
      const vatableSubtotal =
        subtotal -
        serviceSubtotal +
        resolvedServices.reduce(
          (acc, r) => acc + (r.vatApplicable ? r.amountPaisa : 0),
          0,
        );
      const discountApplied = Math.min(input.billDiscountPaisa, subtotal);
      const vatableDiscount =
        subtotal > 0
          ? Math.floor((discountApplied * vatableSubtotal) / subtotal)
          : 0;
      vatPaisa = vatOf(Math.max(0, vatableSubtotal - vatableDiscount));
    }

    let total = afterBillDiscount + vatPaisa;
    if (company.roundingOn) total = roundToRupee(total);

    // What was paid now and what is left owing, against the total worked out
    // here rather than the counter's preview of it.
    const sale = splitAtSale(
      total,
      input.paymentMethod,
      input.paidNowPaisa ?? 0,
      input.paidNowMethod ?? "cash",
    );

    // What kind of bill this is, decided here and stored so reports never have
    // to join two tables to find out (Architecture §3.4).
    const kind =
      lineInserts.length > 0 && resolvedServices.length > 0
        ? "mixed"
        : resolvedServices.length > 0
          ? "clinic"
          : "pharmacy";

    // Services belong to a visit. If the patient has one open today it is used;
    // otherwise one is opened, because a consultation IS a visit.
    let visitId = input.visitId ?? null;
    if (resolvedServices.length > 0 && patientId && !visitId) {
      const openToday = await tx.execute({
        sql: `SELECT id FROM visits
               WHERE patient_id = ? AND date_ad = ? AND status != 'cancelled'
               ORDER BY rowid DESC LIMIT 1`,
        args: [patientId, input.dateAd],
      });
      if (openToday.rows[0]) {
        visitId = openToday.rows[0].id as string;
      } else {
        visitId = ulid();
        const visitSeq = await tx.execute({
          sql: "SELECT next_visit_no FROM fiscal_years WHERE id = ?",
          args: [fy.id],
        });
        const visitNo = Number(visitSeq.rows[0]!.next_visit_no);
        await tx.execute({
          sql: "UPDATE fiscal_years SET next_visit_no = ? WHERE id = ?",
          args: [visitNo + 1, fy.id],
        });
        const firstDoctor =
          resolvedServices.find((r) => r.line.doctorId)?.line.doctorId ?? null;
        await tx.execute({
          sql: `INSERT INTO visits
                  (id, visit_no, fiscal_year_id, patient_id, date_ad, date_bs,
                   type, doctor_id, status, user_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'new', ?, 'waiting', ?, ?, ?)`,
          args: [
            visitId,
            visitNo,
            fy.id,
            patientId,
            input.dateAd,
            input.dateBs,
            firstDoctor,
            input.userId,
            now,
            now,
          ],
        });
      }
    }

    // --- bill header ---
    await tx.execute({
      sql: `INSERT INTO bills
              (id, invoice_no, fiscal_year_id, date_ad, date_bs, patient_name,
               subtotal_paisa, discount_paisa, vat_paisa, total_paisa,
               payment_method, tendered_paisa, status, user_id, client_created_at,
               synced_at, patient_id, visit_id, kind, due_paisa, paid_now_method)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'saved', ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        input.id,
        invoiceNo,
        fy.id,
        input.dateAd,
        input.dateBs,
        input.patientName,
        subtotal,
        input.billDiscountPaisa,
        vatPaisa,
        total,
        sale.method,
        input.tenderedPaisa,
        input.userId,
        input.clientCreatedAt,
        now,
        patientId,
        visitId,
        kind,
        sale.duePaisa,
        sale.paidNowMethod,
      ],
    });

    for (const li of lineInserts) {
      await tx.execute({
        sql: `INSERT INTO bill_lines
                (id, bill_id, item_id, unit_level, qty, rate_paisa, rate_overridden,
                 discount_paisa, amount_paisa, short_base_qty)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          li.lineId,
          input.id,
          li.itemId,
          li.unitLevel,
          li.qty,
          li.ratePaisa,
          li.rateOverridden ? 1 : 0,
          li.discountPaisa,
          li.amount,
          li.shortBase,
        ],
      });
      for (const a of li.allocations) {
        await tx.execute({
          sql: `INSERT INTO bill_line_batches (id, bill_line_id, batch_id, base_qty)
                VALUES (?, ?, ?, ?)`,
          args: [ulid(), li.lineId, a.batchId, a.baseQty],
        });
      }
    }

    // Per-line VAT for the service revenue report. Each VAT-able service line
    // gets its share of the VAT charged, in proportion to the amount it
    // contributed to the VAT base. Medicines have no per-line VAT column and
    // keep the remainder, exactly as they did in v1.
    const vatBase = resolvedServices.reduce(
      (acc, r) => acc + (r.vatApplicable ? r.amountPaisa : 0),
      0,
    ) + (subtotal - serviceSubtotal);
    const serviceVat = resolvedServices.map((r) =>
      r.vatApplicable && vatBase > 0
        ? Math.floor((vatPaisa * r.amountPaisa) / vatBase)
        : 0,
    );

    for (const [index, r] of resolvedServices.entries()) {
      await tx.execute({
        sql: `INSERT INTO bill_service_lines
                (id, bill_id, service_id, name_snapshot, qty, rate_paisa,
                 rate_overridden, discount_paisa, amount_paisa, vat_paisa,
                 doctor_id, lab_partner_id, partner_cost_paisa,
                 doctor_share_basis, doctor_share_value, doctor_share_paisa,
                 followup_applied, followup_note, visit_id, dispatched_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          r.line.id,
          input.id,
          r.line.serviceId,
          r.nameSnapshot,
          r.line.qty,
          r.ratePaisa,
          r.line.rateOverridden ? 1 : 0,
          r.line.discountPaisa,
          r.amountPaisa,
          serviceVat[index] ?? 0,
          r.line.doctorId,
          r.line.labPartnerId,
          // per test, not per line: the ledger multiplies by quantity
          r.partnerCostPaisa,
          r.doctorShareBasis,
          r.doctorShareValue,
          r.doctorSharePaisa,
          r.followupApplied ? 1 : 0,
          r.followupNote,
          visitId,
          // Not dispatched. Saving a bill means a test was ordered, not that
          // a sample is at the laboratory — nobody has drawn it yet. It is
          // stamped when somebody says so, on Laboratory -> To send (0016).
          // This used to be stamped here, which is why the pipeline's stage
          // conditions are written to survive a line dispatched without ever
          // having been collected.
          null,
        ],
      });
    }

    await tx.commit();
    return {
      id: input.id,
      invoiceNo,
      fiscalLabel: fy.bsLabel,
      totalPaisa: total,
      alreadyExisted: false,
      firstPriced,
    };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// ---- reads (register + reprint) ----

export interface BillListRow {
  id: string;
  invoiceNo: number | null;
  fiscalLabel: string;
  dateBs: string;
  patientName: string;
  totalPaisa: number;
  paymentMethod: string;
  status: string;
  /** pharmacy / clinic / mixed, derived at ingest */
  kind: string;
  patientNo: number | null;
  registeredName: string;
  /** what this bill still owes today; 0 for anything not on dues */
  balancePaisa: number;
}

/** Read with `DUE_FACTS_SQL` in the select, or the balance reads as zero. */
function mapBillRow(r: Row): BillListRow {
  return {
    id: r.id as string,
    invoiceNo: r.invoice_no != null ? Number(r.invoice_no) : null,
    fiscalLabel: (r.bs_label as string) ?? "",
    dateBs: r.date_bs as string,
    patientName: (r.patient_name as string) ?? "",
    totalPaisa: Number(r.total_paisa),
    paymentMethod: r.payment_method as string,
    status: r.status as string,
    kind: (r.kind as string) ?? "pharmacy",
    patientNo: r.patient_no == null ? null : Number(r.patient_no),
    registeredName: (r.registered_name as string | null) ?? "",
    balancePaisa: balanceOfRow(r),
  };
}

export interface BillFilters {
  fiscalYearId?: number | null;
  /** pharmacy / clinic / mixed */
  kind?: string | null;
  /** free text over the patient's name, number or the invoice number */
  search?: string | null;
  doctorId?: string | null;
  patientId?: string | null;
}

export async function listBills(
  limit = 200,
  filters: number | null | BillFilters = null,
): Promise<BillListRow[]> {
  // The old signature took a bare fiscal year id. Keeping it working means the
  // pharmacy screens did not have to change to gain the new filters.
  const f: BillFilters =
    typeof filters === "number" || filters === null
      ? { fiscalYearId: filters }
      : filters;

  const where: string[] = [];
  const args: (string | number | null)[] = [];

  if (f.fiscalYearId != null) {
    where.push("b.fiscal_year_id = ?");
    args.push(f.fiscalYearId);
  }
  if (f.kind) {
    where.push("b.kind = ?");
    args.push(f.kind);
  }
  if (f.patientId) {
    where.push("b.patient_id = ?");
    args.push(f.patientId);
  }
  if (f.doctorId) {
    where.push(
      "EXISTS (SELECT 1 FROM bill_service_lines sl WHERE sl.bill_id = b.id AND sl.doctor_id = ?)",
    );
    args.push(f.doctorId);
  }
  if (f.search && f.search.trim()) {
    const q = f.search.trim();
    const digits = q.replace(/\D/g, "");
    where.push(
      `(LOWER(b.patient_name) LIKE ?
        OR LOWER(p.name) LIKE ?
        OR CAST(b.invoice_no AS TEXT) = ?
        OR CAST(p.patient_no AS TEXT) = ?)`,
    );
    // No digits typed means there is nothing to match an invoice or a
    // patient number against; NULL makes those two comparisons not true.
    const numeric = digits === "" ? null : digits;
    args.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`, numeric, numeric);
  }

  args.push(limit);

  const res = await db().execute({
    sql: `SELECT b.*, f.bs_label, p.patient_no, p.name AS registered_name,
                 ${DUE_FACTS_SQL}
            FROM bills b
            LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
            LEFT JOIN patients p ON p.id = b.patient_id
          ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY b.client_created_at DESC LIMIT ?`,
    args,
  });
  return res.rows.map(mapBillRow);
}

export interface BillDetailLine {
  id: string;
  itemId: string;
  brandName: string;
  genericName: string;
  controlled: boolean;
  unitLevel: number;
  unitName: string;
  factorToBase: number;
  qty: number;
  ratePaisa: number;
  rateOverridden: boolean;
  discountPaisa: number;
  amountPaisa: number;
  batches: { batchNo: string; expiryDateAd: string; baseQty: number; batchId: string }[];
}

/** A service as it appears on a saved bill. No batch, no expiry. */
export interface BillDetailServiceLine {
  id: string;
  serviceId: string;
  name: string;
  qty: number;
  ratePaisa: number;
  rateOverridden: boolean;
  discountPaisa: number;
  amountPaisa: number;
  doctorName: string;
  partnerName: string;
  partnerCostPaisa: number;
  doctorSharePaisa: number;
  followupApplied: boolean;
  followupNote: string;
  dispatchedAt: string | null;
  /** how much of this line has already been refunded */
  refundedQty: number;
}

export interface BillDetail extends BillListRow {
  /** True when this bill's fiscal year has been closed: read and print only. */
  yearClosed: boolean;
  subtotalPaisa: number;
  discountPaisa: number;
  vatPaisa: number;
  tenderedPaisa: number;
  creditSettledAt: string | null;
  userName: string;
  lines: BillDetailLine[];
  serviceLines: BillDetailServiceLine[];
  patientId: string | null;
  visitId: string | null;
}

export async function getBillDetail(id: string): Promise<BillDetail | null> {
  const head = await db().execute({
    sql: `SELECT b.*, f.bs_label, f.status AS fy_status, u.name AS user_name,
                 p.patient_no, p.name AS registered_name,
                 ${DUE_FACTS_SQL}
          FROM bills b
          LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
          LEFT JOIN users u ON u.id = b.user_id
          LEFT JOIN patients p ON p.id = b.patient_id
          WHERE b.id = ?`,
    args: [id],
  });
  const h = head.rows[0];
  if (!h) return null;

  const lineRes = await db().execute({
    sql: `SELECT bl.*, i.brand_name, i.generic_name, i.controlled_flag,
                 iu.name AS unit_name, iu.factor_to_base
          FROM bill_lines bl
          JOIN items i ON i.id = bl.item_id
          LEFT JOIN item_units iu ON iu.item_id = bl.item_id AND iu.level = bl.unit_level
          WHERE bl.bill_id = ?`,
    args: [id],
  });

  const lines: BillDetailLine[] = [];
  for (const l of lineRes.rows) {
    const allocs = await db().execute({
      sql: `SELECT bb.base_qty, bb.batch_id, ba.batch_no, ba.expiry_date_ad
            FROM bill_line_batches bb JOIN batches ba ON ba.id = bb.batch_id
            WHERE bb.bill_line_id = ?`,
      args: [l.id as string],
    });
    lines.push({
      id: l.id as string,
      itemId: l.item_id as string,
      brandName: l.brand_name as string,
      genericName: l.generic_name as string,
      controlled: Number(l.controlled_flag) === 1,
      unitLevel: Number(l.unit_level),
      unitName: (l.unit_name as string) ?? "",
      factorToBase: Number(l.factor_to_base ?? 1),
      qty: Number(l.qty),
      ratePaisa: Number(l.rate_paisa),
      rateOverridden: Number(l.rate_overridden) === 1,
      discountPaisa: Number(l.discount_paisa),
      amountPaisa: Number(l.amount_paisa),
      batches: allocs.rows.map((a) => ({
        batchId: a.batch_id as string,
        batchNo: a.batch_no as string,
        expiryDateAd: a.expiry_date_ad as string,
        baseQty: Number(a.base_qty),
      })),
    });
  }

  const svcRes = await db().execute({
    sql: `SELECT sl.*, d.name AS doctor_name, lp.name AS partner_name,
                 COALESCE((SELECT SUM(r.qty) FROM sale_return_service_lines r
                            WHERE r.bill_service_line_id = sl.id), 0) AS refunded_qty
            FROM bill_service_lines sl
            LEFT JOIN doctors d ON d.id = sl.doctor_id
            LEFT JOIN lab_partners lp ON lp.id = sl.lab_partner_id
           WHERE sl.bill_id = ?
           ORDER BY sl.rowid`,
    args: [id],
  });

  const serviceLines: BillDetailServiceLine[] = svcRes.rows.map((l) => ({
    id: l.id as string,
    serviceId: l.service_id as string,
    name: l.name_snapshot as string,
    qty: Number(l.qty),
    ratePaisa: Number(l.rate_paisa),
    rateOverridden: Number(l.rate_overridden) === 1,
    discountPaisa: Number(l.discount_paisa),
    amountPaisa: Number(l.amount_paisa),
    doctorName: (l.doctor_name as string | null) ?? "",
    partnerName: (l.partner_name as string | null) ?? "",
    partnerCostPaisa: Number(l.partner_cost_paisa),
    doctorSharePaisa: Number(l.doctor_share_paisa),
    followupApplied: Number(l.followup_applied) === 1,
    followupNote: (l.followup_note as string) ?? "",
    dispatchedAt: (l.dispatched_at as string | null) ?? null,
    refundedQty: Number(l.refunded_qty),
  }));

  return {
    ...mapBillRow(h),
    // No fiscal year on the row means it predates year tracking — treat as open.
    yearClosed:
      h.fy_status != null && (h.fy_status as string) !== "open",
    patientId: (h.patient_id as string | null) ?? null,
    visitId: (h.visit_id as string | null) ?? null,
    serviceLines,
    subtotalPaisa: Number(h.subtotal_paisa),
    discountPaisa: Number(h.discount_paisa),
    vatPaisa: Number(h.vat_paisa),
    tenderedPaisa: Number(h.tendered_paisa),
    creditSettledAt: (h.credit_settled_at as string | null) ?? null,
    userName: (h.user_name as string) ?? "",
    lines,
  };
}

/** Cancel a bill (Admin): restore its stock, mark Cancelled, keep the number. */
export async function cancelBill(id: string, userId: string): Promise<void> {
  await assertBillYearOpen(id);
  const bill = await db().execute({
    sql: "SELECT status FROM bills WHERE id = ?",
    args: [id],
  });
  if (!bill.rows[0]) throw new Error("bill not found");
  if ((bill.rows[0].status as string) === "cancelled") return;

  const allocs = await db().execute({
    sql: `SELECT bb.batch_id, bb.base_qty, bl.item_id
          FROM bill_line_batches bb JOIN bill_lines bl ON bl.id = bb.bill_line_id
          WHERE bl.bill_id = ?`,
    args: [id],
  });
  const now = new Date().toISOString();
  const tx = await db().transaction("write");
  try {
    for (const a of allocs.rows) {
      await tx.execute({
        sql: "UPDATE batches SET remaining_base_qty = remaining_base_qty + ? WHERE id = ?",
        args: [Number(a.base_qty), a.batch_id as string],
      });
      await tx.execute({
        sql: `INSERT INTO stock_moves (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
              VALUES (?, ?, ?, ?, 'adjustment', 'bill_cancel', ?, ?, ?)`,
        args: [ulid(), a.batch_id as string, a.item_id as string, Number(a.base_qty), id, userId, now],
      });
    }
    await tx.execute({
      sql: "UPDATE bills SET status = 'cancelled' WHERE id = ?",
      args: [id],
    });
    await tx.execute({
      sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
            VALUES (?, ?, 'bill_cancelled', ?, ?)`,
      args: [ulid(), userId, JSON.stringify({ billId: id }), now],
    });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

// Bills on dues are listed, and paid off, in `lib/repos/dues.ts`. The old
// whole-bill "Mark paid" (`credit_settled_at`) is no longer written; a bill it
// already cleared still reads as cleared.

export interface PatientBillRow {
  id: string;
  invoiceNo: number | null;
  fiscalLabel: string;
  dateBs: string;
  totalPaisa: number;
  status: string;
  visitId: string | null;
}

/** Every bill for one patient, newest first — feeds the patient card timeline. */
export async function listBillsForPatient(
  patientId: string,
): Promise<PatientBillRow[]> {
  const res = await db().execute({
    sql: `SELECT b.id, b.invoice_no, b.date_bs, b.total_paisa, b.status,
                 b.visit_id, f.bs_label
            FROM bills b
            LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
           WHERE b.patient_id = ?
           ORDER BY b.date_bs DESC, b.client_created_at DESC`,
    args: [patientId],
  });
  return res.rows.map((r) => ({
    id: r.id as string,
    invoiceNo: r.invoice_no != null ? Number(r.invoice_no) : null,
    fiscalLabel: (r.bs_label as string) ?? "",
    dateBs: r.date_bs as string,
    totalPaisa: Number(r.total_paisa),
    status: r.status as string,
    visitId: (r.visit_id as string | null) ?? null,
  }));
}
