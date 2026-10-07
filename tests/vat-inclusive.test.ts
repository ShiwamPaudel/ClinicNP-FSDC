/**
 * VAT added on top, or already inside the rate (0024).
 *
 * The owner's example, word for word: a crown filling at Rs 10,000. Added on
 * top, the patient pays Rs 11,300. Included, the patient pays Rs 10,000 and
 * Rs 1,150.44 of it is VAT. Both are a setting, and the counter's preview and
 * the saved bill both go through `vatSplit`, so they cannot disagree.
 */
import { describe, it, expect } from "vitest";
import { billTotals, vatSplit, type ServiceLine } from "@/lib/bill-calc";
import { vatIncludedIn } from "@/lib/money";

function svc(ratePaisa: number, vatApplicable: boolean, over?: Partial<ServiceLine>): ServiceLine {
  return {
    lineId: `s-${ratePaisa}-${vatApplicable}`,
    serviceId: "svc",
    name: "Crown filling",
    groupId: "grp",
    qty: 1,
    ratePaisa,
    rateOverridden: false,
    discountPaisa: 0,
    vatApplicable,
    doctorId: null,
    labPartnerId: null,
    followupApplied: false,
    followupNote: "",
    ...over,
  };
}

const CROWN = 1_000_000; // Rs 10,000.00
const onTop = { vatRegistered: true, vatInclusive: false, roundingOn: false };
const included = { vatRegistered: true, vatInclusive: true, roundingOn: false };
const notRegistered = { vatRegistered: false, vatInclusive: true, roundingOn: false };

describe("the crown filling at Rs 10,000", () => {
  it("adds 13% on top: the patient pays Rs 11,300", () => {
    const t = billTotals([], 0, onTop, [svc(CROWN, true)]);
    expect(t.taxablePaisa).toBe(1_000_000);
    expect(t.vatPaisa).toBe(130_000);
    expect(t.totalPaisa).toBe(1_130_000);
  });

  it("with VAT included: the patient pays Rs 10,000, of which Rs 1,150.44 is VAT", () => {
    const t = billTotals([], 0, included, [svc(CROWN, true)]);
    expect(t.totalPaisa).toBe(1_000_000);
    expect(t.vatPaisa).toBe(115_044);
    expect(t.taxablePaisa).toBe(884_956);
    // the two parts make up exactly what was paid
    expect(t.taxablePaisa + t.vatPaisa).toBe(t.totalPaisa);
  });

  it("charges nothing at all when the clinic is not VAT registered, whatever the mode", () => {
    const t = billTotals([], 0, notRegistered, [svc(CROWN, true)]);
    expect(t.vatPaisa).toBe(0);
    expect(t.taxablePaisa).toBe(0);
    expect(t.totalPaisa).toBe(1_000_000);
  });
});

describe("what is and is not VAT-able", () => {
  it("leaves an unticked service out of the VAT, included or not", () => {
    const lines = [svc(CROWN, true), svc(50_000, false, { lineId: "opd" })];
    const inc = billTotals([], 0, included, lines);
    expect(inc.totalPaisa).toBe(1_050_000);
    expect(inc.vatPaisa).toBe(115_044);
    expect(inc.taxablePaisa).toBe(884_956);

    const top = billTotals([], 0, onTop, lines);
    expect(top.vatPaisa).toBe(130_000);
    expect(top.taxablePaisa).toBe(1_000_000);
    expect(top.totalPaisa).toBe(1_050_000 + 130_000);
  });

  it("shares a bill discount, so only the VAT-able part of it lowers the VAT", () => {
    // Rs 500 off a Rs 10,000 + Rs 10,000 bill, half of it VAT-able:
    // the VAT-able half carries Rs 250 of the discount.
    const lines = [svc(CROWN, true), svc(CROWN, false, { lineId: "x" })];
    const inc = billTotals([], 50_000, included, lines);
    expect(inc.totalPaisa).toBe(2_000_000 - 50_000);
    expect(inc.vatPaisa).toBe(vatIncludedIn(1_000_000 - 25_000));
    expect(inc.taxablePaisa).toBe(1_000_000 - 25_000 - inc.vatPaisa);
  });
});

describe("rounding to the rupee", () => {
  it("rounds the total in both modes, and never the VAT", () => {
    const odd = svc(1_000_050, true); // Rs 10,000.50
    const inc = billTotals([], 0, { ...included, roundingOn: true }, [odd]);
    expect(inc.totalPaisa % 100).toBe(0);
    expect(inc.vatPaisa).toBe(vatIncludedIn(1_000_050));
    const top = billTotals([], 0, { ...onTop, roundingOn: true }, [odd]);
    expect(top.totalPaisa % 100).toBe(0);
  });
});

describe("vatSplit is the one calculation", () => {
  it("gives the same figures billTotals does", () => {
    const s = vatSplit({
      subtotalPaisa: CROWN,
      vatableSubtotalPaisa: CROWN,
      billDiscountPaisa: 0,
      vatRegistered: true,
      vatInclusive: true,
    });
    expect(s).toEqual({
      vatPaisa: 115_044,
      taxablePaisa: 884_956,
      totalBeforeRoundingPaisa: 1_000_000,
    });
  });
});
