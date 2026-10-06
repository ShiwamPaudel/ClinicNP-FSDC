"use client";

/**
 * catalog-cache.ts — the counter reads medicines AND services from this local
 * cache so search never waits on the network (Architecture §2.1). Synced from
 * /api/catalog.
 */
import { posDB } from "@/offline/idb";
import type {
  PosItem,
  PosService,
  PosDoctor,
  PosLabPartner,
  PosRack,
  PosFloor,
  PosCatalog,
  CachedPatient,
} from "@/lib/pos-types";

const VERSION_KEY = "catalog_version";
const DOCTORS_KEY = "doctors";
const PARTNERS_KEY = "lab_partners";
const RACKS_KEY = "racks";
const FLOOR_KEY = "floor";

/** All cached items. */
export async function getCachedItems(): Promise<PosItem[]> {
  const db = await posDB();
  return db.getAll("catalog");
}

/** All cached services. Empty when the clinic module is off. */
export async function getCachedServices(): Promise<PosService[]> {
  const db = await posDB();
  return db.getAll("services");
}

export async function getCachedDoctors(): Promise<PosDoctor[]> {
  const db = await posDB();
  const rows = await db.get("meta", DOCTORS_KEY);
  return Array.isArray(rows) ? (rows as PosDoctor[]) : [];
}

export async function getCachedLabPartners(): Promise<PosLabPartner[]> {
  const db = await posDB();
  const rows = await db.get("meta", PARTNERS_KEY);
  return Array.isArray(rows) ? (rows as PosLabPartner[]) : [];
}

/**
 * The shop floor as last synced. Empty is the ordinary case — most shops never
 * draw their racks — and every caller has to read it that way.
 */
export async function getCachedRacks(): Promise<PosRack[]> {
  const db = await posDB();
  const rows = await db.get("meta", RACKS_KEY);
  return Array.isArray(rows) ? (rows as PosRack[]) : [];
}

/** The room, if it has ever been synced. Null before 0017 or before a sync. */
export async function getCachedFloor(): Promise<PosFloor | null> {
  const db = await posDB();
  const row: unknown = await db.get("meta", FLOOR_KEY);
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const f = row as Partial<PosFloor>;
  return typeof f.floorWidthCm === "number" && typeof f.floorDepthCm === "number"
    ? { floorWidthCm: f.floorWidthCm, floorDepthCm: f.floorDepthCm }
    : null;
}

export async function getCachedVersion(): Promise<string | undefined> {
  const db = await posDB();
  const v = await db.get("meta", VERSION_KEY);
  return typeof v === "string" ? v : undefined;
}

/** Replace the cached catalog with a fresh snapshot. */
export async function replaceCatalog(catalog: PosCatalog): Promise<void> {
  const db = await posDB();
  const tx = db.transaction(["catalog", "services", "meta"], "readwrite");
  await tx.objectStore("catalog").clear();
  for (const item of catalog.items) {
    await tx.objectStore("catalog").put(item);
  }
  await tx.objectStore("services").clear();
  for (const service of catalog.services ?? []) {
    await tx.objectStore("services").put(service);
  }
  await tx.objectStore("meta").put(catalog.version, VERSION_KEY);
  await tx.objectStore("meta").put(catalog.doctors ?? [], DOCTORS_KEY);
  await tx.objectStore("meta").put(catalog.labPartners ?? [], PARTNERS_KEY);
  await tx.objectStore("meta").put(catalog.racks ?? [], RACKS_KEY);
  await tx.objectStore("meta").put(catalog.floor ?? null, FLOOR_KEY);
  await tx.done;
}

/**
 * Fetch the latest catalog and refresh the cache. Returns true on success.
 * Fails quietly when offline — the existing cache keeps working.
 */
export async function syncCatalog(): Promise<boolean> {
  try {
    const res = await fetch("/api/catalog", { cache: "no-store" });
    if (!res.ok) return false;
    const catalog = (await res.json()) as PosCatalog;
    await replaceCatalog(catalog);
    return true;
  } catch {
    return false;
  }
}

/**
 * Optimistically decrement cached stock after a local save, so the next search
 * shows correct quantities immediately (server remains authoritative).
 */
export async function applyLocalAllocation(
  itemId: string,
  allocations: { batchId: string; baseQty: number }[],
): Promise<void> {
  const db = await posDB();
  const item = await db.get("catalog", itemId);
  if (!item) return;
  for (const a of allocations) {
    const batch = item.batches.find((b) => b.id === a.batchId);
    if (batch) batch.remainingBaseQty = Math.max(0, batch.remainingBaseQty - a.baseQty);
  }
  await db.put("catalog", item);
}

// ---------------------------------------------------------------------------
// The recent-patients slice
// ---------------------------------------------------------------------------

/**
 * The counter keeps the most recent patients locally so the patient bar can
 * find somebody with the connection down. Identity fields only — no notes, no
 * address, no history. It is a convenience, not a copy of the record.
 */
export async function getCachedPatients(): Promise<CachedPatient[]> {
  const db = await posDB();
  return db.getAll("patients");
}

export async function replacePatientCache(rows: CachedPatient[]): Promise<void> {
  const db = await posDB();
  const tx = db.transaction("patients", "readwrite");
  await tx.objectStore("patients").clear();
  for (const r of rows) await tx.objectStore("patients").put(r);
  await tx.done;
}

/** Add or update one patient locally, so a fresh registration is findable at once. */
export async function cachePatient(row: CachedPatient): Promise<void> {
  const db = await posDB();
  await db.put("patients", row);
}

/** Pull the recent-patients slice. Fails quietly when offline. */
export async function syncPatients(): Promise<boolean> {
  try {
    const res = await fetch("/api/patients/recent", { cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json()) as { patients: CachedPatient[] };
    await replacePatientCache(body.patients ?? []);
    return true;
  } catch {
    return false;
  }
}

/**
 * Empty every local store on logout.
 *
 * The queues are deliberately NOT cleared: a bill or a registration that has
 * not reached the server yet is work nobody else has a copy of, and signing
 * out is not a reason to throw it away. Everything else here is a cache that
 * re-syncs on the next sign-in.
 */
export async function clearCachesOnLogout(): Promise<void> {
  const db = await posDB();
  const tx = db.transaction(["catalog", "services", "patients", "meta"], "readwrite");
  await tx.objectStore("catalog").clear();
  await tx.objectStore("services").clear();
  await tx.objectStore("patients").clear();
  await tx.objectStore("meta").clear();
  await tx.done;
}
