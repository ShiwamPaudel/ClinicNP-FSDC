/**
 * racks.ts — the shop floor, and what this shop keeps where.
 *
 * A piece of furniture is a grid of shelves standing somewhere in a room. The
 * position is the whole point: a map drawn in a different order from the shop
 * is slower to read than no map, because the person has to translate it.
 *
 * Position and size are centimetres from the room's top-left corner (0017),
 * not the whole "rack widths" 0011 used. A shop is a room with things at
 * particular places in it — a long shallow counter, a small square fridge, a
 * narrow shelf tucked in a gap — and none of that fits on a grid of identical
 * squares. Integers, because a floor plan does not need half a millimetre.
 *
 * Rows and columns are numbered from 1 and shown as "R2C3". They are not
 * lettered: the person reading it is looking at a shelf across a room, often
 * in a hurry, and digits survive that better than "B3" does.
 *
 * WHERE A MEDICINE IS KEPT LIVES IN `item_locations`, NOT ON THE ITEM (0013).
 * The item master describes a product — Vicks comes in a jar, everywhere in
 * Nepal. Which shelf it sits on is true in one shop only, so a shared
 * catalogue can be imported and refreshed without trampling what a shop
 * arranged. If you find yourself adding a location column to `items`, that is
 * the reason not to.
 */
import "server-only";
import { ulid } from "ulid";
import { db } from "@/lib/db";
import type { Row } from "@/lib/db";
import {
  asFurnitureKind,
  asRotation,
  type FurnitureKind,
  type Rotation,
} from "@/lib/furniture";

export interface Rack {
  id: string;
  name: string;
  kind: FurnitureKind;
  rows: number;
  cols: number;
  /** centimetres from the room's top-left corner */
  xCm: number;
  yCm: number;
  widthCm: number;
  depthCm: number;
  rotation: Rotation;
  note: string;
  active: boolean;
}

export interface RackInput {
  name: string;
  kind: FurnitureKind;
  rows: number;
  cols: number;
  xCm: number;
  yCm: number;
  widthCm: number;
  depthCm: number;
  rotation: Rotation;
  note?: string;
  active?: boolean;
}

/** The smallest and largest a piece of furniture may be, in centimetres. */
export const MIN_SIDE_CM = 10;
export const MAX_SIDE_CM = 2000;

/** Where one item sits. Null cell means the item simply has no shelf. */
export interface ItemCell {
  rackId: string | null;
  row: number | null;
  col: number | null;
}

/** A cell, plus the free-text fallback for a shop that drew no furniture. */
export interface ItemLocation extends ItemCell {
  note: string;
}

export const EMPTY_LOCATION: ItemLocation = {
  rackId: null,
  row: null,
  col: null,
  note: "",
};

export const MAX_RACK_SIDE = 26;

function mapRack(r: Row): Rack {
  return {
    id: r.id as string,
    name: r.name as string,
    kind: asFurnitureKind(r.kind),
    rows: Number(r.rows_count),
    cols: Number(r.cols_count),
    xCm: Number(r.x_cm),
    yCm: Number(r.y_cm),
    widthCm: Number(r.width_cm),
    depthCm: Number(r.depth_cm),
    rotation: asRotation(r.rotation),
    note: (r.note as string) ?? "",
    active: Number(r.active) === 1,
  };
}

/** A cell that is off the end of its rack, or on no rack at all. */
export class BadCellError extends Error {
  code = "bad_cell" as const;
  userMessage: string;
  constructor(userMessage: string) {
    super(userMessage);
    this.userMessage = userMessage;
  }
}

/**
 * Kept so an older client's error path still resolves, and nothing throws it
 * any more. 0011 refused two pieces of furniture in one grid square; 0017
 * removed that constraint, because a shelf tucked under a counter is a real
 * arrangement and the plan has to be able to show it.
 */
export class RackPositionTakenError extends Error {
  code = "rack_position_taken" as const;
  userMessage = "There is already something in that spot.";
}

export async function listRacks(includeInactive = false): Promise<Rack[]> {
  const res = await db().execute(
    includeInactive
      ? "SELECT * FROM racks ORDER BY y_cm, x_cm, name"
      : "SELECT * FROM racks WHERE active = 1 ORDER BY y_cm, x_cm, name",
  );
  return res.rows.map(mapRack);
}

export async function getRack(id: string): Promise<Rack | null> {
  const res = await db().execute({
    sql: "SELECT * FROM racks WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? mapRack(res.rows[0]) : null;
}

function assertSide(n: number, what: string): void {
  if (!Number.isInteger(n) || n < 1 || n > MAX_RACK_SIDE) {
    throw new BadCellError(
      `One piece of furniture can have between 1 and ${MAX_RACK_SIDE} ${what}.`,
    );
  }
}

/** A size the room could actually contain. */
function assertSize(n: number, what: string): void {
  if (!Number.isInteger(n) || n < MIN_SIDE_CM || n > MAX_SIDE_CM) {
    throw new BadCellError(
      `${what} must be between ${MIN_SIDE_CM} and ${MAX_SIDE_CM} cm.`,
    );
  }
}

export async function createRack(input: RackInput): Promise<string> {
  assertSide(input.rows, "rows");
  assertSide(input.cols, "columns");
  assertSize(input.widthCm, "Width");
  assertSize(input.depthCm, "Depth");

  // Two pieces standing in the same place is no longer refused (0017). A shelf
  // tucked under a counter is a real arrangement, and a planner that would not
  // store it would be lying about the room. Overlap is drawn, not blocked.
  const id = ulid();
  const now = new Date().toISOString();
  await db().execute({
    sql: `INSERT INTO racks
            (id, name, kind, rows_count, cols_count, x_cm, y_cm,
             width_cm, depth_cm, rotation, note, active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name.trim(),
      input.kind,
      input.rows,
      input.cols,
      input.xCm,
      input.yCm,
      input.widthCm,
      input.depthCm,
      input.rotation,
      input.note?.trim() ?? "",
      input.active === false ? 0 : 1,
      now,
      now,
    ],
  });
  return id;
}

export async function updateRack(id: string, input: RackInput): Promise<void> {
  assertSide(input.rows, "rows");
  assertSide(input.cols, "columns");

  assertSize(input.widthCm, "Width");
  assertSize(input.depthCm, "Depth");

  // Shrinking can strand items on cells that no longer exist. Say so rather
  // than quietly leaving a medicine pointing at a shelf that is gone.
  const stranded = await db().execute({
    sql: `SELECT COUNT(*) AS n FROM item_locations
          WHERE rack_id = ? AND (rack_row > ? OR rack_col > ?)`,
    args: [id, input.rows, input.cols],
  });
  const n = Number(stranded.rows[0]?.n ?? 0);
  if (n > 0) {
    throw new BadCellError(
      n === 1
        ? "One item is on a shelf that would no longer exist. Move it first."
        : `${n} items are on shelves that would no longer exist. Move them first.`,
    );
  }

  await db().execute({
    sql: `UPDATE racks
             SET name = ?, kind = ?, rows_count = ?, cols_count = ?,
                 x_cm = ?, y_cm = ?, width_cm = ?, depth_cm = ?, rotation = ?,
                 note = ?, active = ?, updated_at = ?
           WHERE id = ?`,
    args: [
      input.name.trim(),
      input.kind,
      input.rows,
      input.cols,
      input.xCm,
      input.yCm,
      input.widthCm,
      input.depthCm,
      input.rotation,
      input.note?.trim() ?? "",
      input.active === false ? 0 : 1,
      new Date().toISOString(),
      id,
    ],
  });
}

/**
 * Save where things now stand, and nothing else.
 *
 * The planner writes this on every drag, resize and turn. It deliberately
 * cannot touch a name, a kind or the grid of shelves inside a piece: moving a
 * rack across the room must never be able to strand a medicine on a shelf
 * number that stopped existing, and the only way to be sure of that is for the
 * move to have no way of changing the shelf numbers.
 */
export async function moveRacks(
  moves: {
    id: string;
    xCm: number;
    yCm: number;
    widthCm: number;
    depthCm: number;
    rotation: Rotation;
  }[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const m of moves) {
    assertSize(m.widthCm, "Width");
    assertSize(m.depthCm, "Depth");
    await db().execute({
      sql: `UPDATE racks
               SET x_cm = ?, y_cm = ?, width_cm = ?, depth_cm = ?,
                   rotation = ?, updated_at = ?
             WHERE id = ?`,
      args: [m.xCm, m.yCm, m.widthCm, m.depthCm, m.rotation, now, m.id],
    });
  }
}

/** How many medicines sit on each piece, keyed by rack id. */
export async function rackItemCounts(): Promise<Record<string, number>> {
  const res = await db().execute(
    `SELECT rack_id, COUNT(*) AS n FROM item_locations
      WHERE rack_id IS NOT NULL GROUP BY rack_id`,
  );
  const out: Record<string, number> = {};
  for (const r of res.rows) out[r.rack_id as string] = Number(r.n);
  return out;
}

export async function rackItemCount(id: string): Promise<number> {
  const res = await db().execute({
    sql: "SELECT COUNT(*) AS n FROM item_locations WHERE rack_id = ?",
    args: [id],
  });
  return Number(res.rows[0]?.n ?? 0);
}

/**
 * Remove a piece of furniture. Items standing on it lose their cell but keep
 * a written note if they had one — and a location row that ends up holding
 * neither is deleted, because "no row" is how this table says nobody has
 * decided yet.
 */
export async function deleteRack(id: string): Promise<void> {
  await db().batch([
    {
      sql: `UPDATE item_locations
               SET rack_id = NULL, rack_row = NULL, rack_col = NULL, updated_at = ?
             WHERE rack_id = ?`,
      args: [new Date().toISOString(), id],
    },
    {
      sql: "DELETE FROM item_locations WHERE rack_id IS NULL AND trim(note) = ''",
      args: [],
    },
    { sql: "DELETE FROM racks WHERE id = ?", args: [id] },
  ]);
}

/**
 * Check a cell before anything is written.
 *
 * Several screens put medicines on shelves — the shelf plan under Stock, and
 * whatever imports a price list next — so they all come through here and a
 * rule added once is a rule everywhere. Returns the normalised cell, with a
 * null rack meaning no shelf.
 */
export async function assertCellFits(cell: ItemCell): Promise<ItemCell> {
  if (cell.rackId === null || cell.rackId === "") {
    return { rackId: null, row: null, col: null };
  }
  const rack = await getRack(cell.rackId);
  if (!rack) throw new BadCellError("That rack no longer exists.");
  const { row, col } = cell;
  if (row === null || col === null) {
    throw new BadCellError("Choose a row and a column, or no rack at all.");
  }
  if (row < 1 || row > rack.rows || col < 1 || col > rack.cols) {
    throw new BadCellError(
      `${rack.name} has ${rack.rows} rows and ${rack.cols} columns, so R${row}C${col} is not on it.`,
    );
  }
  return { rackId: rack.id, row, col };
}

/** Where one item is kept. Never null — "nowhere" is a real answer. */
export async function getItemLocation(itemId: string): Promise<ItemLocation> {
  const res = await db().execute({
    sql: "SELECT * FROM item_locations WHERE item_id = ?",
    args: [itemId],
  });
  const r = res.rows[0];
  if (!r) return EMPTY_LOCATION;
  return {
    rackId: (r.rack_id as string | null) ?? null,
    row: r.rack_row === null ? null : Number(r.rack_row),
    col: r.rack_col === null ? null : Number(r.rack_col),
    note: (r.note as string) ?? "",
  };
}

/**
 * Put an item somewhere, or nowhere.
 *
 * A location holding neither a cell nor a note is deleted rather than stored:
 * an empty row and no row would mean the same thing, and two ways to say one
 * thing is how reports start disagreeing.
 */
export async function setItemLocation(
  itemId: string,
  input: ItemLocation,
): Promise<void> {
  const cell = await assertCellFits(input);
  const note = input.note.trim();
  const now = new Date().toISOString();

  if (cell.rackId === null && note === "") {
    await db().execute({
      sql: "DELETE FROM item_locations WHERE item_id = ?",
      args: [itemId],
    });
    return;
  }

  await db().execute({
    sql: `INSERT INTO item_locations
            (id, item_id, rack_id, rack_row, rack_col, note, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(item_id) DO UPDATE SET
            rack_id = excluded.rack_id,
            rack_row = excluded.rack_row,
            rack_col = excluded.rack_col,
            note = excluded.note,
            updated_at = excluded.updated_at`,
    args: [ulid(), itemId, cell.rackId, cell.row, cell.col, note, now, now],
  });
}

// Re-exported so server callers can keep importing it from the repo, while the
// counter — which cannot import a server-only module — reads the same function.
export { cellLabel } from "@/lib/rack-label";

export interface ShelfItem {
  itemId: string;
  brandName: string;
  genericName: string;
}

/** Everything standing on one cell, for the shelf view. */
export async function itemsOnCell(
  rackId: string,
  row: number,
  col: number,
): Promise<ShelfItem[]> {
  const res = await db().execute({
    sql: `SELECT i.id, i.brand_name, i.generic_name
            FROM item_locations l JOIN items i ON i.id = l.item_id
           WHERE l.rack_id = ? AND l.rack_row = ? AND l.rack_col = ?
             AND i.active = 1
           ORDER BY i.brand_name`,
    args: [rackId, row, col],
  });
  return res.rows.map((r) => ({
    itemId: r.id as string,
    brandName: r.brand_name as string,
    genericName: (r.generic_name as string) ?? "",
  }));
}

/** How many items stand on each cell, for the map. */
export async function cellCounts(): Promise<
  Record<string, Record<string, number>>
> {
  const res = await db().execute(
    `SELECT l.rack_id, l.rack_row, l.rack_col, COUNT(*) AS n
       FROM item_locations l JOIN items i ON i.id = l.item_id
      WHERE l.rack_id IS NOT NULL AND i.active = 1
      GROUP BY l.rack_id, l.rack_row, l.rack_col`,
  );
  const out: Record<string, Record<string, number>> = {};
  for (const r of res.rows) {
    const rackId = r.rack_id as string;
    const cells = (out[rackId] ??= {});
    cells[`${Number(r.rack_row)}:${Number(r.rack_col)}`] = Number(r.n);
  }
  return out;
}

/**
 * One row per active item, in the order a person walks the shop: piece by
 * piece across the floor, then down each one, then across each shelf. Items
 * with no place sort last, because during setup they are the list of work
 * remaining rather than somewhere to visit.
 */
export interface ShelfRow {
  itemId: string;
  brandName: string;
  genericName: string;
  category: string;
  /** the free-text note, for a shop that has drawn no furniture */
  shelfNote: string;
  rackId: string | null;
  rackName: string | null;
  rackKind: FurnitureKind | null;
  row: number | null;
  col: number | null;
}

export async function shelfRows(): Promise<ShelfRow[]> {
  const res = await db().execute(
    `SELECT i.id, i.brand_name, i.generic_name, i.category,
            COALESCE(l.note, '') AS shelf_note,
            l.rack_id, l.rack_row, l.rack_col,
            r.name AS rack_name, r.kind AS rack_kind
       FROM items i
       LEFT JOIN item_locations l ON l.item_id = i.id
       LEFT JOIN racks r ON r.id = l.rack_id
      WHERE i.active = 1
      ORDER BY (l.rack_id IS NULL), r.y_cm, r.x_cm, r.name,
               l.rack_row, l.rack_col, i.brand_name`,
  );
  return res.rows.map((r) => ({
    itemId: r.id as string,
    brandName: r.brand_name as string,
    genericName: (r.generic_name as string) ?? "",
    category: (r.category as string) ?? "",
    shelfNote: (r.shelf_note as string) ?? "",
    rackId: (r.rack_id as string | null) ?? null,
    rackName: (r.rack_name as string | null) ?? null,
    rackKind: r.rack_kind === null ? null : asFurnitureKind(r.rack_kind),
    row: r.rack_row === null ? null : Number(r.rack_row),
    col: r.rack_col === null ? null : Number(r.rack_col),
  }));
}

/** Every item's location in one map, for the catalog snapshot. */
export async function allItemLocations(): Promise<Map<string, ItemLocation>> {
  const res = await db().execute("SELECT * FROM item_locations");
  const out = new Map<string, ItemLocation>();
  for (const r of res.rows) {
    out.set(r.item_id as string, {
      rackId: (r.rack_id as string | null) ?? null,
      row: r.rack_row === null ? null : Number(r.rack_row),
      col: r.rack_col === null ? null : Number(r.rack_col),
      note: (r.note as string) ?? "",
    });
  }
  return out;
}
