/**
 * bs.ts — the ONLY module that touches the Bikram Sambat converter.
 * Nothing else in the codebase imports `nepali-date-converter` directly (Rules.md §1.5).
 *
 * Conventions used across the app:
 *  - Our BSDate uses 1-indexed months: Baishakh = 1 … Chaitra = 12.
 *  - AD is a native JS `Date`.
 *  - The denormalized DB text column `date_bs` is `YYYY-MM-DD` with a 1-indexed,
 *    zero-padded month, e.g. Shrawan 1, 2083 -> "2083-04-01".
 *  - Fiscal year runs Shrawan 1 -> Ashadh end (PRD 4.5.1).
 */
import NepaliDateImport from "nepali-date-converter";

/**
 * The converter ships as CommonJS. Next's bundler hands us the constructor
 * directly; a plain Node runner (tsx, used by the migration, seed and
 * bootstrap scripts) hands us the module object with the constructor on
 * `.default`. Unwrapping here means every caller gets a constructor, and the
 * install scripts can use BS dates like everything else.
 */
const NepaliDate = (
  typeof NepaliDateImport === "function"
    ? NepaliDateImport
    : (NepaliDateImport as unknown as { default: typeof NepaliDateImport })
        .default
) as typeof NepaliDateImport;

/** The instance type, which the const above shadows out of scope. */
type NepaliDateInstance = InstanceType<typeof NepaliDateImport>;

export interface BSDate {
  /** BS year, e.g. 2083 */
  year: number;
  /** 1-indexed month: Baishakh = 1 … Chaitra = 12 */
  month: number;
  /** day of month, 1-based */
  day: number;
}

export interface FiscalYear {
  /** e.g. "2083/84" */
  label: string;
  startYear: number;
  endYear: number;
}

/** Nepali month names, index 0 = Baishakh. */
export const BS_MONTHS_NP = [
  "बैशाख",
  "जेठ",
  "असार",
  "श्रावण",
  "भदौ",
  "आश्विन",
  "कार्तिक",
  "मंसिर",
  "पुष",
  "माघ",
  "फाल्गुन",
  "चैत",
] as const;

/** Transliterated month names, index 0 = Baishakh. */
export const BS_MONTHS_EN = [
  "Baishakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
] as const;

/** Shrawan is the first month of the fiscal year (1-indexed month 4). */
const FISCAL_START_MONTH = 4; // Shrawan
const NEPALI_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"];

function toNepaliNumerals(s: string): string {
  return s.replace(/[0-9]/g, (d) => NEPALI_DIGITS[Number(d)]!);
}

function fromNepali(nd: NepaliDateInstance): BSDate {
  return {
    year: nd.getYear(),
    month: nd.getMonth() + 1, // library is 0-indexed
    day: nd.getDate(),
  };
}

function toNepali(bs: BSDate): NepaliDateInstance {
  return new NepaliDate(bs.year, bs.month - 1, bs.day);
}

/** Today, in BS. */
export function today(): BSDate {
  return fromNepali(new NepaliDate());
}

/** Convert an AD `Date` to BS. */
export function toBS(ad: Date): BSDate {
  return fromNepali(new NepaliDate(ad));
}

/** Normalize any `Date` to local midnight — the converter returns non-midnight times. */
function localMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Convert a BS date to an AD `Date` at local midnight (safe for day arithmetic). */
export function toAD(bs: BSDate): Date {
  return localMidnight(toNepali(bs).toJsDate());
}

/** Zero-pad to 2 digits. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** BS -> denormalized DB text "YYYY-MM-DD" (1-indexed month). */
export function bsToDbText(bs: BSDate): string {
  return `${bs.year}-${pad2(bs.month)}-${pad2(bs.day)}`;
}

/** Parse denormalized DB text "YYYY-MM-DD" back to a BSDate. */
export function bsFromDbText(text: string): BSDate {
  const [y, m, d] = text.split("-").map(Number);
  return { year: y!, month: m!, day: d! };
}

/** AD -> ISO date text "YYYY-MM-DD" (how AD dates are stored). */
export function adToIso(ad: Date): string {
  return `${ad.getFullYear()}-${pad2(ad.getMonth() + 1)}-${pad2(ad.getDate())}`;
}

/** Parse an AD ISO date string ("YYYY-MM-DD") to a `Date`. */
export function adFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export interface FormatBSOptions {
  /** "en" = English digits (default), "np" = Nepali numerals */
  lang?: "en" | "np";
  /** include month name form: "short" (2083-04-01 style), "long" (1 Shrawan 2083) */
  form?: "short" | "long";
  /** month name script when form=long: "np" Devanagari or "en" transliteration */
  monthScript?: "np" | "en";
}

/** Format a BS date for display. Defaults: English digits, short "YYYY-MM-DD". */
export function formatBS(bs: BSDate, opts: FormatBSOptions = {}): string {
  const { lang = "en", form = "short", monthScript = "en" } = opts;
  let out: string;
  if (form === "long") {
    const name =
      monthScript === "np"
        ? BS_MONTHS_NP[bs.month - 1]
        : BS_MONTHS_EN[bs.month - 1];
    out = `${bs.day} ${name} ${bs.year}`;
  } else {
    out = bsToDbText(bs);
  }
  return lang === "np" ? toNepaliNumerals(out) : out;
}

/**
 * The fiscal year that a BS date falls in.
 * Shrawan(4)..Chaitra(12) belong to {year}/{year+1}.
 * Baishakh(1)..Ashadh(3) belong to {year-1}/{year}.
 */
export function fiscalYearOf(bs: BSDate): FiscalYear {
  const startYear = bs.month >= FISCAL_START_MONTH ? bs.year : bs.year - 1;
  const endYear = startYear + 1;
  return {
    label: `${startYear}/${String(endYear).slice(-2)}`,
    startYear,
    endYear,
  };
}

/** First and last AD date of a fiscal year (Shrawan 1 startYear -> Ashadh end endYear). */
export function fiscalYearAdRange(fy: FiscalYear): { startAd: Date; endAd: Date } {
  const startAd = toAD({ year: fy.startYear, month: FISCAL_START_MONTH, day: 1 });
  // Ashadh (month 3) end of endYear = day before Shrawan 1 of endYear.
  const nextFyStart = toAD({
    year: fy.endYear,
    month: FISCAL_START_MONTH,
    day: 1,
  });
  const endAd = new Date(nextFyStart);
  endAd.setDate(endAd.getDate() - 1);
  return { startAd, endAd };
}

/** The fiscal year that follows `fy` (2083/84 -> 2084/85). */
export function nextFiscalYear(fy: FiscalYear): FiscalYear {
  const startYear = fy.startYear + 1;
  const endYear = startYear + 1;
  return {
    label: `${startYear}/${String(endYear).slice(-2)}`,
    startYear,
    endYear,
  };
}

/** Rebuild a FiscalYear from its stored label ("2083/84"). */
export function fiscalYearFromLabel(label: string): FiscalYear {
  const startYear = Number(label.split("/")[0]);
  if (!Number.isFinite(startYear)) {
    throw new Error(`bad fiscal year label: ${label}`);
  }
  const endYear = startYear + 1;
  return {
    label: `${startYear}/${String(endYear).slice(-2)}`,
    startYear,
    endYear,
  };
}

/**
 * AD range covering an entire BS month [y, m] (m is 1-indexed).
 * Computed without a days-in-month table: end = day before the 1st of the next month.
 */
export function bsMonthRange(
  year: number,
  month: number,
): { startAd: Date; endAd: Date; startBs: BSDate; endBs: BSDate } {
  const startBs: BSDate = { year, month, day: 1 };
  const startAd = toAD(startBs);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextStartAd = toAD({ year: nextYear, month: nextMonth, day: 1 });
  const endAd = new Date(nextStartAd);
  endAd.setDate(endAd.getDate() - 1);
  return { startAd, endAd, startBs, endBs: toBS(endAd) };
}

/** Day of week for a BS date: 0 = Sunday … 6 = Saturday (Saturday is the Nepali weekend). */
export function bsDayOfWeek(bs: BSDate): number {
  return toNepali(bs).getDay();
}
