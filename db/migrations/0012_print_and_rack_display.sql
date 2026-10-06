-- ============================================================
-- 0012_print_and_rack_display.sql
--
-- Two settings, one table rebuild.
--
-- 1. print_format gains 'a4_half'. This is NOT A5. A5 is half of A4 the other
--    way round — the sheet itself is smaller. What the clinic wants is a full
--    A4 sheet, full width, with the bill occupying only the top half, so one
--    ordinary sheet carries two lab bills and is cut once.
--
-- 2. rack_display decides what the counter shows when a medicine is found:
--    nothing, the cell written out ("Rack 1 · R2C3"), or the picture of the
--    shop with that cell lit up. Off by default — a shop with no racks
--    configured should not be shown an empty floor plan.
--
-- SQLite cannot alter a CHECK constraint, so widening print_format means
-- rebuilding the table.
--
-- READ THIS BEFORE COPYING THIS MIGRATION. The first version of it listed the
-- columns from 0001 and nothing else, which silently dropped the three added
-- afterwards: cbms_enabled (0004), module_pharmacy and module_clinic (0006).
-- Losing the module flags would have switched the Clinic module off at the
-- clinic. A rebuild has to carry every column the table has by the time it
-- runs, not every column it was born with. The phase-1 module tests are what
-- caught it.
-- ============================================================

CREATE TABLE company_new (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  name              TEXT NOT NULL DEFAULT '',
  address           TEXT NOT NULL DEFAULT '',
  phone             TEXT NOT NULL DEFAULT '',
  pan_no            TEXT NOT NULL DEFAULT '',
  dda_no            TEXT NOT NULL DEFAULT '',
  vat_registered    INTEGER NOT NULL DEFAULT 0,
  invoice_footer    TEXT NOT NULL DEFAULT 'Get well soon',
  logo_url          TEXT,
  print_format      TEXT NOT NULL DEFAULT 'thermal'
                      CHECK (print_format IN ('thermal', 'a5', 'a4_half')),
  rounding_on       INTEGER NOT NULL DEFAULT 0,
  expiry_alert_days INTEGER NOT NULL DEFAULT 60 CHECK (expiry_alert_days IN (30, 60, 90)),
  min_rate_is_cost  INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL,
  -- added by 0004
  cbms_enabled      INTEGER NOT NULL DEFAULT 0,
  -- added by 0006
  module_pharmacy   INTEGER NOT NULL DEFAULT 1,
  module_clinic     INTEGER NOT NULL DEFAULT 0,
  -- new here
  rack_display      TEXT NOT NULL DEFAULT 'off'
                      CHECK (rack_display IN ('off', 'text', 'visual'))
);

INSERT INTO company_new
  (id, name, address, phone, pan_no, dda_no, vat_registered, invoice_footer,
   logo_url, print_format, rounding_on, expiry_alert_days, min_rate_is_cost,
   updated_at, cbms_enabled, module_pharmacy, module_clinic, rack_display)
SELECT
  id, name, address, phone, pan_no, dda_no, vat_registered, invoice_footer,
  logo_url, print_format, rounding_on, expiry_alert_days, min_rate_is_cost,
  updated_at, cbms_enabled, module_pharmacy, module_clinic, 'off'
FROM company;

DROP TABLE company;

ALTER TABLE company_new RENAME TO company;
