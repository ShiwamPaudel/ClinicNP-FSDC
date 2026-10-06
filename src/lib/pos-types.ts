/**
 * pos-types.ts — shared client/server shapes for the POS. No server-only imports,
 * so both the browser (cache, store) and the server (catalog repo) can use them.
 */

export interface PosUnit {
  level: number;
  name: string;
  factorToBase: number;
  sellingRatePaisa: number;
  isDefaultSelling: boolean;
}

export interface PosBatch {
  id: string;
  batchNo: string;
  expiryDateAd: string;
  remainingBaseQty: number;
  costPaisaPerBase: number;
}

export interface PosItem {
  id: string;
  brandName: string;
  genericName: string;
  category: string;
  controlledFlag: boolean;
  /** visual form (capsule/tablet/bottle/…) for the pictorial unit picker */
  shape: string;
  units: PosUnit[];
  batches: PosBatch[];
  /** Where it is kept, when the shop has drawn its racks. */
  cell: PosCell | null;
  /** The free-text shelf note, for a shop that has not drawn racks. */
  shelfNote: string;
}

/** A shelf on the drawn map. */
export interface PosCell {
  rackId: string;
  row: number;
  col: number;
}

/**
 * A rack as the counter draws it. Carried in the catalog rather than fetched,
 * because the map has to work with the connection down like everything else at
 * the counter does.
 */
export interface PosRack {
  id: string;
  name: string;
  /** rack | shelf | desk | counter | fridge | door */
  kind: string;
  rows: number;
  cols: number;
  /** where it stands and how big it is, in centimetres (0017) */
  xCm: number;
  yCm: number;
  widthCm: number;
  depthCm: number;
  rotation: number;
}

/** The room the furniture stands in, carried so the counter can draw walls. */
export interface PosFloor {
  floorWidthCm: number;
  floorDepthCm: number;
}

export interface PosCatalog {
  version: string;
  items: PosItem[];
  services: PosService[];
  doctors: PosDoctor[];
  labPartners: PosLabPartner[];
  racks: PosRack[];
  /** Absent in a snapshot cached before 0017; the map falls back to the
   *  bounding box of whatever furniture it has. */
  floor?: PosFloor;
}

/** A service line as it travels to the server. */
export interface OutboxServiceLine {
  id: string;
  serviceId: string;
  qty: number;
  ratePaisa: number;
  rateOverridden: boolean;
  discountPaisa: number;
  doctorId: string | null;
  labPartnerId: string | null;
  /** what the counter believed; the server recomputes and wins */
  followupApplied: boolean;
}

/**
 * A patient carried inline with the bill, so a bill can land before the
 * patient registration it depends on (Architecture §2.1 Path B, Phase 5).
 */
export interface InlinePatient {
  id: string;
  name: string;
  sex: string;
  ageValue: number | null;
  ageUnit: "y" | "m" | "d" | null;
  ageAsOfAd: string | null;
  phone: string;
  address: string;
}

/** A bill queued in the outbox, ready to POST to /api/bills. */
export interface OutboxBill {
  id: string; // ULID
  dateBs: string;
  dateAd: string;
  patientName: string;
  /** the registered patient this bill is for, when there is one */
  patientId?: string;
  /** the patient's details, when the registration may not have landed yet */
  patient?: InlinePatient;
  visitId?: string;
  paymentMethod: "cash" | "qr" | "credit";
  tenderedPaisa: number;
  /** on a bill on dues: what was paid at the counter, and how */
  paidNowPaisa?: number;
  paidNowMethod?: "cash" | "qr";
  billDiscountPaisa: number;
  lines: {
    id: string;
    itemId: string;
    unitLevel: number;
    qty: number;
    ratePaisa: number;
    rateOverridden: boolean;
    discountPaisa: number;
    overrideBatchId?: string;
  }[];
  serviceLines?: OutboxServiceLine[];
  clientCreatedAt: string;
  attempts: number;
  lastError?: string;
  /** assigned after a successful sync */
  invoiceNo?: number;
  fiscalLabel?: string;
}

/** A parked (held) bill — a snapshot of the active bill's editable state. */
export interface HeldBill {
  id: string;
  heldAt: string;
  patientName: string;
  lines: HeldLine[];
  /** a parked clinic bill keeps its services and its patient */
  serviceLines?: HeldServiceLine[];
  patientId?: string;
  /** carried for a patient who may not have reached the server yet */
  patient?: InlinePatient;
  visitId?: string;
  /**
   * The patient exactly as the patient bar showed them, so resuming puts the
   * same person back on the bill. Absent on bills held before it was kept;
   * those are matched by `patientId` against the counter's patient list.
   */
  attachedPatient?: {
    id: string;
    patientNo: number | null;
    name: string;
    sex: string;
    ageShort: string;
  };
}

export interface HeldServiceLine {
  serviceId: string;
  qty: number;
  ratePaisa: number;
  rateOverridden: boolean;
  discountPaisa: number;
  doctorId: string | null;
  labPartnerId: string | null;
  followupApplied: boolean;
  followupNote: string;
}

export interface HeldLine {
  itemId: string;
  unitLevel: number;
  qty: number;
  ratePaisa: number;
  rateOverridden: boolean;
  discountPaisa: number;
  overrideBatchId?: string;
}

/**
 * A service as the counter needs it: everything required to price a line and
 * to decide what the line demands (a doctor, a lab partner, a file later).
 * Client-safe, exactly like PosItem — the same object is cached in the browser
 * and read by the server.
 */
export interface PosService {
  id: string;
  name: string;
  code: string;
  groupId: string;
  groupName: string;
  /** the group is a consultation group: the follow-up rule and the
   *  consultation-based doctor shares apply to it */
  isConsultation: boolean;
  ratePaisa: number;
  doctorRequired: boolean;
  defaultDoctorId: string | null;
  outsourced: boolean;
  defaultLabPartnerId: string | null;
  partnerCostPaisa: number;
  /** what has to be collected; empty for a service that collects nothing */
  sampleType: string;
  followupDays: number;
  followupRatePaisa: number;
  vatApplicable: boolean;
  /** the rate came from the sample seed, so the counter can say so out loud */
  sampleRate: boolean;
}

/** A doctor, reduced to what the counter needs to show and to snapshot. */
export interface PosDoctor {
  id: string;
  name: string;
  qualification: string;
  shareBasis: "none" | "pct_consult" | "fixed_consult" | "pct_services";
  shareValue: number;
}

/** A lab partner, reduced to what the counter and the dispatch slip need. */
export interface PosLabPartner {
  id: string;
  name: string;
}

/**
 * A patient registered at the counter and waiting to be sent.
 *
 * The id is minted on the device and is the person's identity from that
 * moment: the same id goes on any bill made for them, so the two queues can
 * land in either order and still describe one person.
 */
export interface QueuedPatient {
  id: string;
  name: string;
  sex: string;
  ageValue: number | null;
  ageUnit: "y" | "m" | "d" | null;
  phone: string;
  address: string;
  queuedAt: string;
  attempts: number;
  lastError?: string;
  /** filled in once the server has assigned the lifetime number */
  patientNo?: number | null;
}

/** A patient in the counter's local cache, identity fields only. */
export interface CachedPatient {
  id: string;
  patientNo: number | null;
  name: string;
  sex: string;
  phone: string;
  ageShort: string;
}
