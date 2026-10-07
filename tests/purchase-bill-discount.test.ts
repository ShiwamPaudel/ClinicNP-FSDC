/**
 * The discount a supplier takes off the whole bill, and the rounding line
 * under it (D-143). The point of both is that a purchase adds up to exactly
 * what the paper says, so the arithmetic is pinned to real invoices from
 * Family Smile Dental Care Center's own distributors.
 */
import { describe, it, expect } from "vitest";
import { purchaseTotals, type PurchaseLineInput } from "@/lib/repos/purchases";
import { purchaseSchema } from "@/lib/validators";

function line(qty: number, unitCostPaisa: number, discountPaisa = 0): PurchaseLineInput {
  return {
    itemId: "i1",
    batchNo: "B1",
    mfgDateAd: null,
    expiryDateAd: "2028-02-29",
    unitLevel: 0,
    factorToBase: 1,
    qty,
    freeQty: 0,
    unitCostPaisa,
    discountPaisa,
  };
}

describe("a supplier's totals block", () => {
  it("reads like Remedies Medicine Suppliers: total, less discount, rounding, net total", () => {
    // 776.20 + 414.20 = 1,190.40; less 63.66; rounding 0.26; net 1,127.00
    const t = purchaseTotals([line(10, 7762), line(10, 4142)], 0, 6366, 26);
    expect(t.subtotalPaisa).toBe(119040);
    expect(t.billDiscountPaisa).toBe(6366);
    expect(t.taxablePaisa).toBe(112674);
    expect(t.totalPaisa).toBe(112700);
  });

  it("takes a rounding line downwards too (K.B. Pharmaceuticals: -0.31)", () => {
    const t = purchaseTotals([line(1, 1879648)], 0, 78817, -31);
    expect(t.totalPaisa).toBe(1879648 - 78817 - 31);
  });

  it("charges VAT on what is left after the discount, as the invoice prints it", () => {
    // Navya Jyoti: 2,437.40 taxable, VAT 316.86, net 2,754.26 — with no
    // discount; the same order with one takes VAT off the smaller figure.
    const withVat = purchaseTotals([line(5, 48748)], 31686, 0, 0);
    expect(withVat.taxablePaisa).toBe(243740);
    expect(withVat.totalPaisa).toBe(275426);
  });

  it("counts the line discounts first, then the discount on the bill", () => {
    const t = purchaseTotals([line(10, 10000, 5000)], 0, 9500, 0);
    expect(t.discountPaisa).toBe(5000);
    expect(t.taxablePaisa).toBe(100000 - 5000 - 9500);
  });

  it("never takes off more than the bill, so a payable cannot go negative", () => {
    const t = purchaseTotals([line(1, 10000)], 0, 999999, 0);
    expect(t.billDiscountPaisa).toBe(10000);
    expect(t.taxablePaisa).toBe(0);
    expect(t.totalPaisa).toBe(0);
  });

  it("is unchanged for a purchase with neither, as every old one was", () => {
    const t = purchaseTotals([line(10, 7762)], 0);
    expect(t.billDiscountPaisa).toBe(0);
    expect(t.roundingPaisa).toBe(0);
    expect(t.totalPaisa).toBe(77620);
  });
});

describe("what the server accepts", () => {
  const base = {
    supplierId: "s1",
    supplierInvoiceNo: "BASR0002535",
    dateBs: "2083-06-07",
    applyVat: false,
    lines: [
      {
        itemId: "i1",
        batchNo: "073093",
        mfgDateBs: "",
        expiryDateBs: "2084-10-30",
        unitLevel: 0,
        qty: 10,
        freeQty: 0,
        unitCostPaisa: 7762,
        discountPaisa: 0,
      },
    ],
  };

  it("takes a discount and a rounding line", () => {
    const r = purchaseSchema.safeParse({ ...base, billDiscountPaisa: 6366, roundingPaisa: 26 });
    expect(r.success).toBe(true);
  });

  it("defaults both to nothing when a purchase does not carry them", () => {
    const r = purchaseSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data?.billDiscountPaisa).toBe(0);
    expect(r.data?.roundingPaisa).toBe(0);
  });

  it("refuses a negative discount and refuses rounding that is not rounding", () => {
    expect(purchaseSchema.safeParse({ ...base, billDiscountPaisa: -1 }).success).toBe(false);
    expect(purchaseSchema.safeParse({ ...base, roundingPaisa: 5000 }).success).toBe(false);
    expect(purchaseSchema.safeParse({ ...base, roundingPaisa: -5000 }).success).toBe(false);
  });
});
