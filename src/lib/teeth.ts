/**
 * teeth.ts — the tooth chart's numbering and vocabulary (C-037, 0025).
 *
 * FDI two-digit numbering, the one used in Nepal: the first digit is the
 * quadrant (1 upper right, 2 upper left, 3 lower left, 4 lower right; 5–8 the
 * same for primary teeth), the second the tooth counted from the midline.
 * The chart is drawn as the dentist faces the patient, so the patient's right
 * is on the left of the screen.
 *
 * Pure: shared by the chart, the server action and the tests.
 */

export const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
export const PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

const ALL = new Set([...PERMANENT_UPPER, ...PERMANENT_LOWER, ...PRIMARY_UPPER, ...PRIMARY_LOWER]);

export function isTooth(n: number): boolean {
  return ALL.has(n);
}

export function isPrimary(n: number): boolean {
  return n >= 51;
}

const QUADRANT = ["", "upper right", "upper left", "lower left", "lower right"];
const NAMES_PERMANENT = ["", "central incisor", "lateral incisor", "canine", "first premolar", "second premolar", "first molar", "second molar", "third molar"];
const NAMES_PRIMARY = ["", "central incisor", "lateral incisor", "canine", "first molar", "second molar"];

/** "36 · lower left first molar", "54 · upper right first molar (milk)" */
export function toothName(n: number): string {
  const q = Math.floor(n / 10);
  const t = n % 10;
  const primary = q >= 5;
  const quadrant = QUADRANT[primary ? q - 4 : q] ?? "";
  const name = (primary ? NAMES_PRIMARY : NAMES_PERMANENT)[t] ?? "";
  return `${n} · ${quadrant} ${name}${primary ? " (milk)" : ""}`;
}

/** Surfaces a finding can be on. Incisal stands in for occlusal on front teeth. */
export const SURFACES = [
  { key: "M", label: "Mesial" },
  { key: "O", label: "Occlusal / incisal" },
  { key: "D", label: "Distal" },
  { key: "B", label: "Buccal / labial" },
  { key: "L", label: "Lingual / palatal" },
] as const;

export function cleanSurfaces(text: string): string {
  const order = "MODBL";
  const keep = new Set(text.toUpperCase().split("").filter((c) => order.includes(c)));
  return order.split("").filter((c) => keep.has(c)).join("");
}

/** What a tooth can be marked as. `tone` picks its colour on the chart. */
export const CONDITIONS = [
  { key: "healthy", label: "Healthy", tone: "ok" },
  { key: "caries", label: "Caries", tone: "danger" },
  { key: "filled", label: "Filled", tone: "info" },
  { key: "rct", label: "Root canal done", tone: "magenta" },
  { key: "crown", label: "Crown", tone: "warn" },
  { key: "bridge", label: "Bridge", tone: "warn" },
  { key: "implant", label: "Implant", tone: "clinic" },
  { key: "fractured", label: "Fractured", tone: "danger" },
  { key: "mobile", label: "Mobile", tone: "warn" },
  { key: "impacted", label: "Impacted", tone: "sage" },
  { key: "to_extract", label: "To extract", tone: "danger" },
  { key: "missing", label: "Missing / extracted", tone: "gone" },
  { key: "watch", label: "Watch", tone: "sage" },
] as const;

export type ToothCondition = (typeof CONDITIONS)[number]["key"];

const CONDITION_KEYS = new Set<string>(CONDITIONS.map((c) => c.key));

export function isCondition(key: string): key is ToothCondition {
  return CONDITION_KEYS.has(key);
}

export function conditionLabel(key: string): string {
  return CONDITIONS.find((c) => c.key === key)?.label ?? key;
}

export interface ToothRecord {
  id: string;
  tooth: number;
  condition: string;
  surfaces: string;
  note: string;
  dateBs: string;
  dateAd: string;
  createdAt: string;
  userName: string;
  voided: boolean;
}

/**
 * Each tooth's state now: its latest record that has not been undone. Latest
 * is by the date it was for, then by when it was typed.
 */
export function currentTeeth(records: ToothRecord[]): Map<number, ToothRecord> {
  const out = new Map<number, ToothRecord>();
  for (const r of records) {
    if (r.voided) continue;
    const prev = out.get(r.tooth);
    if (
      !prev ||
      r.dateAd > prev.dateAd ||
      (r.dateAd === prev.dateAd && r.createdAt > prev.createdAt)
    ) {
      out.set(r.tooth, r);
    }
  }
  return out;
}
