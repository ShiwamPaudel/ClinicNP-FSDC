/**
 * alerts.ts — the phones that agreed to be told, and a note of what went out.
 *
 * A device row is what a browser hands over when somebody turns alerts on. It
 * is meaningless to anybody else and useless on its own, but it is still a way
 * to reach a person, so it is deleted the moment the browser says the device
 * is gone and whenever the person turns alerts off.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";

export interface PushDevice {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string;
  createdAt: string;
  lastSentAt: string | null;
}

function mapDevice(r: Row): PushDevice {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    endpoint: r.endpoint as string,
    p256dh: r.p256dh as string,
    auth: r.auth as string,
    label: (r.label as string) ?? "",
    createdAt: r.created_at as string,
    lastSentAt: (r.last_sent_at as string | null) ?? null,
  };
}

export interface SaveDeviceInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string;
}

/**
 * Remember a device, or refresh the one already remembered.
 *
 * The same browser re-registering must not pile up rows: a person who turns
 * alerts off and on again all week would otherwise get five copies of every
 * alert. The address is unique, so re-registering replaces.
 */
export async function saveDevice(input: SaveDeviceInput): Promise<void> {
  const now = new Date().toISOString();
  await db().execute({
    sql: `INSERT INTO push_devices
            (id, user_id, endpoint, p256dh, auth, label, created_at, fail_reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, '')
          ON CONFLICT (endpoint) DO UPDATE SET
            user_id = excluded.user_id,
            p256dh  = excluded.p256dh,
            auth    = excluded.auth,
            label   = excluded.label,
            fail_reason = ''`,
    args: [ulid(), input.userId, input.endpoint, input.p256dh, input.auth, input.label, now],
  });
}

export async function devicesForUser(userId: string): Promise<PushDevice[]> {
  const res = await db().execute({
    sql: "SELECT * FROM push_devices WHERE user_id = ? ORDER BY created_at DESC",
    args: [userId],
  });
  return res.rows.map(mapDevice);
}

export async function countDevicesForUser(userId: string): Promise<number> {
  const res = await db().execute({
    sql: "SELECT COUNT(*) AS n FROM push_devices WHERE user_id = ?",
    args: [userId],
  });
  return Number(res.rows[0]!.n);
}

export async function forgetDevice(endpoint: string): Promise<void> {
  await db().execute({
    sql: "DELETE FROM push_devices WHERE endpoint = ?",
    args: [endpoint],
  });
}

export async function forgetDevicesForUser(userId: string): Promise<void> {
  await db().execute({
    sql: "DELETE FROM push_devices WHERE user_id = ?",
    args: [userId],
  });
}

export async function markDeviceUsed(endpoint: string): Promise<void> {
  await db().execute({
    sql: "UPDATE push_devices SET last_sent_at = ?, fail_reason = '' WHERE endpoint = ?",
    args: [new Date().toISOString(), endpoint],
  });
}

export async function markDeviceFailed(
  endpoint: string,
  reason: string,
): Promise<void> {
  await db().execute({
    sql: "UPDATE push_devices SET fail_reason = ? WHERE endpoint = ?",
    args: [reason.slice(0, 200), endpoint],
  });
}

// ---------------------------------------------------------------------------
// What went out
// ---------------------------------------------------------------------------

export type AlertChannel = "push" | "email";
/** `off` means the person had that kind of alert switched off, so none was sent. */
export type AlertStatus = "sent" | "failed" | "off";

export interface AlertRecord {
  appointmentId: string | null;
  channel: AlertChannel;
  target: string;
  status: AlertStatus;
  detail: string;
}

export async function recordAlert(a: AlertRecord): Promise<void> {
  await db().execute({
    sql: `INSERT INTO alerts_sent
            (id, appointment_id, channel, target, status, detail, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      ulid(),
      a.appointmentId,
      a.channel,
      a.target.slice(0, 200),
      a.status,
      a.detail.slice(0, 500),
      new Date().toISOString(),
    ],
  });
}

export interface AlertLine {
  channel: AlertChannel;
  target: string;
  status: AlertStatus;
  detail: string;
  at: string;
}

export async function alertsFor(appointmentId: string): Promise<AlertLine[]> {
  const res = await db().execute({
    sql: `SELECT channel, target, status, detail, created_at FROM alerts_sent
           WHERE appointment_id = ? ORDER BY created_at DESC`,
    args: [appointmentId],
  });
  return res.rows.map((r) => ({
    channel: r.channel as AlertChannel,
    target: (r.target as string) ?? "",
    status: r.status as AlertStatus,
    detail: (r.detail as string) ?? "",
    at: r.created_at as string,
  }));
}
