/**
 * The patient card's history table: date, treatment notes, charge, payment,
 * and what is owed after each line.
 *
 * The last balance is what the patient owes, so every case checks it against
 * the rule Dues uses: left owing at the sale, less payments since, less what
 * refunds took off the debt.
 */
import { describe, it, expect } from "vitest";
import {
  buildLedger,
  type LedgerBillInput,
  type LedgerVisitInput,
} from "@/lib/patient-ledger";

function visit(over: Partial<LedgerVisitInput> = {}): LedgerVisitInput {
  return {
    id: "v1",
    dateBs: "2083-06-21",
    at: "2026-10-07T04:00:00.000Z",
    complaint: "Pain in lower left molar",
    findings: "Deep caries, 36",
    advice: "Crown",
    doctorName: "Dr. Sharma",
    cancelled: false,
    ...over,
  };
}

function bill(over: Partial<LedgerBillInput> = {}): LedgerBillInput {
  return {
    id: "b1",
    label: "SI-2083/84-000001",
    dateBs: "2083-06-21",
    at: "2026-10-07T04:10:00.000Z",
    visitId: "v1",
    items: ["Crown filling"],
    totalPaisa: 1_000_000,
    owedAtSalePaisa: 0,
    cancelled: false,
    settledAt: null,
    settledDateBs: null,
    ...over,
  };
}

describe("one visit, one bill", () => {
  it("puts the visit's notes on its bill, as one line", () => {
    const rows = buildLedger({ visits: [visit()], bills: [bill()], payments: [], refunds: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("bill");
    expect(rows[0]!.title).toBe("Crown filling");
    expect(rows[0]!.notes).toEqual([
      "Complaint: Pain in lower left molar",
      "Findings: Deep caries, 36",
      "Advice: Crown",
      "Seen by Dr. Sharma",
    ]);
    expect(rows[0]!.feePaisa).toBe(1_000_000);
    expect(rows[0]!.paymentPaisa).toBe(1_000_000);
    expect(rows[0]!.balancePaisa).toBe(0);
  });

  it("a visit with no bill still has its line, with no money", () => {
    const rows = buildLedger({ visits: [visit()], bills: [], payments: [], refunds: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("visit");
    expect(rows[0]!.feePaisa).toBeNull();
    expect(rows[0]!.balancePaisa).toBe(0);
  });
});

describe("paying in parts", () => {
  it("Rs 10,000 crown, Rs 5,000 now, Rs 3,000 later, Rs 2,000 still due", () => {
    const rows = buildLedger({
      visits: [visit()],
      bills: [bill({ owedAtSalePaisa: 500_000 })],
      payments: [
        {
          billId: "b1",
          dateBs: "2083-06-28",
          at: "2026-10-14T05:00:00.000Z",
          amountPaisa: 300_000,
          method: "cash",
        },
      ],
      refunds: [],
    });
    expect(rows.map((r) => [r.kind, r.feePaisa, r.paymentPaisa, r.balancePaisa])).toEqual([
      ["bill", 1_000_000, 500_000, 500_000],
      ["payment", null, 300_000, 200_000],
    ]);
    expect(rows[1]!.title).toBe("Payment received · Cash");
    expect(rows[1]!.notes).toEqual(["Against bill SI-2083/84-000001"]);
  });

  it("keeps the order things happened in, across days and within one", () => {
    const rows = buildLedger({
      visits: [visit({ id: "v2", dateBs: "2083-06-25", at: "2026-10-11T03:00:00.000Z" })],
      bills: [bill({ visitId: null, owedAtSalePaisa: 1_000_000 })],
      payments: [
        { billId: "b1", dateBs: "2083-06-21", at: "2026-10-07T09:00:00.000Z", amountPaisa: 100_000, method: "qr" },
      ],
      refunds: [],
    });
    expect(rows.map((r) => r.kind)).toEqual(["bill", "payment", "visit"]);
    expect(rows[2]!.balancePaisa).toBe(900_000);
  });
});

describe("refunds", () => {
  it("a refund paid back in cash changes the charge and the payment, not the debt", () => {
    const rows = buildLedger({
      visits: [],
      bills: [bill({ visitId: null })],
      payments: [],
      refunds: [
        { billId: "b1", dateBs: "2083-06-22", at: "2026-10-08T04:00:00.000Z", totalPaisa: 200_000, againstDuePaisa: 0 },
      ],
    });
    const r = rows[1]!;
    expect(r.kind).toBe("refund");
    expect(r.feePaisa).toBe(-200_000);
    expect(r.paymentPaisa).toBe(-200_000);
    expect(r.balancePaisa).toBe(0);
  });

  it("a refund on a bill still owing comes off the debt", () => {
    const rows = buildLedger({
      visits: [],
      bills: [bill({ visitId: null, owedAtSalePaisa: 500_000 })],
      payments: [],
      refunds: [
        { billId: "b1", dateBs: "2083-06-22", at: "2026-10-08T04:00:00.000Z", totalPaisa: 200_000, againstDuePaisa: 200_000 },
      ],
    });
    expect(rows[1]!.paymentPaisa).toBeNull();
    expect(rows[1]!.balancePaisa).toBe(300_000);
  });
});

describe("what is left off the card", () => {
  it("a cancelled bill, and anything paid against it, was never owed", () => {
    const rows = buildLedger({
      visits: [],
      bills: [bill({ visitId: null, cancelled: true, owedAtSalePaisa: 1_000_000 })],
      payments: [
        { billId: "b1", dateBs: "2083-06-22", at: "2026-10-08T04:00:00.000Z", amountPaisa: 100_000, method: "cash" },
      ],
      refunds: [],
    });
    expect(rows).toEqual([]);
  });

  it("a cancelled visit is not a line", () => {
    const rows = buildLedger({ visits: [visit({ cancelled: true })], bills: [], payments: [], refunds: [] });
    expect(rows).toEqual([]);
  });
});

describe("bills cleared with the old Mark paid button", () => {
  it("shows whatever was still owed as paid on the day it was cleared", () => {
    const rows = buildLedger({
      visits: [],
      bills: [
        bill({
          visitId: null,
          owedAtSalePaisa: 1_000_000,
          settledAt: "2026-10-20T05:00:00.000Z",
          settledDateBs: "2083-07-03",
        }),
      ],
      payments: [
        { billId: "b1", dateBs: "2083-06-25", at: "2026-10-11T05:00:00.000Z", amountPaisa: 400_000, method: "cash" },
      ],
      refunds: [],
    });
    expect(rows.map((r) => [r.title, r.paymentPaisa, r.balancePaisa])).toEqual([
      ["Crown filling", 0, 1_000_000],
      ["Payment received · Cash", 400_000, 600_000],
      ["Marked as paid", 600_000, 0],
    ]);
    expect(rows[2]!.dateBs).toBe("2083-07-03");
  });
});
