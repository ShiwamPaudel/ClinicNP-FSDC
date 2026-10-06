-- 0001_init.sql — the inherited v1 pharmacy schema (Architecture.md §3).
-- Append-only migrations: never edit an applied migration.
-- All money columns are integer paisa. All dates: AD ISO text + denormalized BS text.

PRAGMA foreign_keys = ON;

-- ============================================================
-- identity & config
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  pin_hash      TEXT,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  can_edit_rate INTEGER NOT NULL DEFAULT 1,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  name              TEXT NOT NULL DEFAULT '',
  address           TEXT NOT NULL DEFAULT '',
  phone             TEXT NOT NULL DEFAULT '',
  pan_no            TEXT NOT NULL DEFAULT '',
  dda_no            TEXT NOT NULL DEFAULT '',
  vat_registered    INTEGER NOT NULL DEFAULT 0,
  invoice_footer    TEXT NOT NULL DEFAULT 'Get well soon',
  logo_url          TEXT,
  print_format      TEXT NOT NULL DEFAULT 'thermal' CHECK (print_format IN ('thermal', 'a5')),
  rounding_on       INTEGER NOT NULL DEFAULT 0,
  expiry_alert_days INTEGER NOT NULL DEFAULT 60 CHECK (expiry_alert_days IN (30, 60, 90)),
  min_rate_is_cost  INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fiscal_years (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  bs_label         TEXT NOT NULL UNIQUE,          -- '2083/84'
  start_ad         TEXT NOT NULL,                 -- ISO AD date
  end_ad           TEXT NOT NULL,
  next_invoice_no  INTEGER NOT NULL DEFAULT 1,
  next_return_no   INTEGER NOT NULL DEFAULT 1,
  next_purchase_no INTEGER NOT NULL DEFAULT 1,
  active           INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- catalog
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
  id                TEXT PRIMARY KEY,
  brand_name        TEXT NOT NULL,
  generic_name      TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL DEFAULT 'Medicine'
                      CHECK (category IN ('Medicine', 'Consumable', 'Other')),
  manufacturer      TEXT NOT NULL DEFAULT '',
  rack              TEXT NOT NULL DEFAULT '',
  min_stock_base_qty INTEGER NOT NULL DEFAULT 0,
  controlled_flag   INTEGER NOT NULL DEFAULT 0,
  preferred_supplier_id TEXT REFERENCES suppliers(id),
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

-- item_units: level 0 = base unit (factor_to_base = 1). Higher levels multiply down.
CREATE TABLE IF NOT EXISTS item_units (
  id                 TEXT PRIMARY KEY,
  item_id            TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  level              INTEGER NOT NULL CHECK (level IN (0, 1, 2)),
  name               TEXT NOT NULL,                 -- 'Box' | 'Strip' | 'Tablet' | ...
  factor_to_base     INTEGER NOT NULL CHECK (factor_to_base >= 1),
  selling_rate_paisa INTEGER NOT NULL DEFAULT 0,
  is_default_selling INTEGER NOT NULL DEFAULT 0,
  UNIQUE (item_id, level)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  pan_no         TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  terms          TEXT NOT NULL DEFAULT '',
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL
);

-- ============================================================
-- stock
-- ============================================================
CREATE TABLE IF NOT EXISTS batches (
  id                          TEXT PRIMARY KEY,
  item_id                     TEXT NOT NULL REFERENCES items(id),
  batch_no                    TEXT NOT NULL,
  mfg_date_ad                 TEXT,
  expiry_date_ad              TEXT NOT NULL,
  purchase_cost_paisa_per_base INTEGER NOT NULL DEFAULT 0,
  received_base_qty           INTEGER NOT NULL DEFAULT 0,
  remaining_base_qty          INTEGER NOT NULL DEFAULT 0,
  supplier_id                 TEXT REFERENCES suppliers(id),
  purchase_id                 TEXT REFERENCES purchases(id),
  created_at                  TEXT NOT NULL
);

-- append-only ledger; batches.remaining_base_qty is the materialized view of this
CREATE TABLE IF NOT EXISTS stock_moves (
  id            TEXT PRIMARY KEY,
  batch_id      TEXT NOT NULL REFERENCES batches(id),
  item_id       TEXT NOT NULL REFERENCES items(id),
  base_qty_delta INTEGER NOT NULL,               -- +in / -out
  reason        TEXT NOT NULL CHECK (reason IN
                  ('purchase','sale','sale_return','purchase_return','write_off','adjustment')),
  ref_table     TEXT,
  ref_id        TEXT,
  user_id       TEXT REFERENCES users(id),
  at            TEXT NOT NULL
);

-- ============================================================
-- purchasing
-- ============================================================
CREATE TABLE IF NOT EXISTS purchases (
  id                  TEXT PRIMARY KEY,
  purchase_no         TEXT,
  supplier_id         TEXT NOT NULL REFERENCES suppliers(id),
  supplier_invoice_no TEXT NOT NULL DEFAULT '',
  date_ad             TEXT NOT NULL,
  date_bs             TEXT NOT NULL,
  subtotal_paisa      INTEGER NOT NULL DEFAULT 0,
  discount_paisa      INTEGER NOT NULL DEFAULT 0,
  vat_paisa           INTEGER NOT NULL DEFAULT 0,
  total_paisa         INTEGER NOT NULL DEFAULT 0,
  user_id             TEXT REFERENCES users(id),
  created_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id             TEXT PRIMARY KEY,
  purchase_id    TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  item_id        TEXT NOT NULL REFERENCES items(id),
  batch_id       TEXT NOT NULL REFERENCES batches(id),
  unit_level     INTEGER NOT NULL DEFAULT 0,
  qty            INTEGER NOT NULL,
  free_qty       INTEGER NOT NULL DEFAULT 0,
  cost_paisa     INTEGER NOT NULL DEFAULT 0,
  discount_paisa INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id          TEXT PRIMARY KEY,
  return_no   TEXT,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  date_ad     TEXT NOT NULL,
  date_bs     TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  total_paisa INTEGER NOT NULL DEFAULT 0,
  user_id     TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_return_lines (
  id                 TEXT PRIMARY KEY,
  purchase_return_id TEXT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  batch_id           TEXT NOT NULL REFERENCES batches(id),
  base_qty           INTEGER NOT NULL,
  cost_paisa         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id          TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  date_ad     TEXT NOT NULL,
  date_bs     TEXT NOT NULL,
  amount_paisa INTEGER NOT NULL,
  method      TEXT NOT NULL DEFAULT 'cash',
  note        TEXT NOT NULL DEFAULT '',
  user_id     TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL
);

-- ============================================================
-- sales
-- ============================================================
CREATE TABLE IF NOT EXISTS bills (
  id                TEXT PRIMARY KEY,                 -- ULID (client-generated)
  invoice_no        INTEGER,                          -- NULL until assigned server-side
  fiscal_year_id    INTEGER REFERENCES fiscal_years(id),
  date_ad           TEXT NOT NULL,
  date_bs           TEXT NOT NULL,
  patient_name      TEXT NOT NULL DEFAULT '',
  subtotal_paisa    INTEGER NOT NULL DEFAULT 0,
  discount_paisa    INTEGER NOT NULL DEFAULT 0,
  vat_paisa         INTEGER NOT NULL DEFAULT 0,
  total_paisa       INTEGER NOT NULL DEFAULT 0,
  payment_method    TEXT NOT NULL DEFAULT 'cash'
                      CHECK (payment_method IN ('cash', 'qr', 'credit')),
  tendered_paisa    INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'saved'
                      CHECK (status IN ('saved', 'cancelled')),
  credit_settled_at TEXT,
  user_id           TEXT REFERENCES users(id),
  client_created_at TEXT NOT NULL,
  synced_at         TEXT
);

CREATE TABLE IF NOT EXISTS bill_lines (
  id             TEXT PRIMARY KEY,
  bill_id        TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  item_id        TEXT NOT NULL REFERENCES items(id),
  unit_level     INTEGER NOT NULL DEFAULT 0,
  qty            INTEGER NOT NULL,
  rate_paisa     INTEGER NOT NULL,
  rate_overridden INTEGER NOT NULL DEFAULT 0,
  discount_paisa INTEGER NOT NULL DEFAULT 0,
  amount_paisa   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bill_line_batches (
  id           TEXT PRIMARY KEY,
  bill_line_id TEXT NOT NULL REFERENCES bill_lines(id) ON DELETE CASCADE,
  batch_id     TEXT NOT NULL REFERENCES batches(id),
  base_qty     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_returns (
  id          TEXT PRIMARY KEY,
  return_no   INTEGER,
  bill_id     TEXT NOT NULL REFERENCES bills(id),
  date_ad     TEXT NOT NULL,
  date_bs     TEXT NOT NULL,
  total_paisa INTEGER NOT NULL DEFAULT 0,
  user_id     TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_return_lines (
  id             TEXT PRIMARY KEY,
  sale_return_id TEXT NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  bill_line_id   TEXT NOT NULL REFERENCES bill_lines(id),
  batch_id       TEXT REFERENCES batches(id),
  base_qty       INTEGER NOT NULL,
  amount_paisa   INTEGER NOT NULL
);

-- ============================================================
-- infra
-- ============================================================
CREATE TABLE IF NOT EXISTS cbms_queue (
  bill_id     TEXT PRIMARY KEY REFERENCES bills(id),
  payload_json TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent', 'failed')),
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backups (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('daily', 'manual')),
  blob_url   TEXT NOT NULL,
  size       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  action      TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  at          TEXT NOT NULL
);

-- ============================================================
-- indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_items_brand ON items (brand_name);
-- FEFO index: live batches ordered by expiry
CREATE INDEX IF NOT EXISTS idx_batches_fefo
  ON batches (item_id, expiry_date_ad) WHERE remaining_base_qty > 0;
CREATE INDEX IF NOT EXISTS idx_bills_fy_invoice ON bills (fiscal_year_id, invoice_no);
CREATE INDEX IF NOT EXISTS idx_bills_date_bs ON bills (date_bs);
CREATE INDEX IF NOT EXISTS idx_stock_moves_item_at ON stock_moves (item_id, at);
CREATE INDEX IF NOT EXISTS idx_item_units_item ON item_units (item_id);
CREATE INDEX IF NOT EXISTS idx_batches_item ON batches (item_id);
CREATE INDEX IF NOT EXISTS idx_bill_lines_bill ON bill_lines (bill_id);
