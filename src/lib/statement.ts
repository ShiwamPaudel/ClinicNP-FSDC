/**
 * statement.ts — a ledger or list ready to leave the building (C-036).
 *
 * A supplier's ledger, a laboratory's statement and the dues list are each
 * built into one `Statement`, and the same statement is drawn as a PDF or
 * written as an Excel sheet. Money is kept in paisa until the last moment, so
 * the two files can never disagree with each other or with the screen.
 *
 * Pure: no database, no file system. Builders live in `repos/statements.ts`,
 * renderers in `lib/export/`.
 */

export type StatementCell = string | number | null;

export interface StatementColumn {
  key: string;
  label: string;
  /** Share of the page width; the widths of all columns are added up. */
  width: number;
  /** A money column holds paisa and is drawn as rupees, right-aligned. */
  money?: boolean;
  align?: "left" | "right";
}

export interface StatementRow {
  cells: Record<string, StatementCell>;
  /**
   * "group" heads a block (a person on the dues list), "sub" is a quieter
   * line under the one above it (a payment against a bill), "total" closes a
   * block.
   */
  style?: "group" | "sub" | "total";
}

export interface Statement {
  /** File name without the extension: letters, digits and dashes only. */
  fileName: string;
  /** "Supplier ledger", "Laboratory statement", "Dues" */
  title: string;
  /** Whom it is about: a supplier, a laboratory, a patient. */
  party?: { name: string; lines: string[] };
  /** "All entries", "1 Shrawan 2083 – 23 Ashwin 2083" */
  period?: string;
  /** Headline figures, shown above the table. */
  summary?: { label: string; paisa: number }[];
  columns: StatementColumn[];
  rows: StatementRow[];
  /** The closing row, under a rule. */
  totals?: Record<string, StatementCell>;
  /** Said instead of an empty table. */
  emptyText: string;
  /** Plain sentences under the table: how it was paid, what is still owed. */
  notes?: string[];
  /** Lines to sign at the foot, each with its caption ("Received by"). */
  signatures?: string[];
}

/** The clinic, as the top of every exported page names it. */
export interface StatementIssuer {
  name: string;
  address: string;
  phone: string;
  panNo: string;
  vatRegistered: boolean;
}

/** A name safe for a downloaded file: "supplier-ledger-dental-supplies-pvt". */
export function fileSlug(...parts: string[]): string {
  const slug = parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "statement";
}
