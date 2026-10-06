/**
 * appointment-types.ts — the booking vocabulary, shared by the server and the
 * browser.
 *
 * Lives outside lib/repos because the repo layer is `server-only`, and both the
 * front desk and the doctor's phone need the same words for the same thing.
 * Types, labels and clock arithmetic only — no data access.
 */

export type AppointmentStatus =
  | "booked"
  | "arrived"
  | "seen"
  | "cancelled"
  | "missed";

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: "Booked",
  arrived: "Arrived",
  seen: "Seen",
  cancelled: "Cancelled",
  missed: "Did not come",
};

/** What the front desk can move a booking to; cancelling has its own path. */
export const SELECTABLE_APPOINTMENT_STATUSES: Exclude<
  AppointmentStatus,
  "cancelled"
>[] = ["booked", "arrived", "seen", "missed"];

/** A booking that is still expected to happen. */
export function isOpen(status: AppointmentStatus): boolean {
  return status === "booked" || status === "arrived";
}

export const DURATION_CHOICES = [10, 15, 20, 30, 45, 60] as const;

/** "45 minutes", "1 hour", "1 hour 30 minutes" — never "45m". */
export function describeDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = `${h} ${h === 1 ? "hour" : "hours"}`;
  return m === 0 ? hours : `${hours} ${m} minutes`;
}

/** "14:30" -> "2:30 PM". A clinic reads a wall clock, not a 24-hour one. */
export function formatTime(hhmm: string): string {
  const [h = NaN, m = NaN] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "14:30" -> 870. Minutes since midnight, for overlap arithmetic. */
export function minutesOf(hhmm: string): number {
  const [h = NaN, m = NaN] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

/** 870 -> "14:30". */
export function hhmmOf(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isValidTime(hhmm: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return false;
  const [h = NaN, m = NaN] = hhmm.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * Do two bookings for the same doctor collide?
 *
 * Back to back is not a clash: a 2:00 that runs fifteen minutes and a 2:15 are
 * two consecutive patients, which is how a clinic actually runs.
 */
export function overlaps(
  a: { timeHhmm: string; durationMin: number },
  b: { timeHhmm: string; durationMin: number },
): boolean {
  const aStart = minutesOf(a.timeHhmm);
  const bStart = minutesOf(b.timeHhmm);
  if (aStart < 0 || bStart < 0) return false;
  return aStart < bStart + b.durationMin && bStart < aStart + a.durationMin;
}

/**
 * The times offered in the picker: every quarter hour from 7 in the morning to
 * 9 at night. A time outside that can still be typed — the clinic is the one
 * that knows when it is open, not this list.
 */
export function slotChoices(): string[] {
  const out: string[] = [];
  for (let m = 7 * 60; m <= 21 * 60; m += 15) out.push(hhmmOf(m));
  return out;
}
