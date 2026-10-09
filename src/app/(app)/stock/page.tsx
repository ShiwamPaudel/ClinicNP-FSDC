import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listItems } from "@/lib/repos/items";
import {
  itemStockMap,
  stockValuation,
  stockCounts,
} from "@/lib/repos/batches";
import { getCompany } from "@/lib/repos/company";
import { adToIso, adFromIso, toBS, formatBS } from "@/lib/bs";
import { toMixedDisplay } from "@/lib/units";
import { formatPaisa } from "@/lib/money";
import { StockTabs } from "@/components/app/stock-tabs";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

function daysAheadIso(days: number): string {
  return adToIso(new Date(Date.now() + days * 86400000));
}

export default async function CurrentStockPage() {
  await requireUser();
  await requireModulePage("pharmacy");
  const todayIso = adToIso(new Date());

  const [items, stock, company] = await Promise.all([
    listItems(true),
    itemStockMap(todayIso),
    getCompany(),
  ]);
  const windowIso = daysAheadIso(company.expiryAlertDays);
  const [valuation, counts] = await Promise.all([
    stockValuation(todayIso),
    stockCounts(todayIso, windowIso),
  ]);

  const tabCounts = {
    "/stock/low": counts.low,
    "/stock/near-expiry": counts.nearExpiry,
    "/stock/expired": counts.expired,
  };

  return (
    <>
      <StockTabs counts={tabCounts} />
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Stock at cost" value={formatPaisa(valuation.costValuePaisa)} />
          <SummaryCard
            label="Stock at selling rate"
            value={formatPaisa(valuation.salableValuePaisa)}
          />
          <SummaryCard
            label="Expected margin"
            value={formatPaisa(
              valuation.salableValuePaisa - valuation.costValuePaisa,
            )}
          />
        </div>

        {items.length === 0 ? (
          <EmptyState message="No items yet. Add your first medicine to start tracking stock." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>In stock</TH>
                <TH>Nearest expiry</TH>
                <TH numeric>Value at cost</TH>
              </TR>
            </THead>
            <tbody>
              {items.map((item) => {
                const s = stock.get(item.id);
                const sellable = s?.sellableBaseQty ?? 0;
                const low =
                  item.minStockBaseQty > 0 && sellable < item.minStockBaseQty;
                return (
                  <TR key={item.id}>
                    <TD className="font-medium text-sage-900">
                      {item.brandName}
                      {item.genericName && (
                        <div className="text-[12px] text-sage-500">
                          {item.genericName}
                        </div>
                      )}
                    </TD>
                    <TD>
                      {toMixedDisplay(sellable, item.units)}
                      {low && (
                        <Badge tone="warn" className="ml-2">
                          Low
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      {s?.nearestExpiryAd
                        ? formatBS(toBS(adFromIso(s.nearestExpiryAd)), {
                            form: "long",
                            monthScript: "en",
                          })
                        : "—"}
                    </TD>
                    <TD numeric>{formatPaisa(s?.costValuePaisa ?? 0)}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </main>
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-cream-50 p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
        {label}
      </div>
      <div className="mt-1 text-[22px] font-bold text-sage-900 tnum">{value}</div>
    </div>
  );
}
