import Link from "next/link";
import { Plus, Tag } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listItems, isUnpriced } from "@/lib/repos/items";
import { itemStockMap } from "@/lib/repos/batches";
import { adToIso } from "@/lib/bs";
import { PageShell } from "@/components/app/page-shell";
import { ItemsTable, type ItemStock } from "@/components/app/items-table";
import { Button } from "@/components/ui/button";

export default async function ItemsPage() {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const [items, stock] = await Promise.all([
    listItems(true),
    itemStockMap(adToIso(new Date())),
  ]);

  const unpriced = items.filter(isUnpriced).length;
  // A Map does not survive the trip to the browser; a plain list does.
  const stockRows: ItemStock[] = items.map((i) => ({
    itemId: i.id,
    sellableBaseQty: stock.get(i.id)?.sellableBaseQty ?? 0,
  }));

  return (
    <PageShell
      title="Items"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/items/pricing">
            <Button variant="secondary">
              <Tag className="h-4 w-4" />
              Set prices
            </Button>
          </Link>
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

      <ItemsTable items={items} stock={stockRows} />
    </PageShell>
  );
}
