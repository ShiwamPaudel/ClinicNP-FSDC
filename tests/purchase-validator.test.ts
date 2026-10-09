/**
 * A purchase line: the manufacture date is optional (owner request, C-016),
 * but a date that is given must make sense against the expiry. Batch and
 * expiry are needed only on stock for sale (C-035).
 */
import { describe, it, expect } from "vitest";
import { purchaseSchema } from "@/lib/validators";
import { missingOnLine } from "@/lib/supplies";

function purchase(line: Partial<{ mfgDateBs: string; expiryDateBs: string }>) {
  return {
    supplierId: "sup-1",
    supplierInvoiceNo: "INV-1",
    dateBs: "2083-06-06",
    applyVat: false,
    lines: [
      {
        itemId: "item-1",
        batchNo: "B1",
        mfgDateBs: "",
        expiryDateBs: "2085-06-30",
        unitLevel: 0,
        qty: 10,
        freeQty: 0,
        unitCostPaisa: 1000,
        discountPaisa: 0,
        ...line,
      },
    ],
  };
}

describe("the manufacture date on a purchase line", () => {
  it("may be left empty", () => {
    expect(purchaseSchema.safeParse(purchase({ mfgDateBs: "" })).success).toBe(true);
  });

  it("is accepted when given and before the expiry", () => {
    expect(
      purchaseSchema.safeParse(purchase({ mfgDateBs: "2082-06-01" })).success,
    ).toBe(true);
  });

  it("is refused when the medicine would expire before it was made", () => {
    const r = purchaseSchema.safeParse(purchase({ mfgDateBs: "2086-01-01" }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/expire before it was manufactured/);
  });

  it("is refused when it is not a date", () => {
    expect(
      purchaseSchema.safeParse(purchase({ mfgDateBs: "last year" })).success,
    ).toBe(false);
  });

  it("is not checked against an expiry that was not given", () => {
    expect(
      purchaseSchema.safeParse(purchase({ mfgDateBs: "2082-06-01", expiryDateBs: "" })).success,
    ).toBe(true);
  });
});

// The expiry is no longer the schema's to require: whether a line needs one
// depends on what the purchase is for (C-035), which the action decides from
// the module flags with `missingOnLine`.
describe("what a purchase line needs", () => {
  it("for sale: the batch number and the expiry", () => {
    expect(missingOnLine({ batchNo: "", expiryDateBs: "2085-06-30" }, 2, false)).toBe(
      "Line 2: enter the batch number.",
    );
    expect(missingOnLine({ batchNo: "B1", expiryDateBs: "" }, 1, false)).toBe(
      "Line 1: enter the expiry date.",
    );
    expect(missingOnLine({ batchNo: " ", expiryDateBs: "" }, 1, false)).toMatch(/batch/);
    expect(missingOnLine({ batchNo: "B1", expiryDateBs: "2085-06-30" }, 1, false)).toBeNull();
  });

  it("bought for use: neither", () => {
    expect(missingOnLine({ batchNo: "", expiryDateBs: "" }, 1, true)).toBeNull();
  });

  it("a line with no batch or expiry passes the schema, for the action to judge", () => {
    expect(
      purchaseSchema.safeParse(purchase({ expiryDateBs: "" })).success,
    ).toBe(true);
    const bare = purchase({});
    const { batchNo: _b, expiryDateBs: _e, ...line } = bare.lines[0]!;
    expect(purchaseSchema.safeParse({ ...bare, lines: [line] }).success).toBe(true);
  });
});
