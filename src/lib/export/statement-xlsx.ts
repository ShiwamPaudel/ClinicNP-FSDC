/**
 * statement-xlsx.ts — a `Statement` written as an Excel sheet (C-036).
 *
 * The heading lines come first, then the table with its own header row, so
 * the sheet reads like the PDF and still sorts and sums as a table. Money is
 * a real number in rupees with two decimals, never text.
 */
import "server-only";
import ExcelJS from "exceljs";
import type { Statement, StatementIssuer } from "@/lib/statement";

const MONEY = "#,##0.00";

export async function statementXlsx(
  st: Statement,
  issuer: StatementIssuer,
  printedAt: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = issuer.name;
  const ws = wb.addWorksheet(st.title.slice(0, 31));
  const n = st.columns.length;

  const line = (text: string, opts: { bold?: boolean; size?: number } = {}) => {
    const row = ws.addRow([text]);
    row.font = { bold: opts.bold ?? false, size: opts.size ?? 11 };
    if (n > 1) ws.mergeCells(row.number, 1, row.number, n);
  };

  line(issuer.name, { bold: true, size: 14 });
  const contact = [
    issuer.address,
    issuer.phone ? `Tel: ${issuer.phone}` : "",
    issuer.panNo ? `${issuer.vatRegistered ? "VAT" : "PAN"} No: ${issuer.panNo}` : "",
  ].filter(Boolean);
  if (contact.length) line(contact.join(" · "));
  line(st.title, { bold: true, size: 12 });
  if (st.party) {
    line(st.party.name, { bold: true });
    for (const l of st.party.lines.filter(Boolean)) line(l);
  }
  if (st.period) line(st.period);
  for (const s of st.summary ?? []) {
    const row = ws.addRow([s.label, Math.round(s.paisa) / 100]);
    row.getCell(2).numFmt = MONEY;
    row.getCell(1).font = { bold: true };
  }
  line(`Printed ${printedAt}`, { size: 9 });
  ws.addRow([]);

  // --- the table ---
  const header = ws.addRow(st.columns.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF1EC" } };
    cell.border = { bottom: { style: "thin" } };
  });
  st.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(10, Math.round(c.width * 3.2));
    if (c.money) ws.getColumn(i + 1).alignment = { horizontal: "right" };
  });

  const put = (cells: Record<string, string | number | null>, bold: boolean, italic = false) => {
    const row = ws.addRow(
      st.columns.map((c) => {
        const v = cells[c.key];
        if (v === null || v === undefined || v === "") return null;
        return c.money && typeof v === "number" ? Math.round(v) / 100 : v;
      }),
    );
    st.columns.forEach((c, i) => {
      if (c.money) row.getCell(i + 1).numFmt = MONEY;
    });
    if (bold || italic) row.font = { bold, italic };
    return row;
  };

  if (st.rows.length === 0) {
    line(st.emptyText);
  } else {
    for (const r of st.rows) put(r.cells, r.style === "group" || r.style === "total", r.style === "sub");
    if (st.totals) {
      const row = put(st.totals, true);
      row.eachCell((cell) => {
        cell.border = { top: { style: "thin" } };
      });
    }
  }

  const notes = (st.notes ?? []).filter(Boolean);
  if (notes.length > 0) {
    ws.addRow([]);
    for (const n of notes) line(n);
  }
  if (st.signatures?.length) {
    ws.addRow([]);
    ws.addRow([]);
    line(st.signatures.map((s) => `${s}: ____________________`).join("      "));
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
