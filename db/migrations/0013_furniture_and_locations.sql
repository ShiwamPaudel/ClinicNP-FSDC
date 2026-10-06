-- ============================================================
-- 0013_furniture_and_locations.sql
--
-- Two corrections, both asked for by the owner after seeing 0011 in use.
--
-- 1. NOT EVERYTHING IN A SHOP IS A RACK. A pharmacy has racks, shelves and
--    desks, and all three hold medicines in rows and columns. `racks` keeps
--    its name — renaming a table that half the code joins to buys nothing —
--    but every row now says what it actually is.
--
--    Deliberately NO CHECK on `kind`. This project has twice paid for a CHECK
--    it later had to widen (0007 rebuilt stock_moves.reason, 0012 rebuilt the
--    whole company table for one print format), and SQLite cannot alter one
--    without rebuilding. The values are a zod enum in lib/validators, which is
--    where a typo would have to get past a compiler first. A CHECK here would
--    protect against nothing and cost a rebuild the day a fridge is added.
--
-- 2. WHERE A MEDICINE IS KEPT IS NOT PART OF WHAT THE MEDICINE IS.
--    0011 put rack_id/rack_row/rack_col on `items`, and that was wrong. The
--    item master describes a product: Vicks VapoRub comes in a jar, and that
--    is true in every pharmacy in Nepal. Which shelf it sits on is true in
--    exactly one shop. Mixing the two means a shared catalogue of Nepali
--    medicines could never be imported or refreshed without trampling what
--    each shop had arranged.
--
--    So location moves to `item_locations`, keyed by item and owned by the
--    installation. `items.rack` — the free-text note from 0001 — moves with
--    it, because it is the same fact written less precisely. After this
--    migration `items` holds nothing about where anything is.
--
--    One location per item for now (UNIQUE on item_id). Shops really do keep
--    a fast mover in two places, and this table can carry that the day it is
--    asked for: drop one index, change nothing else. A column on `items`
--    could never have grown that way, which is the other reason it is a table.
-- ============================================================

-- --- 1. what kind of furniture it is -------------------------------------
ALTER TABLE racks ADD COLUMN kind TEXT NOT NULL DEFAULT 'rack';

-- --- 2. where this shop keeps things -------------------------------------
CREATE TABLE IF NOT EXISTS item_locations (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES items(id),
  -- All three are null together when the shop has written a note instead of
  -- drawing its furniture. A row with neither a cell nor a note is pointless
  -- and the repo deletes it rather than storing it.
  rack_id    TEXT REFERENCES racks(id),
  rack_row   INTEGER,
  rack_col   INTEGER,
  -- the free-text fallback, carried over from items.rack
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One place per item today. Widening to several means dropping this index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_locations_item
  ON item_locations (item_id);

-- "what is on this shelf" — the counter and the shelf list both ask it.
CREATE INDEX IF NOT EXISTS idx_item_locations_cell
  ON item_locations (rack_id, rack_row, rack_col);

-- Carry everything across before anything is dropped. Items with neither a
-- cell nor a note get no row at all: absence is the correct representation of
-- "nobody has said where this is".
INSERT INTO item_locations
  (id, item_id, rack_id, rack_row, rack_col, note, created_at, updated_at)
SELECT
  lower(hex(randomblob(16))),
  id,
  rack_id,
  rack_row,
  rack_col,
  COALESCE(rack, ''),
  created_at,
  updated_at
FROM items
WHERE rack_id IS NOT NULL
   OR (rack IS NOT NULL AND trim(rack) <> '');

-- --- 3. the item master forgets where anything is ------------------------
-- The index has to go first: SQLite refuses to drop a column an index names.
DROP INDEX IF EXISTS idx_items_cell;

ALTER TABLE items DROP COLUMN rack_col;
ALTER TABLE items DROP COLUMN rack_row;
ALTER TABLE items DROP COLUMN rack_id;
ALTER TABLE items DROP COLUMN rack;
