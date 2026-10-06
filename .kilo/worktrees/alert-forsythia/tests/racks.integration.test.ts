/**
 * The shop floor, and what this shop keeps where.
 *
 * Two things this suite exists to hold down.
 *
 * First, the link. The rack map shipped once with no way to put a medicine on
 * it, and these tests are mostly about the ways that link comes apart: a shelf
 * off the end of its furniture, a rack that shrinks under the items standing
 * on it, a rack renamed while a counter still shows the old name from its
 * offline cache.
 *
 * Second, and more importantly: WHERE A MEDICINE IS KEPT IS NOT PART OF WHAT
 * THE MEDICINE IS. `items` is the product catalogue — Vicks comes in a jar, in
 * every pharmacy in Nepal — and 0013 moved location out of it into
 * `item_locations` so a shared catalogue could be imported without trampling
 * what a shop arranged. The last test in this file fails the moment somebody
 * puts a location column back on `items`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@libsql/client";
import { readFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, `racks.${process.pid}-${Date.now()}.db`);

function split(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${DB_FILE}${suffix}`, { force: true });
    } catch {
      // a lingering handle on Windows — the unique name makes it harmless
    }
  }
});

beforeAll(async () => {
  process.env.TURSO_DATABASE_URL = `file:${DB_FILE}`;
  const { __resetDbForTests } = await import("@/lib/db");
  __resetDbForTests();
  for (const s of ["", "-wal", "-shm"]) rmSync(`${DB_FILE}${s}`, { force: true });

  const c = createClient({ url: `file:${DB_FILE}` });
  const migrations = join(__dirname, "..", "db", "migrations");
  for (const f of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    for (const stmt of split(readFileSync(join(migrations, f), "utf8"))) {
      await c.execute(stmt);
    }
  }
  c.close();
});

/** A minimal sellable item; the units are the smallest legal hierarchy. */
async function makeItem(brandName: string) {
  const { createItem } = await import("@/lib/repos/items");
  return createItem({
    brandName,
    genericName: `${brandName} generic`,
    category: "Medicine",
    manufacturer: "",
    minStockBaseQty: 0,
    controlledFlag: false,
    preferredSupplierId: null,
    active: true,
    shape: "tablet",
    units: [
      {
        level: 0,
        name: "Tablet",
        factorToBase: 1,
        sellingRatePaisa: 100,
        isDefaultSelling: true,
      },
    ],
  });
}

/** An item already standing somewhere. */
async function makeItemAt(
  brandName: string,
  cell: { rackId: string; row: number; col: number },
) {
  const { setItemLocation } = await import("@/lib/repos/racks");
  const id = await makeItem(brandName);
  await setItemLocation(id, { ...cell, note: "" });
  return id;
}

describe("racks, shelves and desks", () => {
  it("remembers what kind of thing each one is", async () => {
    const { createRack, getRack } = await import("@/lib/repos/racks");

    const rack = await createRack({
      name: "Rack 1", kind: "rack", rows: 4, cols: 5, xCm: 0, yCm: 0, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const shelf = await createRack({
      name: "Window shelf", kind: "shelf", rows: 1, cols: 6, xCm: 100, yCm: 0, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const desk = await createRack({
      name: "Front desk", kind: "desk", rows: 2, cols: 4, xCm: 200, yCm: 0, widthCm: 100, depthCm: 45, rotation: 0,
    });

    expect((await getRack(rack))?.kind).toBe("rack");
    expect((await getRack(shelf))?.kind).toBe("shelf");
    expect((await getRack(desk))?.kind).toBe("desk");
  });

  it("reads an unknown kind as a rack rather than breaking the map", async () => {
    // A row written by a newer version must still draw as something. There is
    // deliberately no CHECK on the column, so this is the only guard.
    const { createRack, getRack } = await import("@/lib/repos/racks");
    const id = await createRack({
      name: "From the future", kind: "rack", rows: 1, cols: 1, xCm: 800, yCm: 800, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const c = createClient({ url: `file:${DB_FILE}` });
    await c.execute({
      sql: "UPDATE racks SET kind = 'hovercraft' WHERE id = ?",
      args: [id],
    });
    c.close();
    expect((await getRack(id))?.kind).toBe("rack");
  });

  it("lets two things stand in the same spot, because rooms are like that", async () => {
    // 0011 refused this outright. 0017 allows it: a shelf tucked under a
    // counter is a real arrangement, and a planner that would not store it
    // would be lying about the room. Overlap is drawn, not refused.
    const { createRack, listRacks } = await import("@/lib/repos/racks");
    await createRack({
      name: "First", kind: "rack", rows: 1, cols: 1,
      xCm: 2000, yCm: 2000, widthCm: 100, depthCm: 45, rotation: 0,
    });
    await createRack({
      name: "Second", kind: "desk", rows: 1, cols: 1,
      xCm: 2000, yCm: 2000, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const both = (await listRacks(true)).filter((r) => r.xCm === 2000 && r.yCm === 2000);
    expect(both).toHaveLength(2);
  });
});

describe("putting a medicine somewhere", () => {
  it("saves the cell against the item and reads it back", async () => {
    const { createRack, getItemLocation } = await import("@/lib/repos/racks");
    const rackId = await createRack({
      name: "Rack A", kind: "rack", rows: 4, cols: 5, xCm: 300, yCm: 0, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const itemId = await makeItemAt("Cetamol", { rackId, row: 2, col: 3 });

    expect(await getItemLocation(itemId)).toEqual({
      rackId,
      row: 2,
      col: 3,
      note: "",
    });
  });

  it("refuses a shelf that is off the end of the furniture", async () => {
    const { createRack, assertCellFits, BadCellError } = await import(
      "@/lib/repos/racks"
    );
    const rackId = await createRack({
      name: "Small", kind: "shelf", rows: 2, cols: 2, xCm: 500, yCm: 500, widthCm: 100, depthCm: 45, rotation: 0,
    });

    await expect(
      assertCellFits({ rackId, row: 3, col: 1 }),
    ).rejects.toBeInstanceOf(BadCellError);
    await expect(
      assertCellFits({ rackId, row: 1, col: 9 }),
    ).rejects.toBeInstanceOf(BadCellError);
    await expect(assertCellFits({ rackId, row: 2, col: 2 })).resolves.toEqual({
      rackId,
      row: 2,
      col: 2,
    });
  });

  it("names the thing when it refuses, because there are several", async () => {
    const { createRack, assertCellFits } = await import("@/lib/repos/racks");
    const rackId = await createRack({
      name: "By the window", kind: "shelf", rows: 2, cols: 2, xCm: 700, yCm: 500, widthCm: 100, depthCm: 45, rotation: 0,
    });
    await expect(assertCellFits({ rackId, row: 5, col: 5 })).rejects.toThrow(
      /By the window/,
    );
  });

  it("refuses a rack chosen without a shelf, rather than dropping it", async () => {
    const { createRack, assertCellFits, BadCellError } = await import(
      "@/lib/repos/racks"
    );
    const rackId = await createRack({
      name: "Half-answered", kind: "rack", rows: 3, cols: 3, xCm: 600, yCm: 500, widthCm: 100, depthCm: 45, rotation: 0,
    });
    // Somebody picked the rack and was interrupted. Storing no shelf at all
    // would lose their intent without saying so.
    await expect(
      assertCellFits({ rackId, row: null, col: null }),
    ).rejects.toBeInstanceOf(BadCellError);
  });

  it("keeps a written note for a shop that has drawn nothing", async () => {
    const { setItemLocation, getItemLocation } = await import(
      "@/lib/repos/racks"
    );
    const itemId = await makeItem("Loose stock");
    await setItemLocation(itemId, {
      rackId: null,
      row: null,
      col: null,
      note: "behind the counter",
    });
    expect((await getItemLocation(itemId)).note).toBe("behind the counter");
  });

  it("stores no row at all when there is neither a cell nor a note", async () => {
    // "No row" and "an empty row" would mean the same thing, and two ways to
    // say one thing is how two screens start disagreeing.
    const { setItemLocation, getItemLocation } = await import(
      "@/lib/repos/racks"
    );
    const itemId = await makeItem("Nowhere");
    await setItemLocation(itemId, {
      rackId: null, row: null, col: null, note: "somewhere",
    });
    await setItemLocation(itemId, {
      rackId: null, row: null, col: null, note: "  ",
    });

    const c = createClient({ url: `file:${DB_FILE}` });
    const rows = await c.execute({
      sql: "SELECT COUNT(*) AS n FROM item_locations WHERE item_id = ?",
      args: [itemId],
    });
    c.close();
    expect(Number(rows.rows[0]!.n)).toBe(0);
    expect(await getItemLocation(itemId)).toEqual({
      rackId: null, row: null, col: null, note: "",
    });
  });

  it("moves an item from one shelf to another without leaving it on both", async () => {
    const { createRack, setItemLocation, itemsOnCell } = await import(
      "@/lib/repos/racks"
    );
    const rackId = await createRack({
      name: "Two shelves", kind: "rack", rows: 3, cols: 3, xCm: 1100, yCm: 1100, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const itemId = await makeItemAt("Mover", { rackId, row: 1, col: 1 });
    await setItemLocation(itemId, { rackId, row: 3, col: 3, note: "" });

    expect(await itemsOnCell(rackId, 1, 1)).toHaveLength(0);
    expect((await itemsOnCell(rackId, 3, 3)).map((i) => i.brandName)).toEqual([
      "Mover",
    ]);
  });

  it("takes an item off its shelf without touching anything else", async () => {
    const { createRack, setItemLocation, getItemLocation } = await import(
      "@/lib/repos/racks"
    );
    const { getItem } = await import("@/lib/repos/items");

    const rackId = await createRack({
      name: "Rack 9", kind: "rack", rows: 2, cols: 2, xCm: 900, yCm: 900, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const itemId = await makeItemAt("Removable", { rackId, row: 1, col: 1 });

    await setItemLocation(itemId, {
      rackId: null, row: null, col: null, note: "",
    });
    expect((await getItemLocation(itemId)).rackId).toBeNull();

    // Still a perfectly good medicine.
    const item = await getItem(itemId);
    expect(item?.brandName).toBe("Removable");
    expect(item?.active).toBe(true);
    expect(item?.units).toHaveLength(1);
  });
});

describe("furniture that changes under the things standing on it", () => {
  it("refuses to shrink something that would strand an item", async () => {
    const { createRack, updateRack, BadCellError } = await import(
      "@/lib/repos/racks"
    );
    const rackId = await createRack({
      name: "Shrinking", kind: "rack", rows: 4, cols: 4, xCm: 100, yCm: 100, widthCm: 100, depthCm: 45, rotation: 0,
    });
    await makeItemAt("Stranded", { rackId, row: 4, col: 4 });

    await expect(
      updateRack(rackId, {
        name: "Shrinking", kind: "rack", rows: 2, cols: 2,
        xCm: 100, yCm: 100, widthCm: 100, depthCm: 45, rotation: 0, active: true,
      }),
    ).rejects.toBeInstanceOf(BadCellError);

    // Growing is always fine.
    await updateRack(rackId, {
      name: "Shrinking", kind: "rack", rows: 6, cols: 6,
      xCm: 100, yCm: 100, widthCm: 100, depthCm: 45, rotation: 0, active: true,
    });
  });

  it("leaves items intact when their rack is deleted", async () => {
    const { createRack, deleteRack, getItemLocation } = await import(
      "@/lib/repos/racks"
    );
    const { getItem } = await import("@/lib/repos/items");

    const rackId = await createRack({
      name: "Doomed", kind: "desk", rows: 2, cols: 2, xCm: 200, yCm: 200, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const itemId = await makeItemAt("Survivor", { rackId, row: 1, col: 2 });

    await deleteRack(rackId);
    const item = await getItem(itemId);
    expect(item?.brandName).toBe("Survivor");
    expect(await getItemLocation(itemId)).toEqual({
      rackId: null, row: null, col: null, note: "",
    });
  });

  it("keeps a written note when the furniture under it goes", async () => {
    const { createRack, deleteRack, setItemLocation, getItemLocation } =
      await import("@/lib/repos/racks");
    const rackId = await createRack({
      name: "Also doomed", kind: "rack", rows: 2, cols: 2, xCm: 1200, yCm: 1200, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const itemId = await makeItem("Noted");
    await setItemLocation(itemId, {
      rackId, row: 1, col: 1, note: "top of the fridge",
    });

    await deleteRack(rackId);
    // The cell is gone; what somebody wrote down is not.
    expect(await getItemLocation(itemId)).toEqual({
      rackId: null, row: null, col: null, note: "top of the fridge",
    });
  });
});

describe("what the counter is told", () => {
  it("changes the catalog version when furniture is merely renamed", async () => {
    const { createRack, updateRack } = await import("@/lib/repos/racks");
    const { catalogVersion } = await import("@/lib/repos/batches");

    const rackId = await createRack({
      name: "Front", kind: "rack", rows: 2, cols: 2, xCm: 3000, yCm: 3000, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const before = await catalogVersion();

    // Renaming touches no item and no stock move.
    await new Promise((r) => setTimeout(r, 5));
    await updateRack(rackId, {
      name: "Fridge", kind: "rack", rows: 2, cols: 2,
      xCm: 3000, yCm: 3000, widthCm: 100, depthCm: 45, rotation: 0, active: true,
    });
    expect(await catalogVersion()).not.toBe(before);
  });

  it("changes the catalog version when an item is moved", async () => {
    const { createRack, setItemLocation } = await import("@/lib/repos/racks");
    const { catalogVersion } = await import("@/lib/repos/batches");

    const rackId = await createRack({
      name: "Moving day", kind: "rack", rows: 2, cols: 2, xCm: 3200, yCm: 3000, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const itemId = await makeItemAt("Shifted", { rackId, row: 1, col: 1 });
    const before = await catalogVersion();

    // Since 0013 this writes only to item_locations — it does not touch
    // items.updated_at, so the version has to watch that table too.
    await new Promise((r) => setTimeout(r, 5));
    await setItemLocation(itemId, { rackId, row: 2, col: 2, note: "" });
    expect(await catalogVersion()).not.toBe(before);
  });

  it("changes the catalog version when furniture is deleted", async () => {
    const { createRack, deleteRack } = await import("@/lib/repos/racks");
    const { catalogVersion } = await import("@/lib/repos/batches");

    const rackId = await createRack({
      name: "Temporary", kind: "shelf", rows: 1, cols: 1, xCm: 3100, yCm: 3000, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const before = await catalogVersion();
    await deleteRack(rackId);
    expect(await catalogVersion()).not.toBe(before);
  });

  it("carries the place and the furniture in the catalog snapshot", async () => {
    const { createRack } = await import("@/lib/repos/racks");
    const { catalogSnapshot } = await import("@/lib/repos/catalog");

    const rackId = await createRack({
      name: "Catalogued", kind: "desk", rows: 3, cols: 3, xCm: 4000, yCm: 4000, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const itemId = await makeItemAt("Findable", { rackId, row: 3, col: 2 });

    const snap = await catalogSnapshot(false);
    expect(snap.racks.find((r) => r.id === rackId)).toMatchObject({
      name: "Catalogued",
      kind: "desk",
      rows: 3,
      cols: 3,
    });
    expect(snap.items.find((i) => i.id === itemId)?.cell).toEqual({
      rackId,
      row: 3,
      col: 2,
    });

    // An item with no place says so explicitly rather than being absent.
    const loose = await makeItem("Loose");
    const snap2 = await catalogSnapshot(false);
    expect(snap2.items.find((i) => i.id === loose)?.cell).toBeNull();
  });
});

describe("the item master", () => {
  it("holds nothing about where anything is kept", async () => {
    // The whole point of 0013. `items` describes a product — Vicks comes in a
    // jar, everywhere — so a shared Nepali catalogue can be imported and
    // refreshed without trampling what one shop arranged. This test fails the
    // day somebody puts a location column back.
    const c = createClient({ url: `file:${DB_FILE}` });
    const cols = (
      await c.execute("SELECT name FROM pragma_table_info('items')")
    ).rows.map((r) => String(r.name));
    c.close();

    for (const dead of ["rack", "rack_id", "rack_row", "rack_col"]) {
      expect(cols).not.toContain(dead);
    }
  });

  it("does not lose an item's place when the item is edited", async () => {
    const { createRack, getItemLocation } = await import("@/lib/repos/racks");
    const { getItem, updateItem } = await import("@/lib/repos/items");

    const rackId = await createRack({
      name: "Edit test", kind: "rack", rows: 2, cols: 2, xCm: 5000, yCm: 5000, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const itemId = await makeItemAt("Renamed", { rackId, row: 2, col: 1 });

    const item = (await getItem(itemId))!;
    await updateItem(itemId, { ...item, brandName: "Renamed Twice" });

    expect((await getItem(itemId))?.brandName).toBe("Renamed Twice");
    expect(await getItemLocation(itemId)).toMatchObject({ row: 2, col: 1 });
  });
});

describe("the shelf list", () => {
  it("walks the floor in order and puts the unplaced last", async () => {
    const { createRack, shelfRows } = await import("@/lib/repos/racks");
    const c = createClient({ url: `file:${DB_FILE}` });
    await c.execute("DELETE FROM item_locations");
    await c.execute("DELETE FROM items");
    await c.execute("DELETE FROM racks");
    c.close();

    // Drawn deliberately out of order: the near one is created last.
    const far = await createRack({
      name: "Back wall", kind: "rack", rows: 2, cols: 2, xCm: 100, yCm: 100, widthCm: 100, depthCm: 45, rotation: 0,
    });
    const near = await createRack({
      name: "By the door", kind: "desk", rows: 2, cols: 2, xCm: 0, yCm: 0, widthCm: 100, depthCm: 45, rotation: 0,
    });

    await makeItemAt("Zinc", { rackId: far, row: 1, col: 1 });
    await makeItemAt("Aspirin", { rackId: near, row: 2, col: 1 });
    await makeItemAt("Bandage", { rackId: near, row: 1, col: 1 });
    await makeItem("Homeless");

    const rows = await shelfRows();
    expect(rows.map((r) => r.brandName)).toEqual([
      // By the door first (nearest the front), top shelf before the one below
      "Bandage",
      "Aspirin",
      // then the back wall
      "Zinc",
      // and last, the work remaining
      "Homeless",
    ]);
    expect(rows.at(-1)?.rackId).toBeNull();
    expect(rows[0]?.rackName).toBe("By the door");
    expect(rows[0]?.rackKind).toBe("desk");
  });
});
