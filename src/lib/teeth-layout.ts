/**
 * teeth-layout.ts — where each tooth sits on the drawn chart (C-039).
 *
 * The chart is an occlusal view, as the dentist looks into the mouth: the
 * upper arch a U opening downwards, the lower arch a U opening upwards, the
 * patient's right on the left of the screen. Each arch side is a quarter of
 * an ellipse, from the midline round to the back; the teeth are laid along it
 * by arc length, each as wide as a real tooth of its kind is in proportion,
 * and turned to face out of the arch.
 *
 * Pure numbers: the chart draws them, the tests check them.
 */
import { isPrimary } from "@/lib/teeth";

export type ToothKind = "incisor" | "canine" | "premolar" | "molar";

export function toothKind(n: number): ToothKind {
  const t = n % 10;
  if (t <= 2) return "incisor";
  if (t === 3) return "canine";
  if (isPrimary(n)) return "molar";
  return t <= 5 ? "premolar" : "molar";
}

// Mesiodistal width and buccolingual depth, in millimetres, by position from
// the midline (index 0 = central incisor). Only their proportions are used.
const SIZE = {
  permanentUpper: { w: [8.5, 6.5, 7.5, 7, 6.5, 10, 9, 8.5], d: [7, 6, 8, 9, 9, 11, 11, 10] },
  permanentLower: { w: [5.2, 5.8, 6.8, 7, 7.2, 11, 10.5, 10], d: [6, 6.2, 7.5, 7.8, 8.2, 10.5, 10, 9.5] },
  primaryUpper: { w: [6.5, 5.2, 7, 7.3, 8.2], d: [5.2, 4.8, 6.2, 8.5, 9.5] },
  primaryLower: { w: [4.2, 4.6, 5.6, 7.7, 9.9], d: [4.2, 4.4, 5.6, 7.2, 8.7] },
};

export interface PlacedTooth {
  tooth: number;
  kind: ToothKind;
  /** centre of the tooth */
  x: number;
  y: number;
  /** degrees; the tooth's own x axis runs along the arch, away from the midline */
  angle: number;
  /** true when the tooth's own y axis must be mirrored to point out of the arch */
  flip: boolean;
  /** width along the arch and depth across it, in chart units */
  w: number;
  d: number;
  /** where its number is written */
  labelX: number;
  labelY: number;
}

export interface ArchSpec {
  /** centre of the ellipse; the back teeth end level with it */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  upper: boolean;
  /** the numbers outside the arch, or inside it (milk teeth inside adult ones) */
  labelsInside?: boolean;
  gap?: number;
}

const QUARTER = Math.PI / 2;
const SAMPLES = 240;

/** One side of one arch: `teeth` from the midline backwards, `side` −1 = screen left. */
function placeSide(teeth: number[], size: { w: number[]; d: number[] }, a: ArchSpec, side: -1 | 1): PlacedTooth[] {
  const gap = a.gap ?? 2;
  const point = (t: number) => ({
    x: a.cx + side * a.rx * Math.sin(t),
    y: a.upper ? a.cy - a.ry * Math.cos(t) : a.cy + a.ry * Math.cos(t),
  });

  // arc length along the quarter, sampled
  const ts: number[] = [];
  const ss: number[] = [];
  let s = 0;
  let prev = point(0);
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (QUARTER * i) / SAMPLES;
    const p = point(t);
    s += Math.hypot(p.x - prev.x, p.y - prev.y);
    ts.push(t);
    ss.push(s);
    prev = p;
  }
  const length = s;
  const tAt = (target: number) => {
    let i = 1;
    while (i < ss.length - 1 && ss[i]! < target) i++;
    const s0 = ss[i - 1]!;
    const s1 = ss[i]!;
    const f = s1 === s0 ? 0 : (target - s0) / (s1 - s0);
    return ts[i - 1]! + f * (ts[i]! - ts[i - 1]!);
  };

  const widths = teeth.map((_, i) => size.w[i]!);
  const scale = (length - gap * teeth.length) / widths.reduce((x, y) => x + y, 0);

  const out: PlacedTooth[] = [];
  let along = gap / 2; // half a gap each side of the midline
  teeth.forEach((tooth, i) => {
    const w = widths[i]! * scale;
    const d = size.d[i]! * scale;
    const t = tAt(along + w / 2);
    along += w + gap;
    const p = point(t);

    // tangent pointing away from the midline, and the outward normal
    const tx = side * a.rx * Math.cos(t);
    const ty = (a.upper ? 1 : -1) * a.ry * Math.sin(t);
    let nx = (p.x - a.cx) / (a.rx * a.rx);
    let ny = (p.y - a.cy) / (a.ry * a.ry);
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const angle = (Math.atan2(ty, tx) * 180) / Math.PI;
    const rad = (angle * Math.PI) / 180;
    // after rotate(angle) the tooth's y axis points along (−sin, cos)
    const flip = -Math.sin(rad) * nx + Math.cos(rad) * ny < 0;

    const out_ = a.labelsInside ? -1 : 1;
    const reach = d / 2 + 10;
    out.push({
      tooth,
      kind: toothKind(tooth),
      x: p.x,
      y: p.y,
      angle,
      flip,
      w,
      d,
      labelX: p.x + out_ * nx * reach,
      labelY: p.y + out_ * ny * reach,
    });
  });
  return out;
}

/** Both sides of an arch. The quadrant digit decides the side and the sizes. */
export function placeArch(right: number[], left: number[], a: ArchSpec): PlacedTooth[] {
  const primary = isPrimary(right[0]!);
  const size = primary
    ? a.upper ? SIZE.primaryUpper : SIZE.primaryLower
    : a.upper ? SIZE.permanentUpper : SIZE.permanentLower;
  // the patient's right is the screen's left
  return [...placeSide(right, size, a, -1), ...placeSide(left, size, a, 1)];
}

/** The drawing's size and where the arches sit in it. */
export const CHART = { width: 420, height: 482, cx: 210, upperCy: 212, lowerCy: 270 } as const;

/** Each arch side from the midline backwards. */
export const ARCH_TEETH = {
  permanentUpper: { right: [11, 12, 13, 14, 15, 16, 17, 18], left: [21, 22, 23, 24, 25, 26, 27, 28] },
  permanentLower: { right: [41, 42, 43, 44, 45, 46, 47, 48], left: [31, 32, 33, 34, 35, 36, 37, 38] },
  primaryUpper: { right: [51, 52, 53, 54, 55], left: [61, 62, 63, 64, 65] },
  primaryLower: { right: [81, 82, 83, 84, 85], left: [71, 72, 73, 74, 75] },
} as const;

/** Adult teeth on the outer arch; milk teeth on their own, or inside the adult ones. */
export function chartLayout(which: "permanent" | "primary" | "both"): PlacedTooth[] {
  const { cx, upperCy, lowerCy } = CHART;
  const out: PlacedTooth[] = [];
  if (which !== "primary") {
    const a = { cx, rx: 150, ry: 175 };
    out.push(
      ...placeArch([...ARCH_TEETH.permanentUpper.right], [...ARCH_TEETH.permanentUpper.left], { ...a, cy: upperCy, upper: true }),
      ...placeArch([...ARCH_TEETH.permanentLower.right], [...ARCH_TEETH.permanentLower.left], { ...a, cy: lowerCy, upper: false }),
    );
  }
  if (which !== "permanent") {
    const inside = which === "both";
    const a = inside ? { cx, rx: 92, ry: 110, labelsInside: true } : { cx, rx: 112, ry: 132 };
    out.push(
      ...placeArch([...ARCH_TEETH.primaryUpper.right], [...ARCH_TEETH.primaryUpper.left], { ...a, cy: upperCy, upper: true }),
      ...placeArch([...ARCH_TEETH.primaryLower.right], [...ARCH_TEETH.primaryLower.left], { ...a, cy: lowerCy, upper: false }),
    );
  }
  return out;
}
