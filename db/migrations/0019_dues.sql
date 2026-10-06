-- 0019_dues.sql — bills sold on dues, and the money that comes in against them.
--
-- Append-only: never edit once applied.
--
-- Chunidevi sometimes hands over medicine or does a test and is paid later — all of
-- it, or the part the patient could not pay today. Until now a bill could only
-- be wholly paid or wholly "credit", with one button to call the whole thing
-- paid. Nothing recorded a part payment, who owed what, or the money when it
-- finally came in.
--
-- Additive only. Nothing is rebuilt and no existing row loses anything.
-- `bills.payment_method` keeps its CHECK (cash | qr | credit): 'credit' is what
-- a bill on dues has always been, so the constraint does not need to move and
-- the hottest table in the database does not need to be copied.
--
-- @verify bills,sale_returns,patients,bill_lines,bill_service_lines

-- What was left owing when the bill was made: the total less whatever was paid
-- at the counter. Fixed at the sale, like every other figure on a bill. What is
-- owed today is this, less what has come in since, less anything returned.
ALTER TABLE bills ADD COLUMN due_paisa INTEGER NOT NULL DEFAULT 0;

-- On a bill on dues, how the part paid at the counter was paid: 'cash' or 'qr'.
-- NULL when nothing was paid then. No CHECK, for the reason in 0013 and 0016.
ALTER TABLE bills ADD COLUMN paid_now_method TEXT;

-- Every credit bill before this migration was sold with nothing paid, so its
-- whole total was left owing. A bill already marked paid keeps its
-- `credit_settled_at`, which still means "cleared in full".
UPDATE bills SET due_paisa = total_paisa WHERE payment_method = 'credit';

-- How much of a return came off what the patient still owed, rather than going
-- back to them as money. A return on a bill with nothing owing is all money.
ALTER TABLE sale_returns ADD COLUMN against_due_paisa INTEGER NOT NULL DEFAULT 0;

-- Returns already made on credit bills never marked paid came off what was
-- owed: nothing had been paid, so there was nothing to hand back. Taken in the
-- order they were made, each takes what is left of the debt and no more.
UPDATE sale_returns
   SET against_due_paisa = (
         SELECT MAX(0, MIN(sr.total_paisa,
                   b.due_paisa - IFNULL((SELECT SUM(prev.total_paisa)
                                           FROM sale_returns prev
                                          WHERE prev.bill_id = sr.bill_id
                                            AND prev.rowid < sr.rowid), 0)))
           FROM sale_returns sr
           JOIN bills b ON b.id = sr.bill_id
          WHERE sr.id = sale_returns.id)
 WHERE bill_id IN (SELECT id FROM bills
                    WHERE payment_method = 'credit'
                      AND credit_settled_at IS NULL);

-- Money received against a bill on dues after the bill was made.
--
-- One payment from one person can clear several of their bills, oldest first;
-- each bill it touches gets its own row, and the rows share a `receipt_id` so
-- the payment can be read — or undone — as the one thing that happened. The
-- receipt id is minted by the screen before it is sent, so pressing the button
-- twice records the payment once.
--
-- `fiscal_year_id` is the year the money came IN, which is the open year on the
-- day, not necessarily the bill's own year: dues from a closed year are still
-- collected, and recorded where the money actually arrived (D-060 is the same
-- rule for refunds).
--
-- A payment entered by mistake is voided, never deleted: a day already closed
-- must still add up to what was in the drawer that evening.
CREATE TABLE IF NOT EXISTS due_payments (
  id              TEXT PRIMARY KEY,
  receipt_id      TEXT NOT NULL,
  bill_id         TEXT NOT NULL REFERENCES bills(id),
  amount_paisa    INTEGER NOT NULL,
  method          TEXT NOT NULL DEFAULT 'cash',
  note            TEXT NOT NULL DEFAULT '',
  date_ad         TEXT NOT NULL,
  date_bs         TEXT NOT NULL,
  fiscal_year_id  INTEGER REFERENCES fiscal_years(id),
  user_id         TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL,
  voided_at       TEXT,
  voided_by       TEXT REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_due_payments_bill ON due_payments (bill_id);
CREATE INDEX IF NOT EXISTS idx_due_payments_date ON due_payments (date_ad);

-- A receipt touches each bill at most once. Unique, so two presses of the same
-- button that race each other still record the money once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_due_payments_receipt_bill
  ON due_payments (receipt_id, bill_id);

-- The Dues screen reads every bill still on dues. Only a handful of bills ever
-- are, so the index covers only them.
CREATE INDEX IF NOT EXISTS idx_bills_on_dues ON bills (date_ad)
  WHERE payment_method = 'credit';
