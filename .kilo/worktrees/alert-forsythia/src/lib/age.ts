/**
 * age.ts — how a Nepali clinic records age, and how it is shown later.
 *
 * The front desk types a number and a unit ("3 Months"), not a date of birth.
 * A stored age is only true on the day it was taken, so it is stamped with an
 * "as on" date and rolled forward for display — a 3-month-old registered a year
 * ago must show as about 1 year 3 months, never still as 3 months (D-031).
 *
 * A date of birth, when the patient knows it, always wins: the age is computed
 * live and is exact.
 *
 * Pure, no BS conversion inside — callers hand in AD ISO dates that came from
 * lib/bs.ts, so all calendar maths stays in one place (Rules §1.5).
 */

export type AgeUnit = "y" | "m" | "d";

export interface AgeEntry {
  /** Age as it was entered. Null when only a date of birth is known. */
  value: number | null;
  unit: AgeUnit | null;
  /** The AD date the entered age was true on (ISO). */
  asOfAd: string | null;
  /** AD date of birth (ISO), when known. */
  dobAd: string | null;
}

export interface AgeDisplay {
  /** "34 Y", "1 Y 3 M", "12 D" */
  short: string;
  /** "34 years", "1 year 3 months", "12 days" */
  long: string;
  /** True when a date of birth produced this, so it is exact. */
  exact: boolean;
  /** The "as on" date, when the age was rolled forward rather than computed. */
  asOfAd: string | null;
  /** Whole years, for reports that band by age. */
  years: number;
}

const UNIT_LABEL: Record<AgeUnit, { short: string; one: string; many: string }> = {
  y: { short: "Y", one: "year", many: "years" },
  m: { short: "M", one: "month", many: "months" },
  d: { short: "D", one: "day", many: "days" },
};

export const AGE_UNIT_OPTIONS: { value: AgeUnit; label: string }[] = [
  { value: "y", label: "Years" },
  { value: "m", label: "Months" },
  { value: "d", label: "Days" },
];

function parseIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  // Local midnight, matching lib/bs.ts toAD() (D-006).
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = parseIso(fromIso);
  const b = parseIso(toIso);
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/** Whole months between two AD dates, not counting a partial final month. */
function monthsBetween(fromIso: string, toIso: string): number {
  const a = parseIso(fromIso);
  const b = parseIso(toIso);
  let months =
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return months;
}

/** The elapsed age between two dates, as years + months + days. */
function partsBetween(fromIso: string, toIso: string) {
  const totalMonths = Math.max(0, monthsBetween(fromIso, toIso));
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  // days since the last whole month boundary
  const a = parseIso(fromIso);
  const anchor = new Date(a.getFullYear(), a.getMonth() + totalMonths, a.getDate());
  const days = Math.max(0, daysBetween(toIsoOf(anchor), toIso));
  return { years, months, days };
}

function toIsoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Shift a date back by whole years/months/days, clamping the day to the end of
 * the target month instead of letting it overflow. Without the clamp, 29 Feb
 * minus one year becomes 1 March, which pushes every later birthday a day late
 * and can cost a whole year at the boundary.
 */
function shiftBack(
  from: Date,
  years: number,
  months: number,
  days: number,
): Date {
  const totalMonths = years * 12 + months;
  let y = from.getFullYear();
  let m = from.getMonth() - totalMonths;
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  const day = Math.min(from.getDate(), daysInMonth(y, m));
  const shifted = new Date(y, m, day);
  if (days) shifted.setDate(shifted.getDate() - days);
  return shifted;
}

function render(years: number, months: number, days: number): {
  short: string;
  long: string;
} {
  const pick: [number, AgeUnit][] =
    years > 0
      ? months > 0
        ? [
            [years, "y"],
            [months, "m"],
          ]
        : [[years, "y"]]
      : months > 0
        ? days > 0
          ? [
              [months, "m"],
              [days, "d"],
            ]
          : [[months, "m"]]
        : [[days, "d"]];

  return {
    short: pick.map(([n, u]) => `${n} ${UNIT_LABEL[u].short}`).join(" "),
    long: pick
      .map(([n, u]) => `${n} ${n === 1 ? UNIT_LABEL[u].one : UNIT_LABEL[u].many}`)
      .join(" "),
  };
}

/** Turn an entered age into the number of days it represents, approximately. */
function enteredToParts(value: number, unit: AgeUnit) {
  if (unit === "y") return { years: value, months: 0, days: 0 };
  if (unit === "m") return { years: Math.floor(value / 12), months: value % 12, days: 0 };
  return { years: 0, months: 0, days: value };
}

/**
 * The age to show today.
 * - date of birth present -> computed live, exact
 * - entered age present   -> rolled forward from its "as on" date
 * - neither               -> an em dash, never a guess
 */
export function displayAge(entry: AgeEntry, todayAd: string): AgeDisplay {
  if (entry.dobAd) {
    const { years, months, days } = partsBetween(entry.dobAd, todayAd);
    const r = render(years, months, days);
    return { ...r, exact: true, asOfAd: null, years };
  }

  if (entry.value != null && entry.unit && entry.asOfAd) {
    const base = enteredToParts(entry.value, entry.unit);
    // Roll the entered age forward by the time since it was taken by walking
    // back a notional birth date, then measuring to today.
    const asOf = parseIso(entry.asOfAd);
    const notionalBirth = shiftBack(asOf, base.years, base.months, base.days);
    const { years, months, days } = partsBetween(toIsoOf(notionalBirth), todayAd);
    const r = render(years, months, days);
    return { ...r, exact: false, asOfAd: entry.asOfAd, years };
  }

  return { short: "—", long: "Not recorded", exact: false, asOfAd: null, years: 0 };
}

/** The age exactly as it was entered, for an edit form. */
export function enteredAgeLabel(entry: AgeEntry): string {
  if (entry.value == null || !entry.unit) return "";
  const u = UNIT_LABEL[entry.unit];
  return `${entry.value} ${entry.value === 1 ? u.one : u.many}`;
}

/** Sane input bounds. Never a clinical judgement — just a typo guard. */
export function isSaneAge(value: number, unit: AgeUnit): boolean {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return false;
  if (unit === "y") return value <= 130;
  if (unit === "m") return value <= 1560; // 130 years
  return value <= 47_450; // 130 years
}
