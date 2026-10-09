import Link from "next/link";
import { Plus, Tag } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { requireModulePage, getModules } from "@/lib/modules";
import { listItems, isUnpriced } from "@/lib/repos/items";
import { itemStockMap } from "@/lib/repos/batches";
import { itemPurchases } from "@/lib/repos/purchases";
import { buysForUse } from "@/lib/supplies";
import { adToIso } from "@/lib/bs";
import { PageShell } from "@/components/app/page-shell";
import {
  ItemsTable,
  type ItemStock,
  type ItemLastBought,
} from "@/components/app/items-table";
import { Button } from "@/components/ui/button";

export default async function ItemsPage() {
  await requireAdmin();
  await requireModulePage("supplies");
  const modules = await getModules();
  // Bought for use, nothing is counted: the list says when each item was last
  // bought and for how much instead of what is in stock (C-035).
  const forUse = buysForUse(modules);
  const [items, stock, bought] = await Promise.all([
    listItems(true),
    forUse
      ? Promise.resolve(new Map<string, { sellableBaseQty: number }>())
      : itemStockMap(adToIso(new Date())),
    forUse ? itemPurchases() : Promise.resolve([]),
  ]);

  // Selling prices only matter where medicine is sold at the counter. A
  // clinic buying its own materials is never nagged to price them.
  const sells = modules.pharmacy;
  const unpriced = sells ? items.filter(isUnpriced).length : 0;
  // A Map does not survive the trip to the browser; a plain list does.
  const stockRows: ItemStock[] = items.map((i) => ({
    itemId: i.id,
    sellableBaseQty: stock.get(i.id)?.sellableBaseQty ?? 0,
  }));
  // Newest first, so the first row seen for an item is its last purchase.
  const lastBought: ItemLastBought[] = [];
  const seen = new Set<string>();
  for (const b of bought) {
    if (seen.has(b.itemId)) continue;
    seen.add(b.itemId);
    lastBought.push({
      itemId: b.itemId,
      dateBs: b.dateBs,
      costPaisa: b.costPaisa,
      unitName: b.unitName,
    });
  }

  return (
    <PageShell
      title="Items"
      actions={
        <div className="flex items-center gap-2">
          {sells && (
            <Link href="/items/pricing">
              <Button variant="secondary">
                <Tag className="h-4 w-4" />
                Set prices
              </Button>
            </Link>
          )}
          <Link href="/items/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add item
            </Button>
          </Link>
        </div>
      }
    >
      {unpriced > 0 && (
        <Link
          href="/items/pricing"
          className="mb-4 flex items-center justify-between gap-3 rounded-[10px] border border-warn-600/30 bg-warn-100 px-4 py-3 hover:bg-warn-100/70"
        >
          <div className="text-[13px] text-sage-900">
            <strong className="font-semibold">
              {unpriced} medicine{unpriced === 1 ? " has" : "s have"} no price yet
            </strong>{" "}
            — price them here, or let the first sale set the price.
          </div>
          <span className="shrink-0 text-[13px] font-semibold text-sage-900">
            Set prices →
          </span>
        </Link>
      )}

      {forUse ? (
        <ItemsTable items={items} lastBought={lastBought} forUse />
      ) : (
        <ItemsTable items={items} stock={stockRows} />
      )}
    </PageShell>
  );
}
