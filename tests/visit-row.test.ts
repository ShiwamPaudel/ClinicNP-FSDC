/**
 * A row added to a patient's history (C-036): what its services come to, and
 * whether the payment typed against it makes sense. The form previews with
 * the same function the server checks with, and both agree with the bill
 * `ingestBill` will save — the Rs 10,000 crown from C-034 is the anchor.
 */
import { describe, it, expect } from "vitest";
import { rowCharge, rowPaymentProblem } from "@/lib/visit-row";

const crown = { qty: 1, ratePaisa: 1_000_000, vatApplicable: true };
const xray = { qty: 2, ratePaisa: 50_000, vatApplicable: false };

describe("what a row's services come to", () => {
  it("VAT added on top", () => {
    const c = rowCharge([crown], { vatRegistered: true, vatInclusive: false, roundingOn: false });
    expect(c).toEqual({ subtotalPaisa: 1_000_000, taxablePaisa: 1_000_000, vatPaisa: 130_000, totalPaisa: 1_130_000 });
  });

  it("VAT already in the rate", () => {
    const c = rowCharge([crown], { vatRegistered: true, vatInclusive: true, roundingOn: false });
    expect(c.totalPaisa).toBe(1_000_000);
    expect(c.vatPaisa).toBe(115_044);
    expect(c.taxablePaisa).toBe(884_956);
  });

  it("only VAT-able services carry VAT", () => {
    const c = rowCharge([crown, xray], { vatRegistered: true, vatInclusive: false, roundingOn: false });
    expect(c.subtotalPaisa).toBe(1_100_000);
    expect(c.vatPaisa).toBe(130_000);
    expect(c.totalPaisa).toBe(1_230_000);
  });

  it("no VAT when the clinic is not registered", () => {
    const c = rowCharge([crown, xray], { vatRegistered: false, vatInclusive: false, roundingOn: false });
    expect(c.vatPaisa).toBe(0);
    expect(c.totalPaisa).toBe(1_100_000);
  });

  it("rounds to the rupee when the clinic rounds", () => {
    const c = rowCharge([{ qty: 1, ratePaisa: 33_333, vatApplicable: true }], {
      vatRegistered: true,
      vatInclusive: false,
      roundingOn: true,
    });
    expect(c.totalPaisa % 100).toBe(0);
  });
});

describe("the payment typed against a row", () => {
  it("paid in full and on credit need nothing more", () => {
    expect(rowPaymentProblem("full", 0, 1_000_000)).toBeNull();
    expect(rowPaymentProblem("credit", 0, 1_000_000)).toBeNull();
  });

  it("a part payment is something paid and something left", () => {
    expect(rowPaymentProblem("part", 500_000, 1_000_000)).toBeNull();
    expect(rowPaymentProblem("part", 0, 1_000_000)).toMatch(/how much was paid/);
    expect(rowPaymentProblem("part", 1_000_000, 1_000_000)).toMatch(/Paid in full/);
    expect(rowPaymentProblem("part", 1_200_000, 1_000_000)).toMatch(/more than the charge/);
  });
});
