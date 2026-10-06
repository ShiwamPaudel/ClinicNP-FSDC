-- 0004_compliance.sql — CBMS (IRD) transmission toggle on the company profile.
-- The queue (cbms_queue) already exists from 0001; this just gates transmission.

ALTER TABLE company ADD COLUMN cbms_enabled INTEGER NOT NULL DEFAULT 0;
