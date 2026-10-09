/**
 * validators — zod schemas shared by client forms and server actions (one source of truth).
 */
import { z } from "zod";
import { ITEM_SHAPE_KEYS, type ItemShape } from "@/lib/item-shape";
import { FURNITURE_KINDS, type FurnitureKind } from "@/lib/furniture";

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const pinSchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
});

export const roleSchema = z.enum(["admin", "staff", "accountant", "doctor"]);

export const newUserSchema = z.object({
  name: z.string().min(1, "Enter a name"),
  username: z
    .string()
    .min(3, "At least 3 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, . _ - only"),
  password: z.string().min(6, "At least 6 characters"),
  pin: z
    .string()
    .regex(/^\d{4}$/, "PIN must be 4 digits")
    .optional()
    .or(z.literal("")),
  role: roleSchema,
  canEditRate: z.boolean(),
});
export type NewUserInput = z.infer<typeof newUserSchema>;

export const updateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  role: roleSchema.optional(),
  canEditRate: z.boolean().optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional().or(z.literal("")),
  pin: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .or(z.literal("")),
});

// ---- Phase 2: items, suppliers, purchases ----

export const categorySchema = z.enum(["Medicine", "Consumable", "Other"]);

export const itemUnitSchema = z.object({
  level: z.number().int().min(0).max(2),
  name: z.string().min(1, "Unit needs a name"),
  factorToBase: z.number().int().min(1),
  sellingRatePaisa: z.number().int().min(0),
  isDefaultSelling: z.boolean(),
});

export const itemSchema = z.object({
  id: z.string().optional(),
  brandName: z.string().trim().min(1, "Enter the name"),
  genericName: z.string(),
  category: categorySchema,
  manufacturer: z.string(),
  minStockBaseQty: z.number().int().min(0),
  controlledFlag: z.boolean(),
  preferredSupplierId: z.string().nullable(),
  active: z.boolean(),
  shape: z.enum(ITEM_SHAPE_KEYS as [ItemShape, ...ItemShape[]]),
  units: z.array(itemUnitSchema).min(1, "Add at least the base unit"),
});
export type ItemFormInput = z.infer<typeof itemSchema>;

export const supplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Enter a supplier name"),
  panNo: z.string(),
  phone: z.string(),
  address: z.string(),
  contactPerson: z.string(),
  terms: z.string(),
  active: z.boolean(),
});
export type SupplierFormInput = z.infer<typeof supplierSchema>;

export const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1),
  dateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  amountPaisa: z.number().int().min(1, "Enter an amount"),
  method: z.string().min(1),
  note: z.string(),
});

/** Undoing a payment to a supplier or a laboratory entered by mistake (0023). */
export const paymentVoidSchema = z.object({
  kind: z.enum(["supplier", "lab"]),
  paymentId: z.string().min(1),
  reason: z.string().trim().min(1, "Say why this payment is being undone"),
});

export const purchaseLineSchema = z
  .object({
    itemId: z.string().min(1),
    // Batch and expiry are required only on stock for sale; the action checks
    // that. A clinic buying for its own use sends neither (C-035).
    batchNo: z.string().default(""),
    // Optional: plenty of packs and supplier bills do not print one. Empty
    // string means "not known" and is stored as NULL.
    mfgDateBs: z
      .string()
      .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a manufacture date, or leave it empty"),
    expiryDateBs: z
      .string()
      .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick an expiry date")
      .default(""),
    unitLevel: z.number().int().min(0).max(2),
    qty: z.number().int().min(1, "Quantity required"),
    freeQty: z.number().int().min(0),
    unitCostPaisa: z.number().int().min(0),
    discountPaisa: z.number().int().min(0),
    // The selling price typed on the line, for its unit (0022). Defaults to 0,
    // "none given", so anything that does not send it saves exactly as before.
    sellingRatePaisa: z.number().int().min(0).default(0),
    // Only when editing a saved purchase: which existing line this row is.
    // A new purchase never sends it, and it is ignored if one does.
    lineId: z.string().min(1).optional(),
  })
  // Both are zero-padded BS text, so comparing the strings compares the dates.
  .refine((l) => !l.mfgDateBs || !l.expiryDateBs || l.mfgDateBs <= l.expiryDateBs, {
    message: "A medicine cannot expire before it was manufactured. Check the dates.",
  });

/** How a supplier or a laboratory can be paid. */
export const PAYABLE_METHODS = ["cash", "bank", "cheque", "qr"] as const;

export const purchasePaymentSchema = z
  .object({
    mode: z.enum(["credit", "full", "part"]),
    amountPaisa: z.number().int().min(0).default(0),
    method: z.enum(PAYABLE_METHODS).default("cash"),
  })
  .refine((p) => p.mode !== "part" || p.amountPaisa > 0, {
    message: "Enter how much was paid, or choose \"On credit\"",
  });

export const purchaseSchema = z.object({
  supplierId: z.string().min(1, "Choose a supplier"),
  supplierInvoiceNo: z.string(),
  dateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  applyVat: z.boolean(),
  /** taken off the whole bill after the lines are added up (0021) */
  billDiscountPaisa: z.number().int().min(0, "A discount cannot be less than nothing").default(0),
  /** the supplier's rounding line, up or down; a rupee or two at most */
  roundingPaisa: z
    .number()
    .int()
    .min(-1000, "Rounding that big is not rounding")
    .max(1000, "Rounding that big is not rounding")
    .default(0),
  lines: z.array(purchaseLineSchema).min(1, "Add at least one item"),
  // What was paid as the purchase was entered (0023). Absent is "on credit",
  // what every purchase was before, so an older form saves exactly as it did.
  // Only a new purchase reads it; an edit leaves its payments alone.
  payment: purchasePaymentSchema.optional(),
});
export type PurchaseFormInput = z.infer<typeof purchaseSchema>;

/** Changing a saved purchase: the same fields, plus which one and the password. */
export const purchaseUpdateSchema = purchaseSchema.extend({
  purchaseId: z.string().min(1),
  password: z.string().min(1, "Enter your password to save the change"),
});

export const purchaseReturnSchema = z.object({
  supplierId: z.string().min(1),
  dateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  reason: z.string(),
  lines: z
    .array(
      z.object({
        batchId: z.string().min(1),
        itemId: z.string().min(1),
        baseQty: z.number().int().min(1),
        costPaisa: z.number().int().min(0),
      }),
    )
    .min(1, "Choose at least one batch"),
});

// ---- Phase 3: bill ingest (outbox -> /api/bills) ----

export const ingestLineSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  unitLevel: z.number().int().min(0).max(2),
  qty: z.number().int().min(1),
  ratePaisa: z.number().int().min(0),
  rateOverridden: z.boolean(),
  discountPaisa: z.number().int().min(0),
  overrideBatchId: z.string().optional(),
});

export const ingestServiceLineSchema = z.object({
  id: z.string().min(1),
  serviceId: z.string().min(1),
  qty: z.number().int().min(1),
  ratePaisa: z.number().int().min(0),
  rateOverridden: z.boolean(),
  discountPaisa: z.number().int().min(0),
  doctorId: z.string().nullable(),
  labPartnerId: z.string().nullable(),
  followupApplied: z.boolean(),
});

/**
 * A patient carried inline with a bill, for when the bill reaches the server
 * before the registration does (Architecture §2.1 Path B).
 */
export const inlinePatientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sex: z.enum(["f", "m", "o"]),
  ageValue: z.number().int().nullable(),
  ageUnit: z.enum(["y", "m", "d"]).nullable(),
  ageAsOfAd: z.string().nullable(),
  phone: z.string().default(""),
  address: z.string().default(""),
});

export const ingestBillSchema = z.object({
  id: z.string().min(1),
  dateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateAd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  patientName: z.string(),
  paymentMethod: z.enum(["cash", "qr", "credit"]),
  tenderedPaisa: z.number().int().min(0),
  /** on a bill on dues, what was paid at the counter (absent from older queues) */
  paidNowPaisa: z.number().int().min(0).optional(),
  paidNowMethod: z.enum(["cash", "qr"]).optional(),
  billDiscountPaisa: z.number().int().min(0),
  lines: z.array(ingestLineSchema),
  serviceLines: z.array(ingestServiceLineSchema).optional(),
  patientId: z.string().optional(),
  patient: inlinePatientSchema.optional(),
  visitId: z.string().optional(),
  clientCreatedAt: z.string(),
})
  // A bill has to be for something. Either block alone is a real bill: a
  // medicine-only sale, or a consultation with nothing dispensed.
  .refine((b) => b.lines.length > 0 || (b.serviceLines?.length ?? 0) > 0, {
    message: "Add at least one item or service",
    path: ["lines"],
  })
  // A service belongs to somebody (PRD §4B.4). The patient may be named by id
  // or carried inline; either way the bill knows who it is for.
  .refine(
    (b) =>
      (b.serviceLines?.length ?? 0) === 0 ||
      Boolean(b.patientId) ||
      Boolean(b.patient),
    {
      message: "A bill with a service on it needs a patient",
      path: ["patientId"],
    },
  )
  // If both are given they must agree, or the bill is describing two people.
  .refine((b) => !b.patient || !b.patientId || b.patient.id === b.patientId, {
    message: "That bill names two different patients",
    path: ["patient"],
  });
export type IngestBillPayload = z.infer<typeof ingestBillSchema>;

export const companySchema = z.object({
  name: z.string().min(1, "Enter the name"),
  address: z.string(),
  phone: z.string(),
  panNo: z.string(),
  ddaNo: z.string(),
  vatRegistered: z.boolean(),
  vatInclusive: z.boolean().default(false),
  invoiceFooter: z.string(),
  logoUrl: z.string().nullable(),
  // Kept only so an older stored value still parses. There is one bill
  // format now and nothing chooses between them (D-090).
  printFormat: z.enum(["thermal", "a5", "a4_half"]).default("a4_half"),
  roundingOn: z.boolean(),
  expiryAlertDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  minRateIsCost: z.boolean(),
  rackDisplay: z.enum(["off", "text", "visual"]),
  dateCalendar: z.enum(["bs", "ad"]).default("bs"),
});
export type CompanyInput = z.infer<typeof companySchema>;

// ---------------------------------------------------------------------------
// Clinic catalog (Phase 3)
// ---------------------------------------------------------------------------

export const rackSchema = z.object({
  name: z.string().min(1, "Give it a name"),
  kind: z.enum(FURNITURE_KINDS as unknown as [FurnitureKind, ...FurnitureKind[]]),
  rows: z.number().int().min(1, "At least one row").max(26, "That is too many rows for one rack"),
  cols: z.number().int().min(1, "At least one column").max(26, "That is too many columns for one rack"),
  // Centimetres from the room's top-left corner (0017). Negative is allowed
  // on purpose: something dragged past the corner is recorded where it was
  // put rather than clamped to a place it is not.
  xCm: z.number().int().min(-5000).max(5000),
  yCm: z.number().int().min(-5000).max(5000),
  widthCm: z.number().int().min(10).max(2000),
  depthCm: z.number().int().min(10).max(2000),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  note: z.string().max(120, "Keep the note short").optional(),
  active: z.boolean(),
});
export type RackFormInput = z.infer<typeof rackSchema>;

/** A drag, a resize or a turn. Geometry only — see `moveRacks`. */
export const layoutMoveSchema = z.object({
  moves: z
    .array(
      z.object({
        id: z.string().min(1),
        xCm: z.number().int().min(-5000).max(5000),
        yCm: z.number().int().min(-5000).max(5000),
        widthCm: z.number().int().min(10).max(2000),
        depthCm: z.number().int().min(10).max(2000),
        rotation: z.union([
          z.literal(0),
          z.literal(90),
          z.literal(180),
          z.literal(270),
        ]),
      }),
    )
    .min(1)
    .max(200),
});

/** How big the room itself is, in centimetres. */
export const floorSizeSchema = z.object({
  floorWidthCm: z.number().int().min(100).max(5000),
  floorDepthCm: z.number().int().min(100).max(5000),
});

export const itemLocationSchema = z.object({
  itemId: z.string().min(1),
  rackId: z.string().min(1).nullable(),
  row: z.number().int().min(1).max(26).nullable(),
  col: z.number().int().min(1).max(26).nullable(),
  note: z.string().max(120, "Keep the note short"),
});

export const serviceGroupSchema = z.object({
  name: z.string().min(1, "Enter a group name"),
  sortOrder: z.number().int().min(0).max(9999),
  isConsultation: z.boolean(),
  active: z.boolean(),
});

export const serviceSchema = z.object({
  name: z.string().min(1, "Enter a service name"),
  code: z.string().max(24, "Keep the short code brief"),
  groupId: z.string().min(1, "Choose a group"),
  ratePaisa: z.number().int().min(0, "A rate cannot be negative"),
  doctorRequired: z.boolean(),
  defaultDoctorId: z.string().nullable(),
  outsourced: z.boolean(),
  defaultLabPartnerId: z.string().nullable(),
  partnerCostPaisa: z.number().int().min(0, "A cost cannot be negative"),
  sampleType: z.string().max(40),
  followupDays: z.number().int().min(0).max(365, "A follow-up window is at most a year"),
  followupRatePaisa: z.number().int().min(0),
  vatApplicable: z.boolean(),
  active: z.boolean(),
});
export type ServiceFormInput = z.infer<typeof serviceSchema>;

export const shareBasisSchema = z.enum([
  "none",
  "pct_consult",
  "fixed_consult",
  "pct_services",
]);

/** Blank is allowed everywhere an address is optional; anything else must look like one. */
export const optionalEmail = z
  .string()
  .trim()
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), {
    message: "That doesn't look like an email address",
  });

export const doctorSchema = z.object({
  name: z.string().min(1, "Enter the doctor's name"),
  qualification: z.string(),
  specialty: z.string(),
  nmcNo: z.string(),
  phone: z.string(),
  email: optionalEmail,
  /** The sign-in that belongs to this doctor, or empty for none. */
  userId: z.string(),
  notifyPush: z.boolean(),
  notifyEmail: z.boolean(),
  shareBasis: shareBasisSchema,
  /** basis points for the percentage bases, paisa for a fixed amount */
  shareValue: z.number().int().min(0),
  active: z.boolean(),
});
export type DoctorFormInput = z.infer<typeof doctorSchema>;

/** What a doctor may change about themselves, from their own phone. */
export const doctorProfileSchema = z.object({
  name: z.string().min(1, "Enter your name"),
  qualification: z.string(),
  specialty: z.string(),
  nmcNo: z.string(),
  phone: z.string(),
  email: optionalEmail,
  notifyPush: z.boolean(),
  notifyEmail: z.boolean(),
});
export type DoctorProfileInput = z.infer<typeof doctorProfileSchema>;

// ---- Booked consultations ----

const bsDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time");

export const bookConsultationSchema = z.object({
  /** Minted by the browser, so a retry books one consultation and not two. */
  id: z.string().optional(),
  doctorId: z.string().min(1, "Choose a doctor"),
  patientId: z.string().min(1, "Choose the patient"),
  dateBs: bsDate,
  timeHhmm: clockTime,
  durationMin: z.number().int().min(5).max(240),
  reason: z.string().max(300),
});
export type BookConsultationInput = z.infer<typeof bookConsultationSchema>;

export const rescheduleConsultationSchema = z.object({
  id: z.string().min(1),
  dateBs: bsDate,
  timeHhmm: clockTime,
  durationMin: z.number().int().min(5).max(240),
});

export const consultationStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["booked", "arrived", "seen", "cancelled", "missed"]),
  cancelReason: z.string().max(300).default(""),
});

/** What a browser hands over when somebody turns alerts on. */
export const pushDeviceSchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(400),
  auth: z.string().min(1).max(200),
  label: z.string().max(120).default(""),
});

export const labPartnerSchema = z.object({
  name: z.string().min(1, "Enter the laboratory's name"),
  panNo: z.string(),
  phone: z.string(),
  address: z.string(),
  contactPerson: z.string(),
  terms: z.string(),
  active: z.boolean(),
});
export type LabPartnerFormInput = z.infer<typeof labPartnerSchema>;

export const labPartnerPaymentSchema = z.object({
  partnerId: z.string().min(1),
  dateBs: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  amountPaisa: z.number().int().min(1, "Enter an amount"),
  method: z.enum(["cash", "bank", "cheque", "qr", "adjustment"]),
  note: z.string(),
});
