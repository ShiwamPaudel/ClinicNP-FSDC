-- ============================================================
-- 0011_racks.sql — where a medicine physically is.
--
-- items.rack has been a free-text string since 0001 ("R2", "top shelf",
-- "behind counter"), which is fine for the person who wrote it and useless to
-- anyone else on their first week. This gives the shop a real floor plan.
--
-- A rack is a grid: so many rows, so many columns. Racks carry their own
-- position on the shop floor (pos_x, pos_y) so the picture on screen stands
-- the way the racks stand in the room — that is the entire point. A map drawn
-- in a different order from the shop is slower than no map.
--
-- The old items.rack column is deliberately left alone. It still holds
-- whatever was typed into it, it still prints, and nothing that reads it
-- breaks. An item with a real cell simply has both.
-- ============================================================

CREATE TABLE IF NOT EXISTS racks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  -- the grid. Kept small on purpose: a rack nobody can point at across the
  -- room is two racks.
  rows_count  INTEGER NOT NULL DEFAULT 1 CHECK (rows_count  BETWEEN 1 AND 26),
  cols_count  INTEGER NOT NULL DEFAULT 1 CHECK (cols_count  BETWEEN 1 AND 26),
  -- position on the shop floor, in rack-widths. Signed: adding a rack to the
  -- left of the first one gives -1 rather than renumbering everything.
  pos_x       INTEGER NOT NULL DEFAULT 0,
  pos_y       INTEGER NOT NULL DEFAULT 0,
  note        TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Two racks cannot stand in the same place.
CREATE UNIQUE INDEX IF NOT EXISTS idx_racks_position ON racks (pos_x, pos_y);
CREATE INDEX IF NOT EXISTS idx_racks_active ON racks (active, name);

-- Where the item lives. All three are null together: an item with no cell is
-- ordinary, not broken — plenty of stock sits behind the counter.
ALTER TABLE items ADD COLUMN rack_id  TEXT REFERENCES racks(id);
ALTER TABLE items ADD COLUMN rack_row INTEGER;
ALTER TABLE items ADD COLUMN rack_col INTEGER;

-- The counter looks items up by cell when somebody is restocking a shelf.
CREATE INDEX IF NOT EXISTS idx_items_cell ON items (rack_id, rack_row, rack_col);
