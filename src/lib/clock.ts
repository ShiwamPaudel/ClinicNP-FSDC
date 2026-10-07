/**
 * clock.ts — the time of day something happened, as the clinic reads it.
 *
 * Timestamps are stored as UTC ISO strings. The server that renders a page may
 * run in UTC and the browser that hydrates it in Nepal, so formatting with the
 * machine's own zone would print two different times for one payment. The
 * zone is named instead, and both sides agree.
 */

const NEPAL_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kathmandu",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "2:35 PM" in Nepal time, or "" for a missing or unreadable timestamp. */
export function nepalTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return NEPAL_TIME.format(d);
}

const NEPAL_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" });

/**
 * The AD calendar day ("2026-10-08") a UTC timestamp falls on in Nepal.
 * Slicing the ISO string gives the UTC day, which is yesterday for anything
 * done before 5:45 in the morning here.
 */
export function nepalDayIso(iso: string): string {
  return NEPAL_DAY.format(new Date(iso));
}
