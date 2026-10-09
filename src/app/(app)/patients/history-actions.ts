"use server";

/**
 * A row typed straight into a patient's history table (C-036): the doctor's
 * treatment notes for a visit, and — when services are charged — the bill for
 * them, paid in full, in part or left on dues.
 *
 * The notes become a visit. The services become an ordinary numbered bill
 * through `ingestBill`, the same path the counter's bills take, so VAT, the
 * invoice number, dues, doctor shares and laboratory costs are worked out in
 * the one place they always are. Nothing here prices or numbers anything.
 */
import { revalidatePath } from "next/cache";
import { ulid } from "ulid";
import { z } from "zod";
import { requireUser, canBill, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { getPatient } from "@/lib/repos/patients";
import {
  createVisit,
  updateVisit,
  cancelVisit,
  visitsForPatient,
} from "@/lib/repos/visits";
import { listPosServices } from "@/lib/repos/services";
import { getCompany } from "@/lib/repos/company";
import {
  ingestBill,
  ServiceLineError,
  DueBillError,
  InsufficientStockError,
} from "@/lib/repos/bills";
import { formatDocNo } from "@/lib/invoice-number";
import { adFromIso, adToIso, bsFromDbText, bsToDbText, toAD, toBS } from "@/lib/bs";
import { nepalDayIso } from "@/lib/clock";
import { rowCharge, rowPaymentProblem } from "@/lib/visit-row";

const rowSchema = z.object({
  patientId: z.string().min(1),
  dateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  notes: z.string().max(4000, "The notes are too long"),
  doctorId: z.string().min(1).nullable(),
  services: z
    .array(
      z.object({
        serviceId: z.string().min(1),
        qty: z.number().int().min(1).max(99),
        ratePaisa: z.number().int().min(0),
        labPartnerId: z.string().min(1).nullable(),
      }),
    )
    .max(20),
  payment: z.object({
    mode: z.enum(["full", "part", "credit"]),
    amountPaisa: z.number().int().min(0),
    method: z.enum(["cash", "qr"]),
  }),
});
export type HistoryRowInput = z.infer<typeof rowSchema>;

export interface HistoryRowResult {
  ok: boolean;
  userMessage?: string;
  /** set when a bill was made */
  billId?: string;
  invoiceLabel?: string;
  totalPaisa?: number;
}

function fail(userMessage: string): HistoryRowResult {
  return { ok: false, userMessage };
}

export async function addHistoryRowAction(input: unknown): Promise<HistoryRowResult> {
  try {
    const user = await requireUser();
    await requireModule("clinic");
    if (!canBill(user.role)) throw new NotAuthorizedError();

    const parsed = rowSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the row.");
    }
    const d = parsed.data;
    const notes = d.notes.trim();
    if (!notes && d.services.length === 0) {
      return fail("Type the treatment notes, or add a service.");
    }

    const patient = await getPatient(d.patientId);
    if (!patient || patient.mergedIntoId) return fail("That patient is no longer on file.");

    // Today as the clinic's calendar has it, not the server's (which is UTC).
    const todayAd = nepalDayIso(new Date().toISOString());
    const todayBs = bsToDbText(toBS(adFromIso(todayAd)));
    if (d.dateBs > todayBs) return fail("The date can't be in the future.");
    // A bill is issued the day it is made: an invoice dated in the past would
    // sit out of order in the year's numbering.
    if (d.services.length > 0 && d.dateBs !== todayBs) {
      return fail("A row with a charge is dated today. Use today's date, or leave the charge off.");
    }
    const dateAd = adToIso(toAD(bsFromDbText(d.dateBs)));

    // --- the services, checked before anything is written ---
    const catalog = new Map((await listPosServices()).map((s) => [s.id, s]));
    const company = await getCompany();
    const mayEditRate = user.role === "admin" || user.canEditRate;
    const lines = [];
    for (const l of d.services) {
      const s = catalog.get(l.serviceId);
      if (!s) return fail("One of the services is no longer set up. Remove it and add it again.");
      if (s.doctorRequired && !d.doctorId) return fail(`${s.name} needs a doctor. Choose one.`);
      const labPartnerId = s.outsourced ? (l.labPartnerId ?? s.defaultLabPartnerId) : null;
      if (s.outsourced && !labPartnerId) {
        return fail(`${s.name} needs the laboratory it goes to.`);
      }
      const overridden = l.ratePaisa !== s.ratePaisa;
      if (overridden && !mayEditRate) {
        return fail(`You can't change the rate of ${s.name}. Ask the owner.`);
      }
      lines.push({ service: s, qty: l.qty, ratePaisa: l.ratePaisa, overridden, labPartnerId });
    }

    const charge = rowCharge(
      lines.map((l) => ({
        qty: l.qty,
        ratePaisa: l.ratePaisa,
        vatApplicable: l.service.vatApplicable,
      })),
      {
        vatRegistered: company.vatRegistered,
        vatInclusive: company.vatInclusive,
        roundingOn: company.roundingOn,
      },
    );
    if (lines.length > 0) {
      const problem = rowPaymentProblem(
        d.payment.mode,
        d.payment.amountPaisa,
        charge.totalPaisa,
      );
      if (problem) return fail(problem);
    }

    // --- the visit, with the doctor's notes ---
    const earlier = (await visitsForPatient(patient.id)).filter(
      (v) => v.status !== "cancelled",
    );
    const visit = await createVisit({
      patientId: patient.id,
      dateAd,
      dateBs: d.dateBs,
      type: earlier.length > 0 ? "followup" : "new",
      doctorId: d.doctorId,
      userId: user.id,
    });
    await updateVisit({ id: visit.id, findings: notes, status: "seen" });

    // --- the bill, when something was charged ---
    let result: HistoryRowResult = { ok: true };
    if (lines.length > 0) {
      const mode = d.payment.mode;
      try {
        const bill = await ingestBill({
          id: ulid(),
          dateBs: d.dateBs,
          dateAd,
          patientName: patient.name,
          paymentMethod: mode === "full" ? d.payment.method : "credit",
          tenderedPaisa: mode === "full" ? charge.totalPaisa : 0,
          paidNowPaisa: mode === "part" ? d.payment.amountPaisa : mode === "credit" ? 0 : undefined,
          paidNowMethod: mode === "part" ? d.payment.method : undefined,
          billDiscountPaisa: 0,
          lines: [],
          serviceLines: lines.map((l) => ({
            id: ulid(),
            serviceId: l.service.id,
            qty: l.qty,
            ratePaisa: l.ratePaisa,
            rateOverridden: l.overridden,
            discountPaisa: 0,
            doctorId: d.doctorId,
            labPartnerId: l.labPartnerId,
            // The full rate. A follow-up price is the counter's to offer.
            followupApplied: false,
          })),
          patientId: patient.id,
          visitId: visit.id,
          clientCreatedAt: new Date().toISOString(),
          userId: user.id,
        });
        result = {
          ok: true,
          billId: bill.id,
          invoiceLabel: formatDocNo("SI", bill.fiscalLabel, bill.invoiceNo),
          totalPaisa: bill.totalPaisa,
        };
      } catch (err) {
        const why =
          err instanceof ServiceLineError || err instanceof DueBillError
            ? err.userMessage
            : err instanceof InsufficientStockError
              ? "Not enough stock."
              : null;
        if (!why) console.error("[history row bill]", err);
        // The notes are worth keeping on their own; an empty visit is not.
        if (!notes) {
          await cancelVisit(visit.id, "Row not saved: the bill could not be made", user.id);
        }
        revalidatePath(`/patients/${patient.id}`);
        return fail(
          `${notes ? "The notes were saved, but the bill wasn't" : "The row wasn't saved"}: ${
            why ?? "something went wrong. Please try again."
          }`,
        );
      }
    }

    revalidatePath(`/patients/${patient.id}`);
    revalidatePath("/visits/today");
    revalidatePath("/visits");
    if (result.billId) {
      revalidatePath("/bills");
      revalidatePath("/dues");
    }
    return result;
  } catch (err) {
    if (err instanceof ModuleDisabledError || err instanceof NotAuthorizedError) {
      return fail(err.userMessage);
    }
    console.error("[history row]", err);
    return fail("Something went wrong. Please try again.");
  }
}
