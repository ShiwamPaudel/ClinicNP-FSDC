"use client";

/**
 * idb.ts — the single IndexedDB database for the counter.
 * Stores: catalog (item cache), services (service cache), meta (catalog
 * version, doctors and laboratories), outbox (pending bills), held (parked
 * bills). Never use localStorage for bills/queue (Rules §6).
 *
 * The database was called "faarma" in v1 and is "clinicnp" from v2 on. The
 * carry-over below moves anything still queued on a device that used the old
 * name, and only deletes the old database once the rows are verifiably present
 * in the new one. A bill waiting to be sent is never destroyed to tidy a name.
 */
import { openDB, deleteDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  PosItem,
  PosService,
  PosDoctor,
  PosLabPartner,
  PosRack,
  PosFloor,
  OutboxBill,
  HeldBill,
  QueuedPatient,
  CachedPatient,
} from "@/lib/pos-types";

interface PosDB extends DBSchema {
  catalog: { key: string; value: PosItem };
  services: { key: string; value: PosService };
  // the version string, plus the doctor, laboratory and rack lists, which are
  // short enough that a store of their own would be ceremony
  meta: {
    key: string;
    value: string | PosDoctor[] | PosLabPartner[] | PosRack[] | PosFloor | null;
  };
  outbox: { key: string; value: OutboxBill };
  held: { key: string; value: HeldBill };
  patient_outbox: { key: string; value: QueuedPatient };
  patients: { key: string; value: CachedPatient };
}

const DB_NAME = "clinicnp";
const LEGACY_DB_NAME = "faarma";
const CARRIED_OVER_KEY = "carried-over-from-previous-name";

/**
 * Stores whose contents must survive the rename. `catalog`, `services` and
 * `patients` are caches and re-sync; the two queues hold work nobody else has
 * a copy of.
 */
const CARRIED_STORES = ["outbox", "held", "patient_outbox"] as const;

let dbPromise: Promise<IDBPDatabase<PosDB>> | null = null;

function createStores(db: IDBPDatabase<PosDB>): void {
  if (!db.objectStoreNames.contains("catalog"))
    db.createObjectStore("catalog", { keyPath: "id" });
  if (!db.objectStoreNames.contains("services"))
    db.createObjectStore("services", { keyPath: "id" });
  if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
  if (!db.objectStoreNames.contains("outbox"))
    db.createObjectStore("outbox", { keyPath: "id" });
  if (!db.objectStoreNames.contains("held"))
    db.createObjectStore("held", { keyPath: "id" });
  if (!db.objectStoreNames.contains("patient_outbox"))
    db.createObjectStore("patient_outbox", { keyPath: "id" });
  if (!db.objectStoreNames.contains("patients"))
    db.createObjectStore("patients", { keyPath: "id" });
}

/** True when a database with the old name is still on this device. */
async function legacyDatabaseExists(): Promise<boolean> {
  if (typeof indexedDB.databases === "function") {
    try {
      const list = await indexedDB.databases();
      return list.some((d) => d.name === LEGACY_DB_NAME);
    } catch {
      // Browser wouldn't say — fall through and let the copy step decide.
    }
  }
  return true;
}

/**
 * One-time carry-over from the v1 database name. Runs before the counter is
 * handed a database, so it can never race the outbox drain loop.
 */
async function carryOverFromLegacy(db: IDBPDatabase<PosDB>): Promise<void> {
  if (await db.get("meta", CARRIED_OVER_KEY)) return;

  if (!(await legacyDatabaseExists())) {
    await db.put("meta", new Date().toISOString(), CARRIED_OVER_KEY);
    return;
  }

  let legacy: IDBPDatabase<PosDB> | null = null;
  try {
    legacy = await openDB<PosDB>(LEGACY_DB_NAME, 1, { upgrade: createStores });

    const carried: Partial<Record<(typeof CARRIED_STORES)[number], number>> = {};
    for (const store of CARRIED_STORES) {
      if (!legacy.objectStoreNames.contains(store)) continue;
      const rows = await legacy.getAll(store);
      for (const row of rows) await db.put(store, row);
      carried[store] = rows.length;
    }

    // Verify everything landed before destroying the old database.
    let verified = true;
    for (const store of CARRIED_STORES) {
      const expected = carried[store];
      if (expected === undefined) continue;
      if ((await db.count(store)) < expected) verified = false;
    }

    legacy.close();
    legacy = null;

    if (verified) {
      await db.put("meta", new Date().toISOString(), CARRIED_OVER_KEY);
      await deleteDB(LEGACY_DB_NAME);
    }
    // If it didn't verify, both databases stay. Nothing is lost and the next
    // boot tries again.
  } catch {
    // Leave the old database exactly where it is and retry on the next boot.
  } finally {
    legacy?.close();
  }
}

export function posDB(): Promise<IDBPDatabase<PosDB>> {
  if (!dbPromise) {
    dbPromise = (async () => {
      // Version 3 adds the services, patient queue and patient cache stores.
      // `createStores` is guarded so an upgrade adds only what is missing and
      // never touches a queued bill or registration.
      const db = await openDB<PosDB>(DB_NAME, 3, { upgrade: createStores });
      await carryOverFromLegacy(db);
      return db;
    })();
  }
  return dbPromise;
}
