/**
 * services.ts — the admin-configured catalog of everything the clinic bills
 * that is not a medicine, and the groups it is filed under.
 *
 * Nothing here is hard-coded: the seeded groups are ordinary rows the Admin can
 * rename, reorder, deactivate and add to (PRD §4B.3).
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import type { PosService } from "@/lib/pos-types";

export interface ServiceGroup {
  id: string;
  name: string;
  sortOrder: number;
  isConsultation: boolean;
  active: boolean;
  /** how many services sit in this group — for the settings list */
  serviceCount?: number;
}

export interface Service {
  id: string;
  name: string;
  code: string;
  groupId: string;
  groupName: string;
  ratePaisa: number;
  doctorRequired: boolean;
  defaultDoctorId: string | null;
  outsourced: boolean;
  defaultLabPartnerId: string | null;
  partnerCostPaisa: number;
  /** what has to be collected — "Blood", "Urine", or empty for nothing */
  sampleType: string;
  followupDays: number;
  followupRatePaisa: number;
  vatApplicable: boolean;
  sampleRate: boolean;
  active: boolean;
}

export interface ServiceInput {
  name: string;
  code: string;
  groupId: string;
  ratePaisa: number;
  doctorRequired: boolean;
  defaultDoctorId: string | null;
  outsourced: boolean;
  defaultLabPartnerId: string | null;
  partnerCostPaisa: number;
  sampleType: string;
  followupDays: number;
  followupRatePaisa: number;
  vatApplicable: boolean;
  active: boolean;
}

function mapGroup(r: Row): ServiceGroup {
  return {
    id: r.id as string,
    name: r.name as string,
    sortOrder: Number(r.sort_order),
    isConsultation: Number(r.is_consultation) === 1,
    active: Number(r.active) === 1,
    serviceCount: r.service_count == null ? undefined : Number(r.service_count),
  };
}

function mapService(r: Row): Service {
  return {
    id: r.id as string,
    name: r.name as string,
    code: (r.code as string | null) ?? "",
    groupId: r.group_id as string,
    groupName: (r.group_name as string | null) ?? "",
    ratePaisa: Number(r.rate_paisa),
    doctorRequired: Number(r.doctor_required) === 1,
    defaultDoctorId: (r.default_doctor_id as string | null) ?? null,
    outsourced: Number(r.outsourced) === 1,
    defaultLabPartnerId: (r.default_lab_partner_id as string | null) ?? null,
    partnerCostPaisa: Number(r.partner_cost_paisa),
    sampleType: (r.sample_type as string | null) ?? "",
    followupDays: Number(r.followup_days),
    followupRatePaisa: Number(r.followup_rate_paisa),
    vatApplicable: Number(r.vat_applicable) === 1,
    sampleRate: Number(r.sample_rate) === 1,
    active: Number(r.active) === 1,
  };
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export async function listServiceGroups(
  includeInactive = false,
): Promise<ServiceGroup[]> {
  const res = await db().execute(
    `SELECT g.*, (SELECT COUNT(*) FROM services s
                   WHERE s.group_id = g.id AND s.active = 1) AS service_count
       FROM service_groups g
      ${includeInactive ? "" : "WHERE g.active = 1"}
      ORDER BY g.sort_order ASC, g.name ASC`,
  );
  return res.rows.map(mapGroup);
}

export async function createServiceGroup(input: {
  name: string;
  sortOrder: number;
  isConsultation: boolean;
}): Promise<string> {
  const id = ulid();
  await db().execute({
    sql: `INSERT INTO service_groups (id, name, sort_order, is_consultation, active, created_at)
          VALUES (?, ?, ?, ?, 1, ?)`,
    args: [
      id,
      input.name,
      input.sortOrder,
      input.isConsultation ? 1 : 0,
      new Date().toISOString(),
    ],
  });
  return id;
}

export async function updateServiceGroup(
  id: string,
  input: { name: string; sortOrder: number; isConsultation: boolean; active: boolean },
): Promise<void> {
  await db().execute({
    sql: `UPDATE service_groups
             SET name = ?, sort_order = ?, is_consultation = ?, active = ?
           WHERE id = ?`,
    args: [
      input.name,
      input.sortOrder,
      input.isConsultation ? 1 : 0,
      input.active ? 1 : 0,
      id,
    ],
  });
}

/** A group with services in it is deactivated, never deleted — history needs it. */
export async function groupHasServices(id: string): Promise<boolean> {
  const res = await db().execute({
    sql: "SELECT 1 FROM services WHERE group_id = ? LIMIT 1",
    args: [id],
  });
  return res.rows.length > 0;
}

export async function deleteServiceGroup(id: string): Promise<void> {
  await db().execute({ sql: "DELETE FROM service_groups WHERE id = ?", args: [id] });
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const SERVICE_SELECT = `
  SELECT s.*, g.name AS group_name
    FROM services s
    JOIN service_groups g ON g.id = s.group_id`;

export async function listServices(includeInactive = false): Promise<Service[]> {
  const res = await db().execute(
    `${SERVICE_SELECT}
     ${includeInactive ? "" : "WHERE s.active = 1"}
     ORDER BY g.sort_order ASC, s.name ASC`,
  );
  return res.rows.map(mapService);
}

export async function getService(id: string): Promise<Service | null> {
  const res = await db().execute({
    sql: `${SERVICE_SELECT} WHERE s.id = ?`,
    args: [id],
  });
  return res.rows[0] ? mapService(res.rows[0]) : null;
}

export async function createService(input: ServiceInput): Promise<string> {
  const id = ulid();
  const now = new Date().toISOString();
  await db().execute({
    sql: `INSERT INTO services
            (id, name, code, group_id, rate_paisa, doctor_required, default_doctor_id,
             outsourced, default_lab_partner_id, partner_cost_paisa, sample_type,
             followup_days, followup_rate_paisa, vat_applicable, sample_rate,
             active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    args: [
      id,
      input.name,
      input.code || null,
      input.groupId,
      input.ratePaisa,
      input.doctorRequired ? 1 : 0,
      input.defaultDoctorId,
      input.outsourced ? 1 : 0,
      input.defaultLabPartnerId,
      input.partnerCostPaisa,
      input.sampleType,
      input.followupDays,
      input.followupRatePaisa,
      input.vatApplicable ? 1 : 0,
      input.active ? 1 : 0,
      now,
      now,
    ],
  });
  return id;
}

/**
 * Editing a service changes what it costs from here on. Bills already saved
 * keep the rate, partner cost and name they were billed at — every one of
 * those is snapshotted onto the bill line.
 *
 * Editing also clears the sample-rate mark: once a person has set the price,
 * it is no longer a placeholder.
 */
export async function updateService(id: string, input: ServiceInput): Promise<void> {
  await db().execute({
    sql: `UPDATE services
             SET name = ?, code = ?, group_id = ?, rate_paisa = ?, doctor_required = ?,
                 default_doctor_id = ?, outsourced = ?, default_lab_partner_id = ?,
                 partner_cost_paisa = ?, sample_type = ?, followup_days = ?,
                 followup_rate_paisa = ?, vat_applicable = ?, active = ?,
                 sample_rate = 0, updated_at = ?
           WHERE id = ?`,
    args: [
      input.name,
      input.code || null,
      input.groupId,
      input.ratePaisa,
      input.doctorRequired ? 1 : 0,
      input.defaultDoctorId,
      input.outsourced ? 1 : 0,
      input.defaultLabPartnerId,
      input.partnerCostPaisa,
      input.sampleType,
      input.followupDays,
      input.followupRatePaisa,
      input.vatApplicable ? 1 : 0,
      input.active ? 1 : 0,
      new Date().toISOString(),
      id,
    ],
  });
}

// ---------------------------------------------------------------------------
// The counter's view
// ---------------------------------------------------------------------------

/**
 * Active services in the shape the counter caches. Inactive services drop out
 * of search but stay in history, which is why every bill line snapshots the
 * name it was billed under.
 */
export async function listPosServices(): Promise<PosService[]> {
  const res = await db().execute(
    `SELECT s.*, g.name AS group_name, g.is_consultation
       FROM services s
       JOIN service_groups g ON g.id = s.group_id
      WHERE s.active = 1 AND g.active = 1
      ORDER BY g.sort_order ASC, s.name ASC`,
  );
  return res.rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    code: (r.code as string | null) ?? "",
    groupId: r.group_id as string,
    groupName: r.group_name as string,
    isConsultation: Number(r.is_consultation) === 1,
    ratePaisa: Number(r.rate_paisa),
    doctorRequired: Number(r.doctor_required) === 1,
    defaultDoctorId: (r.default_doctor_id as string | null) ?? null,
    outsourced: Number(r.outsourced) === 1,
    defaultLabPartnerId: (r.default_lab_partner_id as string | null) ?? null,
    partnerCostPaisa: Number(r.partner_cost_paisa),
    sampleType: (r.sample_type as string | null) ?? "",
    followupDays: Number(r.followup_days),
    followupRatePaisa: Number(r.followup_rate_paisa),
    vatApplicable: Number(r.vat_applicable) === 1,
    sampleRate: Number(r.sample_rate) === 1,
  }));
}

/**
 * The authoritative service row the ingest route prices against, including
 * whether its group is a consultation group.
 */
export async function getServiceForBilling(id: string): Promise<PosService | null> {
  const res = await db().execute({
    sql: `SELECT s.*, g.name AS group_name, g.is_consultation
            FROM services s
            JOIN service_groups g ON g.id = s.group_id
           WHERE s.id = ?`,
    args: [id],
  });
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    name: r.name as string,
    code: (r.code as string | null) ?? "",
    groupId: r.group_id as string,
    groupName: r.group_name as string,
    isConsultation: Number(r.is_consultation) === 1,
    ratePaisa: Number(r.rate_paisa),
    doctorRequired: Number(r.doctor_required) === 1,
    defaultDoctorId: (r.default_doctor_id as string | null) ?? null,
    outsourced: Number(r.outsourced) === 1,
    defaultLabPartnerId: (r.default_lab_partner_id as string | null) ?? null,
    partnerCostPaisa: Number(r.partner_cost_paisa),
    sampleType: (r.sample_type as string | null) ?? "",
    followupDays: Number(r.followup_days),
    followupRatePaisa: Number(r.followup_rate_paisa),
    vatApplicable: Number(r.vat_applicable) === 1,
    sampleRate: Number(r.sample_rate) === 1,
  };
}

/**
 * The AD date of this patient's most recent consultation with this doctor,
 * before today — the one fact the follow-up rule needs and only the server can
 * answer honestly.
 *
 * "Consultation" means a service line whose group is flagged as one. Cancelled
 * bills do not count: a visit that was never really billed cannot start a
 * follow-up window.
 */
export async function lastConsultationAd(
  patientId: string,
  doctorId: string | null,
  beforeOrOnAd: string,
): Promise<string | null> {
  if (!doctorId) return null;
  const res = await db().execute({
    sql: `SELECT b.date_ad
            FROM bill_service_lines sl
            JOIN bills b ON b.id = sl.bill_id
            JOIN services s ON s.id = sl.service_id
            JOIN service_groups g ON g.id = s.group_id
           WHERE b.patient_id = ?
             AND sl.doctor_id = ?
             AND g.is_consultation = 1
             AND b.status = 'saved'
             AND b.date_ad <= ?
             AND sl.followup_applied = 0
           ORDER BY b.date_ad DESC
           LIMIT 1`,
    args: [patientId, doctorId, beforeOrOnAd],
  });
  return res.rows[0] ? (res.rows[0].date_ad as string) : null;
}
