-- 0015_service_sample_type.sql — what has to be collected for a test.
--
-- Append-only: never edit once applied.
--
-- Chunidevi sends samples to an outside laboratory, and the step the counter
-- actually performs is collecting one. Blood, urine, stool and a swab are
-- collected differently, go into different containers, and a sample-collection
-- screen that does not say which is a screen that gets it wrong once.
--
-- Empty is the correct value for everything that is not a test: a consultation
-- and an ultrasound collect nothing, and a blank here says so honestly rather
-- than forcing a "none" that then has to be filtered out everywhere.
--
-- No CHECK, for the reason written into 0013: this project has twice rebuilt a
-- table to widen one, and the value is a free-text label chosen from a list in
-- the UI. The day a laboratory asks for "sputum" that must be a typing change,
-- not a migration.

ALTER TABLE services ADD COLUMN sample_type TEXT NOT NULL DEFAULT '';
