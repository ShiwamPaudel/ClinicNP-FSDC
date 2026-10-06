-- 0014_opening_stock.sql — the shelf on the day the software arrives.
--
-- Append-only: never edit once applied.
--
-- Until now stock could only enter through a purchase, so a shop switching to
-- ClinicNP had to invent a supplier, an invoice number and a payable nobody
-- owed in order to record what was already on its own shelves (D-077). That is
-- a lie in the ledger that survives into the supplier statement.
--
-- `opening` is its own reason. It could have been recorded as a purchase with
-- a null purchase_id and nobody would have noticed for a while — the purchase
-- register reads the `purchases` table, so it would not have appeared there —
-- but the item's own history would have said "Stock in / purchase" for stock
-- that was never bought, and that history is the thing somebody reads when a
-- count does not add up.
--
-- @rebuild  stock_moves.reason has carried a CHECK since 0001 and was already
--           rebuilt once by 0007 to widen it. SQLite still cannot alter a
--           CHECK, so it is rebuilt again. Nothing holds a foreign key INTO
--           stock_moves, so there are no inbound references to satisfy.
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
                   -- the reasoned stock-out family, added by 0007 (PRD §4A.2)
                   'returned_to_supplier','disposed','damaged','lost',
                   'clinic_use','sample','count_correction',
                   -- new here: what was already on the shelf on day one
                   'opening')),
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

-- Both indexes 0007 left behind, recreated exactly.
CREATE INDEX IF NOT EXISTS idx_stock_moves_item_at   ON stock_moves (item_id, at);
CREATE INDEX IF NOT EXISTS idx_stock_moves_reason_at ON stock_moves (reason, at);
