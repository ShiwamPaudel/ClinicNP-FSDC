/**
 * invoice-number.ts — formats the fiscal-year invoice numbers.
 * Sales: SI-2083/84-000123 · Sales return: SR-… · Purchase: PI-… (Architecture §2.3).
 * The sequence VALUE is assigned server-side, transactionally (never on the client).
 */

export type NumberKind = "SI" | "SR" | "PI";

/** Format a sequence into the fiscal-year invoice number. */
export function formatDocNo(
  kind: NumberKind,
  fiscalLabel: string,
  seq: number,
): string {
  return `${kind}-${fiscalLabel}-${String(seq).padStart(6, "0")}`;
}

/** Parse a formatted number back to its parts (or null if it doesn't match). */
export function parseDocNo(
  value: string,
): { kind: NumberKind; fiscalLabel: string; seq: number } | null {
  const m = /^(SI|SR|PI)-(\d{4}\/\d{2})-(\d{6})$/.exec(value);
  if (!m) return null;
  return {
    kind: m[1] as NumberKind,
    fiscalLabel: m[2]!,
    seq: Number(m[3]),
  };
}
