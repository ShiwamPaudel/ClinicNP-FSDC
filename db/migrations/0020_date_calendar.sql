-- 0020_date_calendar.sql — which calendar the date boxes open in.
--
-- Append-only: never edit once applied.
--
-- A medicine pack prints its expiry in English dates ("EXP 06/2027"), and
-- until now every date box offered only the Nepali calendar, so each one was
-- converted in somebody's head. The shop now chooses: 'bs' (Nepali, as every
-- box has always been) or 'ad' (English). Each box also has a switch inside
-- it for a single pick.
--
-- Only the picking changes. Every date is still stored, sent and printed in
-- BS exactly as before, so no other table is touched (D-137).
--
-- One column with a default. Nothing is rebuilt and no existing row changes
-- except to gain 'bs', which is what it was already showing.
--
-- @verify company

ALTER TABLE company ADD COLUMN date_calendar TEXT NOT NULL DEFAULT 'bs'
  CHECK (date_calendar IN ('bs', 'ad'));
