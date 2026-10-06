/**
 * fiscal.ts — fiscal-year bootstrap and lookup.
 * Fiscal year = Shrawan 1 -> Ashadh end (PRD 4.5.1). Invoice numbers restart each year.
 */
import "server-only";
import { db } from "@/lib/db";
import { ulid } from "ulid";
import {
  adToIso,
  fiscalYearAdRange,
  fiscalYearOf,
  fiscalYearFromLabel,
  nextFiscalYear,
  today,
  type FiscalYear as FY,
} from "@/lib/bs";
import type { Row } from "@/lib/db";

export interface FiscalYearRow {
  id: number;
  bsLabel: string;
  startAd: string;
  endAd: string;
  nextInvoiceNo: number;
  nextReturnNo: number;
  nextPurchaseNo: number;
  active: boolean;
  status: FiscalYearStatus;
  closedAt: string | null;
}

export type FiscalYearStatus = "open" | "closed";

function mapFy(r: Row): FiscalYearRow {
  return {
    id: Number(r.id),
    bsLabel: r.bs_label as string,
    startAd: r.start_ad as string,
    endAd: r.end_ad as string,
    nextInvoiceNo: Number(r.next_invoice_no),
    nextReturnNo: Number(r.next_return_no),
    nextPurchaseNo: Number(r.next_purchase_no),
    active: Number(r.active) === 1,
    status: (r.status as FiscalYearStatus) ?? "closed",
    closedAt: (r.closed_at as string | null) ?? null,
  };
}

export async function getFiscalYearByLabel(
  label: string,
): Promise<FiscalYearRow | null> {
  const res = await db().execute({
    sql: "SELECT * FROM fiscal_years WHERE bs_label = ?",
    args: [label],
  });
  return res.rows[0] ? mapFy(res.rows[0]) : null;
}

export async function getActiveFiscalYear(): Promise<FiscalYearRow | null> {
  const res = await db().execute(
    "SELECT * FROM fiscal_years WHERE active = 1 ORDER BY id DESC LIMIT 1",
  );
  return res.rows[0] ? mapFy(res.rows[0]) : null;
}

/** The single open year, or null before the first one exists. */
export async function getOpenFiscalYear(): Promise<FiscalYearRow | null> {
  const res = await db().execute(
    "SELECT * FROM fiscal_years WHERE status = 'open' LIMIT 1",
  );
  return res.rows[0] ? mapFy(res.rows[0]) : null;
}

/** Create a fiscal-year row from a computed FY (idempotent by label).
 *  A year created while another is still open comes in closed: exactly one year
 *  is open at a time, and moving that flag is the close-year wizard's job. */
export async function ensureFiscalYear(fy: FY): Promise<FiscalYearRow> {
  const existing = await getFiscalYearByLabel(fy.label);
  if (existing) return existing;
  const { startAd, endAd } = fiscalYearAdRange(fy);
  const openAlready = await getOpenFiscalYear();
  await db().execute({
    sql: `INSERT INTO fiscal_years (bs_label, start_ad, end_ad, active, status)
          VALUES (?, ?, ?, 1, ?)`,
    args: [
      fy.label,
      adToIso(startAd),
      adToIso(endAd),
      openAlready ? "closed" : "open",
    ],
  });
  const created = await getFiscalYearByLabel(fy.label);
  if (!created) throw new Error("failed to create fiscal year");
  return created;
}

/** Bootstrap the current fiscal year derived from today's BS date. */
export async function bootstrapCurrentFiscalYear(): Promise<FiscalYearRow> {
  const fy = fiscalYearOf(today());
  return ensureFiscalYear(fy);
}

/**
 * Thrown when anything tries to write into a year that has been closed.
 * A closed year's reports must never change after closing — that is the whole
 * point of closing one (D-029).
 */
export class ClosedFiscalYearError extends Error {
  readonly code = "closed_fiscal_year" as const;
  readonly userMessage =
    "This year is closed. Record it in the current year instead.";
  constructor() {
    super("closed fiscal year");
    this.name = "ClosedFiscalYearError";
  }
}

/** Every fiscal year, newest first. */
export async function listFiscalYears(): Promise<FiscalYearRow[]> {
  const res = await db().execute(
    "SELECT * FROM fiscal_years ORDER BY start_ad DESC",
  );
  return res.rows.map(mapFy);
}

/** Throws unless the given year is the open one. */
export async function assertYearOpen(fiscalYearId: number): Promise<void> {
  const res = await db().execute({
    sql: "SELECT status FROM fiscal_years WHERE id = ?",
    args: [fiscalYearId],
  });
  const status = res.rows[0]?.status as string | undefined;
  if (status !== "open") throw new ClosedFiscalYearError();
}

/** Throws unless the bill's fiscal year is still open. */
export async function assertBillYearOpen(billId: string): Promise<void> {
  const res = await db().execute({
    sql: `SELECT f.status AS status
            FROM bills b LEFT JOIN fiscal_years f ON f.id = b.fiscal_year_id
           WHERE b.id = ?`,
    args: [billId],
  });
  if (res.rows.length === 0) return; // caller reports "no longer exists"
  const status = res.rows[0]!.status as string | null;
  // A bill with no fiscal year predates year tracking — leave it alone.
  if (status !== null && status !== "open") throw new ClosedFiscalYearError();
}

export interface CloseYearResult {
  closedLabel: string;
  openedLabel: string;
}

/**
 * Close the open year and open the next one, in one transaction:
 * create the next year, reset its sequences to 1, mark the previous one closed
 * with who did it and when, and write an audit entry. Cannot be undone from the
 * interface (PRD §4A.1).
 *
 * Stock, suppliers, patients and services do not reset — inventory is perpetual.
 * Only the numbering series and the reporting boundary move.
 */
export async function closeYearAndOpenNext(
  userId: string,
): Promise<CloseYearResult> {
  const open = await getOpenFiscalYear();
  if (!open) throw new Error("there is no open fiscal year to close");

  const next = nextFiscalYear(fiscalYearFromLabel(open.bsLabel));
  const { startAd, endAd } = fiscalYearAdRange(next);
  const now = new Date().toISOString();

  const tx = await db().transaction("write");
  try {
    // The partial unique index allows only one open year, so the previous year
    // must close before the next one opens.
    await tx.execute({
      sql: `UPDATE fiscal_years
               SET status = 'closed', closed_at = ?, closed_by = ?, active = 0
             WHERE id = ?`,
      args: [now, userId, open.id],
    });

    const existing = await tx.execute({
      sql: "SELECT id FROM fiscal_years WHERE bs_label = ?",
      args: [next.label],
    });

    if (existing.rows.length > 0) {
      // The year already exists (created early): open it and reset its series.
      await tx.execute({
        sql: `UPDATE fiscal_years
                 SET status = 'open', active = 1, closed_at = NULL, closed_by = NULL,
                     next_invoice_no = 1, next_return_no = 1, next_purchase_no = 1,
                     next_visit_no = 1, next_stockout_no = 1
               WHERE bs_label = ?`,
        args: [next.label],
      });
    } else {
      await tx.execute({
        sql: `INSERT INTO fiscal_years
                (bs_label, start_ad, end_ad, active, status,
                 next_invoice_no, next_return_no, next_purchase_no,
                 next_visit_no, next_stockout_no)
              VALUES (?, ?, ?, 1, 'open', 1, 1, 1, 1, 1)`,
        args: [next.label, adToIso(startAd), adToIso(endAd)],
      });
    }

    await tx.execute({
      sql: `INSERT INTO audit_log (id, user_id, action, detail_json, at)
            VALUES (?, ?, 'fiscal_year.closed', ?, ?)`,
      args: [
        ulid(),
        userId,
        JSON.stringify({ closed: open.bsLabel, opened: next.label }),
        now,
      ],
    });

    await tx.commit();
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      // already unwound
    }
    throw err;
  }

  return { closedLabel: open.bsLabel, openedLabel: next.label };
}
