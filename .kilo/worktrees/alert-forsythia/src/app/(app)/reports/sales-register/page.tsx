import { requireAdmin } from "@/lib/session";
import { salesRegister } from "@/lib/repos/reports";
import { resolveRange } from "@/lib/date-range";
import { formatPaisa } from "@/lib/money";
import { formatDocNo } from "@/lib/invoice-number";
import { ReportFrame } from "@/components/app/report-frame";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export default async function SalesRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; fy?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const range = resolveRange(sp);
  const rows = await salesRegister(range.fromIso, range.toIso);
  const total = rows
    .filter((r) => r.status !== "cancelled")
    .reduce((s, r) => s + r.totalPaisa, 0);

  return (
    <ReportFrame
      fy={sp.fy}
      title="Sales register"
      rangeLabel={range.label}
      preset={range.preset}
      exportReport="sales-register"
    >
      {rows.length === 0 ? (
        <EmptyState message="No bills in this range." />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Invoice</TH>
                <TH>Date</TH>
                <TH>Patient</TH>
                <TH numeric>Subtotal</TH>
                <TH numeric>Discount</TH>
                <TH numeric>VAT</TH>
                <TH numeric>Total</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r, i) => (
                <TR key={i}>
                  <TD className="font-mono">
                    {r.invoiceNo != null ? formatDocNo("SI", r.fiscalLabel, r.invoiceNo) : "—"}
                  </TD>
                  <TD>{r.dateBs}</TD>
                  <TD>{r.patientName || "—"}</TD>
                  <TD numeric>{formatPaisa(r.subtotalPaisa, false)}</TD>
                  <TD numeric>{formatPaisa(r.discountPaisa, false)}</TD>
                  <TD numeric>{formatPaisa(r.vatPaisa, false)}</TD>
                  <TD numeric>{formatPaisa(r.totalPaisa, false)}</TD>
                  <TD>
                    {r.status === "cancelled" ? (
                      <Badge tone="danger">Cancelled</Badge>
                    ) : (
                      <Badge tone="ok">Saved</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <div className="mt-3 text-right text-[15px] font-semibold text-sage-900">
            Net total: {formatPaisa(total)}
          </div>
        </>
      )}
    </ReportFrame>
  );
}
