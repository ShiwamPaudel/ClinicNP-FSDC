/**
 * takings.ts — where the money came from, so that every split of it adds up
 * to the sales figure beside it.
 *
 * Read line by line: a bill's lines carry their share of its discount, VAT
 * and rounding (`shareOut`), so a day's lines add up to its bills' totals to
 * the paisa. Refunds come off on the day they were given back, which is how
 * the sales tiles, the day close and the financial summary all count them.
 * Cancelled bills are not takings.
 *
 * The dashboard's breakdowns, its 30-day trend and the day close's split are
 * all read from here, so none of them can disagree with the others.
 */
import "server-only";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import { shareOut } from "@/lib/takings";

/**
 * What a line is, for the coarse split. A consultation group wins over a
 * laboratory partner; "service" is everything else the clinic does itself.
 */
export type TakingsKind = "medicine" | "consultation" | "lab" | "service";

export interface TakingsRow {
  dateAd: string;
  kind: TakingsKind;
  /** null for medicines, and for a service whose group no longer exists */
  groupId: string | null;
  groupName: string;
  /** the service as it was billed; "Medicines" for a shelf line */
  serviceName: string;
  paisa: number;
  /** services billed less those refunded; medicine lines count 0 */
  count: number;
}

const KIND_SQL = `CASE WHEN COALESCE(g.is_consultation, 0) = 1 THEN 'consultation'
                       WHEN sl.lab_partner_id IS NOT NULL THEN 'lab'
                       ELSE 'service' END`;

export async function takingsBetween(fromIso: string, toIso: string): Promise<TakingsRow[]> {
  const [sold, back] = await Promise.all([
    db().execute({
      sql: `SELECT b.id AS bill_id, b.date_ad, b.total_paisa,
                   sl.amount_paisa AS amount, sl.qty, ${KIND_SQL} AS kind,
                   s.group_id, g.name AS group_name, sl.name_snapshot AS service_name
              FROM bill_service_lines sl
              JOIN bills b ON b.id = sl.bill_id
              LEFT JOIN services s ON s.id = sl.service_id
              LEFT JOIN service_groups g ON g.id = s.group_id
             WHERE b.status = 'saved' AND b.date_ad BETWEEN ? AND ?
            UNION ALL
            SELECT b.id, b.date_ad, b.total_paisa,
                   bl.amount_paisa, 0, 'medicine', NULL, NULL, NULL
              FROM bill_lines bl
              JOIN bills b ON b.id = bl.bill_id
             WHERE b.status = 'saved' AND b.date_ad BETWEEN ? AND ?`,
      args: [fromIso, toIso, fromIso, toIso],
    }),
    db().execute({
      sql: `SELECT sr.date_ad, srsl.amount_paisa AS amount, srsl.qty, ${KIND_SQL} AS kind,
                   s.group_id, g.name AS group_name, sl.name_snapshot AS service_name
              FROM sale_return_service_lines srsl
              JOIN sale_returns sr ON sr.id = srsl.sale_return_id
              JOIN bill_service_lines sl ON sl.id = srsl.bill_service_line_id
              LEFT JOIN services s ON s.id = sl.service_id
              LEFT JOIN service_groups g ON g.id = s.group_id
             WHERE sr.date_ad BETWEEN ? AND ?
            UNION ALL
            SELECT sr.date_ad, srl.amount_paisa, 0, 'medicine', NULL, NULL, NULL
              FROM sale_return_lines srl
              JOIN sale_returns sr ON sr.id = srl.sale_return_id
             WHERE sr.date_ad BETWEEN ? AND ?`,
      args: [fromIso, toIso, fromIso, toIso],
    }),
  ]);

  const out = new Map<string, TakingsRow>();
  const add = (r: Row, paisa: number, count: number) => {
    const kind = r.kind as TakingsKind;
    const groupId = (r.group_id as string | null) ?? null;
    const dateAd = r.date_ad as string;
    const serviceName =
      kind === "medicine" ? "Medicines" : ((r.service_name as string | null) ?? "");
    const key = `${dateAd}|${kind}|${groupId ?? ""}|${serviceName}`;
    const row = out.get(key) ?? {
      dateAd,
      kind,
      groupId,
      groupName:
        kind === "medicine" ? "Medicines" : ((r.group_name as string | null) ?? "Other"),
      serviceName,
      paisa: 0,
      count: 0,
    };
    row.paisa += paisa;
    row.count += count;
    out.set(key, row);
  };

  // Each bill's lines share out its total.
  const byBill = new Map<string, Row[]>();
  for (const r of sold.rows) {
    const id = r.bill_id as string;
    const list = byBill.get(id);
    if (list) list.push(r);
    else byBill.set(id, [r]);
  }
  for (const lines of byBill.values()) {
    const shares = shareOut(
      Number(lines[0]!.total_paisa),
      lines.map((l) => Number(l.amount)),
    );
    lines.forEach((l, i) => add(l, shares[i]!, Number(l.qty)));
  }
  for (const r of back.rows) add(r, -Number(r.amount), -Number(r.qty));

  return [...out.values()].sort((a, b) =>
    a.dateAd === b.dateAd ? a.groupName.localeCompare(b.groupName) : a.dateAd < b.dateAd ? -1 : 1,
  );
}

/** The coarse four-way split, as the day close shows it. */
export function splitOf(rows: TakingsRow[]): {
  medicinesPaisa: number;
  consultationPaisa: number;
  diagnosticsPaisa: number;
  laboratoryPaisa: number;
} {
  const sum = (k: TakingsKind) =>
    rows.filter((r) => r.kind === k).reduce((s, r) => s + r.paisa, 0);
  return {
    medicinesPaisa: sum("medicine"),
    consultationPaisa: sum("consultation"),
    diagnosticsPaisa: sum("service"),
    laboratoryPaisa: sum("lab"),
  };
}

export interface GroupTakings {
  groupId: string | null;
  groupName: string;
  paisa: number;
  count: number;
}

/**
 * The takings by service group (medicines as one group of their own), largest
 * first. Lab work counts under its own group — a crown sent out is still a
 * crown — so the groups add up to the whole.
 */
export function byGroup(rows: TakingsRow[]): GroupTakings[] {
  const m = new Map<string, GroupTakings>();
  for (const r of rows) {
    const key = r.kind === "medicine" ? "~medicine" : (r.groupId ?? `~${r.groupName}`);
    const g = m.get(key) ?? { groupId: r.groupId, groupName: r.groupName, paisa: 0, count: 0 };
    g.paisa += r.paisa;
    g.count += r.count;
    m.set(key, g);
  }
  return [...m.values()]
    .filter((g) => g.paisa !== 0 || g.count !== 0)
    .sort((a, b) => b.paisa - a.paisa || a.groupName.localeCompare(b.groupName));
}

/** Per day, medicines and services, oldest first; days with nothing are absent. */
export function trendOf(
  rows: TakingsRow[],
): { dateAd: string; medicinePaisa: number; servicePaisa: number }[] {
  const m = new Map<string, { dateAd: string; medicinePaisa: number; servicePaisa: number }>();
  for (const r of rows) {
    const d = m.get(r.dateAd) ?? { dateAd: r.dateAd, medicinePaisa: 0, servicePaisa: 0 };
    if (r.kind === "medicine") d.medicinePaisa += r.paisa;
    else d.servicePaisa += r.paisa;
    m.set(r.dateAd, d);
  }
  return [...m.values()].sort((a, b) => (a.dateAd < b.dateAd ? -1 : 1));
}

/**
 * The busiest services, by how many were billed (net of refunds), with what
 * they took. Medicines are left out: they have their own list.
 */
export function topServicesOf(
  rows: TakingsRow[],
  limit = 5,
): { name: string; count: number; netPaisa: number }[] {
  const m = new Map<string, { name: string; count: number; netPaisa: number }>();
  for (const r of rows) {
    if (r.kind === "medicine") continue;
    const s = m.get(r.serviceName) ?? { name: r.serviceName, count: 0, netPaisa: 0 };
    s.count += r.count;
    s.netPaisa += r.paisa;
    m.set(r.serviceName, s);
  }
  return [...m.values()]
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count || b.netPaisa - a.netPaisa || a.name.localeCompare(b.name))
    .slice(0, limit);
}
