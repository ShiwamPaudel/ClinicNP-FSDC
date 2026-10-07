/**
 * parse.ts — turn the text OCR read off a supplier's invoice photo into
 * something the purchase form can be filled with.
 *
 * Nothing here touches the database, the network or the DOM: text in, a draft
 * purchase out. That is deliberate — every rule below was written against the
 * actual OCR output of Family Smile Dental Care Center's own suppliers' bills, and the only way to keep
 * it honest as the suppliers change their stationery is to be able to pin a
 * real line of text in a test.
 *
 * What the bills look like. Three of the four distributors print from the same
 * dot-matrix package, with this header:
 *
 *   S.N. HS CODE: ITEM DESCRIPTION: PACK: BATCH: EXP.DATE QTY: CC/RATE: AMOUNT: M.R.P.
 *   1. SOLAY TAB 1X10 206031 2028/03 4 323.27 1,293.08 375.00
 *
 * so the expiry is the hinge: the description, pack and batch sit to its left,
 * and the quantity, rate, amount and MRP to its right. Free goods come as a
 * continuation row that repeats "- do -" instead of a name.
 *
 * What we never do is trust it. Every row's arithmetic is checked (qty x rate
 * against the printed amount) and the bill's own TOTAL / LESS DISCOUNT /
 * ROUNDING / NET TOTAL are read separately, so the form can tell the person
 * where the reading and the paper disagree. The person tallies and corrects;
 * nothing is saved until they press Save.
 */

/** One row of the supplier's bill, as far as it could be read. */
export interface ReadLine {
  /** The name exactly as printed, kept so the person can see what the paper said. */
  printedName: string;
  /** Pack text as printed ("1X10", "10's", "1 vial") — used to guess the unit. */
  pack: string;
  batchNo: string;
  /** Expiry as "YYYY-MM" in AD, or "" when the bill has no expiry column. */
  expiryAdMonth: string;
  qty: number;
  freeQty: number;
  unitCostPaisa: number;
  /** The amount as printed. */
  amountPaisa: number;
  /**
   * True when qty x rate did not agree with the printed amount. OCR misreads a
   * digit often enough (4:896.80 for 1,896.80) that this is the single most
   * useful signal on the page: the row is worth a second look.
   */
  amountDisagrees: boolean;
}

export interface ReadInvoice {
  invoiceNo: string;
  /** The supplier's own transaction date, in BS, as "YYYY-MM-DD" or "". */
  dateBs: string;
  lines: ReadLine[];
  /** The bill's own figures, or null where they could not be read. */
  totalPaisa: number | null;
  billDiscountPaisa: number | null;
  roundingPaisa: number | null;
  netTotalPaisa: number | null;
  hasVat: boolean;
}

/* ------------------------------------------------------------------ tokens */

/**
 * OCR confuses a handful of letters with digits, and does it consistently:
 * O for 0, B and S for 8 and 5, I and l for 1, Z for 2. We only ever apply
 * this inside a token that is already shaped like a number (an expiry, a
 * batch that is all digits elsewhere), never to a medicine's name.
 */
function digitsOnly(s: string): string {
  return s.replace(/[OoDQ]/g, "0").replace(/[Il|]/g, "1").replace(/[Zz]/g, "2").replace(/[Ss]/g, "5").replace(/[Bb]/g, "8");
}

/**
 * Paisa from a printed amount. The separators are unreliable: the thousands
 * mark comes back as "." as often as ",", and a decimal point is sometimes a
 * dash or a colon (181-04, 4:896.80). What is reliable is that these columns
 * always print two decimal places, so the last two digits are the paisa.
 */
export function moneyToPaisa(token: string): number | null {
  const neg = /^[-~]/.test(token.trim());
  const cleaned = token.replace(/[^\d.,:\-]/g, "").replace(/^-/, "");
  if (!/\d/.test(cleaned)) return null;
  const groups = cleaned.split(/[.,:\-]+/).filter((g) => g.length > 0);
  if (groups.length === 0) return null;
  const last = groups[groups.length - 1]!;
  let paisa: number;
  if (groups.length > 1 && last.length === 2) {
    paisa = Number(groups.slice(0, -1).join("")) * 100 + Number(last);
  } else if (groups.length === 1) {
    // A bare number: whole rupees.
    paisa = Number(last) * 100;
  } else {
    // Separators but no two-digit tail — read it as whole rupees.
    paisa = Number(groups.join("")) * 100;
  }
  return Number.isFinite(paisa) ? (neg ? -paisa : paisa) : null;
}

/**
 * True for a token that prints like money: two decimal places, with or
 * without a thousands mark ("9,612.18", "1.293.08", "2754.26", "77.62").
 */
function looksLikeMoney(token: string): boolean {
  const t = token.replace(/[^\d.,:\-%~]/g, "");
  return (
    /^[-~]?\d{1,3}(?:[.,:\-]\d{3})+[.,:\-]\d{2}%?$/.test(t) ||
    /^[-~]?\d+[.,:\-]\d{2}%?$/.test(t)
  );
}

/** True for a bare whole number, which on these bills means a quantity. */
function looksLikeCount(token: string): boolean {
  return /^\d{1,4}$/.test(token);
}

/* ------------------------------------------------------------------ expiry */

/**
 * A slash or a dash, never a dot: "8.55" is a rate, and letting a dot count
 * would turn half the money on a bill into expiry dates in the 2050s.
 */
const EXPIRY = /^([0-9OoBbSsZzIl]{1,4})[/-]([0-9OoBbSsZzIl]{1,4})$/;

function inRange(year: number): boolean {
  return year >= 2020 && year <= 2060;
}

/**
 * An expiry month, as "YYYY-MM". Suppliers print it every way there is —
 * "2028/02" on the dot-matrix bills, "06/28" and "12/2026" on others — so all
 * three are read, and which half is the year is decided by the numbers rather
 * than by the supplier.
 *
 * Anything that is not a plausible expiry comes back empty: the year has to be
 * one a medicine could carry, which is what stops a batch number, a phone
 * number or a mangled column being taken for a date.
 */
export function expiryFromToken(token: string): string {
  const m = EXPIRY.exec(token.trim());
  if (!m) return "";
  const a = digitsOnly(m[1]!);
  const b = digitsOnly(m[2]!);
  const na = Number(a);
  const nb = Number(b);
  // "2028/02"
  if (a.length === 4 && inRange(na) && nb >= 1 && nb <= 12) {
    return `${na}-${String(nb).padStart(2, "0")}`;
  }
  // "12/2026"
  if (b.length === 4 && inRange(nb) && na >= 1 && na <= 12) {
    return `${nb}-${String(na).padStart(2, "0")}`;
  }
  // "06/28" — a two-digit year, which on a medicine is always this century.
  if (b.length === 2 && na >= 1 && na <= 12 && inRange(2000 + nb)) {
    return `${2000 + nb}-${String(na).padStart(2, "0")}`;
  }
  return "";
}

/* -------------------------------------------------------------------- pack */

const PACK_WORDS = /^(1?(PH|ANP|AMP|TUBE?|TU8|VIAL|VIXD|PCS|BOX|JAR|STRIP|BTL|KIT))$/i;

function looksLikePack(token: string): boolean {
  if (/^\d{1,3}\s*[xX*]\s*\d{1,3}$/.test(token)) return true; // 1X10, 1X15
  // 10's, 15's — and 15'5, because OCR reads the trailing s as a 5 often. The
  // apostrophe is what makes the 5 allowed: without it "25" is a strength.
  if (/^\d{1,3}(['’][sS5]|[sS])$/.test(token)) return true;
  return PACK_WORDS.test(token);
}

/* -------------------------------------------------------------------- rows */

/** A continuation row: the same medicine again, as free goods or a second batch. */
function isDitto(line: string): boolean {
  return (
    /^[-–—\s]*do[-–—\s]*$/i.test(line.trim().split(/\s{2,}/)[0] ?? "") ||
    /^\s*[-–—]\s*do\s*[-–—]/i.test(line) ||
    // "do-" and "do -" with the leading dash lost (Sohan, 2083/05/29). The
    // dash after it is required, so a medicine called DOLO or DOXY never is.
    /^\s*do\s*[-–—](\s|$)/i.test(line)
  );
}

/**
 * A name printed in front of a "- do -" row: OCR read two rows of the paper
 * into one line of text, the next medicine's name first and the continuation
 * row after it ("ANOMYCETIN- EYE OINT - do - 10 TAB 26441494 2027/09 2 FREE").
 * The name belongs to the row that follows, which comes back with no name of
 * its own. Gives the name and the row without it, or null.
 */
function splitLeadingName(line: string): { name: string; rest: string } | null {
  const m = /^(.*?[A-Za-z]{3}.*?)\s+[-–—]\s*do\s*[-–—]\s+(.*)$/i.exec(line);
  if (!m) return null;
  const name = m[1]!.replace(/^\d{1,2}[.,:]?\s+/, "").replace(/[-–—:;,\s]+$/, "").trim();
  if (!name) return null;
  return { name, rest: `- do - ${m[2]}` };
}

/**
 * Whether two batch numbers read off the same bill are the same batch, allowing
 * for the couple of characters OCR gets wrong ("OM2616" / "OK2616"). Either
 * one missing counts as alike: there is nothing to tell them apart by.
 */
function batchesAlike(a: string, b: string): boolean {
  const norm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  const x = norm(a);
  const y = norm(b);
  if (!x || !y || x === y) return true;
  if (x.length !== y.length) return x.includes(y) || y.includes(x);
  let differ = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) differ++;
  return differ <= 2;
}

/** "FREE", and the ways OCR prints it: "EREE", "FRFE", "LFREE" (1 FREE run together). */
function isFreeMark(token: string): boolean {
  return /^[lI|1]?[FE]R[EF3][E3]$/i.test(token);
}

interface RowParts {
  left: string[];
  right: string[];
  expiry: string;
}

/**
 * Split a row into what is left of the number columns and what is right of
 * them.
 *
 * The expiry is the hinge when it is there. It is not always: on the Remedies
 * bill the whole expiry column drifted onto a line of its own, leaving
 * "1. FRUSAL TA8 073093 10 77.62 776.20 90.00" with nothing to hinge on. So
 * the fallback is the quantity — the last bare number that still has two
 * printed amounts after it, which is exactly the QTY column and never a
 * strength in the medicine's name ("HYTIDE 25", "AMCAB 5MG").
 */
function splitRow(tokens: string[]): RowParts | null {
  for (let i = 0; i < tokens.length; i++) {
    const expiry = expiryFromToken(tokens[i]!);
    if (expiry) {
      return { left: tokens.slice(0, i), right: tokens.slice(i + 1), expiry };
    }
  }
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (!looksLikeCount(tokens[i]!)) continue;
    const after = tokens.slice(i + 1).filter((t) => looksLikeMoney(t) && !t.includes("%"));
    if (after.length >= 2) {
      return { left: tokens.slice(0, i), right: tokens.slice(i), expiry: "" };
    }
  }
  return null;
}

/**
 * Strip the serial number and the HS code from the front of a row. The bills
 * print "1." or "1" and then, on some lines only, a four-to-eight digit customs
 * code ("1.3004 MEDOMOL TAB"), which is not part of the medicine's name.
 */
function stripSerial(tokens: string[]): string[] {
  const out = [...tokens];
  if (out.length && /^\d{1,2}[.,:]?$/.test(out[0]!)) out.shift();
  else if (out.length && /^\d{1,2}[.,]\d{4,8}$/.test(out[0]!)) {
    // "1.3004" — serial and HS code run together.
    out.shift();
  }
  if (out.length && /^\d{4,8}$/.test(out[0]!) && out.length > 2) out.shift();
  return out;
}

/**
 * Name, pack and batch out of what sat left of the numbers.
 *
 * The pack column is the divider: whatever is printed before it is the
 * medicine, whatever comes after it is the batch. That matters because a batch
 * is not always one token — "AC1 2902" and "TC-26003" are both one batch
 * number with a space or a dash in the middle of it, and taking only the last
 * token would put "AC1" into the medicine's name.
 */
function readLeft(left: string[]): { name: string; pack: string; batchNo: string } {
  const t = stripSerial(left);
  if (t.length === 0) return { name: "", pack: "", batchNo: "" };

  let packAt = -1;
  for (let i = t.length - 1; i >= 0; i--) {
    if (looksLikePack(t[i]!)) {
      packAt = i;
      break;
    }
  }
  if (packAt === -1) {
    // No pack column read: the batch is the last token, the name is the rest.
    return {
      name: t.slice(0, -1).join(" ").replace(/[:;,]+$/, "").trim(),
      pack: "",
      batchNo: cleanBatch([t[t.length - 1]!]),
    };
  }
  let pack = t[packAt]!;
  let nameEnd = packAt;
  // "1 vial" and "1 TUBE" arrive as two tokens.
  if (packAt > 0 && /^\d$/.test(t[packAt - 1]!) && /^[A-Za-z]/.test(pack)) {
    pack = `${t[packAt - 1]} ${pack}`;
    nameEnd = packAt - 1;
  }
  return {
    name: t.slice(0, nameEnd).join(" ").replace(/[:;,]+$/, "").trim(),
    pack,
    batchNo: cleanBatch(t.slice(packAt + 1)),
  };
}

/**
 * Join what the batch column held. Anything shaped like a half-read expiry
 * ("207/102") is dropped: it is the next column bleeding in, not the batch.
 */
function cleanBatch(tokens: string[]): string {
  return tokens
    .filter((t) => !/^\d{3,4}[/\-.]\d{1,3}$/.test(t))
    .join("")
    .replace(/[:;,]+$/, "")
    .trim();
}

/**
 * Quantity, rate and amount out of what sat right of the expiry.
 *
 * The columns are QTY, CC/RATE, AMOUNT, M.R.P., but OCR drops a stray mark
 * between them often enough ("20 ~ 31.03 620.60 36.00") that counting columns
 * does not work. What does work: the quantity is the first bare number, and
 * the money columns are the last three amounts on the row — of which the last
 * is the MRP, which a purchase does not use.
 */
function readRight(right: string[]): {
  qty: number;
  free: boolean;
  unitCostPaisa: number;
  amountPaisa: number;
} | null {
  const free = right.some(isFreeMark);
  const counts = right.filter(looksLikeCount);
  // "LFREE": the quantity 1 and the word run together, with nothing else
  // bare on the row to be the quantity.
  if (counts.length === 0 && right.some((t) => /^[lI|1][FE]R/i.test(t))) counts.push("1");
  const monies = right.filter((t) => looksLikeMoney(t) && !t.includes("%"));
  const qty = counts.length ? Number(counts[0]) : 0;
  if (qty <= 0) return null;
  if (monies.length === 0) {
    return free ? { qty, free, unitCostPaisa: 0, amountPaisa: 0 } : null;
  }
  // Of rate / amount / MRP, drop the MRP when all three are there.
  const useful = monies.length >= 3 ? monies.slice(-3, -1) : monies.slice(0, 2);
  const unitCostPaisa = moneyToPaisa(useful[0] ?? "0") ?? 0;
  const amountPaisa = moneyToPaisa(useful[1] ?? useful[0] ?? "0") ?? 0;
  return { qty, free, unitCostPaisa, amountPaisa };
}

/* ------------------------------------------------------------------ totals */

/** The bill's own closing figures. Labels come back mangled, so match loosely. */
function readTotals(lines: string[]): Pick<
  ReadInvoice,
  "totalPaisa" | "billDiscountPaisa" | "roundingPaisa" | "netTotalPaisa" | "hasVat"
> {
  let totalPaisa: number | null = null;
  let billDiscountPaisa: number | null = null;
  let roundingPaisa: number | null = null;
  let netTotalPaisa: number | null = null;
  let hasVat = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    // "Taxable Amount" comes back as "TaableAmoumt" as often as not.
    if (/\bVAT\b|TA\w?ABLE\s*AM/i.test(line)) hasVat = true;
    // The figure on a totals line is the last money token on it.
    const tokens = line.split(/\s+/);
    let money = [...tokens].reverse().find((t) => looksLikeMoney(t) && !t.includes("%"));
    // OCR can lift the figure onto a line of its own just above its label
    // ("6,318.89" then "OFFICE COPY TOTAL"). Only a line that is nothing but
    // one amount is borrowed, so a row of the bill never is.
    if (!money && /T[O0]TAL/i.test(line) && i > 0) {
      const above = lines[i - 1]!.trim();
      if (looksLikeMoney(above) && !above.includes("%")) money = above;
    }
    if (!money) continue;
    const paisa = moneyToPaisa(money);
    if (paisa === null) continue;
    const negative = /[-~]\s*\d|:\s*-/.test(line) && /R[O0DB]UND/i.test(line);
    // Suppliers close a bill every way there is: NET TOTAL on the dot-matrix
    // bills, Net Amount, Net Payable, Grand Total elsewhere.
    if (/^[^A-Za-z]*(N[E3][TI1]|HET|MET)\s*(T[O0]TAL|AM[O0]UNT|PAYA8?BLE)/i.test(line)) {
      netTotalPaisa ??= paisa;
    } else if (/GRAND\s*T[O0]TAL/i.test(line)) {
      netTotalPaisa ??= paisa;
    } else if (/R[O0DB]UND/i.test(line)) {
      roundingPaisa ??= negative ? -Math.abs(paisa) : paisa;
    } else if (/DISC[O0]UNT/i.test(line) && !/TRADE/i.test(line)) {
      billDiscountPaisa ??= paisa;
    } else if (/T[O0]TAL|GR[O0]SS\s*AM/i.test(line)) {
      totalPaisa ??= paisa;
    }
  }
  return { totalPaisa, billDiscountPaisa, roundingPaisa, netTotalPaisa, hasVat };
}

/* ------------------------------------------------------- invoice no. & date */

function readInvoiceNo(lines: string[]): string {
  // "Invoice No.", but also "TnvoicE No." and "Jnvoice No." — the first letter
  // is the one OCR is least sure of, so it is the one not to insist on.
  const labelled = /NV[O0Q]IC[E3]\s*N[O0]/i;
  // Lines that carry a different long number entirely.
  const decoy = /REGD|PAN\b|DDA|MEMBER|TEL|PH:/i;
  const candidate = /^[A-Z]{2,6}\d{4,}$/;
  const pick = (tokens: string[]): string | null => {
    for (const t of tokens) {
      const clean = t.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (!candidate.test(clean)) continue;
      const m = /^([A-Z]{2,6})(\d{4,})$/.exec(clean)!;
      let letters = m[1]!;
      let digits = m[2]!;
      // "BASRO002535": the O at the end of the letters is a zero, which the
      // digits that follow give away by starting with one themselves.
      const trailingO = /O+$/.exec(letters)?.[0];
      if (trailingO && digits.startsWith("0") && letters.length - trailingO.length >= 2) {
        letters = letters.slice(0, -trailingO.length);
        digits = "0".repeat(trailingO.length) + digits;
      }
      return letters + digits;
    }
    return null;
  };
  for (let i = 0; i < lines.length; i++) {
    if (!labelled.test(lines[i]!)) continue;
    const here = decoy.test(lines[i]!) ? null : pick(lines[i]!.split(/\s+/));
    if (here) return here;
    const after = lines[i + 1];
    if (after && !decoy.test(after)) {
      const next = pick(after.split(/\s+/));
      if (next) return next;
    }
  }
  // No label read: take the first thing on the page shaped like one.
  for (const line of lines) {
    if (decoy.test(line)) continue;
    const here = pick(line.split(/\s+/));
    if (here) return here;
  }
  return "";
}

/**
 * The supplier's transaction date, which these bills print in BS. AD dates sit
 * next to it on the same bill, so the year is what tells them apart: a BS year
 * is in the 2070s and 2080s, an AD one in the 2020s.
 */
function readDateBs(lines: string[]): string {
  for (const line of lines) {
    const m = /\b(20[6-9]\d)\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/.exec(line);
    if (!m) continue;
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 32) continue;
    return `${m[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return "";
}

/* -------------------------------------------------------------------- main */

/** Where the item rows start and stop, so headers and footers are left alone. */
function itemBand(lines: string[]): [number, number] {
  let start = 0;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/ITE[MN]\s*DESCRI|DESCRIPTI[O0]N/i.test(lines[i]!)) start = i + 1;
    if (/CUST[O0]MER\s*C[O0]|IN\s*WORDS|INW[O0]RDS/i.test(lines[i]!) && i > start) {
      end = Math.min(end, i);
      break;
    }
  }
  return [start, end];
}

export function parseInvoiceText(text: string): ReadInvoice {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const [start, end] = itemBand(lines);
  const out: ReadLine[] = [];

  /** A name read in front of a "- do -" row, waiting for the row it names. */
  let pendingName = "";
  /** A "- do -" read on a line by itself, marking the row after it. */
  let dittoNext = false;

  for (let i = start; i < end; i++) {
    let line = lines[i]!;
    let parts = splitRow(line.split(/\s+/).filter(Boolean));
    let right = parts ? readRight(parts.right) : null;
    // OCR sometimes breaks one printed row in two around the expiry: the name,
    // pack and batch on one line and "2028/07 10 112.07 1,120.70 130.00" on
    // the next, or the expiry kept on the first line and the figures alone on
    // the second. A line that is not a row on its own is read together with
    // the next one when the break falls exactly there.
    const next = lines[i + 1];
    const nextFirst = next?.split(/\s+/)[0] ?? "";
    const endsOnExpiry = !!expiryFromToken(line.split(/\s+/).at(-1) ?? "");
    const breaksAtExpiry =
      !!expiryFromToken(nextFirst) ||
      (endsOnExpiry && (looksLikeCount(nextFirst) || looksLikeMoney(nextFirst)));
    if (!right && next && i + 1 < end && breaksAtExpiry) {
      const joined = `${line} ${next}`;
      const jParts = splitRow(joined.split(/\s+/).filter(Boolean));
      const jRight = jParts ? readRight(jParts.right) : null;
      if (jParts && jRight) {
        line = joined;
        parts = jParts;
        right = jRight;
        i++;
      }
    }
    const tokens = line.split(/\s+/).filter(Boolean);
    // A "- do -" left on a line of its own: the row it begins is the next one.
    if (!parts && isDitto(line) && tokens.length <= 3) {
      dittoNext = true;
      continue;
    }
    if (tokens.length < 4 || !parts || !right) continue;

    const lead = splitLeadingName(line);
    if (lead) {
      pendingName = lead.name;
      line = lead.rest;
      parts = splitRow(line.split(/\s+/).filter(Boolean));
      right = parts ? readRight(parts.right) : null;
      if (!parts || !right) continue;
    }
    const ditto = isDitto(line) || dittoNext;
    dittoNext = false;
    const left = readLeft(parts.left);
    // A "name" with no letters in it is a stray pack or serial figure ("1"),
    // not a medicine.
    if (!/[A-Za-z]{2}/.test(left.name)) left.name = "";
    if (!left.name && !ditto && pendingName) left.name = pendingName;
    if (!ditto) pendingName = "";

    // Free goods come as a continuation row: "- do -" and the same batch
    // again, priced at nothing. That is bonus stock on the row above, not a
    // line of its own — and it stays bonus stock even when OCR loses the
    // "- do -" itself and leaves the row with no name at all.
    const previous = out[out.length - 1];
    if (right.free && previous && (ditto || !left.name)) {
      // A free row repeats its medicine's batch. When the rows between were
      // lost, the row above is a different medicine, and bonus stock put on
      // it would be wrong stock — so a free row whose batch is plainly not the
      // one above is left out rather than attached to the wrong line.
      if (batchesAlike(left.batchNo, previous.batchNo)) previous.freeQty += right.qty;
      continue;
    }

    // A "- do -" row that is not free is a second batch of the same medicine,
    // so it becomes a line of its own carrying the name down.
    const name = ditto && previous ? previous.printedName : left.name;

    // Two kinds of row are not rows at all, and are dropped rather than put in
    // front of the person to delete: one with neither a name nor a batch on
    // it, which is a stray line of figures OCR lifted off the page, and one
    // priced at nothing that is not marked free.
    if (!name && !left.batchNo) continue;
    if (!right.free && right.amountPaisa === 0) continue;

    const expected = right.qty * right.unitCostPaisa;
    out.push({
      printedName: name,
      pack: left.pack,
      batchNo: left.batchNo,
      expiryAdMonth: parts.expiry,
      qty: right.qty,
      freeQty: 0,
      unitCostPaisa: right.unitCostPaisa,
      amountPaisa: right.amountPaisa,
      // Half a rupee of slack for the supplier's own rounding of qty x rate.
      amountDisagrees: Math.abs(expected - right.amountPaisa) > 50,
    });
  }

  return {
    invoiceNo: readInvoiceNo(lines),
    dateBs: readDateBs(lines),
    lines: out,
    ...readTotals(lines.slice(Math.max(start, 0))),
  };
}
