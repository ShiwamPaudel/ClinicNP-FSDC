/**
 * catalog.ts — builds the counter's catalog snapshot.
 *
 * From v2 this is everything the counter can sell: medicines with their units
 * and live batches, and — when the Clinic module is on — services with the
 * doctors and laboratories they need. One snapshot, so one search box can
 * cover both without waiting on the network (Architecture §2.1).
 */
import "server-only";
import { listItems } from "@/lib/repos/items";
import { allBatchesWithStock, catalogVersion } from "@/lib/repos/batches";
import { listPosServices } from "@/lib/repos/services";
import { listDoctors } from "@/lib/repos/doctors";
import { listLabPartners } from "@/lib/repos/lab-partners";
import { listRacks, allItemLocations } from "@/lib/repos/racks";
import { getFloorSize } from "@/lib/repos/company";
import type {
  PosService,
  PosDoctor,
  PosLabPartner,
  PosRack,
  PosCell,
  PosFloor,
} from "@/lib/pos-types";

export interface CatalogBatch {
  id: string;
  batchNo: string;
  expiryDateAd: string;
  remainingBaseQty: number;
  costPaisaPerBase: number;
}

export interface CatalogItem {
  id: string;
  brandName: string;
  genericName: string;
  category: string;
  controlledFlag: boolean;
  shape: string;
  units: {
    level: number;
    name: string;
    factorToBase: number;
    sellingRatePaisa: number;
    isDefaultSelling: boolean;
  }[];
  batches: CatalogBatch[];
  cell: PosCell | null;
  shelfNote: string;
}

export interface CatalogSnapshot {
  version: string;
  items: CatalogItem[];
  services: PosService[];
  doctors: PosDoctor[];
  labPartners: PosLabPartner[];
  /** The shop floor, so the counter can light up a shelf while offline. */
  racks: PosRack[];
  /** The room those racks stand in. Absent in a snapshot cached before 0017,
   *  and the map falls back to whatever the furniture covers. */
  floor?: PosFloor;
}

/**
 * `includeClinic` is decided by the caller from the module flags, so a
 * pharmacy-only install never even ships a services array.
 */
export async function catalogSnapshot(
  includeClinic = false,
): Promise<CatalogSnapshot> {
  const [items, batches, version, services, doctors, labPartners, racks] =
    await Promise.all([
      listItems(),
      allBatchesWithStock(),
      catalogVersion(),
      includeClinic ? listPosServices() : Promise.resolve([]),
      includeClinic ? listDoctors() : Promise.resolve([]),
      includeClinic ? listLabPartners() : Promise.resolve([]),
      listRacks(),
    ]);
  const locations = await allItemLocations();
  const floor = await getFloorSize();

  const batchesByItem = new Map<string, CatalogBatch[]>();
  for (const b of batches) {
    if (!batchesByItem.has(b.itemId)) batchesByItem.set(b.itemId, []);
    batchesByItem.get(b.itemId)!.push({
      id: b.id,
      batchNo: b.batchNo,
      expiryDateAd: b.expiryDateAd,
      remainingBaseQty: b.remainingBaseQty,
      costPaisaPerBase: b.costPaisaPerBase,
    });
  }

  return {
    version,
    floor,
    services,
    doctors: doctors.map((d) => ({
      id: d.id,
      name: d.name,
      qualification: d.qualification,
      shareBasis: d.shareBasis,
      shareValue: d.shareValue,
    })),
    labPartners: labPartners.map((p) => ({ id: p.id, name: p.name })),
    racks: racks.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      rows: r.rows,
      cols: r.cols,
      xCm: r.xCm,
      yCm: r.yCm,
      widthCm: r.widthCm,
      depthCm: r.depthCm,
      rotation: r.rotation,
    })),
    items: items.map((i) => ({
      id: i.id,
      brandName: i.brandName,
      genericName: i.genericName,
      category: i.category,
      controlledFlag: i.controlledFlag,
      shape: i.shape,
      units: i.units,
      batches: batchesByItem.get(i.id) ?? [],
      // All three or none: a half-written cell would draw a light on nothing.
      cell: (() => {
        const l = locations.get(i.id);
        return l && l.rackId !== null && l.row !== null && l.col !== null
          ? { rackId: l.rackId, row: l.row, col: l.col }
          : null;
      })(),
      shelfNote: locations.get(i.id)?.note ?? "",
    })),
  };
}
