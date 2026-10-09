/**
 * statement-pdf.ts — a `Statement` drawn as an A4 PDF (C-036).
 *
 * Set in Mukta, the face the app already uses for Devanagari: it carries both
 * scripts, so रू and a name typed in Nepali print as they read on screen.
 * The font files ship in `assets/fonts` (SIL Open Font License, beside them)
 * and are read from disk, never fetched.
 */
import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatPaisa } from "@/lib/money";
import type { Statement, StatementIssuer, StatementCell } from "@/lib/statement";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
let fonts: { regular: Buffer; bold: Buffer } | null = null;
function loadFonts() {
  fonts ??= {
    regular: readFileSync(path.join(FONT_DIR, "Mukta-Regular.ttf")),
    bold: readFileSync(path.join(FONT_DIR, "Mukta-SemiBold.ttf")),
  };
  return fonts;
}

const INK = "#1f2a24";
const MUTED = "#5f6b64";
const RULE = "#c9cfc9";
const HEAD_FILL = "#eef1ec";
const GROUP_FILL = "#f6f7f3";

function cellText(value: StatementCell, money: boolean | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (money && typeof value === "number") return formatPaisa(value, false);
  return String(value);
}

/** Draw the statement; resolves to the finished file. */
export function statementPdf(
  st: Statement,
  issuer: StatementIssuer,
  printedAt: string,
): Promise<Buffer> {
  const { regular, bold } = loadFonts();
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 48, left: 40, right: 40 },
    bufferPages: true,
    // Set before the first page, so pdfkit never reaches for its own
    // Helvetica metrics, which a bundled server may not carry.
    font: regular as unknown as string,
    info: { Title: `${st.title}${st.party ? ` — ${st.party.name}` : ""}`, Author: issuer.name },
  });
  doc.registerFont("R", regular);
  doc.registerFont("B", bold);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  // --- the clinic, and what this is ---
  doc.font("B").fontSize(15).fillColor(INK).text(issuer.name, left, 40, { width: width * 0.62 });
  const contact = [
    issuer.address,
    issuer.phone ? `Tel: ${issuer.phone}` : "",
    issuer.panNo ? `${issuer.vatRegistered ? "VAT" : "PAN"} No: ${issuer.panNo}` : "",
  ].filter(Boolean);
  doc.font("R").fontSize(9).fillColor(MUTED);
  for (const line of contact) doc.text(line, { width: width * 0.62 });
  const leftBottom = doc.y;

  doc.font("B").fontSize(13).fillColor(INK).text(st.title, left, 40, { width, align: "right" });
  doc.font("R").fontSize(8.5).fillColor(MUTED).text(`Printed ${printedAt}`, { width, align: "right" });
  doc.y = Math.max(leftBottom, doc.y) + 8;
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.8).strokeColor(INK).stroke();
  doc.y += 10;

  // --- whom it is about ---
  if (st.party) {
    doc.font("B").fontSize(12).fillColor(INK).text(st.party.name, left, doc.y, { width });
    doc.font("R").fontSize(9).fillColor(MUTED);
    for (const line of st.party.lines.filter(Boolean)) doc.text(line, { width });
    doc.y += 4;
  }
  if (st.period) {
    doc.font("R").fontSize(9).fillColor(MUTED).text(st.period, left, doc.y, { width });
    doc.y += 4;
  }

  // --- headline figures ---
  if (st.summary && st.summary.length > 0) {
    const n = st.summary.length;
    const gap = 8;
    const w = (width - gap * (n - 1)) / n;
    const top = doc.y + 2;
    st.summary.forEach((s, i) => {
      const x = left + i * (w + gap);
      doc.rect(x, top, w, 38).lineWidth(0.6).strokeColor(RULE).stroke();
      doc.font("R").fontSize(8).fillColor(MUTED).text(s.label.toUpperCase(), x + 8, top + 6, { width: w - 16 });
      doc.font("B").fontSize(12).fillColor(INK).text(`रू ${formatPaisa(s.paisa, false)}`, x + 8, top + 17, { width: w - 16 });
    });
    doc.y = top + 38 + 12;
  }

  // --- the table ---
  const totalW = st.columns.reduce((s, c) => s + c.width, 0);
  const cols = st.columns.map((c) => ({ ...c, w: (c.width / totalW) * width }));
  const PAD = 4;
  const SIZE = 8.8;

  const rowHeight = (cells: Record<string, StatementCell>, font: "R" | "B") => {
    doc.font(font).fontSize(SIZE);
    let h = 0;
    for (const c of cols) {
      const t = cellText(cells[c.key] ?? null, c.money);
      h = Math.max(h, doc.heightOfString(t || " ", { width: c.w - PAD * 2 }));
    }
    return h + PAD * 2;
  };

  const drawRow = (
    cells: Record<string, StatementCell>,
    opts: { font: "R" | "B"; fill?: string; color?: string; ruleAbove?: boolean },
  ) => {
    const h = rowHeight(cells, opts.font);
    if (doc.y + h > bottom()) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawHead();
    }
    const y = doc.y;
    if (opts.fill) doc.rect(left, y, width, h).fill(opts.fill);
    if (opts.ruleAbove) {
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.8).strokeColor(INK).stroke();
    }
    let x = left;
    doc.font(opts.font).fontSize(SIZE).fillColor(opts.color ?? INK);
    for (const c of cols) {
      const t = cellText(cells[c.key] ?? null, c.money);
      doc.text(t, x + PAD, y + PAD, {
        width: c.w - PAD * 2,
        align: c.money || c.align === "right" ? "right" : "left",
      });
      x += c.w;
    }
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.4).strokeColor(RULE).stroke();
    doc.y = y + h;
  };

  const head = Object.fromEntries(cols.map((c) => [c.key, c.label]));
  const drawHead = () => {
    const h = rowHeight(head, "B");
    const y = doc.y;
    doc.rect(left, y, width, h).fill(HEAD_FILL);
    let x = left;
    doc.font("B").fontSize(SIZE).fillColor(INK);
    for (const c of cols) {
      doc.text(c.label, x + PAD, y + PAD, {
        width: c.w - PAD * 2,
        align: c.money || c.align === "right" ? "right" : "left",
      });
      x += c.w;
    }
    doc.moveTo(left, y + h).lineTo(left + width, y + h).lineWidth(0.8).strokeColor(INK).stroke();
    doc.y = y + h;
  };

  if (st.rows.length === 0) {
    doc.font("R").fontSize(10).fillColor(MUTED).text(st.emptyText, left, doc.y + 6, { width });
  } else {
    drawHead();
    for (const r of st.rows) {
      if (r.style === "group") drawRow(r.cells, { font: "B", fill: GROUP_FILL });
      else if (r.style === "total") drawRow(r.cells, { font: "B" });
      else if (r.style === "sub") drawRow(r.cells, { font: "R", color: MUTED });
      else drawRow(r.cells, { font: "R" });
    }
    if (st.totals) drawRow(st.totals, { font: "B", ruleAbove: true });
  }

  // --- notes, and lines to sign ---
  const notes = (st.notes ?? []).filter(Boolean);
  if (notes.length > 0) {
    doc.y += 10;
    doc.font("R").fontSize(9).fillColor(MUTED);
    for (const n of notes) doc.text(n, left, doc.y, { width });
  }
  const signs = st.signatures ?? [];
  if (signs.length > 0) {
    if (doc.y + 70 > bottom()) {
      doc.addPage();
      doc.y = doc.page.margins.top;
    }
    const gap = 40;
    const w = Math.min(170, (width - gap * (signs.length - 1)) / signs.length);
    const y = doc.y + 50;
    signs.forEach((label, i) => {
      // first on the left, last on the right, the rest spread between
      const x = signs.length === 1 ? left + width - w : left + (i * (width - w)) / (signs.length - 1);
      doc.moveTo(x, y).lineTo(x + w, y).lineWidth(0.6).strokeColor(INK).stroke();
      doc.font("R").fontSize(9).fillColor(MUTED).text(label, x, y + 4, { width: w, align: "center" });
    });
    doc.y = y + 20;
  }

  // --- page numbers ---
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - doc.page.margins.bottom + 16;
    // Writing into the bottom margin must not start a new page.
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("R").fontSize(8).fillColor(MUTED);
    doc.text(issuer.name, left, y, { width: width / 2, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, left + width / 2, y, {
      width: width / 2,
      align: "right",
      lineBreak: false,
    });
    doc.page.margins.bottom = saved;
  }

  doc.end();
  return done;
}
