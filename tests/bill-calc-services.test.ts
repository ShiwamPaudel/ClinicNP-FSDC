/**
 * The widened bill: medicine lines and service lines under one set of totals.
 *
 * The v1 tests in bill-calc.test.ts are deliberately left untouched — they are
 * the proof that the medicine-only path did not move. These tests cover what
 * is new.
 */
import { describe, it, expect } from "vitest";
import {
  billTotals,
  apportion,
  serviceLineAmountPaisa,
  type BillLine,
  type ServiceLine,
} from "@/lib/bill-calc";
import type { PosItem } from "@/lib/pos-types";

const item: PosItem = {
  id: "i1",
  brandName: "ABC Med",
  genericName: "Amox 500",
  category: "Medicine",
  controlledFlag: false,
  shape: "tablet",
  cell: null,
  shelfNote: "",
  units: [
    { level: 0, name: "Tablet", factorToBase: 1, sellingRatePaisa: 200, isDefaultSelling: true },
  ],
  batches: [],
};

function med(qty: number, ratePaisa: number, discountPaisa = 0): BillLine {
  return {
    lineId: `m${qty}-${ratePaisa}`,
    item,
    unitLevel: 0,
    qty,
    ratePaisa,
    rateOverridden: false,
    discountPaisa,
  };
}

function svc(over?: Partial<ServiceLine>): ServiceLine {
  return {
    lineId: "s1",
    serviceId: "svc1",
    name: "OPD Consultation",
    groupId: "grp_opd",
    qty: 1,
    ratePaisa: 50_000,
    rateOverridden: false,
    discountPaisa: 0,
    vatApplicable: false,
    doctorId: null,
    labPartnerId: null,
    followupApplied: false,
    followupNote: "",
    ...over,
  };
}

const noVat = { vatRegistered: false, roundingOn: false };
const withVat = { vatRegistered: true, roundingOn: false };

describe("billTotals with no service lines is the v1 calculation", () => {
  it("an empty service list leaves the v1 medicine arithmetic untouched", () => {
    // serviceLines used to default to []. It no longer does, because the
    // counter's payment pane never passed it and quietly showed a total of
    // zero on a bill that had a Rs 600 test on it. Omitting it is now a
    // compile error; this checks that saying [] means what the default meant.
    const lines = [med(10, 200), med(3, 1_500)];
    const t = billTotals(lines, 500, withVat, []);
    expect(t.subtotalPaisa).toBe(2_000 + 4_500);
    expect(t.totalPaisa).toBeGreaterThan(0);
  });

  it("still puts the whole discount against the VAT base when everything is VAT-able", () => {
    // subtotal 10000, discount 1000 -> base 9000, VAT 13% = 1170
    const t = billTotals([med(10, 1_000)], 1_000, withVat, []);
    expect(t.subtotalPaisa).toBe(10_000);
    expect(t.vatPaisa).toBe(1_170);
    expect(t.totalPaisa).toBe(10_170);
  });
});

describe("billTotals with service lines", () => {
  it("adds the service subtotal to the medicine subtotal", () => {
    const t = billTotals([med(10, 200)], 0, noVat, [svc()]);
    expect(t.subtotalPaisa).toBe(2_000 + 50_000);
    expect(t.totalPaisa).toBe(52_000);
  });

  it("bills a service-only bill with no medicine lines at all", () => {
    const t = billTotals([], 0, noVat, [svc()]);
    expect(t.subtotalPaisa).toBe(50_000);
    expect(t.totalPaisa).toBe(50_000);
  });

  it("charges no VAT on a service that is not VAT-able", () => {
    // Only the medicine is VAT-able: 2000 * 13% = 260
    const t = billTotals([med(10, 200)], 0, withVat, [svc()]);
    expect(t.vatPaisa).toBe(260);
    expect(t.totalPaisa).toBe(52_000 + 260);
  });

  it("charges VAT on a service that is VAT-able", () => {
    // 2000 + 50000 = 52000 * 13% = 6760
    const t = billTotals([med(10, 200)], 0, withVat, [svc({ vatApplicable: true })]);
    expect(t.vatPaisa).toBe(6_760);
  });

  it("charges nothing when the company is not VAT registered, flag or no flag", () => {
    const t = billTotals([med(10, 200)], 0, noVat, [svc({ vatApplicable: true })]);
    expect(t.vatPaisa).toBe(0);
  });

  it("shares a bill discount across VAT-able and exempt lines in proportion", () => {
    // medicine 2000 (VAT-able) + consultation 50000 (exempt) = 52000
    // discount 5200 -> the VAT-able share is 2000/52000 of it = 200
    // VAT base 2000 - 200 = 1800 -> 234
    const t = billTotals([med(10, 200)], 5_200, withVat, [svc()]);
    expect(t.subtotalPaisa).toBe(52_000);
    expect(t.vatPaisa).toBe(234);
    expect(t.totalPaisa).toBe(52_000 - 5_200 + 234);
  });

  it("never lets a discount larger than the bill produce a negative total", () => {
    const t = billTotals([med(1, 100)], 999_999, withVat, [svc()]);
    expect(t.totalPaisa).toBeGreaterThanOrEqual(0);
    expect(t.vatPaisa).toBe(0);
  });

  it("counts a free follow-up line as zero without dropping it from the bill", () => {
    const t = billTotals([], 0, noVat, [svc({ ratePaisa: 0, followupApplied: true })]);
    expect(t.subtotalPaisa).toBe(0);
    expect(t.totalPaisa).toBe(0);
  });

  it("handles two films of the same X-ray", () => {
    const t = billTotals([], 0, noVat, [svc({ qty: 2, ratePaisa: 80_000 })]);
    expect(t.subtotalPaisa).toBe(160_000);
  });

  it("applies rupee rounding to the grand total as before", () => {
    const t = billTotals([], 0, { vatRegistered: false, roundingOn: true }, [
      svc({ ratePaisa: 49_949 }),
    ]);
    expect(t.totalPaisa % 100).toBe(0);
  });
});

describe("serviceLineAmountPaisa", () => {
  it("subtracts a line discount and never goes below zero", () => {
    expect(serviceLineAmountPaisa(svc({ discountPaisa: 10_000 }))).toBe(40_000);
    expect(serviceLineAmountPaisa(svc({ discountPaisa: 99_999 }))).toBe(0);
  });
});

describe("apportion", () => {
  it("splits exactly, with the parts summing to the total", () => {
    const parts = apportion(100, [1, 1, 1]);
    expect(parts.reduce((s, p) => s + p, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });

  it("gives the spare paisa to whoever lost the most in the rounding", () => {
    const parts = apportion(10, [1, 2, 4]);
    expect(parts.reduce((s, p) => s + p, 0)).toBe(10);
  });

  it("returns zeros when there is nothing to split or nothing to split across", () => {
    expect(apportion(0, [5, 5])).toEqual([0, 0]);
    expect(apportion(100, [0, 0])).toEqual([0, 0]);
    expect(apportion(100, [])).toEqual([]);
  });

  it("gives the whole amount to a single weight", () => {
    expect(apportion(777, [3])).toEqual([777]);
  });
});
