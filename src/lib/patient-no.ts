/**
 * patient-no.ts — the lifetime patient number.
 *
 * A patient is not a fiscal-year object (D-028): the number is allocated once,
 * never reset at year close, and never reused after a merge — the merged-away
 * number is retired, not recycled.
 *
 * Allocation itself is transactional and lives in lib/repos/patients.ts, which
 * draws from the `counters` table inside the same transaction that inserts the
 * patient. This file owns the format and the provisional label.
 */

/** `P-000123` — flat and lifetime (PRD §8.3, confirmed at install). */
export function formatPatientNo(value: number): string {
  return `P-${String(value).padStart(6, "0")}`;
}

/** Parse a formatted number back, or null if it isn't one. */
export function parsePatientNo(text: string): number | null {
  const m = /^P-(\d{6,})$/.exec(text.trim().toUpperCase());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * What a patient registered offline is called until the server assigns the real
 * number. Deliberately not a number: it must never be mistaken for one, and it
 * must never be printed as though it were (Architecture §2.1 Path B).
 */
export function provisionalPatientLabel(ulid: string): string {
  return `New – ${ulid.slice(-6).toUpperCase()}`;
}

/** True when a label is provisional rather than an assigned number. */
export function isProvisionalLabel(label: string): boolean {
  return label.startsWith("New – ") || label.startsWith("New - ");
}

/**
 * The label to show for a patient, whichever state they are in.
 * `patientNo` is null until the server has assigned one.
 */
export function patientLabel(patientNo: number | null, id: string): string {
  return patientNo == null ? provisionalPatientLabel(id) : formatPatientNo(patientNo);
}
