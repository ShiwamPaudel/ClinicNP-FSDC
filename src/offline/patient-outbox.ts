"use client";

/**
 * patient-outbox.ts — the pending-registration queue.
 *
 * A patient registered while the connection is down is written here first, with
 * a client-minted ULID that is their identity from that moment on. The server
 * assigns the lifetime number when the registration lands; until then the
 * counter shows a provisional label (`New – A1B2C3`).
 *
 * The bill queue and this one drain independently and either can land first,
 * which is why a bill carries an inline snapshot of its patient (Architecture
 * §2.1 Path B): if the bill arrives before the registration, the server creates
 * the patient from the snapshot under the same id, and the registration that
 * follows is then idempotent against it.
 */
import { posDB } from "@/offline/idb";
import type { QueuedPatient } from "@/lib/pos-types";

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

async function notify() {
  const count = await pendingPatientCount();
  for (const l of listeners) l(count);
}

export function subscribePatientOutbox(listener: Listener): () => void {
  listeners.add(listener);
  void pendingPatientCount().then(listener);
  return () => listeners.delete(listener);
}

export async function pendingPatientCount(): Promise<number> {
  const db = await posDB();
  return db.count("patient_outbox");
}

export async function enqueuePatient(patient: QueuedPatient): Promise<void> {
  const db = await posDB();
  await db.put("patient_outbox", patient);
  await notify();
}

export async function listPatientOutbox(): Promise<QueuedPatient[]> {
  const db = await posDB();
  return db.getAll("patient_outbox");
}

/**
 * Take a registration out of the queue without sending it. Admin-chosen only —
 * nothing removes one on its own.
 */
export async function discardPatient(id: string): Promise<void> {
  const db = await posDB();
  await db.delete("patient_outbox", id);
  await notify();
}

async function removePatient(id: string): Promise<void> {
  const db = await posDB();
  await db.delete("patient_outbox", id);
  await notify();
}

async function updatePatient(patient: QueuedPatient): Promise<void> {
  const db = await posDB();
  await db.put("patient_outbox", patient);
}

/**
 * What goes to the server. Listed field by field so the queue's own
 * bookkeeping never travels — and so a field added to a patient and forgotten
 * here fails `tests/outbox.test.ts` rather than being dropped in silence.
 */
export function patientRequestBody(p: QueuedPatient): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    sex: p.sex,
    ageValue: p.ageValue,
    ageUnit: p.ageUnit,
    phone: p.phone,
    address: p.address,
  };
}

/** Fields the queue keeps for itself and never sends. */
export const PATIENT_OUTBOX_ONLY_FIELDS = [
  "attempts",
  "lastError",
  "patientNo",
  "queuedAt",
] as const;

export interface SyncPatientResult {
  ok: boolean;
  patientNo?: number;
}

async function syncOne(p: QueuedPatient): Promise<SyncPatientResult> {
  try {
    const res = await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patientRequestBody(p)),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        ok: boolean;
        patient?: { patientNo: number | null };
      };
      await removePatient(p.id);
      return { ok: true, patientNo: data.patient?.patientNo ?? undefined };
    }

    // A definite refusal — bad details, or the module switched off — will
    // never succeed on a retry. It stays in the queue with the reason on it so
    // the Admin can see what happened, rather than looping forever.
    // Shown on the Stuck queue, so it is a sentence and never a status code.
    let msg =
      res.status >= 500
        ? "Something went wrong at the other end. It will keep trying."
        : "It was refused. Show this to the owner.";
    try {
      const body = await res.json();
      if (body?.userMessage) msg = body.userMessage as string;
    } catch {
      // the answer wasn't readable — keep the plain wording
    }
    p.attempts += 1;
    p.lastError = msg;
    await updatePatient(p);
    return { ok: false };
  } catch {
    p.attempts += 1;
    p.lastError = "The connection dropped while sending.";
    await updatePatient(p);
    return { ok: false };
  }
}

let running = false;

/**
 * Send everything that is waiting, oldest first.
 *
 * Backing off between rounds is the retry loop's job, exactly as it is for
 * bills — one place decides how hard to try, rather than every queue keeping
 * its own timer.
 */
export async function flushPatientOutbox(): Promise<number> {
  if (running) return 0;
  running = true;
  let sent = 0;
  try {
    const queued = (await listPatientOutbox()).sort((a, b) =>
      a.queuedAt < b.queuedAt ? -1 : 1,
    );
    for (const p of queued) {
      const res = await syncOne(p);
      if (res.ok) sent += 1;
    }
  } finally {
    running = false;
  }
  await notify();
  return sent;
}
