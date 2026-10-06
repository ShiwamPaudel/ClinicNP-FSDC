/**
 * company.ts — the single-row company profile (id = 1).
 */
import "server-only";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import {
  DEFAULT_DATE_CALENDAR,
  isDateCalendar,
  type DateCalendar,
} from "@/lib/calendar-view";

/** a4_half is a full A4 sheet with the bill in its top half, so one sheet
 *  carries two bills and is cut once. It is not A5, which is a smaller sheet. */
export type PrintFormat = "thermal" | "a5" | "a4_half";

/** What the counter shows about where a medicine physically is. */
export type RackDisplay = "off" | "text" | "visual";
export type ExpiryAlertDays = 30 | 60 | 90;

export interface Company {
  name: string;
  address: string;
  phone: string;
  panNo: string;
  ddaNo: string;
  vatRegistered: boolean;
  invoiceFooter: string;
  logoUrl: string | null;
  printFormat: PrintFormat;
  roundingOn: boolean;
  expiryAlertDays: ExpiryAlertDays;
  minRateIsCost: boolean;
  rackDisplay: RackDisplay;
  /** Which calendar every date box opens in (0020). Dates are stored in BS either way. */
  dateCalendar: DateCalendar;
}

const DEFAULTS: Company = {
  name: "",
  address: "",
  phone: "",
  panNo: "",
  ddaNo: "",
  vatRegistered: false,
  invoiceFooter: "Get well soon",
  logoUrl: null,
  printFormat: "thermal",
  roundingOn: false,
  expiryAlertDays: 60,
  minRateIsCost: false,
  rackDisplay: "off",
  dateCalendar: DEFAULT_DATE_CALENDAR,
};

function mapCompany(r: Row): Company {
  return {
    name: r.name as string,
    address: r.address as string,
    phone: r.phone as string,
    panNo: r.pan_no as string,
    ddaNo: r.dda_no as string,
    vatRegistered: Number(r.vat_registered) === 1,
    invoiceFooter: r.invoice_footer as string,
    logoUrl: (r.logo_url as string | null) ?? null,
    printFormat: r.print_format as PrintFormat,
    roundingOn: Number(r.rounding_on) === 1,
    expiryAlertDays: Number(r.expiry_alert_days) as ExpiryAlertDays,
    minRateIsCost: Number(r.min_rate_is_cost) === 1,
    rackDisplay: (r.rack_display as RackDisplay) ?? "off",
    dateCalendar: isDateCalendar(r.date_calendar)
      ? r.date_calendar
      : DEFAULT_DATE_CALENDAR,
  };
}

export async function getCompany(): Promise<Company> {
  const res = await db().execute("SELECT * FROM company WHERE id = 1");
  return res.rows[0] ? mapCompany(res.rows[0]) : { ...DEFAULTS };
}

export async function saveCompany(c: Company): Promise<void> {
  await db().execute({
    sql: `INSERT INTO company
            (id, name, address, phone, pan_no, dda_no, vat_registered, invoice_footer,
             logo_url, print_format, rounding_on, expiry_alert_days, min_rate_is_cost,
             rack_display, date_calendar, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            address = excluded.address,
            phone = excluded.phone,
            pan_no = excluded.pan_no,
            dda_no = excluded.dda_no,
            vat_registered = excluded.vat_registered,
            invoice_footer = excluded.invoice_footer,
            logo_url = excluded.logo_url,
            print_format = excluded.print_format,
            rounding_on = excluded.rounding_on,
            expiry_alert_days = excluded.expiry_alert_days,
            min_rate_is_cost = excluded.min_rate_is_cost,
            rack_display = excluded.rack_display,
            date_calendar = excluded.date_calendar,
            updated_at = excluded.updated_at`,
    args: [
      c.name,
      c.address,
      c.phone,
      c.panNo,
      c.ddaNo,
      c.vatRegistered ? 1 : 0,
      c.invoiceFooter,
      c.logoUrl,
      c.printFormat,
      c.roundingOn ? 1 : 0,
      c.expiryAlertDays,
      c.minRateIsCost ? 1 : 0,
      c.rackDisplay,
      c.dateCalendar,
      new Date().toISOString(),
    ],
  });
}

/**
 * Just the calendar setting, for the app layout. Read on its own because the
 * company row carries the letterhead image, which is far too big to fetch for
 * every page just to learn one word.
 */
export async function getDateCalendar(): Promise<DateCalendar> {
  const res = await db().execute("SELECT date_calendar FROM company WHERE id = 1");
  const v = res.rows[0]?.date_calendar;
  return isDateCalendar(v) ? v : DEFAULT_DATE_CALENDAR;
}

// ============================================================
// The shop floor's own size (0017)
//
// Kept off the Company profile deliberately, even though it lives on the same
// row. The Settings form owns that row and rewrites every column it knows
// about; the floor planner owns these two and nothing else. Threading them
// through `saveCompany` would mean saving the company details from one screen
// could quietly resize the room drawn on another.
// ============================================================

export interface FloorSize {
  floorWidthCm: number;
  floorDepthCm: number;
}

/** A shop that has never drawn a room gets a plausible one: 6m by 4.5m. */
export const DEFAULT_FLOOR: FloorSize = {
  floorWidthCm: 600,
  floorDepthCm: 450,
};

export async function getFloorSize(): Promise<FloorSize> {
  const res = await db().execute(
    "SELECT floor_width_cm, floor_depth_cm FROM company WHERE id = 1",
  );
  const r = res.rows[0];
  if (!r) return { ...DEFAULT_FLOOR };
  return {
    floorWidthCm: Number(r.floor_width_cm) || DEFAULT_FLOOR.floorWidthCm,
    floorDepthCm: Number(r.floor_depth_cm) || DEFAULT_FLOOR.floorDepthCm,
  };
}

export async function setFloorSize(size: FloorSize): Promise<void> {
  await db().execute({
    sql: `UPDATE company
             SET floor_width_cm = ?, floor_depth_cm = ?, updated_at = ?
           WHERE id = 1`,
    args: [size.floorWidthCm, size.floorDepthCm, new Date().toISOString()],
  });
}

// ============================================================
// Module flags (PRD §3.1). Kept apart from the Company profile: they are a
// system boundary, not a business detail, and they are read on nearly every
// request, so they travel on their own narrow query.
// ============================================================

export interface ModuleFlags {
  pharmacy: boolean;
  clinic: boolean;
}

/** Reads the two module switches. Callers should go through lib/modules.ts,
 *  which caches this for the life of a request. */
export async function getModuleFlags(): Promise<ModuleFlags> {
  const res = await db().execute(
    "SELECT module_pharmacy, module_clinic FROM company WHERE id = 1",
  );
  const r = res.rows[0];
  // No company row yet (fresh install): pharmacy on, clinic off — the v1 shape.
  if (!r) return { pharmacy: true, clinic: false };
  return {
    pharmacy: Number(r.module_pharmacy ?? 1) === 1,
    clinic: Number(r.module_clinic ?? 0) === 1,
  };
}

/** Writes both switches. The caller is responsible for refusing to turn the
 *  last one off (lib/modules.ts owns that rule). */
export async function setModuleFlags(flags: ModuleFlags): Promise<void> {
  await db().execute({
    sql: `UPDATE company
             SET module_pharmacy = ?, module_clinic = ?, updated_at = ?
           WHERE id = 1`,
    args: [flags.pharmacy ? 1 : 0, flags.clinic ? 1 : 0, new Date().toISOString()],
  });
}
