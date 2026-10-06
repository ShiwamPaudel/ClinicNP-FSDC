-- 0003_bill_line_short.sql — records an oversold shortfall on a bill line so
-- Admin can reconcile (reality wins at the counter; Architecture §2.2).

ALTER TABLE bill_lines ADD COLUMN short_base_qty INTEGER NOT NULL DEFAULT 0;
