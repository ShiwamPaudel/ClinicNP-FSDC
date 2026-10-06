/**
 * demo-pitch-2.ts — TEMPORARY, second pass. Adds the pharmacy paperwork the
 * first pass left empty: a purchase, a supplier return, and two stock-outs,
 * so the purchase register and stock-out register have something to show.
 *
 * Run: TURSO_DATABASE_URL=file:tests/demo-pitch.db pnpm tsx db/demo-pitch-2.ts
 */
import { createClient } from "@libsql/client";
import { ulid } from "ulid";
import { toBS, bsToDbText, adToIso } from "../src/lib/bs";

for (const f of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* absent — fine */
  }
}

const url = process.env.TURSO_DATABASE_URL!;
if (!url.startsWith("file:")) {
  throw new Error(`refusing to run against a non-file database: ${url}`);
}
const c = createClient({ url });
const NOW = new Date().toISOString();

function dayBack(n: number): { ad: string; bs: string } {
  const ad = new Date(Date.now() - n * 86400000);
  return { ad: adToIso(ad), bs: bsToDbText(toBS(ad)) };
}

async function main() {
  const adminId = (await c.execute("SELECT id FROM users WHERE username='admin'"))
    .rows[0]!.id as string;
  const fyId = (await c.execute("SELECT id FROM fiscal_years WHERE status='open'"))
    .rows[0]!.id as number;
  const supId = (await c.execute("SELECT id FROM suppliers LIMIT 1")).rows[0]!
    .id as string;
  const amox = (await c.execute(
    "SELECT id FROM items WHERE brand_name='Sample Amoxicillin 500'",
  )).rows[0]!.id as string;
  const pcm = (await c.execute(
    "SELECT id FROM items WHERE brand_name='Sample Paracetamol 500'",
  )).rows[0]!.id as string;

  // ---------------------------------------------------------------
  // a purchase — stock coming in, on a new batch each
  // ---------------------------------------------------------------
  const pd = dayBack(10);
  const purchaseId = ulid();
  const lines: { item: string; batchNo: string; expDays: number; level: number;
    qty: number; factor: number; cost: number }[] = [
    { item: amox, batchNo: "AMX-2301", expDays: 540, level: 2, qty: 5, factor: 60, cost: 9000 },
    { item: pcm, batchNo: "PCM-3401", expDays: 620, level: 1, qty: 40, factor: 10, cost: 620 },
  ];
  let subtotal = 0;
  for (const l of lines) subtotal += l.cost * l.qty;

  await c.execute({
    sql: `INSERT INTO purchases (id,purchase_no,supplier_id,supplier_invoice_no,
            date_ad,date_bs,subtotal_paisa,discount_paisa,vat_paisa,total_paisa,
            user_id,created_at)
          VALUES (?,?,?,?,?,?,?,0,0,?,?,?)`,
    args: [purchaseId, "PUR-1", supId, "SMPL-INV-4471", pd.ad, pd.bs,
      subtotal, subtotal, adminId, NOW],
  });

  const newBatch: Record<string, string> = {};
  for (const l of lines) {
    const batchId = ulid();
    newBatch[l.item] = batchId;
    const exp = new Date(Date.now() + l.expDays * 86400000);
    const baseQty = l.qty * l.factor;
    const costPerBase = Math.round(l.cost / l.factor);
    await c.execute({
      sql: `INSERT INTO batches (id,item_id,batch_no,mfg_date_ad,expiry_date_ad,
              purchase_cost_paisa_per_base,received_base_qty,remaining_base_qty,
              supplier_id,purchase_id,created_at)
            VALUES (?,?,?,NULL,?,?,?,?,?,?,?)`,
      args: [batchId, l.item, l.batchNo, adToIso(exp), costPerBase, baseQty,
        baseQty, supId, purchaseId, NOW],
    });
    await c.execute({
      sql: `INSERT INTO purchase_lines (id,purchase_id,item_id,batch_id,unit_level,
              qty,free_qty,cost_paisa,discount_paisa)
            VALUES (?,?,?,?,?,?,0,?,0)`,
      args: [ulid(), purchaseId, l.item, batchId, l.level, l.qty, l.cost],
    });
    await c.execute({
      sql: `INSERT INTO stock_moves (id,batch_id,item_id,base_qty_delta,reason,
              ref_table,ref_id,user_id,at)
            VALUES (?,?,?,?,'purchase','purchases',?,?,?)`,
      args: [ulid(), batchId, l.item, baseQty, purchaseId, adminId,
        `${pd.ad}T11:00:00.000Z`],
    });
  }

  // ---------------------------------------------------------------
  // a supplier return, recorded as a stock-out with that reason
  // ---------------------------------------------------------------
  const rd = dayBack(6);
  const retId = ulid();
  const retBatch = newBatch[pcm]!;
  const retBaseQty = 50; // 5 strips
  const retCostPerBase = 62;
  await c.execute({
    sql: `INSERT INTO purchase_returns (id,return_no,supplier_id,date_ad,date_bs,
            reason,total_paisa,user_id,created_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [retId, "PRT-1", supId, rd.ad, rd.bs, "Short-dated stock taken back",
      retBaseQty * retCostPerBase, adminId, NOW],
  });
  await c.execute({
    sql: `INSERT INTO purchase_return_lines (id,purchase_return_id,batch_id,
            base_qty,cost_paisa)
          VALUES (?,?,?,?,?)`,
    args: [ulid(), retId, retBatch, retBaseQty, retCostPerBase],
  });

  // ---------------------------------------------------------------
  // stock-outs — the register that answers "what did I lose, and to what?"
  // ---------------------------------------------------------------
  interface Adj {
    no: number; back: number; dir: "out" | "in"; reason: string;
    supplier: string | null; note: string; item: string; batch: string;
    level: number; qtyEntered: number; factor: number; costPerBase: number;
    returnId?: string;
  }
  const adjustments: Adj[] = [
    { no: 1, back: 6, dir: "out", reason: "returned_to_supplier", supplier: supId,
      note: "Short-dated stock taken back by the supplier", item: pcm,
      batch: retBatch, level: 1, qtyEntered: 5, factor: 10, costPerBase: 62,
      returnId: retId },
    { no: 2, back: 4, dir: "out", reason: "damaged", supplier: null,
      note: "Strip crushed in the delivery carton", item: pcm, batch: retBatch,
      level: 1, qtyEntered: 2, factor: 10, costPerBase: 62 },
    { no: 3, back: 2, dir: "out", reason: "clinic_use", supplier: null,
      note: "Used in a dressing at the clinic", item: amox,
      batch: newBatch[amox]!, level: 0, qtyEntered: 4, factor: 1,
      costPerBase: 150 },
  ];

  for (const a of adjustments) {
    const d = dayBack(a.back);
    const adjId = ulid();
    const baseQty = a.qtyEntered * a.factor;
    const cost = baseQty * a.costPerBase;
    await c.execute({
      sql: `INSERT INTO stock_adjustments (id,adjustment_no,fiscal_year_id,direction,
              date_ad,date_bs,reason,supplier_id,visit_id,note,total_cost_paisa,
              purchase_return_id,user_id,created_at)
            VALUES (?,?,?,?,?,?,?,?,NULL,?,?,?,?,?)`,
      args: [adjId, a.no, fyId, a.dir, d.ad, d.bs, a.reason, a.supplier, a.note,
        cost, a.returnId ?? null, adminId, `${d.ad}T15:00:00.000Z`],
    });
    await c.execute({
      sql: `INSERT INTO stock_adjustment_lines (id,adjustment_id,item_id,batch_id,
              base_qty,unit_level_entered,qty_entered,cost_paisa)
            VALUES (?,?,?,?,?,?,?,?)`,
      args: [ulid(), adjId, a.item, a.batch, baseQty, a.level, a.qtyEntered, cost],
    });
    await c.execute({
      sql: "UPDATE batches SET remaining_base_qty = remaining_base_qty - ? WHERE id=?",
      args: [baseQty, a.batch],
    });
    await c.execute({
      sql: `INSERT INTO stock_moves (id,batch_id,item_id,base_qty_delta,reason,
              ref_table,ref_id,user_id,at)
            VALUES (?,?,?,?,?,'stock_adjustments',?,?,?)`,
      args: [ulid(), a.batch, a.item, -baseQty, a.reason, adjId, adminId,
        `${d.ad}T15:00:00.000Z`],
    });
  }

  await c.execute({
    sql: "UPDATE fiscal_years SET next_stockout_no=? WHERE id=?",
    args: [adjustments.length + 1, fyId],
  });

  // ---------------------------------------------------------------
  // a supplier payment, so the supplier ledger carries a balance
  // ---------------------------------------------------------------
  const sd = dayBack(5);
  await c.execute({
    sql: `INSERT INTO supplier_payments (id,supplier_id,date_ad,date_bs,
            amount_paisa,method,note,user_id,created_at)
          VALUES (?,?,?,?,?,'bank','Part payment',?,?)`,
    args: [ulid(), supId, sd.ad, sd.bs, 200000, adminId, NOW],
  }).catch((e) => console.log("supplier payment skipped:", e.message));

  const neg = await c.execute(
    "SELECT COUNT(*) n FROM batches WHERE remaining_base_qty < 0",
  );
  c.close();
  console.log(
    `pass 2: 1 purchase (${lines.length} lines), 1 supplier return, ` +
    `${adjustments.length} stock-outs. negative batches: ${neg.rows[0]!.n}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
