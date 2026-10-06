-- 0007_stock_out.sql — stock leaving (or being corrected onto) the shelf for a
-- reason that isn't a sale. Append-only: never edit once applied.
--
-- @rebuild  stock_moves.reason carries CHECK (reason IN (...6 values...)) from
--           0001 and SQLite cannot alter a CHECK, so the table is rebuilt to
--           widen the list. Nothing holds a foreign key INTO stock_moves, so
--           the rebuild has no inbound references to satisfy.
-- @verify stock_moves

CREATE TABLE stock_moves_new (
  id             TEXT PRIMARY KEY,
  batch_id       TEXT NOT NULL REFERENCES batches(id),
  item_id        TEXT NOT NULL REFERENCES items(id),
  -- positive for stock in, negative for stock out
  base_qty_delta INTEGER NOT NULL,
  reason         TEXT NOT NULL CHECK (reason IN (
                   -- carried forward from 0001
                   'purchase','sale','sale_return','purchase_return',
                   'write_off','adjustment',
                   -- the reasoned stock-out family (PRD §4A.2)
                   'returned_to_supplier','disposed','damaged','lost',
                   'clinic_use','sample','count_correction')),
  ref_table      TEXT,
  ref_id         TEXT,
  user_id        TEXT REFERENCES users(id),
  at             TEXT NOT NULL
);

INSERT INTO stock_moves_new
  (id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at)
  SELECT id, batch_id, item_id, base_qty_delta, reason, ref_table, ref_id, user_id, at
    FROM stock_moves;

DROP TABLE stock_moves;
ALTER TABLE stock_moves_new RENAME TO stock_moves;

-- 0001 put exactly one index on stock_moves; recreate it, then add the one the
-- stock-out register needs.
CREATE INDEX IF NOT EXISTS idx_stock_moves_item_at   ON stock_moves (item_id, at);
CREATE INDEX IF NOT EXISTS idx_stock_moves_reason_at ON stock_moves (reason, at);

-- ============================================================
-- the stock-out document: one header, many lines, one printed note
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id                 TEXT PRIMARY KEY,
  adjustment_no      INTEGER,
  fiscal_year_id     INTEGER REFERENCES fiscal_years(id),
  direction          TEXT NOT NULL CHECK (direction IN ('out', 'in')),
  date_ad            TEXT NOT NULL,
  date_bs            TEXT NOT NULL,
  reason             TEXT NOT NULL CHECK (reason IN (
                       'returned_to_supplier','disposed','damaged','lost',
                       'clinic_use','sample','count_correction')),
  supplier_id        TEXT REFERENCES suppliers(id),
  -- visits arrive in 0008, so this cannot carry a foreign key yet; the repo
  -- enforces it once the clinic module exists.
  visit_id           TEXT,
  note               TEXT NOT NULL DEFAULT '',
  total_cost_paisa   INTEGER NOT NULL DEFAULT 0,
  purchase_return_id TEXT REFERENCES purchase_returns(id),
  user_id            TEXT REFERENCES users(id),
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_adjustment_lines (
  id                 TEXT PRIMARY KEY,
  adjustment_id      TEXT NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  item_id            TEXT NOT NULL REFERENCES items(id),
  batch_id           TEXT NOT NULL REFERENCES batches(id),
  -- always positive: the direction lives on the header
  base_qty           INTEGER NOT NULL,
  unit_level_entered INTEGER NOT NULL DEFAULT 0,
  qty_entered        INTEGER NOT NULL,
  cost_paisa         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_stock_adj_lines_item ON stock_adjustment_lines (item_id);
CREATE INDEX IF NOT EXISTS idx_stock_adj_lines_adj  ON stock_adjustment_lines (adjustment_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_fy ON stock_adjustments (fiscal_year_id, adjustment_no);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_date ON stock_adjustments (date_ad);
