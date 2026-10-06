-- 0006_modules_fy.sql — module flags, fiscal-year status, lifetime counters,
-- the three-value user role, and the request rate-limit store.
-- Append-only: never edit once applied.
--
-- @rebuild  users carries CHECK (role IN ('admin','staff')) from 0001 and SQLite
--           cannot alter a CHECK, so the table is rebuilt. Seven tables hold
--           foreign keys into users(id), so foreign keys go off around the
--           transaction and are checked again afterwards.
-- @verify users

-- ============================================================
-- modules (PRD §3.1) — the only new global switches
-- ============================================================
ALTER TABLE company ADD COLUMN module_pharmacy INTEGER NOT NULL DEFAULT 1;
ALTER TABLE company ADD COLUMN module_clinic   INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- fiscal years: exactly one open year at a time (Architecture §2.4)
-- ============================================================
-- The DEFAULT is 'closed' on purpose. A DEFAULT of 'open' would mark every
-- existing year open at once and the partial unique index below would then fail
-- on any database holding more than one year. The UPDATE decides, not the DEFAULT.
ALTER TABLE fiscal_years ADD COLUMN status    TEXT NOT NULL DEFAULT 'closed';
ALTER TABLE fiscal_years ADD COLUMN closed_at TEXT;
-- users.id is a TEXT ULID, not an integer.
ALTER TABLE fiscal_years ADD COLUMN closed_by TEXT REFERENCES users(id);
ALTER TABLE fiscal_years ADD COLUMN next_visit_no    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fiscal_years ADD COLUMN next_stockout_no INTEGER NOT NULL DEFAULT 1;

-- Open the year whose AD range contains today; failing that, the latest one.
UPDATE fiscal_years SET status = 'open'
 WHERE id = (
   SELECT id FROM fiscal_years
    ORDER BY (start_ad <= date('now') AND date('now') <= end_ad) DESC,
             start_ad DESC
    LIMIT 1
 );

CREATE UNIQUE INDEX IF NOT EXISTS one_open_fy
  ON fiscal_years (status) WHERE status = 'open';

-- ============================================================
-- lifetime counters (never reset at year close) — D-028
-- ============================================================
CREATE TABLE IF NOT EXISTS counters (
  name       TEXT PRIMARY KEY,
  next_value INTEGER NOT NULL
);
INSERT OR IGNORE INTO counters (name, next_value) VALUES ('patient_no', 1);

-- ============================================================
-- request rate limiting, kept in our own database (no third-party service).
-- One row per fixed window; `bucket` already encodes the window index, so an
-- upsert is the whole algorithm. Expired rows are swept by the nightly cron.
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket     TEXT PRIMARY KEY,
  hits       INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL          -- unix seconds
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry ON rate_limits (expires_at);

-- ============================================================
-- users: add the read-only Accountant role (PRD §4B.8)
-- ============================================================
CREATE TABLE users_new (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  pin_hash      TEXT,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'accountant')),
  can_edit_rate INTEGER NOT NULL DEFAULT 1,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

INSERT INTO users_new (id, name, username, password_hash, pin_hash, role,
                       can_edit_rate, active, created_at)
  SELECT id, name, username, password_hash, pin_hash, role,
         can_edit_rate, active, created_at
    FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
