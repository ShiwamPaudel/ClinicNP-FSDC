import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import {
  listStockOuts,
  stockOutTotalsByReason,
  STOCK_OUT_REASONS,
  type StockOutReason,
} from "@/lib/repos/adjustments";
import { resolveRange } from "@/lib/date-range";
import { formatPaisa } from "@/lib/money";
import { StockTabs } from "@/components/app/stock-tabs";
import { RangePicker } from "@/components/app/range-picker";
import { ExportButton } from "@/components/app/export-button";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Stock out" };

const LABEL: Record<StockOutReason, string> = Object.fromEntries(
  STOCK_OUT_REASONS.map((r) => [r.key, r.label]),
) as Record<StockOutReason, string>;

export default async function StockOutRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    fy?: string;
    reason?: string;
  }>;
}) {
  const user = await requireUser();
  await requireModulePage("pharmacy");

  const sp = await searchParams;
  const range = resolveRange(sp);
  const reason = (sp.reason as StockOutReason | undefined) ?? null;

  const [rows, totals] = await Promise.all([
    listStockOuts(range.fromIso, range.toIso, reason),
    stockOutTotalsByReason(range.fromIso, range.toIso),
  ]);

  const grandTotal = totals.reduce((s, t) => s + t.costPaisa, 0);
  const isAdmin = user.role === "admin";

  return (
    <>
      <StockTabs />
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <RangePicker current={range.preset ?? ""} />
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-sage-500">{range.label}</span>
            <ExportButton report="stock-out" />
            {isAdmin && (
              <Link href="/stock/out/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Record stock out
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* what did I lose this year, and to what? */}
        {totals.length > 0 && (
          <div className="mb-5 rounded-[10px] border border-line bg-cream-50 p-4">
            <h2 className="mb-3 text-[14px] font-semibold text-sage-900">
              Value by reason
            </h2>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {totals.map((t) => (
                <div key={t.reason} className="min-w-[150px]">
                  <div className="text-[12px] text-sage-500">
                    {LABEL[t.reason] ?? t.reason}
                  </div>
                  <div className="font-mono text-[16px] font-semibold text-sage-900">
                    {formatPaisa(t.costPaisa)}
                  </div>
                  <div className="text-[11px] text-sage-500">
                    {t.entries} {t.entries === 1 ? "entry" : "entries"}
                  </div>
                </div>
              ))}
              <div className="min-w-[150px] border-l border-line pl-6">
                <div className="text-[12px] text-sage-500">Total</div>
                <div className="font-mono text-[16px] font-semibold text-sage-900">
                  {formatPaisa(grandTotal)}
                </div>
              </div>
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState message="Nothing went out in this period. Stock leaving for any reason other than a sale shows up here." />
        ) : (
          <div className="rounded-[10px] border border-line bg-cream-50">
            <Table>
              <THead>
                <TR>
                  <TH>Number</TH>
                  <TH>Date (BS)</TH>
                  <TH>Reason</TH>
                  <TH>Supplier</TH>
                  <TH>Lines</TH>
                  <TH>Value</TH>
                  <TH>By</TH>
                </TR>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link
                        href={`/stock/out/${r.id}`}
                        className="font-mono text-[13px] text-sage-700 hover:underline"
                      >
                        {r.adjustmentNo != null
                          ? `SO-${r.fiscalLabel}-${String(r.adjustmentNo).padStart(6, "0")}`
                          : "—"}
                      </Link>
                    </TD>
                    <TD>{r.dateBs}</TD>
                    <TD>
                      <Badge tone={r.direction === "in" ? "ok" : "neutral"}>
                        {LABEL[r.reason] ?? r.reason}
                        {r.direction === "in" ? " · added back" : ""}
                      </Badge>
                    </TD>
                    <TD>{r.supplierName ?? "—"}</TD>
                    <TD numeric>{r.lineCount}</TD>
                    <TD numeric>{formatPaisa(r.totalCostPaisa)}</TD>
                    <TD className="text-sage-500">{r.userName}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </main>
    </>
  );
}
