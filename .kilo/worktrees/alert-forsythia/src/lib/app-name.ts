/**
 * app-name.ts — the product name is DERIVED from the enabled modules and is
 * never stored as a setting (D-025, PRD §3.3):
 *
 *   clinic on                 -> "ClinicNP"
 *   clinic off, pharmacy on   -> "Faarma"
 *
 * "Faarma" survives here and nowhere else in the product; the original 2019 name
 * is retired entirely (Rules.md §0.3). Pure and dependency-free, so both the
 * server and the counter bundle can import it.
 */

export interface ModuleFlags {
  pharmacy: boolean;
  clinic: boolean;
}

/** The name shown when the Clinic module is on. */
export const CLINIC_APP_NAME = "ClinicNP";
/** The name shown for a pharmacy-only install. */
export const PHARMACY_APP_NAME = "Faarma";

/** Default until the module flags have been read (first customer runs clinic on). */
export const DEFAULT_APP_NAME = CLINIC_APP_NAME;

export function appNameFor(modules: ModuleFlags): string {
  return modules.clinic ? CLINIC_APP_NAME : PHARMACY_APP_NAME;
}

/** One-line description for metadata, the manifest and the PWA install prompt. */
export function appDescriptionFor(modules: ModuleFlags): string {
  if (modules.clinic && modules.pharmacy) {
    return "Clinic and pharmacy billing, patients and stock";
  }
  if (modules.clinic) return "Clinic billing, patients and visits";
  return "Pharmacy billing & stock for Nepali retail pharmacies";
}

/** The title suffix: names only the halves that are actually switched on. */
export function appSubtitleFor(modules: ModuleFlags): string {
  if (modules.clinic && modules.pharmacy) return "Clinic & Pharmacy Management";
  if (modules.clinic) return "Clinic Management";
  return "Pharmacy Management";
}
