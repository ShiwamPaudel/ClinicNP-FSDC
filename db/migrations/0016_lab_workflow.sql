-- 0016_lab_workflow.sql — what actually happens to a sample.
--
-- Append-only: never edit once applied.
--
-- Chunidevi does not run its own laboratory. It bills a test, takes the sample,
-- sends it out, and waits for a report to come back — and until now the
-- software knew about the first of those four and nothing else. A test was
-- billed and then vanished from view, which meant the question a clinic asks
-- twenty times a day ("has that one gone yet?", "is the report back?") had no
-- answer anywhere except somebody's memory.
--
-- The stages are stamped as times rather than tracked as a status column. A
-- status says where something is; a timestamp says where it is AND when it got
-- there, which is the half you need when a sample has gone missing and the
-- question is who had it last. The stage is derived:
--
--   nothing stamped        -> waiting to be collected
--   collected_at           -> collected, waiting to go out
--   dispatched_at          -> gone to the laboratory, waiting for a report
--   report_received_at     -> report is here, waiting for the patient
--   report_given_at        -> done
--
-- `dispatched_at` already exists (0009), where it was stamped by printing a
-- dispatch slip. It keeps its meaning and becomes the third stage.
--
-- No CHECK and no enum, for the reason written into 0013 and 0015: this
-- project has twice rebuilt a table to widen one.

ALTER TABLE bill_service_lines ADD COLUMN collected_at TEXT;
ALTER TABLE bill_service_lines ADD COLUMN report_received_at TEXT;
ALTER TABLE bill_service_lines ADD COLUMN report_given_at TEXT;

-- Why a sample is stuck: haemolysed and being redrawn, patient did not come
-- back, laboratory rejected it. Free text, because the reasons are not a list
-- anybody can write down in advance and a wrong list gets ignored.
ALTER TABLE bill_service_lines ADD COLUMN lab_note TEXT NOT NULL DEFAULT '';

-- The worklists are all "the oldest thing not yet done", so they are read in
-- the order things were billed, filtered by which stamp is still missing.
CREATE INDEX IF NOT EXISTS idx_bsl_lab_collected
  ON bill_service_lines (collected_at);
CREATE INDEX IF NOT EXISTS idx_bsl_lab_dispatched
  ON bill_service_lines (dispatched_at);
CREATE INDEX IF NOT EXISTS idx_bsl_lab_report
  ON bill_service_lines (report_received_at, report_given_at);
