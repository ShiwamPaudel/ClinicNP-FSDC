"use client";

/**
 * held.ts — parked bills (F7 hold / F8 resume). Survive reload via IndexedDB.
 * Max 10 in the tray (PRD 4.1.5).
 */
import { posDB } from "@/offline/idb";
import type { HeldBill } from "@/lib/pos-types";

export const MAX_HELD = 10;

export async function listHeld(): Promise<HeldBill[]> {
  const db = await posDB();
  const all = await db.getAll("held");
  return all.sort((a, b) => (a.heldAt < b.heldAt ? 1 : -1));
}

export async function heldCount(): Promise<number> {
  const db = await posDB();
  return db.count("held");
}

/** Park a bill. Returns false if the tray is full. */
export async function holdBill(bill: HeldBill): Promise<boolean> {
  const db = await posDB();
  if ((await db.count("held")) >= MAX_HELD) return false;
  await db.put("held", bill);
  return true;
}

/** Resume a held bill: fetch and remove it from the tray. */
export async function resumeHeld(id: string): Promise<HeldBill | undefined> {
  const db = await posDB();
  const bill = await db.get("held", id);
  if (bill) await db.delete("held", id);
  return bill;
}

export async function removeHeld(id: string): Promise<void> {
  const db = await posDB();
  await db.delete("held", id);
}
