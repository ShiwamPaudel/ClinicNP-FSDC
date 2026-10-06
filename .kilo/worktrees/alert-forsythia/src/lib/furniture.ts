/**
 * furniture.ts — what a shop keeps things on, and how big it is.
 *
 * Client-safe, because the floor planner draws a room and the counter draws a
 * map, and neither can import a server-only repo.
 *
 * A kind is mostly a label: the person reading a plan that says "Rack 3" while
 * they are looking at the front counter stops trusting the plan. Two things do
 * hang off it, and only two — a sensible default size when a piece is dropped
 * on the floor, and whether the piece has shelves inside it at all. A door has
 * no shelves; asking somebody which row of a door a medicine is on is asking a
 * question with no answer.
 */

export const FURNITURE_KINDS = [
  "rack",
  "shelf",
  "desk",
  "counter",
  "fridge",
  "door",
] as const;

export type FurnitureKind = (typeof FURNITURE_KINDS)[number];

export const DEFAULT_FURNITURE_KIND: FurnitureKind = "rack";

/** Singular, for a label beside one piece. */
export const FURNITURE_LABEL: Record<FurnitureKind, string> = {
  rack: "Rack",
  shelf: "Shelf",
  desk: "Desk",
  counter: "Counter",
  fridge: "Fridge",
  door: "Door",
};

/** What the add button suggests naming the next one. */
export const FURNITURE_DEFAULT_NAME: Record<FurnitureKind, string> = {
  rack: "Rack",
  shelf: "Shelf",
  desk: "Desk",
  counter: "Counter",
  fridge: "Fridge",
  door: "Door",
};

/**
 * Whether medicines can be put on it.
 *
 * A door and a desk are landmarks: they are on the plan so somebody can read
 * the room, not so something can be stored on them. Anything false here is
 * drawn, named and moved like everything else, and simply never offered as a
 * place to put a medicine.
 */
export const FURNITURE_HOLDS_STOCK: Record<FurnitureKind, boolean> = {
  rack: true,
  shelf: true,
  desk: false,
  counter: true,
  fridge: true,
  door: false,
};

/** Roughly what one is, in centimetres, before anybody drags a handle. */
export const FURNITURE_DEFAULT_SIZE: Record<
  FurnitureKind,
  { widthCm: number; depthCm: number; rows: number; cols: number }
> = {
  rack: { widthCm: 100, depthCm: 45, rows: 4, cols: 3 },
  shelf: { widthCm: 80, depthCm: 30, rows: 3, cols: 2 },
  desk: { widthCm: 140, depthCm: 70, rows: 1, cols: 1 },
  counter: { widthCm: 200, depthCm: 60, rows: 2, cols: 4 },
  fridge: { widthCm: 60, depthCm: 60, rows: 3, cols: 1 },
  door: { widthCm: 90, depthCm: 12, rows: 1, cols: 1 },
};

/**
 * Anything unrecognised reads as a rack rather than throwing. A row written by
 * a newer version of the app should draw as *something* on an older one.
 */
export function asFurnitureKind(v: unknown): FurnitureKind {
  return FURNITURE_KINDS.includes(v as FurnitureKind)
    ? (v as FurnitureKind)
    : DEFAULT_FURNITURE_KIND;
}

export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

export function asRotation(v: unknown): Rotation {
  const n = Number(v);
  return (ROTATIONS as readonly number[]).includes(n) ? (n as Rotation) : 0;
}

/**
 * The footprint a piece actually occupies on the floor.
 *
 * A quarter turn swaps width and depth. Everything that has to know where a
 * piece really is — overlap, the room's bounds, the counter's map — asks this
 * rather than reading width_cm directly, because a rotated rack that still
 * reports its unrotated width is a rack drawn through a wall.
 */
export function footprint(piece: {
  widthCm: number;
  depthCm: number;
  rotation: number;
}): { w: number; h: number } {
  const turned = piece.rotation === 90 || piece.rotation === 270;
  return turned
    ? { w: piece.depthCm, h: piece.widthCm }
    : { w: piece.widthCm, h: piece.depthCm };
}

/** Do two pieces stand in the same place? Touching edges do not count. */
export function overlaps(
  a: { xCm: number; yCm: number; widthCm: number; depthCm: number; rotation: number },
  b: { xCm: number; yCm: number; widthCm: number; depthCm: number; rotation: number },
): boolean {
  const fa = footprint(a);
  const fb = footprint(b);
  return (
    a.xCm < b.xCm + fb.w &&
    b.xCm < a.xCm + fa.w &&
    a.yCm < b.yCm + fb.h &&
    b.yCm < a.yCm + fa.h
  );
}
