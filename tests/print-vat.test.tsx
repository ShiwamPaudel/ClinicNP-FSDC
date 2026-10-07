/**
 * The printed bill's money block (C-034): the taxable amount and the VAT, said
 * the way the bill was charged — on top, or already inside the rates — and no
 * "(pending)" after the bill number of a bill printed before it was numbered.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoiceA4 } from "@/components/print/invoice-a4";
import type { PrintBill } from "@/lib/print-types";

function bill(over: Partial<PrintBill>): PrintBill {
  return {
    company: {
      name: "Family Smile Dental Care Center",
      address: "",
      phone: "01-5450221",
      panNo: "604320603",
      ddaNo: "",
      vatRegistered: true,
      invoiceFooter: "Get well soon",
      logoUrl: null,
    },
    invoiceLabel: "SI-2083/84-000001",
    provisional: false,
    dateBsLong: "22 Ashwin 2083",
    timeStr: "10:15 AM",
    patientName: "Sample Patient",
    lines: [],
    serviceLines: [
      {
        name: "Crown filling",
        doctorName: "",
        qty: 1,
        ratePaisa: 1_000_000,
        discountPaisa: 0,
        amountPaisa: 1_000_000,
        rateOverridden: false,
        followupNote: "",
      },
    ],
    subtotalPaisa: 1_000_000,
    billDiscountPaisa: 0,
    vatPaisa: 130_000,
    taxablePaisa: 1_000_000,
    vatInclusive: false,
    totalPaisa: 1_130_000,
    paymentMethod: "cash",
    tenderedPaisa: 0,
    changePaisa: 0,
    userName: "Admin",
    ...over,
  } as PrintBill;
}

const text = (b: PrintBill) =>
  renderToStaticMarkup(<InvoiceA4 bill={b} />).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the printed bill number", () => {
  it("never says (pending), even on a slip printed before the number came", () => {
    const t = text(bill({ invoiceLabel: "Slip 3F9A2C", provisional: true }));
    expect(t).toContain("Slip 3F9A2C");
    expect(t).not.toContain("pending");
  });
});

describe("the VAT lines", () => {
  it("VAT on top: taxable Rs 10,000, VAT Rs 1,300, total Rs 11,300", () => {
    const t = text(bill({}));
    expect(t).toContain("Taxable amount");
    expect(t).toContain("10,000.00");
    expect(t).toMatch(/VAT 13% [^a-z(]*1,300\.00/);
    expect(t).not.toContain("(included)");
    expect(t).toContain("11,300.00");
  });

  it("VAT included: taxable Rs 8,849.56, VAT Rs 1,150.44 included, total Rs 10,000", () => {
    const t = text(
      bill({
        vatInclusive: true,
        vatPaisa: 115_044,
        taxablePaisa: 884_956,
        totalPaisa: 1_000_000,
      }),
    );
    expect(t).toContain("8,849.56");
    expect(t).toContain("VAT 13% (included)");
    expect(t).toContain("1,150.44");
  });

  it("prints no VAT lines on a bill with no VAT", () => {
    const t = text(
      bill({
        company: { ...bill({}).company, vatRegistered: false },
        vatPaisa: 0,
        taxablePaisa: 0,
        totalPaisa: 1_000_000,
      }),
    );
    expect(t).not.toContain("Taxable amount");
    expect(t).not.toContain("VAT 13%");
  });
});
