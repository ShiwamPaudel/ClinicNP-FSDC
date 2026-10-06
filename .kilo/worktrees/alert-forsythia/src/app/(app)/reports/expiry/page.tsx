import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listItems } from "@/lib/repos/items";
import { listRacks, allItemLocations } from "@/lib/repos/racks";
import { cellLabel } from "@/lib/rack-label";
import { nearExpiryBatches } from "@/lib/repos/batches";
import { getCompany } from "@/lib/repos/company";
import { adToIso, adFromIso, toBS, formatBS } from "@/lib/bs";
import { toMixedDisplay } from "@/lib/units";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

/**
 * Two orders, because there are two jobs.
 *
 * Soonest-first answers "what dies next", which is the money question. Shelf by
 * shelf answers "what do I pull off the shelves today", which is the legs
 * question — and doing that in expiry order means walking the shop six times.
 */
type Order = "expiry" | "shelf";

export default async function ExpiryReportPage({
  searchParams,
}: {
  searchParams: Promise<{ by?: string }>;
}) {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const { by } = await searchParams;
  const order: Order = by === "shelf" ? "shelf" : "expiry";

  const todayIso = adToIso(new Date());
  const company = await getCompany();
  const windowIso = adToIso(
    new Date(Date.now() + company.expiryAlertDays * 86400000),
  );
  const [items, batches, racks, locations] = await Promise.all([
    listItems(true),
    nearExpiryBatches(todayIso, windowIso),
    listRacks(true),
    allItemLocations(),
  ]);

  const unitsByItem = new Map(items.map((i) => [i.id, i.units]));
  const rackById = new Map(racks.map((r) => [r.id, r]));
  // listRacks already returns walk order (pos_y, pos_x, name), so its index is
  // the order a person crosses the floor in.
  const rackOrder = new Map(racks.map((r, i) => [r.id, i]));

  /** The shelf an item stands on, and how far into the walk it is. */
  const shelfByItem = new Map<
    string,
    { label: string; rank: number; row: number; col: number }
  >();
  const shelfNoteByItem = new Map<string, string>();
  for (const [itemId, loc] of locations) {
    if (loc.note) shelfNoteByItem.set(itemId, loc.note);
    if (loc.rackId === null || loc.row === null || loc.col === null) continue;
    const rack = rackById.get(loc.rackId);
    if (!rack) continue;
    shelfByItem.set(itemId, {
      label: cellLabel(rack.name, loc.row, loc.col),
      rank: rackOrder.get(loc.rackId) ?? 9999,
      row: loc.row,
      col: loc.col,
    });
  }

  // Anything with no shelf sorts last: it is not a place to walk to.
  const rows =
    order === "shelf"
      ? [...batches].sort((a, b) => {
          const sa = shelfByItem.get(a.itemId);
          const sb = shelfByItem.get(b.itemId);
          if (!sa && !sb) return a.expiryDateAd < b.expiryDateAd ? -1 : 1;
          if (!sa) return 1;
          if (!sb) return -1;
          return (
            sa.rank - sb.rank ||
            sa.row - sb.row ||
            sa.col - sb.col ||
            (a.expiryDateAd < b.expiryDateAd ? -1 : 1)
          );
        })
      : batches;

  const atRisk = batches.reduce(
    (s, b) => s + b.remainingBaseQty * b.costPaisaPerBase,
    0,
  );
  const showShelf = racks.length > 0;

  return (
    <ReportFrame
      showFiscalYear={false}
      title="Expiry report"
      rangeLabel={`Next ${company.expiryAlertDays} days`}
      showRange={false}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="rounded-[10px] border border-line bg-cream-50 p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
            Cost value at risk
          </div>
          <div className="mt-1 text-[22px] font-bold text-danger-600 tnum">
            {formatPaisa(atRisk)}
          </div>
        </div>
        {showShelf && (
          <div className="flex items-center gap-1 rounded-[8px] border border-line bg-cream-50 p-1">
            <OrderTab href="/reports/expiry" label="Soonest first" on={order === "expiry"} />
            <OrderTab
              href="/reports/expiry?by=shelf"
              label="Shelf by shelf"
              on={order === "shelf"}
            />
          </div>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState message="Nothing is expiring soon." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              {showShelf && <TH>Shelf</TH>}
              <TH>Batch</TH>
              <TH>Expiry</TH>
              <TH>Remaining</TH>
              <TH numeric>Cost at risk</TH>
            </TR>
          </THead>
          <tbody>
            {rows.map((b) => (
              <TR key={b.id}>
                <TD className="font-medium text-sage-900">{b.brandName}</TD>
                {showShelf && (
                  <TD className="text-sage-600">
                    {shelfByItem.get(b.itemId)?.label ??
                      shelfNoteByItem.get(b.itemId) ??
                      "—"}
                  </TD>
                )}
                <TD className="font-mono">{b.batchNo}</TD>
                <TD>{formatBS(toBS(adFromIso(b.expiryDateAd)), { form: "long", monthScript: "en" })}</TD>
                <TD>{toMixedDisplay(b.remainingBaseQty, unitsByItem.get(b.itemId) ?? [])}</TD>
                <TD numeric>{formatPaisa(b.remainingBaseQty * b.costPaisaPerBase, false)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </ReportFrame>
  );
}

function OrderTab({
  href,
  label,
  on,
}: {
  href: string;
  label: string;
  on: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={cn(
        "rounded-[6px] px-3 py-1.5 text-[13px]",
        on
          ? "bg-sage-150 font-semibold text-sage-900"
          : "text-sage-500 hover:bg-cream-200 hover:text-sage-700",
      )}
    >
      {label}
    </Link>
  );
}
