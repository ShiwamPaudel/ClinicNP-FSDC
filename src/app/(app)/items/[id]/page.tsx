import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { getItem } from "@/lib/repos/items";
import { getRack, getItemLocation, cellLabel } from "@/lib/repos/racks";
import { batchesForItem, itemHistory } from "@/lib/repos/batches";
import { adFromIso, adToIso, formatBS, toBS } from "@/lib/bs";
import { toMixedDisplay } from "@/lib/units";
import { formatPaisa } from "@/lib/money";
import { PageShell } from "@/components/app/page-shell";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const REASON_LABEL: Record<string, string> = {
  purchase: "Stock in",
  // Deliberately not "Stock in": this is stock the shop already owned, and the
  // history is where somebody looks when a count does not add up.
  opening: "Opening stock",
  sale: "Sold",
  sale_return: "Sale return",
  purchase_return: "Returned to supplier",
  write_off: "Written off",
  adjustment: "Adjustment",
};

function bsOf(iso: string): string {
  return formatBS(toBS(adFromIso(iso)), { form: "long", monthScript: "en" });
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const todayIso = adToIso(new Date());
  const batches = await batchesForItem(id);
  const history = await itemHistory(id);

  // Read-only here on purpose. Where a shop keeps a medicine is stock, not
  // part of the product (0013), and it is set on Stock → Shelves.
  const location = await getItemLocation(id);
  const rack = location.rackId ? await getRack(location.rackId) : null;
  const keptAt =
    rack && location.row !== null && location.col !== null
      ? cellLabel(rack.name, location.row, location.col)
      : location.note || "—";

  return (
    <PageShell
      title={item.brandName}
      actions={
        <Link href={`/items/${id}/edit`}>
          <Button variant="secondary">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </Link>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="rounded-[10px] border border-line bg-cream-50 p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail label="Generic" value={item.genericName || "—"} />
            <Detail label="Category" value={item.category} />
            <Detail label="Kept at" value={keptAt} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {item.controlledFlag && <Badge tone="info">Controlled (Rx)</Badge>}
            {!item.active && <Badge tone="neutral">Inactive</Badge>}
          </div>
          <div className="mt-4">
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-sage-500">
              Units &amp; rates
            </div>
            <div className="flex flex-wrap gap-3">
              {[...item.units]
                .sort((a, b) => b.level - a.level)
                .map((u) => (
                  <div
                    key={u.level}
                    className="rounded-[8px] border border-line bg-cream-100 px-3 py-2 text-[13px]"
                  >
                    <span className="font-medium">{u.name}</span>
                    {u.isDefaultSelling && (
                      <span className="ml-1 text-[11px] text-magenta-600">
                        default
                      </span>
                    )}
                    <div className="text-sage-600">
                      {formatPaisa(u.sellingRatePaisa)} · {u.factorToBase} base
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-sage-900">
            Batches
          </h2>
          {batches.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-line bg-cream-50 p-6 text-center text-[14px] text-sage-500">
              No stock received yet.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Batch</TH>
                  <TH>Expiry</TH>
                  <TH numeric>Remaining</TH>
                  <TH numeric>Cost/base</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <tbody>
                {batches.map((b) => {
                  const expired = b.expiryDateAd < todayIso;
                  return (
                    <TR key={b.id}>
                      <TD className="font-mono">{b.batchNo}</TD>
                      <TD>{bsOf(b.expiryDateAd)}</TD>
                      <TD numeric>
                        {toMixedDisplay(b.remainingBaseQty, item.units)}
                      </TD>
                      <TD numeric>{formatPaisa(b.costPaisaPerBase)}</TD>
                      <TD>
                        {expired ? (
                          <Badge tone="danger-solid">Expired</Badge>
                        ) : b.remainingBaseQty === 0 ? (
                          <Badge tone="neutral">Empty</Badge>
                        ) : (
                          <Badge tone="ok">Live</Badge>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-[15px] font-semibold text-sage-900">
            History
          </h2>
          {history.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-line bg-cream-50 p-6 text-center text-[14px] text-sage-500">
              Nothing here yet.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>What</TH>
                  <TH>Batch</TH>
                  <TH numeric>Change (base)</TH>
                </TR>
              </THead>
              <tbody>
                {history.map((h, i) => (
                  <TR key={i}>
                    <TD>{bsOf(h.at.slice(0, 10))}</TD>
                    <TD>{REASON_LABEL[h.reason] ?? h.reason}</TD>
                    <TD className="font-mono">{h.batchNo}</TD>
                    <TD numeric>
                      {h.baseQtyDelta > 0 ? "+" : ""}
                      {h.baseQtyDelta}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
        {label}
      </div>
      <div className="text-[14px] text-sage-900">{value}</div>
    </div>
  );
}
