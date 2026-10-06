import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listItems } from "@/lib/repos/items";
import { itemStockMap, stockCounts } from "@/lib/repos/batches";
import { listSuppliers } from "@/lib/repos/suppliers";
import { getCompany } from "@/lib/repos/company";
import { adToIso } from "@/lib/bs";
import { toMixedDisplay } from "@/lib/units";
import { StockTabs } from "@/components/app/stock-tabs";
import { PrintButton } from "@/components/app/print-button";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckCircle2 } from "lucide-react";

function daysAheadIso(days: number): string {
  return adToIso(new Date(Date.now() + days * 86400000));
}

export default async function LowStockPage() {
  await requireUser();
  await requireModulePage("pharmacy");
  const todayIso = adToIso(new Date());
  const [items, stock, suppliers, company] = await Promise.all([
    listItems(),
    itemStockMap(todayIso),
    listSuppliers(true),
    getCompany(),
  ]);
  const counts = await stockCounts(todayIso, daysAheadIso(company.expiryAlertDays));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const low = items.filter((i) => {
    const sellable = stock.get(i.id)?.sellableBaseQty ?? 0;
    return i.minStockBaseQty > 0 && sellable < i.minStockBaseQty;
  });

  // group by preferred supplier
  const groups = new Map<string, typeof low>();
  for (const item of low) {
    const key = item.preferredSupplierId ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  return (
    <>
      <StockTabs
        counts={{
          "/stock/low": counts.low,
          "/stock/near-expiry": counts.nearExpiry,
          "/stock/expired": counts.expired,
        }}
      />
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
        {low.length === 0 ? (
          <EmptyState icon={CheckCircle2} message="Nothing is running low. You're well stocked." />
        ) : (
          <>
            <div className="mb-4 flex justify-end print:hidden">
              <PrintButton label="Print order list" />
            </div>
            <div className="flex flex-col gap-6">
              {[...groups.entries()].map(([supplierId, list]) => (
                <div key={supplierId || "none"}>
                  <h2 className="mb-2 text-[15px] font-semibold text-sage-900">
                    {supplierId ? supplierName.get(supplierId) : "No preferred supplier"}
                  </h2>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Item</TH>
                        <TH>In stock</TH>
                        <TH>Reorder level</TH>
                      </TR>
                    </THead>
                    <tbody>
                      {list.map((item) => {
                        const sellable = stock.get(item.id)?.sellableBaseQty ?? 0;
                        return (
                          <TR key={item.id}>
                            <TD className="font-medium text-sage-900">
                              {item.brandName}
                            </TD>
                            <TD>{toMixedDisplay(sellable, item.units)}</TD>
                            <TD>{toMixedDisplay(item.minStockBaseQty, item.units)}</TD>
                          </TR>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
