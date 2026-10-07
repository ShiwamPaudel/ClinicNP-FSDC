-- 0024_vat_inclusive.sql — rates that already include VAT, and the taxable amount on every bill.
--
-- Append-only: never edit once applied.
--
-- A VAT-registered clinic prices a service one of two ways. "Crown filling,
-- Rs 10,000" either means Rs 10,000 plus 13% VAT (Rs 11,300 to pay), or
-- Rs 10,000 to pay with the VAT already inside it (Rs 8,849.56 + Rs 1,150.44).
-- Until now only the first was possible. `company.vat_inclusive` chooses.
--
-- The bill records the choice it was made under, so changing the setting later
-- never changes how an old bill reads, reprints or is refunded. It also records
-- its taxable amount: the VAT report used `subtotal - discount`, which counts
-- exempt services as taxable on a mixed bill and, for a VAT-inclusive bill,
-- counts the VAT itself as taxable. NULL on bills made before today, where the
-- report falls back to the old sum.
--
-- All three are additive, so every row reads exactly as it did.
--
-- @verify company, bills, bill_lines, bill_service_lines

-- 0 = add VAT on top of the rate; 1 = the rate already includes VAT.
ALTER TABLE company ADD COLUMN vat_inclusive INTEGER NOT NULL DEFAULT 0;

-- The mode this bill was made under.
ALTER TABLE bills ADD COLUMN vat_inclusive INTEGER NOT NULL DEFAULT 0;

-- What the VAT was charged on, after discount and excluding the VAT itself.
ALTER TABLE bills ADD COLUMN taxable_paisa INTEGER;
