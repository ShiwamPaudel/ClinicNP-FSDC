"use client";

/**
 * outbox.ts — the pending-bill queue. Bills save here first (survives reload),
 * then a background loop POSTs them to the idempotent /api/bills. On ack they
 * leave the outbox; on failure they retry with exponential backoff (Architecture §2.1).
 */
import { posDB } from "@/offline/idb";
import {
  flushPatientOutbox,
  pendingPatientCount,
} from "@/offline/patient-outbox";
import type { OutboxBill } from "@/lib/pos-types";

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

const BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 240_000]; // cap 4 min

async function notify() {
  const count = await pendingCount();
  for (const l of listeners) l(count);
}

/** Subscribe to the pending-count (for the header status chip). */
export function subscribeOutbox(listener: Listener): () => void {
  listeners.add(listener);
  void pendingCount().then(listener);
  return () => listeners.delete(listener);
}

export async function pendingCount(): Promise<number> {
  const db = await posDB();
  return db.count("outbox");
}

export async function enqueueBill(bill: OutboxBill): Promise<void> {
  const db = await posDB();
  await db.put("outbox", bill);
  await notify();
}

export async function listOutbox(): Promise<OutboxBill[]> {
  const db = await posDB();
  return db.getAll("outbox");
}

/**
 * Take a bill out of the queue without sending it.
 *
 * Only ever called because an Admin looked at why it would not go and decided
 * to deal with it another way. Nothing removes a bill on its own.
 */
export async function discardBill(id: string): Promise<void> {
  const db = await posDB();
  await db.delete("outbox", id);
  await notify();
}

async function removeBill(id: string): Promise<void> {
  const db = await posDB();
  await db.delete("outbox", id);
  await notify();
}

async function updateBill(bill: OutboxBill): Promise<void> {
  const db = await posDB();
  await db.put("outbox", bill);
}

export interface SyncOneResult {
  ok: boolean;
  invoiceNo?: number;
  fiscalLabel?: string;
}

/**
 * What actually goes to the server for one queued bill.
 *
 * Listed field by field on purpose: the queue's own bookkeeping — attempts,
 * lastError, the invoice number assigned on the way back — must never be
 * posted as though it were part of the bill. The cost of that choice is that a
 * field added to a bill and forgotten here is silently dropped in transit,
 * which is exactly what happened to service lines once. `tests/outbox.test.ts`
 * now fails if a bill grows a field this function does not carry.
 */
export function billRequestBody(bill: OutboxBill): Record<string, unknown> {
  return {
    id: bill.id,
    dateBs: bill.dateBs,
    dateAd: bill.dateAd,
    patientName: bill.patientName,
    paymentMethod: bill.paymentMethod,
    tenderedPaisa: bill.tenderedPaisa,
    paidNowPaisa: bill.paidNowPaisa,
    paidNowMethod: bill.paidNowMethod,
    billDiscountPaisa: bill.billDiscountPaisa,
    lines: bill.lines,
    serviceLines: bill.serviceLines ?? [],
    patientId: bill.patientId,
    visitId: bill.visitId,
    clientCreatedAt: bill.clientCreatedAt,
  };
}

/** Fields the queue keeps for itself and never sends. */
export const OUTBOX_ONLY_FIELDS = [
  "attempts",
  "lastError",
  "invoiceNo",
  "fiscalLabel",
  "patient",
] as const;

/** Try to send one queued bill. Returns whether it was accepted (and removed). */
async function syncOne(bill: OutboxBill): Promise<SyncOneResult> {
  try {
    const res = await fetch("/api/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(billRequestBody(bill)),
    });
    if (res.ok) {
      const data = await res.json();
      await removeBill(bill.id);
      return { ok: true, invoiceNo: data.invoiceNo, fiscalLabel: data.fiscalLabel };
    }
    // Surface the server's message (e.g. an insufficient-stock rejection from a
    // rare two-device offline race). It keeps retrying at backoff — which self-
    // heals once stock is entered — but the reason is now visible on the bill.
    // This reason is printed on the Stuck queue for somebody at a counter, so
    // it has to be a sentence rather than a status code or whatever the
    // browser happened to throw.
    let msg =
      res.status >= 500
        ? "Something went wrong at the other end. It will keep trying."
        : "It was refused. Show this to the owner.";
    try {
      const body = await res.json();
      if (body?.userMessage) msg = body.userMessage as string;
    } catch {
      /* body wasn't readable — keep the plain wording */
    }
    bill.attempts += 1;
    bill.lastError = msg;
    await updateBill(bill);
    return { ok: false };
  } catch {
    bill.attempts += 1;
    bill.lastError = "The connection dropped while sending.";
    await updateBill(bill);
    return { ok: false };
  }
}

let running = false;

/** Drain the outbox once (send everything currently pending, oldest first). */
export async function flushOutbox(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const bills = (await listOutbox()).sort((a, b) =>
      a.clientCreatedAt < b.clientCreatedAt ? -1 : 1,
    );
    for (const bill of bills) {
      await syncOne(bill);
    }
  } finally {
    running = false;
  }
}

let loopTimer: ReturnType<typeof setTimeout> | null = null;

/** Start the background retry loop (idempotent — safe to call once on mount). */
export function startOutboxLoop(): () => void {
  let stopped = false;
  let attempt = 0;

  async function tick() {
    if (stopped) return;
    const before = (await pendingCount()) + (await pendingPatientCount());
    if (before > 0 && navigator.onLine) {
      // Registrations first: a bill that names a queued patient then usually
      // finds them already there. Nothing depends on the order — the bill
      // carries its own snapshot — it simply makes the common case tidier.
      await flushPatientOutbox();
      await flushOutbox();
    }
    const after = (await pendingCount()) + (await pendingPatientCount());
    // back off when items remain; reset when the queue drains
    attempt = after > 0 ? Math.min(attempt + 1, BACKOFF_MS.length - 1) : 0;
    const delay = after > 0 ? BACKOFF_MS[attempt]! : 30_000;
    if (!stopped) loopTimer = setTimeout(tick, delay);
  }

  const onOnline = () => void (async () => {
    await flushPatientOutbox();
    await flushOutbox();
  })();
  window.addEventListener("online", onOnline);
  void tick();

  return () => {
    stopped = true;
    if (loopTimer) clearTimeout(loopTimer);
    window.removeEventListener("online", onOnline);
  };
}
