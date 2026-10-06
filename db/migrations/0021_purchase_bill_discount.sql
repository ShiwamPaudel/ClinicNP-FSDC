-- 0021_purchase_bill_discount.sql — the discount a supplier gives after the total.
--
-- Append-only: never edit once applied.
--
-- Real supplier invoices from Chunidevi's distributors end with a discount on the
-- whole bill, not on each line: "LESS DISCOUNT 480.61", "10% Discount",
-- "Discount 0%" + "Trade Discount 0%". Most also carry a rounding line
-- ("ROUNDING 0.43", "-0.31") so the net total lands on whole rupees. Without
-- somewhere to put them, a purchase entered here could not add up to the paper
-- it was copied from (D-143).
--
-- `discount_paisa` keeps its meaning: the sum of the per-line discounts.
-- Two columns are added beside it, both additive with a default of 0, so every
-- purchase recorded before today reads exactly as it did.
--
-- @verify purchases, purchase_lines, batches

-- What the supplier took off the whole bill, after the lines were added up.
ALTER TABLE purchases ADD COLUMN bill_discount_paisa INTEGER NOT NULL DEFAULT 0;

-- The rounding line, which may be up or down, so the net total matches the paper.
ALTER TABLE purchases ADD COLUMN rounding_paisa INTEGER NOT NULL DEFAULT 0;
