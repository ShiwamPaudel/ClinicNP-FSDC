/**
 * Batch number and expiry on a medicine bill are mandatory (D-141).
 *
 * Two halves: the rule that decides what a line prints (and refuses a line
 * that cannot print both), and the printed bill itself, rendered to HTML, so a
 * change to the bill's layout cannot quietly drop either column.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { batchesForPrint, expiryForPrint } from "@/lib/print-batches";
import { InvoiceA4 } from "@/components/print/invoice-a4";
import type { PrintBill } from "@/lib/print-types";

const BATCHES = [
  { id: "b1", batchNo: "PCM-2419", expiryDateAd: "2027-09-30" },
  { id: "b2", batchNo: " AMX-7781 ", expiryDateAd: "2028-03-31" },
];

describe("what a medicine line prints", () => {
  it("prints every batch the stock was taken from, each with its own expiry, in that order", () => {
    const out = batchesForPrint(
      [{ batchId: "b2" }, { batchId: "b1" }],
      BATCHES,
    );
    expect(out).toEqual([
      { batchNo: "AMX-7781", expiry: "03/2028" },
      { batchNo: "PCM-2419", expiry: "09/2027" },
    ]);
  });

  it("writes the expiry as the English month and year, as the pack does (D-142)", () => {
    // The owner's own example: 30 December 2026 prints as 12/2026.
    expect(expiryForPrint("2026-12-30")).toBe("12/2026");
    expect(expiryForPrint("2027-01-01")).toBe("01/2027");
    // No day, and no time zone can move it into the next or previous month.
    expect(expiryForPrint("2026-12-31")).toBe("12/2026");
    expect(expiryForPrint("2027-02-28")).toBe("02/2027");
  });

  it("refuses a line with no batch at all", () => {
    expect(batchesForPrint([], BATCHES)).toBeNull();
  });

  it("refuses a line whose batch is not in the counter's list", () => {
    expect(batchesForPrint([{ batchId: "gone" }], BATCHES)).toBeNull();
  });

  it("refuses a batch with no batch number, even if another batch is fine", () => {
    const batches = [...BATCHES, { id: "b3", batchNo: "  ", expiryDateAd: "2029-01-31" }];
    expect(batchesForPrint([{ batchId: "b1" }, { batchId: "b3" }], batches)).toBeNull();
  });

  it("refuses a batch with no expiry", () => {
    const batches = [{ id: "b4", batchNo: "X1", expiryDateAd: "" }];
    expect(batchesForPrint([{ batchId: "b4" }], batches)).toBeNull();
  });
});

function bill(lines: PrintBill["lines"]): PrintBill {
  return {
    company: {
      name: "Green Cross Sample Pharmacy",
      address: "Kupondole",
      phone: "01-5555555",
      panNo: "",
      ddaNo: "",
      vatRegistered: false,
      invoiceFooter: "Get well soon",
      logoUrl: null,
    },
    invoiceLabel: "SI-2083/84-000009",
    provisional: false,
    dateBsLong: "6 Ashwin 2083",
    timeStr: "10:15",
    patientName: "Sample Patient",
    lines,
    subtotalPaisa: 0,
    billDiscountPaisa: 0,
    vatPaisa: 0,
    totalPaisa: 0,
    paymentMethod: "cash",
    tenderedPaisa: 0,
    changePaisa: 0,
    userName: "Bikash",
  } as PrintBill;
}

function line(name: string, batches: { batchNo: string; expiry: string }[]) {
  return {
    name,
    genericName: "",
    batches,
    qty: 1,
    unitName: "Strip",
    ratePaisa: 1800,
    discountPaisa: 0,
    amountPaisa: 1800,
    rateOverridden: false,
    controlled: false,
  };
}

describe("the printed bill", () => {
  it("has a Batch no. and an Expiry column, with each medicine's values in them", () => {
    const html = renderToStaticMarkup(
      <InvoiceA4
        bill={bill([
          line("Sample Paracetamol 500", [{ batchNo: "PCM-2419", expiry: "09/2027" }]),
        ])}
      />,
    );
    expect(html).toContain("<th>Batch no.</th>");
    expect(html).toContain("<th>Expiry</th>");
    expect(html).toContain("PCM-2419");
    expect(html).toContain("09/2027");
  });

  it("prints a medicine from two batches as two batch numbers, each level with its own expiry", () => {
    const html = renderToStaticMarkup(
      <InvoiceA4
        bill={bill([
          line("Sample Amoxicillin 500", [
            { batchNo: "AMX-1", expiry: "05/2027" },
            { batchNo: "AMX-2", expiry: "06/2028" },
          ]),
        ])}
      />,
    );
    const cells = [...html.matchAll(/<td class="a4-batch">(.*?)<\/td>/g)].map((m) => m[1]);
    expect(cells).toEqual([
      "<div>AMX-1</div><div>AMX-2</div>",
      "<div>05/2027</div><div>06/2028</div>",
    ]);
  });
});
