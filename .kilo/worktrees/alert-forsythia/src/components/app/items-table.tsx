"use client";

/**
 * items-table.tsx — the catalogue list, with a search box in front of it.
 *
 * The catalogue is thousands of products now, which changes what this screen
 * is for: nobody scrolls a list that long looking for Amlodipine, they type
 * it. So the box is the way in, and the table under it is what is left after
 * typing.
 *
 * It also stops drawing after a few hundred rows. Painting several thousand
 * rows makes the page slow to open and slow to type into, and the rows past
 * the first screenful were never going to be read — the honest thing is to
 * show the count and ask for a narrower search.
 */
import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { Package, Pencil, Search } from "lucide-react";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { toMixedDisplay, hasNoPrice } from "@/lib/units";
import { formatPaisa } from "@/lib/money";
// Type only: the items repo is server-only, and the price check it exports
// is a one-line wrapper around `hasNoPrice`, which is shared.
import type { Item } from "@/lib/repos/items";

/** How many rows are drawn at once before the list asks to be narrowed. */
const MOST_ROWS = 200;

export interface ItemStock {
  itemId: string;
  sellableBaseQty: number;
}

/** Fold a name the way somebody types it: no case, no spaces, no punctuation. */
function fold(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function ItemsTable({
  items,
  stock,
}: {
  items: Item[];
  stock: ItemStock[];
}) {
  const [query, setQuery] = useState("");
  // Typing stays smooth on a catalogue of thousands: the list catches up.
  const typed = useDeferredValue(query);

  const stockById = useMemo(
    () => new Map(stock.map((s) => [s.itemId, s.sellableBaseQty])),
    [stock],
  );

  // Searchable text per item, built once rather than on every keystroke.
  const haystack = useMemo(
    () =>
      new Map(
        items.map((i) => [i.id, fold(`${i.brandName} ${i.genericName} ${i.manufacturer}`)]),
      ),
    [items],
  );

  const found = useMemo(() => {
    const needle = fold(typed);
    if (!needle) return items;
    return items.filter((i) => haystack.get(i.id)?.includes(needle));
  }, [items, haystack, typed]);

  const visible = found.slice(0, MOST_ROWS);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Package}
        message="No items yet. Add your first medicine to start tracking stock."
        action={
          <Link href="/items/new">
            <Button>Add item</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-500" />
          <Input
            id="items-search"
            aria-label="Search items by name"
            className="pl-9"
            placeholder="Search by brand, generic or maker"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="text-[13px] text-sage-500">
          {found.length === items.length
            ? `${items.length} item${items.length === 1 ? "" : "s"}`
            : `${found.length} of ${items.length}`}
        </p>
      </div>

      {found.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-cream-50 p-8 text-center">
          <Package className="mx-auto mb-2 h-6 w-6 text-sage-500" />
          <p className="text-[15px] font-medium text-sage-900">
            Nothing matches that.
          </p>
          <p className="mt-1 text-[13px] text-sage-500">
            Try part of the brand name, or the generic name.
          </p>
        </div>
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Default rate</TH>
                <TH>In stock</TH>
                <TH>Status</TH>
                <TH>{""}</TH>
              </TR>
            </THead>
            <tbody>
              {visible.map((item) => {
                const sellable = stockById.get(item.id) ?? 0;
                const defaultUnit =
                  item.units.find((u) => u.isDefaultSelling) ?? item.units[0];
                // Something never stocked is not "running low" — it has not
                // started. Saying otherwise puts an amber warning on every row
                // of a freshly imported catalogue, which is how people learn
                // to stop reading the amber warnings.
                const neverStocked = sellable <= 0;
                const low =
                  !neverStocked &&
                  item.minStockBaseQty > 0 &&
                  sellable < item.minStockBaseQty;
                return (
                  <TR key={item.id}>
                    <TD>
                      <Link
                        href={`/items/${item.id}`}
                        className="font-medium text-sage-900 hover:text-sage-600"
                      >
                        {item.brandName}
                      </Link>
                      {item.genericName && (
                        <div className="text-[12px] text-sage-500">
                          {item.genericName}
                        </div>
                      )}
                    </TD>
                    <TD>
                      {!defaultUnit ? (
                        "—"
                      ) : hasNoPrice(item.units) ? (
                        <span className="text-[13px] font-medium text-warn-600">
                          No price yet
                        </span>
                      ) : (
                        `${formatPaisa(defaultUnit.sellingRatePaisa)} / ${defaultUnit.name}`
                      )}
                    </TD>
                    <TD>
                      {item.units.length > 0
                        ? toMixedDisplay(sellable, item.units)
                        : "—"}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {!item.active && <Badge tone="neutral">Inactive</Badge>}
                        {item.active && neverStocked && (
                          <Badge tone="neutral">Not stocked</Badge>
                        )}
                        {low && <Badge tone="warn">Low</Badge>}
                        {item.controlledFlag && <Badge tone="info">Rx</Badge>}
                        {item.active && !low && sellable > 0 && (
                          <Badge tone="ok">In stock</Badge>
                        )}
                      </div>
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/items/${item.id}/edit`}
                        className="inline-flex items-center gap-1.5 rounded-[8px] border border-line bg-cream-50 px-2.5 py-1.5 text-[13px] font-medium text-sage-900 hover:bg-cream-200"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
          {found.length > visible.length && (
            <p className="text-center text-[13px] text-sage-500">
              Showing the first {MOST_ROWS} of {found.length}. Type more of the
              name to narrow it down.
            </p>
          )}
        </>
      )}
    </div>
  );
}
