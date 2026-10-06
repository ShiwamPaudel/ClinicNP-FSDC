-- 0018_consultations.sql — a doctor's booked consultations, the doctors who
-- can sign in to see their own, and the alerts that go out when one is booked.
--
-- Append-only: never edit once applied.
--
-- @rebuild  users carries CHECK (role IN ('admin','staff','accountant')) from
--           0006 and SQLite cannot widen a CHECK in place, so the table is
--           rebuilt exactly as 0006 rebuilt it.
-- @verify   users, doctors, patients
--
-- Until now a doctor was a name on a slip and a share of the takings. Chunidevi
-- books consultations by phone all day and wrote them in a diary, which meant
-- the answer to "who is Dr Karki seeing on Thursday" lived on one desk and
-- nowhere else. A booking is not a visit: a visit is what happened, a booking
-- is what somebody agreed would happen. They are separate rows and a booking
-- points at the visit it eventually became, if it became one.
--
-- Time of day is stored as "HH:MM" on a 24-hour clock next to the date rather
-- than as one combined moment, because a clinic books "Thursday at 2" in local
-- time and always will. The pair sorts correctly as text, which is all the
-- lists here ever need.
--
-- No CHECK on `status`, for the reason written into 0013, 0015 and 0016: this
-- project has twice rebuilt a table to widen one.

-- ============================================================
-- users: add the Doctor role. A doctor signs in to one screen — their own
-- list of booked consultations — and nothing else.
-- ============================================================
CREATE TABLE users_new (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  pin_hash      TEXT,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'accountant', 'doctor')),
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

-- ============================================================
-- doctors: how to reach them, and which login is theirs
-- ============================================================
ALTER TABLE doctors ADD COLUMN email TEXT NOT NULL DEFAULT '';
-- The login that belongs to this doctor, when they have been given one. A
-- doctor is still not a login: most never get one.
ALTER TABLE doctors ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE doctors ADD COLUMN notify_push INTEGER NOT NULL DEFAULT 1;
ALTER TABLE doctors ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 1;

-- One login belongs to at most one doctor. Partial index, so the many doctors
-- with no login do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_user
  ON doctors (user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- appointments — what somebody agreed would happen
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
  id             TEXT PRIMARY KEY,
  doctor_id      TEXT NOT NULL REFERENCES doctors(id),
  patient_id     TEXT NOT NULL REFERENCES patients(id),
  date_ad        TEXT NOT NULL,
  date_bs        TEXT NOT NULL,
  time_hhmm      TEXT NOT NULL,
  duration_min   INTEGER NOT NULL DEFAULT 15,
  reason         TEXT NOT NULL DEFAULT '',
  -- booked | arrived | seen | cancelled | missed
  status         TEXT NOT NULL DEFAULT 'booked',
  cancel_reason  TEXT NOT NULL DEFAULT '',
  -- set when the person actually turned up and a visit was started for them
  visit_id       TEXT REFERENCES visits(id),
  booked_by      TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_day
  ON appointments (doctor_id, date_ad, time_hhmm);
CREATE INDEX IF NOT EXISTS idx_appointments_day
  ON appointments (date_ad, time_hhmm);
CREATE INDEX IF NOT EXISTS idx_appointments_patient
  ON appointments (patient_id, date_ad DESC);

-- ============================================================
-- push_devices — one row per phone or browser that agreed to be alerted
-- ============================================================
CREATE TABLE IF NOT EXISTS push_devices (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  -- the address the alert is delivered to, minted by the browser
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  label        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  last_sent_at TEXT,
  -- a device that has been thrown away answers permanently; it is dropped
  fail_reason  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices (user_id);

-- ============================================================
-- alerts_sent — what went out, where, and whether it landed
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts_sent (
  id             TEXT PRIMARY KEY,
  appointment_id TEXT REFERENCES appointments(id),
  -- push | email
  channel        TEXT NOT NULL,
  target         TEXT NOT NULL DEFAULT '',
  -- sent | failed | off
  status         TEXT NOT NULL,
  detail         TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_appointment
  ON alerts_sent (appointment_id, created_at DESC);
