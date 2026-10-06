-- 0008_clinic_core.sql — the clinic's record keeping: patients, their visits,
-- and the files that come back from an outside lab or imaging.
-- Append-only: never edit once applied.
--
-- Ids follow the house convention: TEXT ULIDs, client-mintable, so a patient
-- registered in a power cut carries the same id once it syncs (Phase 5). Only
-- fiscal_years uses an INTEGER key. Architecture's sketch showed INTEGER keys
-- and a separate `ulid` column; the id IS the ULID here, exactly as bills work,
-- so the extra column would be redundant.

-- ============================================================
-- patients — lifetime numbers, never reset at year close (D-028)
-- ============================================================
CREATE TABLE IF NOT EXISTS patients (
  id              TEXT PRIMARY KEY,
  -- NULL until the server assigns one; an offline registration carries a
  -- provisional label on the device until then.
  patient_no      INTEGER UNIQUE,
  name            TEXT NOT NULL,
  sex             TEXT NOT NULL CHECK (sex IN ('f', 'm', 'o')),
  -- Nepali clinics record an age, not a date of birth. Age is stored with the
  -- date it was true on, so it is never displayed as if it were current (D-031).
  age_value       INTEGER,
  age_unit        TEXT CHECK (age_unit IN ('y', 'm', 'd')),
  age_as_of_ad    TEXT,
  dob_ad          TEXT,
  phone           TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  guardian_name   TEXT NOT NULL DEFAULT '',
  blood_group     TEXT NOT NULL DEFAULT '',
  note            TEXT NOT NULL DEFAULT '',
  referred_by     TEXT NOT NULL DEFAULT '',
  active          INTEGER NOT NULL DEFAULT 1,
  -- set when this record was merged away into another; the number is retired,
  -- never recycled (D-028)
  merged_into_id  TEXT REFERENCES patients(id),
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients (phone);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients (name);
CREATE INDEX IF NOT EXISTS idx_patients_no ON patients (patient_no);
CREATE INDEX IF NOT EXISTS idx_patients_active ON patients (active, merged_into_id);

-- ============================================================
-- visits — one encounter on one BS date, numbered per fiscal year
-- ============================================================
CREATE TABLE IF NOT EXISTS visits (
  id             TEXT PRIMARY KEY,
  visit_no       INTEGER,
  fiscal_year_id INTEGER REFERENCES fiscal_years(id),
  patient_id     TEXT NOT NULL REFERENCES patients(id),
  date_ad        TEXT NOT NULL,
  date_bs        TEXT NOT NULL,
  type           TEXT NOT NULL DEFAULT 'new'
                   CHECK (type IN ('new', 'followup', 'report_review')),
  -- doctors arrive in 0009; no foreign key yet, the repo resolves it
  doctor_id      TEXT,
  department     TEXT NOT NULL DEFAULT '',
  complaint      TEXT NOT NULL DEFAULT '',
  findings       TEXT NOT NULL DEFAULT '',
  advice         TEXT NOT NULL DEFAULT '',
  -- vitals: all optional, never validated, never interpreted (Rules §2.5)
  bp             TEXT NOT NULL DEFAULT '',
  pulse          INTEGER,
  temp_c         REAL,
  weight_kg      REAL,
  spo2           INTEGER,
  status         TEXT NOT NULL DEFAULT 'waiting'
                   CHECK (status IN ('waiting', 'seen', 'closed', 'cancelled')),
  cancel_reason  TEXT NOT NULL DEFAULT '',
  user_id        TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visits_patient ON visits (patient_id, date_ad DESC);
CREATE INDEX IF NOT EXISTS idx_visits_date_bs ON visits (date_bs);
CREATE INDEX IF NOT EXISTS idx_visits_doctor ON visits (doctor_id, date_bs);
CREATE INDEX IF NOT EXISTS idx_visits_fy ON visits (fiscal_year_id, visit_no);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits (date_ad, status);

-- ============================================================
-- attachments — metadata only; the bytes live in blob storage (Architecture §2.6)
-- ============================================================
CREATE TABLE IF NOT EXISTS attachments (
  id                   TEXT PRIMARY KEY,
  patient_id           TEXT NOT NULL REFERENCES patients(id),
  visit_id             TEXT REFERENCES visits(id),
  -- bill_service_lines arrives in 0009; no foreign key yet
  bill_service_line_id TEXT,
  kind                 TEXT NOT NULL DEFAULT 'report'
                         CHECK (kind IN ('report', 'image', 'scan', 'other')),
  title                TEXT NOT NULL DEFAULT '',
  file_name            TEXT NOT NULL,
  mime                 TEXT NOT NULL,
  size_bytes           INTEGER NOT NULL DEFAULT 0,
  -- the storage key. Never exposed to the client; serving goes through an
  -- authenticated route (Rules §1.13).
  blob_key             TEXT NOT NULL,
  uploaded_by          TEXT REFERENCES users(id),
  created_at           TEXT NOT NULL,
  -- soft delete, hard-deleted by the nightly sweep 30 days later
  deleted_at           TEXT,
  deleted_by           TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_attachments_patient ON attachments (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachments_visit ON attachments (visit_id);
CREATE INDEX IF NOT EXISTS idx_attachments_line ON attachments (bill_service_line_id);
CREATE INDEX IF NOT EXISTS idx_attachments_deleted ON attachments (deleted_at);

-- ============================================================
-- bills gain the patient link now, so Phase 3 only has to fill them
-- ============================================================
ALTER TABLE bills ADD COLUMN patient_id TEXT REFERENCES patients(id);
ALTER TABLE bills ADD COLUMN visit_id   TEXT REFERENCES visits(id);
-- derived at ingest and stored so reports can group without a double join
ALTER TABLE bills ADD COLUMN kind TEXT NOT NULL DEFAULT 'pharmacy';

CREATE INDEX IF NOT EXISTS idx_bills_patient ON bills (patient_id);
CREATE INDEX IF NOT EXISTS idx_bills_kind ON bills (kind, date_bs);
