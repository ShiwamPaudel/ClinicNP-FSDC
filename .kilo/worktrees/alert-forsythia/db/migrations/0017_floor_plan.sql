-- 0017_floor_plan.sql — the shop as a room, not as a spreadsheet.
--
-- Append-only: never edit once applied.
--
-- 0011 put furniture on a grid of whole "rack widths" with a UNIQUE index on
-- (pos_x, pos_y). That is a seating chart, not a floor plan. It cannot say
-- that the counter is long and shallow while the cold-chain fridge is small
-- and square, it cannot put a narrow shelf in the gap between two racks, and
-- the unique index means two pieces of furniture may never share a grid square
-- even when one of them is a third the size of the other.
--
-- A real pharmacy is a room with things at particular places in it, so this
-- stores exactly that: a position and a footprint in centimetres, and a
-- rotation. Centimetres because that is what somebody measuring a shop with a
-- tape has, and integers because a floor plan does not need half a millimetre
-- and floating point in a database is a rounding argument waiting to happen.
--
-- @rebuild  The UNIQUE (pos_x, pos_y) index is the whole problem, and it was
--           created in 0011 alongside the table. Dropping an index would be
--           enough on its own, but pos_x/pos_y are also being replaced rather
--           than kept beside their successors — two sources of truth for where
--           a rack is would disagree within a week. Nothing holds a foreign
--           key into racks except item_locations.rack_id, which is preserved
--           by keeping every id.
-- @verify racks, item_locations

CREATE TABLE racks_new (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  -- rack | shelf | desk | counter | fridge | door. No CHECK, deliberately:
  -- 0013 established that this is a label chosen from a list in the UI, and
  -- this migration exists partly because 0011 constrained too much.
  kind        TEXT NOT NULL DEFAULT 'rack',

  -- The grid of places INSIDE a piece of storage. Unchanged, and still capped:
  -- a rack nobody can point at across the room is two racks.
  rows_count  INTEGER NOT NULL DEFAULT 1 CHECK (rows_count BETWEEN 1 AND 26),
  cols_count  INTEGER NOT NULL DEFAULT 1 CHECK (cols_count BETWEEN 1 AND 26),

  -- Where it stands and how big it is, in centimetres from the room's top-left
  -- corner. Signed, so something dragged past the corner is still recorded
  -- rather than clamped to a lie.
  x_cm        INTEGER NOT NULL DEFAULT 0,
  y_cm        INTEGER NOT NULL DEFAULT 0,
  width_cm    INTEGER NOT NULL DEFAULT 100 CHECK (width_cm BETWEEN 10 AND 2000),
  depth_cm    INTEGER NOT NULL DEFAULT 45  CHECK (depth_cm BETWEEN 10 AND 2000),
  -- Quarter turns only. A shop is rectangular and so is its furniture; free
  -- rotation would mean storing an angle nobody can reproduce with a tape.
  rotation    INTEGER NOT NULL DEFAULT 0 CHECK (rotation IN (0, 90, 180, 270)),

  note        TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- One rack width was about a metre, and the old grid had no gaps in it, so
-- 110cm per step reproduces the old arrangement with a walkable gap between
-- each piece rather than a wall of furniture.
INSERT INTO racks_new
  (id, name, kind, rows_count, cols_count, x_cm, y_cm, width_cm, depth_cm,
   rotation, note, active, created_at, updated_at)
SELECT
  id, name, kind, rows_count, cols_count,
  pos_x * 110, pos_y * 110,
  CASE kind WHEN 'desk' THEN 140 WHEN 'shelf' THEN 80 ELSE 100 END,
  CASE kind WHEN 'desk' THEN 70  WHEN 'shelf' THEN 30 ELSE 45 END,
  0, note, active, created_at, updated_at
FROM racks;

DROP TABLE racks;
ALTER TABLE racks_new RENAME TO racks;

-- No unique index on position any more: that was the constraint being removed.
-- Overlap is a drawing problem, shown on the plan, not a database error — a
-- shelf tucked under a counter is a real arrangement and refusing to store it
-- would make the planner lie about the room.
CREATE INDEX IF NOT EXISTS idx_racks_active ON racks (active, name);
CREATE INDEX IF NOT EXISTS idx_racks_position ON racks (y_cm, x_cm);

-- The room the furniture stands in. On company because there is one shop
-- floor; a second room would be a table, and a shop that needs one will say so.
ALTER TABLE company ADD COLUMN floor_width_cm INTEGER NOT NULL DEFAULT 600;
ALTER TABLE company ADD COLUMN floor_depth_cm INTEGER NOT NULL DEFAULT 450;
