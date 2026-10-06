-- 0023_payables.sql — paying suppliers and laboratories, and undoing a mistake.
--
-- Append-only: never edit once applied.
--
-- A purchase can now be paid for when it is entered — in full, in part, or not
-- at all (on credit, which is what every purchase was before). What was paid
-- is an ordinary `supplier_payments` row, so the supplier's balance is worked
-- out exactly as it always was: purchases, less returns, less payments.
-- `purchase_id` only records which purchase a payment was made with, so the
-- purchase can say "paid रू X when entered". It is NULL for a payment made on
-- its own, which is every payment recorded before today.
--
-- A payment typed wrong is undone, never deleted — the same rule as a dues
-- payment (0019): it stays in the record, marked with who undid it, when, and
-- why, and stops counting towards the balance. Both payment tables get the
-- same three columns.
--
-- Additive with defaults, so the code already deployed keeps working with the
-- columns in place: it reads none of them, and nothing is undone yet.
--
-- @verify supplier_payments, lab_partner_payments, purchases

ALTER TABLE supplier_payments ADD COLUMN purchase_id TEXT REFERENCES purchases(id);
ALTER TABLE supplier_payments ADD COLUMN voided_at TEXT;
ALTER TABLE supplier_payments ADD COLUMN voided_by TEXT REFERENCES users(id);
ALTER TABLE supplier_payments ADD COLUMN void_reason TEXT NOT NULL DEFAULT '';

ALTER TABLE lab_partner_payments ADD COLUMN voided_at TEXT;
ALTER TABLE lab_partner_payments ADD COLUMN voided_by TEXT REFERENCES users(id);
ALTER TABLE lab_partner_payments ADD COLUMN void_reason TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments (supplier_id, date_ad);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_purchase ON supplier_payments (purchase_id);
