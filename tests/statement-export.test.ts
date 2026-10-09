/**
 * Ledgers as files (C-036): the same statement drawn as a PDF and written as
 * an Excel sheet. The sheet must carry money as numbers in rupees, and the
 * PDF must be a real PDF that carries Nepali text without falling over.
 */
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { statementPdf } from "@/lib/export/statement-pdf";
import { statementXlsx } from "@/lib/export/statement-xlsx";
import { fileSlug, type Statement } from "@/lib/statement";

const issuer = {
  name: "Family Smile Dental Care Center",
  address: "",
  phone: "01-5450221",
  panNo: "604320603",
  vatRegistered: true,
};

function statement(rows = 3): Statement {
  return {
    fileName: "supplier-ledger-test",
    title: "Supplier ledger",
    party: { name: "दन्त सप्लायर्स", lines: ["PAN/VAT No: 123456789", ""] },
    period: "All entries up to 23 Ashwin 2083",
    summary: [{ label: "Owed now", paisa: 85_000 }],
    columns: [
      { key: "date", label: "Date", width: 12 },
      { key: "what", label: "Particulars", width: 40 },
      { key: "bought", label: "Purchase", width: 15, money: true },
      { key: "paid", label: "Paid / returned", width: 15, money: true },
      { key: "balance", label: "Balance", width: 15, money: true },
    ],
    rows: Array.from({ length: rows }, (_, i) => ({
      cells: {
        date: "2083-06-23",
        what: `Purchase PI-2083/84-${String(i + 1).padStart(6, "0")}`,
        bought: 180_000,
        paid: null,
        balance: 180_000 * (i + 1),
      },
    })),
    totals: { date: "", what: "Total", bought: 180_000 * rows, paid: 0, balance: 180_000 * rows },
    emptyText: "Nothing yet.",
  };
}

describe("the PDF", () => {
  it("is a PDF, Nepali names and all", async () => {
    const pdf = await statementPdf(statement(), issuer, "23 Ashwin 2083, 3:00 PM");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2_000);
  });

  it("runs onto more pages when the ledger is long", async () => {
    const short = await statementPdf(statement(3), issuer, "now");
    const long = await statementPdf(statement(200), issuer, "now");
    const pages = (b: Buffer) => (b.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages(short)).toBe(1);
    expect(pages(long)).toBeGreaterThan(3);
  });

  it("says so when there is nothing to list", async () => {
    const pdf = await statementPdf({ ...statement(0), rows: [] }, issuer, "now");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("the Excel sheet", () => {
  it("carries money as rupees, as numbers, with the header row and totals", async () => {
    const buf = await statementXlsx(statement(2), issuer, "now");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    const values = (r: number) => (ws.getRow(r).values as unknown[]).slice(1);
    let header = 0;
    ws.eachRow((row, n) => {
      if (row.getCell(1).value === "Date" && row.getCell(2).value === "Particulars") header = n;
    });
    expect(header).toBeGreaterThan(0);
    expect(values(header + 1)).toEqual(["2083-06-23", "Purchase PI-2083/84-000001", 1800, undefined, 1800]);
    expect(ws.getRow(header + 1).getCell(3).numFmt).toBe("#,##0.00");
    expect(values(header + 3)[1]).toBe("Total");
    expect(values(header + 3)[2]).toBe(3600);
    expect(String(ws.getRow(1).getCell(1).value)).toBe(issuer.name);
  });
});

describe("the file name", () => {
  it("is plain letters, digits and dashes", () => {
    expect(fileSlug("supplier-ledger", "Dental Supplies Pvt. Ltd.")).toBe(
      "supplier-ledger-dental-supplies-pvt-ltd",
    );
    expect(fileSlug("dues", "दन्त")).toBe("dues");
    expect(fileSlug("", "")).toBe("statement");
  });
});
