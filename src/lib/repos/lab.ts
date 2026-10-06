/**
 * lab.ts — where a sample actually is. All SQL for the laboratory worklists.
 *
 * Chunidevi does not run its own laboratory: it bills a test, draws the sample,
 * sends it out, and waits for a report. Four steps, each done by a person,
 * each with a moment where the thing is sitting on a bench and somebody has to
 * know it is there. That is what this table of work is for.
 *
 * A stage is derived from which timestamps are stamped (0016), never stored as
 * a status. It cannot then disagree with itself, and every stage carries the
 * time it happened, which is the half you need when a sample has gone missing
 * and the question is who had it last.
 *
 * What this deliberately does NOT hold is a result. ClinicNP records that a
 * test was sent, what it cost, and that a report came back. It does not record
 * what the report said — the outside laboratory issues that, and software that
 * stores a number it did not measure starts looking like the authority on it.
 */
import "server-only";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";

/** The four places a sample can be waiting, plus the end. */
export type LabStage =
  | "to_collect"
  | "to_dispatch"
  | "awaiting_report"
  | "report_in"
  | "done";

export const LAB_STAGES: LabStage[] = [
  "to_collect",
  "to_dispatch",
  "awaiting_report",
  "report_in",
  "done",
];

export const STAGE_LABEL: Record<LabStage, string> = {
  to_collect: "To collect",
  to_dispatch: "To send",
  awaiting_report: "Awaiting report",
  report_in: "Report in",
  done: "Given to patient",
};

/** What the person at the desk does next, said as the thing they did. */
export const STAGE_ACTION: Record<LabStage, string> = {
  to_collect: "Sample collected",
  to_dispatch: "Sent to lab",
  awaiting_report: "Report received",
  report_in: "Given to patient",
  done: "",
};

export interface LabRow {
  lineId: string;
  billId: string;
  visitId: string | null;
  invoiceNo: number | null;
  dateBs: string;
  dateAd: string;
  patientId: string | null;
  patientNo: number | null;
  patientName: string;
  patientPhone: string;
  ageSex: string;
  testName: string;
  sampleType: string;
  partnerName: string;
  note: string;
  collectedAt: string | null;
  dispatchedAt: string | null;
  reportReceivedAt: string | null;
  reportGivenAt: string | null;
}

/**
 * Only outsourced tests on live bills enter the pipeline.
 *
 * A consultation is not a sample and a cancelled bill is not work. `outsourced`
 * is what makes something a laboratory job here — it is the flag that already
 * means "this goes to somebody else", and adding a second flag beside it would
 * let the two disagree.
 */
const BASE_FROM = `
    FROM bill_service_lines sl
    JOIN bills b ON b.id = sl.bill_id
    JOIN services s ON s.id = sl.service_id
    LEFT JOIN patients p ON p.id = b.patient_id
    LEFT JOIN lab_partners lp ON lp.id = sl.lab_partner_id
   WHERE b.status = 'saved'
     AND s.outsourced = 1`;

/**
 * The SQL condition that puts a line in exactly one stage.
 *
 * Written as the same descending ladder `stageOf` walks, and for the same
 * reason: the two must never disagree about where something is. A looser
 * `to_collect` of merely "not collected" reads correctly until it meets a line
 * stamped as dispatched without ever being stamped as collected — which the
 * old dispatch-slip behaviour (0009) produced — and then the same test is on
 * two lists at once, and clicking it on either says somebody else moved it.
 *
 * So every rung excludes the ones above it explicitly. It costs a few more
 * NULL checks and it makes the invariant true by construction rather than by
 * everybody remembering.
 */
const STAGE_WHERE: Record<LabStage, string> = {
  to_collect:
    "sl.collected_at IS NULL AND sl.dispatched_at IS NULL" + // sweep-ok: SQL, never on screen
    " AND sl.report_received_at IS NULL AND sl.report_given_at IS NULL", // sweep-ok: SQL, never on screen
  to_dispatch:
    "sl.collected_at IS NOT NULL AND sl.dispatched_at IS NULL" + // sweep-ok: SQL, never on screen
    " AND sl.report_received_at IS NULL AND sl.report_given_at IS NULL", // sweep-ok: SQL, never on screen
  awaiting_report:
    "sl.dispatched_at IS NOT NULL" + // sweep-ok: SQL, never on screen
    " AND sl.report_received_at IS NULL AND sl.report_given_at IS NULL", // sweep-ok: SQL, never on screen
  report_in:
    "sl.report_received_at IS NOT NULL AND sl.report_given_at IS NULL", // sweep-ok: SQL, never on screen
  done: "sl.report_given_at IS NOT NULL", // sweep-ok: SQL, never on screen
};

function ageSexOf(r: Row): string {
  const unit = (r.age_unit as string | null) ?? null;
  const value = r.age_value == null ? null : Number(r.age_value);
  const sex = ((r.sex as string | null) ?? "").toUpperCase();
  const age = value != null && unit ? `${value}${unit}` : "";
  return [age, sex].filter(Boolean).join(" · ");
}

function mapRow(r: Row): LabRow {
  return {
    lineId: r.line_id as string,
    billId: r.bill_id as string,
    visitId: (r.visit_id as string | null) ?? null,
    invoiceNo: r.invoice_no == null ? null : Number(r.invoice_no),
    dateBs: r.date_bs as string,
    dateAd: r.date_ad as string,
    patientId: (r.patient_id as string | null) ?? null,
    patientNo: r.patient_no == null ? null : Number(r.patient_no),
    patientName: (r.patient_name as string | null) || "—",
    patientPhone: (r.phone as string | null) ?? "",
    ageSex: ageSexOf(r),
    testName: r.name_snapshot as string,
    sampleType: (r.sample_type as string | null) ?? "",
    partnerName: (r.partner_name as string | null) ?? "",
    note: (r.lab_note as string | null) ?? "",
    collectedAt: (r.collected_at as string | null) ?? null,
    dispatchedAt: (r.dispatched_at as string | null) ?? null,
    reportReceivedAt: (r.report_received_at as string | null) ?? null,
    reportGivenAt: (r.report_given_at as string | null) ?? null,
  };
}

const SELECT_COLS = `
  SELECT sl.id AS line_id, sl.bill_id, sl.visit_id, sl.name_snapshot,
         sl.collected_at, sl.dispatched_at, sl.report_received_at,
         sl.report_given_at, sl.lab_note,
         s.sample_type,
         b.invoice_no, b.date_bs, b.date_ad,
         p.id AS patient_id, p.patient_no, p.name AS patient_name,
         p.phone, p.sex, p.age_value, p.age_unit,
         lp.name AS partner_name`;

/**
 * One stage's worklist.
 *
 * Everything still waiting is read oldest-first: the sample that has been
 * sitting longest is the one somebody needs to see at the top. Work that is
 * finished reads newest-first, because there the question is "what just
 * happened", not "what is stuck".
 */
export async function labWorklist(
  stage: LabStage,
  limit = 200,
): Promise<LabRow[]> {
  const order =
    stage === "done"
      ? "ORDER BY sl.report_given_at DESC"
      : "ORDER BY b.date_ad ASC, b.rowid ASC";
  const res = await db().execute({
    sql: `${SELECT_COLS} ${BASE_FROM} AND ${STAGE_WHERE[stage]} ${order} LIMIT ?`,
    args: [limit],
  });
  return res.rows.map(mapRow);
}

/** How many are sitting in each stage, for the tab badges. */
export async function labCounts(): Promise<Record<LabStage, number>> {
  const res = await db().execute(`
    SELECT
      SUM(CASE WHEN ${STAGE_WHERE.to_collect} THEN 1 ELSE 0 END) AS to_collect,
      SUM(CASE WHEN ${STAGE_WHERE.to_dispatch} THEN 1 ELSE 0 END) AS to_dispatch,
      SUM(CASE WHEN ${STAGE_WHERE.awaiting_report} THEN 1 ELSE 0 END) AS awaiting_report,
      SUM(CASE WHEN ${STAGE_WHERE.report_in} THEN 1 ELSE 0 END) AS report_in,
      SUM(CASE WHEN ${STAGE_WHERE.done} THEN 1 ELSE 0 END) AS done
    ${BASE_FROM}`);
  const r = res.rows[0];
  const n = (v: unknown) => (v == null ? 0 : Number(v));
  return {
    to_collect: n(r?.to_collect),
    to_dispatch: n(r?.to_dispatch),
    awaiting_report: n(r?.awaiting_report),
    report_in: n(r?.report_in),
    done: n(r?.done),
  };
}

/** One line, with enough to decide whether a transition is legal. */
export async function getLabLine(lineId: string): Promise<LabRow | null> {
  const res = await db().execute({
    sql: `${SELECT_COLS} ${BASE_FROM} AND sl.id = ? LIMIT 1`,
    args: [lineId],
  });
  const r = res.rows[0];
  return r ? mapRow(r) : null;
}

/** The stage a row is in, from what has been stamped. */
export function stageOf(row: {
  collectedAt: string | null;
  dispatchedAt: string | null;
  reportReceivedAt: string | null;
  reportGivenAt: string | null;
}): LabStage {
  if (row.reportGivenAt) return "done";
  if (row.reportReceivedAt) return "report_in";
  if (row.dispatchedAt) return "awaiting_report";
  if (row.collectedAt) return "to_dispatch";
  return "to_collect";
}

/** The column each stage stamps when its work is done. */
const STAMP_COLUMN: Record<Exclude<LabStage, "done">, string> = {
  to_collect: "collected_at",
  to_dispatch: "dispatched_at",
  awaiting_report: "report_received_at",
  report_in: "report_given_at",
};

/**
 * Move one line on by exactly one stage.
 *
 * `from` is the stage the screen believed it was in. Two people working the
 * same queue on two machines is the normal case in a clinic, and without this
 * the second click would stamp a step that had already been taken — recording
 * a collection time for a sample that is already at the laboratory.
 */
export async function advanceLabLine(
  lineId: string,
  from: Exclude<LabStage, "done">,
): Promise<{ ok: boolean; reason?: string }> {
  const row = await getLabLine(lineId);
  if (!row) return { ok: false, reason: "That test is no longer on a live bill." };

  const actual = stageOf(row);
  if (actual !== from) {
    return {
      ok: false,
      reason: `Somebody has already moved that one on — it is at "${STAGE_LABEL[actual]}" now.`,
    };
  }

  await db().execute({
    sql: `UPDATE bill_service_lines SET ${STAMP_COLUMN[from]} = ? WHERE id = ?`,
    args: [new Date().toISOString(), lineId],
  });
  return { ok: true };
}

/**
 * Take one line back a stage, for the mis-click.
 *
 * Clearing the stamp rather than writing a correcting one is right here: the
 * time recorded was simply not true, and a sample collection that did not
 * happen should leave no trace of having happened. Who undid it is in the
 * audit log.
 */
export async function revertLabLine(
  lineId: string,
  from: Exclude<LabStage, "to_collect">,
): Promise<{ ok: boolean; reason?: string }> {
  const row = await getLabLine(lineId);
  if (!row) return { ok: false, reason: "That test is no longer on a live bill." };

  const actual = stageOf(row);
  if (actual !== from) {
    return {
      ok: false,
      reason: `That one is at "${STAGE_LABEL[actual]}" now, so there is nothing to undo.`,
    };
  }

  const column: Record<Exclude<LabStage, "to_collect">, string> = {
    to_dispatch: "collected_at",
    awaiting_report: "dispatched_at",
    report_in: "report_received_at",
    done: "report_given_at",
  };

  await db().execute({
    sql: `UPDATE bill_service_lines SET ${column[from]} = NULL WHERE id = ?`,
    args: [lineId],
  });
  return { ok: true };
}

/** Why a sample is stuck. Free text; empty clears it. */
export async function setLabNote(lineId: string, note: string): Promise<void> {
  await db().execute({
    sql: "UPDATE bill_service_lines SET lab_note = ? WHERE id = ?",
    args: [note.trim().slice(0, 300), lineId],
  });
}
