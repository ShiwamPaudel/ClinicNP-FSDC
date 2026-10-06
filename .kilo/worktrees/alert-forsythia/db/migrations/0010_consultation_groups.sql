-- 0010_consultation_groups.sql — which service groups count as a consultation.
-- Append-only: never edit once applied.
--
-- The doctor-share rules `pct_consult` and `fixed_consult` pay on consultation
-- lines only (PRD §4B.3), and the follow-up window is a consultation idea too.
-- Nothing recorded which groups those are, and the answer must not be "the
-- group happens to be named OPD Consultation" — every group is renameable, and
-- a clinic may well add "Emergency Consultation" or bill a consultation under
-- a group of its own.
--
-- So the group carries the flag, and the Admin can set it on any group.

ALTER TABLE service_groups ADD COLUMN is_consultation INTEGER NOT NULL DEFAULT 0;

UPDATE service_groups SET is_consultation = 1 WHERE id IN ('grp_opd', 'grp_followup');
