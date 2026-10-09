-- 0025_payouts_salaries_teeth.sql — paying doctors their share, paying staff
-- their salary, and a tooth chart on the patient card.
--
-- Append-only: never edit once applied.
--
-- Doctors. A doctor's share of each service has been worked out and frozen on
-- the bill line since 0009 (`bill_service_lines.doctor_share_paisa`); nothing
-- recorded paying it. `doctor_payouts` does. What a payout covers is not
-- stored: it is matched to the oldest unpaid share first whenever it is read,
-- so a refund or an undone payout can never leave a stale tag behind.
--
-- Staff. `staff` is whoever is paid a salary, with or without a login.
-- `staff_pay_rates` keeps every salary they have had and the month it started,
-- so raising a salary in Magh never rewrites Shrawan's sheet. A month's sheet
-- is worked out from the rate, its `salary_adjustments` (bonus, deduction,
-- advance recovered) and its `salary_payments` — nothing is totalled and
-- stored. An advance is a payment of kind 'advance'; it is recovered by
-- 'advance_recovery' lines on later months.
--
-- Teeth. `tooth_records` is a dated history per tooth (FDI numbering: 11–48
-- permanent, 51–85 primary). A tooth's state is its latest record that has not
-- been undone.
--
-- All new tables; nothing that exists changes, so the code already deployed
-- keeps working with them in place.
--
-- A payment or line typed wrong is undone, never deleted — the rule since 0019.
--
-- @verify doctors, bill_service_lines, patients, users

CREATE TABLE IF NOT EXISTS doctor_payouts (
  id            TEXT PRIMARY KEY,
  doctor_id     TEXT NOT NULL REFERENCES doctors(id),
  date_ad       TEXT NOT NULL,
  date_bs       TEXT NOT NULL,
  amount_paisa  INTEGER NOT NULL CHECK (amount_paisa > 0),
  method        TEXT NOT NULL DEFAULT 'cash',
  note          TEXT NOT NULL DEFAULT '',
  user_id       TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  voided_at     TEXT,
  voided_by     TEXT REFERENCES users(id),
  void_reason   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_doctor_payouts_doctor ON doctor_payouts (doctor_id, date_ad);

CREATE TABLE IF NOT EXISTS staff (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  designation   TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  pan_no        TEXT NOT NULL DEFAULT '',
  ssf_no        TEXT NOT NULL DEFAULT '',
  bank_account  TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  -- BS dates, 'YYYY-MM-DD'; left_bs NULL while they still work here
  joined_bs     TEXT,
  left_bs       TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_pay_rates (
  id                   TEXT PRIMARY KEY,
  staff_id             TEXT NOT NULL REFERENCES staff(id),
  -- the first BS month this rate is paid for, 'YYYY-MM'
  from_month_bs        TEXT NOT NULL,
  monthly_salary_paisa INTEGER NOT NULL CHECK (monthly_salary_paisa >= 0),
  -- contributes to the Social Security Fund (11% staff, 20% employer)
  ssf_enrolled         INTEGER NOT NULL DEFAULT 0,
  -- 1% social security tax, for staff who are not on the fund
  sst_applies          INTEGER NOT NULL DEFAULT 1,
  user_id              TEXT REFERENCES users(id),
  created_at           TEXT NOT NULL,
  UNIQUE (staff_id, from_month_bs)
);

CREATE TABLE IF NOT EXISTS salary_adjustments (
  id            TEXT PRIMARY KEY,
  staff_id      TEXT NOT NULL REFERENCES staff(id),
  month_bs      TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('bonus', 'deduction', 'advance_recovery')),
  label         TEXT NOT NULL DEFAULT '',
  amount_paisa  INTEGER NOT NULL CHECK (amount_paisa > 0),
  user_id       TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  voided_at     TEXT,
  voided_by     TEXT REFERENCES users(id),
  void_reason   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_salary_adjustments_staff ON salary_adjustments (staff_id, month_bs);

CREATE TABLE IF NOT EXISTS salary_payments (
  id            TEXT PRIMARY KEY,
  staff_id      TEXT NOT NULL REFERENCES staff(id),
  kind          TEXT NOT NULL CHECK (kind IN ('salary', 'advance')),
  -- the month a salary payment is for; the month an advance was given in
  month_bs      TEXT NOT NULL,
  date_ad       TEXT NOT NULL,
  date_bs       TEXT NOT NULL,
  amount_paisa  INTEGER NOT NULL CHECK (amount_paisa > 0),
  method        TEXT NOT NULL DEFAULT 'cash',
  note          TEXT NOT NULL DEFAULT '',
  user_id       TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  voided_at     TEXT,
  voided_by     TEXT REFERENCES users(id),
  void_reason   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_salary_payments_staff ON salary_payments (staff_id, month_bs);

CREATE TABLE IF NOT EXISTS tooth_records (
  id            TEXT PRIMARY KEY,
  patient_id    TEXT NOT NULL REFERENCES patients(id),
  tooth         INTEGER NOT NULL CHECK (tooth BETWEEN 11 AND 85),
  condition     TEXT NOT NULL,
  -- the surfaces involved, e.g. 'MOD'; empty for the whole tooth
  surfaces      TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  date_ad       TEXT NOT NULL,
  date_bs       TEXT NOT NULL,
  user_id       TEXT REFERENCES users(id),
  created_at    TEXT NOT NULL,
  voided_at     TEXT,
  voided_by     TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_tooth_records_patient ON tooth_records (patient_id, tooth, date_ad);
