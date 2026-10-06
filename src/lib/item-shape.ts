/**
 * item-shape.ts — the visual form an item is sold in, chosen when the item is
 * created. Drives the pictorial unit art at the counter. Pure + shared by
 * client, server and validators.
 */
export type ItemShape =
  | "capsule"
  | "tablet"
  | "strip"
  | "bottle"
  | "box"
  | "tube"
  | "sachet"
  | "drops"
  | "vial";

export const ITEM_SHAPE_KEYS: ItemShape[] = [
  "capsule",
  "tablet",
  "strip",
  "bottle",
  "box",
  "tube",
  "sachet",
  "drops",
  "vial",
];

export const ITEM_SHAPES: { key: ItemShape; label: string }[] = [
  { key: "capsule", label: "Capsule" },
  { key: "tablet", label: "Tablet" },
  { key: "strip", label: "Blister strip" },
  { key: "bottle", label: "Bottle / Syrup" },
  { key: "box", label: "Box" },
  { key: "tube", label: "Tube" },
  { key: "sachet", label: "Sachet" },
  { key: "drops", label: "Drops" },
  { key: "vial", label: "Vial / Injection" },
];

export const DEFAULT_ITEM_SHAPE: ItemShape = "tablet";

export function isItemShape(x: unknown): x is ItemShape {
  return typeof x === "string" && (ITEM_SHAPE_KEYS as string[]).includes(x);
}

export function asItemShape(x: unknown): ItemShape {
  return isItemShape(x) ? x : DEFAULT_ITEM_SHAPE;
}

/**
 * What kind of container a given unit level represents, for the pictorial view.
 * Inferred from the unit's name (falls back to its position in the hierarchy).
 */
export type PackKind = "loose" | "strip" | "box" | "bottle";

export function packKindForUnit(
  name: string,
  level: number,
  shape: ItemShape,
): PackKind {
  const n = name.trim().toLowerCase();
  if (/strip|blister/.test(n)) return "strip";
  if (/box|carton|pkt|packet|pack/.test(n)) return "box";
  if (/bottle|btl|jar/.test(n)) return "bottle";
  if (level === 0) {
    // the base unit is drawn as itself (loose), unless it IS a container shape
    if (shape === "bottle" || shape === "vial" || shape === "drops") return "bottle";
    if (shape === "box") return "box";
    return "loose";
  }
  // higher, un-named levels: treat as boxes
  return "box";
}
