import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { purchaseRegister } from "@/lib/repos/reports";
import { resolveRange } from "@/lib/date-range";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export default async function PurchaseRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; fy?: string }>;
}) {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const sp = await searchParams;
  const range = resolveRange(sp);
  const rows = await purchaseRegister(range.fromIso, range.toIso);
  const total = rows.reduce((s, r) => s + r.totalPaisa, 0);

  return (
    <ReportFrame
      fy={sp.fy}
      title="Purchase register"
      rangeLabel={range.label}
      preset={range.preset}
      exportReport="purchase-register"
    >
      {rows.length === 0 ? (
        <EmptyState message="No purchases in this range." />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Purchase no.</TH>
                <TH>Supplier</TH>
                <TH>Their invoice</TH>
                <TH>Date</TH>
                <TH numeric>Subtotal</TH>
                <TH numeric>VAT</TH>
                <TH numeric>Total</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r, i) => (
                <TR key={i}>
                  {/* The row opens the entry it summarises — the register is
                      where somebody notices a figure they want to look into. */}
                  <TD className="font-mono">
                    <Link
                      href={`/purchases/${r.id}`}
                      className="text-sage-900 underline-offset-2 hover:underline"
                    >
                      {r.purchaseNo ?? "View"}
                    </Link>
                  </TD>
                  <TD>{r.supplierName}</TD>
                  <TD>{r.supplierInvoiceNo || "—"}</TD>
                  <TD>{r.dateBs}</TD>
                  <TD numeric>{formatPaisa(r.subtotalPaisa, false)}</TD>
                  <TD numeric>{formatPaisa(r.vatPaisa, false)}</TD>
                  <TD numeric>{formatPaisa(r.totalPaisa, false)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <div className="mt-3 text-right text-[15px] font-semibold text-sage-900">
            Total: {formatPaisa(total)}
          </div>
        </>
      )}
    </ReportFrame>
  );
}
