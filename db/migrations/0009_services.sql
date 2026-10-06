-- 0009_services.sql — everything the clinic bills that is not a medicine.
-- Append-only: never edit once applied.
--
-- Service lines are a sibling of bill_lines under the same bills parent, not a
-- widening of it (Architecture §3.4). A medicine line is a stock allocation;
-- a service line is a priced act. Keeping them apart leaves the counter's
-- hottest, most-tested table untouched.
--
-- Money is integer paisa throughout. Every rate, cost and share that can be
-- edited later is SNAPSHOTTED onto the bill line at billing time, so changing
-- a service's price or a doctor's cut never rewrites history.

-- ============================================================
-- service_groups — how services are grouped on screen and in reports
-- ============================================================
CREATE TABLE IF NOT EXISTS service_groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_service_groups_order ON service_groups (sort_order, name);

-- ============================================================
-- doctors — a payee and a name on a slip, never a login (PRD §4B.3)
-- ============================================================
CREATE TABLE IF NOT EXISTS doctors (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  qualification TEXT NOT NULL DEFAULT '',
  specialty     TEXT NOT NULL DEFAULT '',
  nmc_no        TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  share_basis   TEXT NOT NULL DEFAULT 'none'
                  CHECK (share_basis IN ('none', 'pct_consult', 'fixed_consult', 'pct_services')),
  -- basis points (1% = 100) for the pct bases, paisa for fixed_consult
  share_value   INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_doctors_active ON doctors (active, name);

-- ============================================================
-- lab_partners — an outside laboratory, with a supplier-shaped ledger
-- ============================================================
CREATE TABLE IF NOT EXISTS lab_partners (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  pan_no         TEXT NOT NULL DEFAULT '',
  phone          TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  contact_person TEXT NOT NULL DEFAULT '',
  terms          TEXT NOT NULL DEFAULT '',
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lab_partners_active ON lab_partners (active, name);

-- ============================================================
-- services — the admin-configured catalog (PRD §4B.3)
-- ============================================================
CREATE TABLE IF NOT EXISTS services (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  -- optional short code for fast keyboard search ("usgap")
  code                  TEXT,
  group_id              TEXT NOT NULL REFERENCES service_groups(id),
  rate_paisa            INTEGER NOT NULL DEFAULT 0,
  doctor_required       INTEGER NOT NULL DEFAULT 0,
  default_doctor_id     TEXT REFERENCES doctors(id),
  -- sent to an outside lab: the line then requires a partner and carries its cost
  outsourced            INTEGER NOT NULL DEFAULT 0,
  default_lab_partner_id TEXT REFERENCES lab_partners(id),
  partner_cost_paisa    INTEGER NOT NULL DEFAULT 0,
  -- the visit expects a report back; unattached ones show under "Files pending"
  keeps_file            INTEGER NOT NULL DEFAULT 0,
  -- consultations only: days of free or reduced follow-up. 0 = no rule.
  followup_days         INTEGER NOT NULL DEFAULT 0,
  followup_rate_paisa   INTEGER NOT NULL DEFAULT 0,
  -- only meaningful when the company VAT toggle is on
  vat_applicable        INTEGER NOT NULL DEFAULT 0,
  -- marks a rate that came from the sample seed, so the counter can say so
  sample_rate           INTEGER NOT NULL DEFAULT 0,
  active                INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_services_group ON services (group_id, name);
CREATE INDEX IF NOT EXISTS idx_services_active ON services (active, name);
CREATE INDEX IF NOT EXISTS idx_services_code ON services (code);

-- ============================================================
-- bill_service_lines — the priced act, with everything snapshotted
-- ============================================================
CREATE TABLE IF NOT EXISTS bill_service_lines (
  id                 TEXT PRIMARY KEY,
  bill_id            TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  service_id         TEXT NOT NULL REFERENCES services(id),
  -- the name as it was billed, so a later rename does not rewrite an old invoice
  name_snapshot      TEXT NOT NULL DEFAULT '',
  qty                INTEGER NOT NULL DEFAULT 1,
  rate_paisa         INTEGER NOT NULL DEFAULT 0,
  rate_overridden    INTEGER NOT NULL DEFAULT 0,
  discount_paisa     INTEGER NOT NULL DEFAULT 0,
  amount_paisa       INTEGER NOT NULL DEFAULT 0,
  vat_paisa          INTEGER NOT NULL DEFAULT 0,
  doctor_id          TEXT REFERENCES doctors(id),
  lab_partner_id     TEXT REFERENCES lab_partners(id),
  -- what the clinic pays the outside lab, as at billing time
  partner_cost_paisa INTEGER NOT NULL DEFAULT 0,
  -- the doctor's terms as at billing time; editing the doctor later must not
  -- move money that has already been earned
  doctor_share_basis TEXT,
  doctor_share_value INTEGER NOT NULL DEFAULT 0,
  doctor_share_paisa INTEGER NOT NULL DEFAULT 0,
  -- the follow-up rule fired on this line, and why, in words for the invoice
  followup_applied   INTEGER NOT NULL DEFAULT 0,
  followup_note      TEXT NOT NULL DEFAULT '',
  visit_id           TEXT REFERENCES visits(id),
  -- stamped when the lab dispatch slip is printed
  dispatched_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_bsl_bill ON bill_service_lines (bill_id);
CREATE INDEX IF NOT EXISTS idx_bsl_service ON bill_service_lines (service_id);
CREATE INDEX IF NOT EXISTS idx_bsl_partner ON bill_service_lines (lab_partner_id);
CREATE INDEX IF NOT EXISTS idx_bsl_doctor ON bill_service_lines (doctor_id);
CREATE INDEX IF NOT EXISTS idx_bsl_visit ON bill_service_lines (visit_id);

-- ============================================================
-- sale_return_service_lines — a refund. Nothing goes back to stock.
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_return_service_lines (
  id                   TEXT PRIMARY KEY,
  sale_return_id       TEXT NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  bill_service_line_id TEXT NOT NULL REFERENCES bill_service_lines(id),
  qty                  INTEGER NOT NULL DEFAULT 1,
  amount_paisa         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_srsl_return ON sale_return_service_lines (sale_return_id);
CREATE INDEX IF NOT EXISTS idx_srsl_line ON sale_return_service_lines (bill_service_line_id);

-- ============================================================
-- lab_partner_payments — the other half of the partner ledger
-- ============================================================
CREATE TABLE IF NOT EXISTS lab_partner_payments (
  id             TEXT PRIMARY KEY,
  lab_partner_id TEXT NOT NULL REFERENCES lab_partners(id),
  date_ad        TEXT NOT NULL,
  date_bs        TEXT NOT NULL,
  amount_paisa   INTEGER NOT NULL DEFAULT 0,
  method         TEXT NOT NULL DEFAULT 'cash'
                   CHECK (method IN ('cash', 'bank', 'cheque', 'qr', 'adjustment')),
  note           TEXT NOT NULL DEFAULT '',
  user_id        TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lpp_partner ON lab_partner_payments (lab_partner_id, date_ad);

-- ============================================================
-- Seeded groups. Every one is renameable and reorderable by the Admin, and
-- more can be added; these are a starting point, not a fixed vocabulary.
-- Ids are fixed strings rather than ULIDs so the seed and the tests can name
-- them, and so re-running this migration on a fresh database is identical.
-- ============================================================
INSERT INTO service_groups (id, name, sort_order, active, created_at)
SELECT 'grp_opd', 'OPD Consultation', 10, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM service_groups WHERE id = 'grp_opd');

INSERT INTO service_groups (id, name, sort_order, active, created_at)
SELECT 'grp_followup', 'Follow-up', 20, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM service_groups WHERE id = 'grp_followup');

INSERT INTO service_groups (id, name, sort_order, active, created_at)
SELECT 'grp_lab', 'Laboratory', 30, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM service_groups WHERE id = 'grp_lab');

INSERT INTO service_groups (id, name, sort_order, active, created_at)
SELECT 'grp_usg', 'Ultrasound', 40, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM service_groups WHERE id = 'grp_usg');

INSERT INTO service_groups (id, name, sort_order, active, created_at)
SELECT 'grp_xray', 'X-Ray', 50, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM service_groups WHERE id = 'grp_xray');

INSERT INTO service_groups (id, name, sort_order, active, created_at)
SELECT 'grp_ecg', 'ECG', 60, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM service_groups WHERE id = 'grp_ecg');

INSERT INTO service_groups (id, name, sort_order, active, created_at)
SELECT 'grp_echo', 'ECHO', 70, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM service_groups WHERE id = 'grp_echo');

INSERT INTO service_groups (id, name, sort_order, active, created_at)
SELECT 'grp_skin', 'Skin Analysis', 80, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM service_groups WHERE id = 'grp_skin');

INSERT INTO service_groups (id, name, sort_order, active, created_at)
SELECT 'grp_proc', 'Procedure / Dressing', 90, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM service_groups WHERE id = 'grp_proc');

INSERT INTO service_groups (id, name, sort_order, active, created_at)
SELECT 'grp_other', 'Other', 100, 1, datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM service_groups WHERE id = 'grp_other');
