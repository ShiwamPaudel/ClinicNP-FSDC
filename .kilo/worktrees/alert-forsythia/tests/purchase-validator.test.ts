/**
 * A purchase line: the manufacture date is optional (owner request, C-016),
 * but a date that is given must make sense against the expiry.
 */
import { describe, it, expect } from "vitest";
import { purchaseSchema } from "@/lib/validators";

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

  it("does not make the expiry optional", () => {
    expect(
      purchaseSchema.safeParse(purchase({ expiryDateBs: "" })).success,
    ).toBe(false);
  });
});
