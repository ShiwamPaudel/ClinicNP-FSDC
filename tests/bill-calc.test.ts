import { describe, it, expect } from "vitest";
import {
  billTotals,
  lineAmountPaisa,
  lineBaseQty,
  linePreview,
  type BillLine,
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
    { level: 0, name: "Tablet", factorToBase: 1, sellingRatePaisa: 200, isDefaultSelling: false },
    { level: 1, name: "Strip", factorToBase: 10, sellingRatePaisa: 1800, isDefaultSelling: true },
  ],
  batches: [
    { id: "near", batchNo: "N1", expiryDateAd: "2026-08-01", remainingBaseQty: 25, costPaisaPerBase: 150 },
    { id: "far", batchNo: "F1", expiryDateAd: "2027-08-01", remainingBaseQty: 100, costPaisaPerBase: 150 },
  ],
};

function line(over?: Partial<BillLine>): BillLine {
  return {
    lineId: "l1",
    item,
    unitLevel: 1,
    qty: 3,
    ratePaisa: 1800,
    rateOverridden: false,
    discountPaisa: 0,
    ...over,
  };
}

describe("bill-calc", () => {
  it("line amount and base qty", () => {
    expect(lineAmountPaisa(line())).toBe(5400); // 3 strips * 1800
    expect(lineBaseQty(line())).toBe(30); // 3 strips * 10
    expect(lineAmountPaisa(line({ discountPaisa: 400 }))).toBe(5000);
  });

  it("line preview spills across batches via real FEFO", () => {
    const p = linePreview(line({ qty: 3 }), "2026-07-14"); // 30 base
    expect(p.allocations).toEqual([
      { batchId: "near", baseQty: 25 },
      { batchId: "far", baseQty: 5 },
    ]);
    expect(p.availableBaseQty).toBe(125);
  });

  it("bill totals without VAT", () => {
    const t = billTotals([line()], 0, { vatRegistered: false, roundingOn: false }, []);
    expect(t.subtotalPaisa).toBe(5400);
    expect(t.vatPaisa).toBe(0);
    expect(t.totalPaisa).toBe(5400);
  });

  it("bill totals with 13% VAT and bill discount", () => {
    const t = billTotals([line()], 400, { vatRegistered: true, roundingOn: false }, []);
    // (5400 - 400) = 5000, VAT 650, total 5650
    expect(t.vatPaisa).toBe(650);
    expect(t.totalPaisa).toBe(5650);
  });

  it("rounding to nearest rupee", () => {
    const t = billTotals(
      [line({ ratePaisa: 1799 })],
      0,
      { vatRegistered: false, roundingOn: true },
      [],
    );
    // 3 * 1799 = 5397 -> rounds to 5400
    expect(t.totalPaisa).toBe(5400);
  });
});
