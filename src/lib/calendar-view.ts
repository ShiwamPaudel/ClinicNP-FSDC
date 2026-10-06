/**
 * calendar-view.ts — the arithmetic behind the date picker's two faces.
 *
 * Every date box in ClinicNP takes and gives BS text ("2083-06-06"), and
 * everything behind the box — the server, the database, the printed bill —
 * keeps working in BS exactly as before. What changes is only the calendar a
 * person picks from: the Nepali month grid, or the English one. A medicine
 * pack prints "EXP 06/2027" in English dates; nobody should have to convert
 * that in their head to find it on a Nepali grid (D-137).
 *
 * This module lays out either grid and turns a pick back into BS text, so the
 * picker component holds no date maths of its own and this can be tested.
 */
import {
  BS_MONTHS_EN,
  BS_MONTHS_NP,
  adToIso,
  bsDayOfWeek,
  bsFromDbText,
  bsMonthRange,
  bsToDbText,
  formatBS,
  toAD,
  toBS,
  today,
  type BSDate,
} from "@/lib/bs";

/** Which calendar a date box shows: Nepali (BS) or English (AD). */
export type DateCalendar = "bs" | "ad";

export const DEFAULT_DATE_CALENDAR: DateCalendar = "bs";

export function isDateCalendar(v: unknown): v is DateCalendar {
  return v === "bs" || v === "ad";
}

export const AD_MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const AD_MONTHS_SHORT = AD_MONTHS_EN.map((m) => m.slice(0, 3));

/** One month on screen. `month` is 1-12 in whichever calendar it belongs to. */
export interface MonthView {
  calendar: DateCalendar;
  year: number;
  month: number;
}

// ---------------------------------------------------------------------------
// The range the converter can handle
//
// The BS converter covers 2000/01/01 to 2090/12/30 — roughly April 1943 to
// April 2034. The last BS month cannot be laid out, because a month's length
// is found from the first day of the month after it, so the picker stops at
// the end of 2090/11 (about March 2034). No expiry date comes close.
// ---------------------------------------------------------------------------

const BS_FIRST_MONTH = { year: 2000, month: 1 };
const BS_LAST_MONTH = { year: 2090, month: 11 };

let limits: { firstAd: Date; lastAd: Date } | null = null;

/** First and last day a date box will offer, as AD dates at local midnight. */
export function supportedAdRange(): { firstAd: Date; lastAd: Date } {
  limits ??= {
    firstAd: toAD({ year: BS_FIRST_MONTH.year, month: BS_FIRST_MONTH.month, day: 1 }),
    lastAd: bsMonthRange(BS_LAST_MONTH.year, BS_LAST_MONTH.month).endAd,
  };
  return limits;
}

function monthIndex(y: number, m: number): number {
  return y * 12 + (m - 1);
}

function fromIndex(i: number): { year: number; month: number } {
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

function viewBounds(calendar: DateCalendar): { min: number; max: number } {
  if (calendar === "bs") {
    return {
      min: monthIndex(BS_FIRST_MONTH.year, BS_FIRST_MONTH.month),
      max: monthIndex(BS_LAST_MONTH.year, BS_LAST_MONTH.month),
    };
  }
  const { firstAd, lastAd } = supportedAdRange();
  return {
    min: monthIndex(firstAd.getFullYear(), firstAd.getMonth() + 1),
    max: monthIndex(lastAd.getFullYear(), lastAd.getMonth() + 1),
  };
}

/** Keep a view inside the months the converter can lay out. */
export function clampView(view: MonthView): MonthView {
  const { min, max } = viewBounds(view.calendar);
  const i = Math.min(max, Math.max(min, monthIndex(view.year, view.month)));
  return { calendar: view.calendar, ...fromIndex(i) };
}

/** Move by whole months (12 = one year), never past the supported range. */
export function stepView(view: MonthView, months: number): MonthView {
  return clampView({
    calendar: view.calendar,
    ...fromIndex(monthIndex(view.year, view.month) + months),
  });
}

export function canStep(view: MonthView, months: number): boolean {
  const { min, max } = viewBounds(view.calendar);
  const i = monthIndex(view.year, view.month) + months;
  return i >= min && i <= max;
}

/** A BS text value that is well-formed and inside the supported range. */
export function parseBsValue(value: string | null | undefined): BSDate | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const bs = bsFromDbText(value);
  if (bs.month < 1 || bs.month > 12 || bs.day < 1 || bs.day > 32) return null;
  try {
    toAD(bs);
    return bs;
  } catch {
    return null;
  }
}

/**
 * The month to open on: the one holding the chosen date, or this month when
 * nothing is chosen yet.
 */
export function viewContaining(
  calendar: DateCalendar,
  value: string | null | undefined,
): MonthView {
  const bs = parseBsValue(value) ?? today();
  if (calendar === "bs") {
    return clampView({ calendar, year: bs.year, month: bs.month });
  }
  const ad = toAD(bs);
  return clampView({ calendar, year: ad.getFullYear(), month: ad.getMonth() + 1 });
}

/** The first day of a view, as BS text. */
function firstDayOf(view: MonthView): string {
  if (view.calendar === "bs") {
    return bsToDbText({ year: view.year, month: view.month, day: 1 });
  }
  const { firstAd } = supportedAdRange();
  const first = new Date(view.year, view.month - 1, 1);
  return bsToDbText(toBS(first < firstAd ? firstAd : first));
}

/**
 * Flip to the other calendar without losing your place: land on the month
 * holding the chosen date, or else the month you were looking at.
 */
export function switchCalendar(
  view: MonthView,
  value: string | null | undefined,
): MonthView {
  const other: DateCalendar = view.calendar === "bs" ? "ad" : "bs";
  const anchor = parseBsValue(value) ? value! : firstDayOf(view);
  return viewContaining(other, anchor);
}

export interface GridDay {
  day: number;
  /** What picking this day emits. Empty for a day outside the supported range. */
  bsText: string;
  /** 0 = Sunday … 6 = Saturday, the Nepali weekend. */
  weekday: number;
  disabled: boolean;
  /** Read out by a screen reader: "22 September 2026". */
  label: string;
}

export interface MonthGrid {
  /** Empty cells before the 1st, so it sits under its weekday. */
  leadingBlanks: number;
  days: GridDay[];
  title: string;
  /** Nepali month names are set in Devanagari. */
  titleScript: "np" | "en";
  subtitle: string;
}

/** Lay out one month of either calendar. */
export function monthGrid(input: MonthView): MonthGrid {
  const view = clampView(input);
  return view.calendar === "bs" ? bsGrid(view) : adGrid(view);
}

function bsGrid(view: MonthView): MonthGrid {
  const { startAd, endBs } = bsMonthRange(view.year, view.month);
  const firstDow = bsDayOfWeek({ year: view.year, month: view.month, day: 1 });
  const days: GridDay[] = [];
  for (let d = 1; d <= endBs.day; d++) {
    const bs: BSDate = { year: view.year, month: view.month, day: d };
    days.push({
      day: d,
      bsText: bsToDbText(bs),
      weekday: (firstDow + d - 1) % 7,
      disabled: false,
      label: formatBS(bs, { form: "long", monthScript: "en" }),
    });
  }
  return {
    leadingBlanks: firstDow,
    days,
    title: `${BS_MONTHS_NP[view.month - 1]} ${view.year}`,
    titleScript: "np",
    // Unchanged from the picker people already know: the month's English
    // spelling and the English date its 1st falls on.
    subtitle: `${BS_MONTHS_EN[view.month - 1]} · ${adToIso(startAd)}`,
  };
}

function adGrid(view: MonthView): MonthGrid {
  const { firstAd, lastAd } = supportedAdRange();
  const count = new Date(view.year, view.month, 0).getDate();
  const firstDow = new Date(view.year, view.month - 1, 1).getDay();
  const days: GridDay[] = [];
  let firstBs: BSDate | null = null;
  let lastBs: BSDate | null = null;
  for (let d = 1; d <= count; d++) {
    const ad = new Date(view.year, view.month - 1, d);
    const disabled = ad < firstAd || ad > lastAd;
    const bs = disabled ? null : toBS(ad);
    if (bs) {
      firstBs ??= bs;
      lastBs = bs;
    }
    days.push({
      day: d,
      bsText: bs ? bsToDbText(bs) : "",
      weekday: (firstDow + d - 1) % 7,
      disabled,
      label: `${d} ${AD_MONTHS_EN[view.month - 1]} ${view.year}`,
    });
  }
  return {
    leadingBlanks: firstDow,
    days,
    title: `${AD_MONTHS_EN[view.month - 1]} ${view.year}`,
    titleScript: "en",
    subtitle: firstBs && lastBs ? bsSpan(firstBs, lastBs) : "",
  };
}

/** "Bhadra – Ashwin 2083", or across a new year "Chaitra 2082 – Baishakh 2083". */
function bsSpan(a: BSDate, b: BSDate): string {
  const name = (bs: BSDate) => BS_MONTHS_EN[bs.month - 1];
  if (a.year === b.year && a.month === b.month) return `${name(a)} ${a.year}`;
  if (a.year === b.year) return `${name(a)} – ${name(b)} ${b.year}`;
  return `${name(a)} ${a.year} – ${name(b)} ${b.year}`;
}

/** A BS text value written out in one calendar: "6 Ashwin 2083" or "22 Sep 2026". */
export function formatInCalendar(value: string, calendar: DateCalendar): string {
  const bs = parseBsValue(value);
  if (!bs) return "";
  if (calendar === "bs") return formatBS(bs, { form: "long", monthScript: "en" });
  const ad = toAD(bs);
  return `${ad.getDate()} ${AD_MONTHS_SHORT[ad.getMonth()]} ${ad.getFullYear()}`;
}

/** Today as BS text, for marking today on either grid. */
export function todayBsText(): string {
  return bsToDbText(today());
}

/**
 * A BS text value as plain digits in one calendar: "2083-06-09" or
 * "2026-09-25". This is the form somebody types, and the form a typed box
 * shows them while they are editing it.
 */
export function numericInCalendar(
  value: string,
  calendar: DateCalendar,
): string {
  const bs = parseBsValue(value);
  if (!bs) return "";
  if (calendar === "bs") return bsToDbText(bs);
  return adToIso(toAD(bs));
}

/**
 * The first year that is read as Nepali (BS) when typed; anything earlier is
 * English (AD).
 *
 * BS runs about 57 years ahead of AD, so the two never overlap for any date
 * this system will see: AD 2060 is 34 years away, further than any expiry,
 * and BS 2059 is AD 2002, older than any purchase. The year is therefore
 * enough to tell which calendar a typed date is in.
 */
export const BS_TYPED_YEAR_FROM = 2060;

/** Which calendar a typed four-digit year belongs to. */
export function calendarOfTypedYear(year: number): DateCalendar {
  return year >= BS_TYPED_YEAR_FROM ? "bs" : "ad";
}

/**
 * Read a date somebody typed and return it as BS text, or null if it is not a
 * date yet.
 *
 * **The year decides the calendar, not the setting.** People copy these dates
 * off paper: a medicine pack prints English ("EXP 01/2028") and a Nepali
 * supplier's bill prints Nepali ("2083/06/13"), often on the same purchase.
 * Reading every typed date in the shop's one calendar got both wrong in turn —
 * with the setting on Nepali, "2028-01-31" off a pack was saved as 14 May
 * 1971; with it on English, "2083-06-13" off a bill was refused. So "2028-…"
 * is English and "2083-…" is Nepali wherever they are typed
 * (`calendarOfTypedYear`). The setting still decides how dates are *shown*.
 *
 * Separators are forgiving (`-`, `/`, `.`) and a single-digit month or day is
 * accepted, since nobody types the leading zero on 2083-6-9. Everything else is
 * refused rather than guessed at: a half-typed "2083-0" is not a date, and
 * returning null keeps the stored value untouched while the rest of it is
 * still being typed.
 */
export function parseTypedDate(text: string): string | null {
  const m = text.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 32) return null;

  if (calendarOfTypedYear(year) === "bs") {
    // parseBsValue does the real check: it refuses a day the month does not
    // have, and a year outside the conversion table.
    return parseBsValue(bsToDbText({ year, month, day })) ? bsToDbText({ year, month, day }) : null;
  }

  // An AD date has to round-trip. `new Date(2026, 1, 31)` silently becomes
  // 3 March, so the only way to know 31 February was refused is to look.
  const ad = new Date(year, month - 1, day);
  if (
    ad.getFullYear() !== year ||
    ad.getMonth() !== month - 1 ||
    ad.getDate() !== day
  ) {
    return null;
  }
  try {
    const bs = toBS(ad);
    const bsText = bsToDbText(bs);
    return parseBsValue(bsText) ? bsText : null;
  } catch {
    // Outside the conversion table.
    return null;
  }
}

/**
 * Shape what somebody is typing into a date as they type it: digits only, with
 * the dashes put in for them. "20830609" arrives as "2083-06-09", and the dash
 * after the year appears the moment the fourth digit does, so nobody has to
 * find `-` or `/` — which a phone's number pad does not even have.
 *
 * Three things make it bearable to use rather than merely correct:
 *
 *  - **Deleting is not fought.** A trailing dash is only added while the text
 *    is growing. Backspace over "2083-" and it becomes "2083", not "2083-"
 *    again — otherwise the dash would reappear forever and the year could
 *    never be corrected.
 *  - **Separators still work.** Somebody who types "2083-6-9" or pastes
 *    "2083/06/09" gets what they meant: a separator typed after a one-digit
 *    month or day pads it with a zero instead of being thrown away.
 *  - **It never guesses a date.** It only arranges characters. Whether the
 *    result is a real day is still `parseTypedDate`'s decision, so a half-typed
 *    value simply does not commit.
 *
 * `previous` is what the box held before this keystroke.
 */
export function maskTypedDate(raw: string, previous = ""): string {
  let year = "";
  let month = "";
  let day = "";
  // 0 = typing the year, 1 = the month, 2 = the day
  let part = 0;

  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      if (part === 0) {
        year += ch;
        if (year.length === 4) part = 1;
      } else if (part === 1) {
        month += ch;
        if (month.length === 2) part = 2;
      } else if (day.length < 2) {
        day += ch;
      }
    } else if (ch === "-" || ch === "/" || ch === "." || ch === " ") {
      // A separator closes a one-digit month or day. One that arrives where a
      // dash was already put in — or after nothing at all — is ignored.
      if (part === 1 && month.length === 1) {
        month = `0${month}`;
        part = 2;
      } else if (part === 2 && day.length === 1) {
        day = `0${day}`;
      }
    }
  }

  let out = year;
  if (part >= 1) out += "-";
  out += month;
  if (part >= 2) out += "-";
  out += day;

  const deleting = raw.length < previous.length;
  if (deleting && out.endsWith("-")) out = out.slice(0, -1);
  return out;
}
