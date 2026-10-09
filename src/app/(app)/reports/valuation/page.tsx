import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listItems } from "@/lib/repos/items";
import { itemStockMap, stockValuation } from "@/lib/repos/batches";
import { adToIso } from "@/lib/bs";
import { toMixedDisplay } from "@/lib/units";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";

export default async function ValuationPage() {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const todayIso = adToIso(new Date());
  const [items, stock, totals] = await Promise.all([
    listItems(true),
    itemStockMap(todayIso),
    stockValuation(todayIso),
  ]);

  const rows = items
    .map((item) => {
      const s = stock.get(item.id);
      const baseUnit = item.units.find((u) => u.level === 0);
      const sellable = s?.sellableBaseQty ?? 0;
      const salable = sellable * (baseUnit?.sellingRatePaisa ?? 0);
      return {
        item,
        sellable,
        costValue: s?.costValuePaisa ?? 0,
        salableValue: salable,
      };
    })
    .filter((r) => r.sellable > 0);

  return (
    <ReportFrame
      showFiscalYear={false} title="Stock valuation" rangeLabel="As of today" showRange={false}>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card label="Total at cost" value={formatPaisa(totals.costValuePaisa)} />
        <Card label="Total at selling rate" value={formatPaisa(totals.salableValuePaisa)} />
        <Card
          label="Expected margin"
          value={formatPaisa(totals.salableValuePaisa - totals.costValuePaisa)}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState message="Nothing on the shelf yet. Enter your opening stock and it will be valued here." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH>In stock</TH>
              <TH numeric>Value at cost</TH>
              <TH numeric>Value at selling</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.item.id}>
                <TD className="font-medium text-sage-900">{r.item.brandName}</TD>
                <TD>{toMixedDisplay(r.sellable, r.item.units)}</TD>
                <TD numeric>{formatPaisa(r.costValue, false)}</TD>
                <TD numeric>{formatPaisa(r.salableValue, false)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </ReportFrame>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-cream-50 p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
        {label}
      </div>
      <div className="mt-1 text-[22px] font-bold text-sage-900 tnum">{value}</div>
    </div>
  );
}
