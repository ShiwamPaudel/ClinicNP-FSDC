import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { getSupplier, supplierLedger } from "@/lib/repos/suppliers";
import { formatPaisa } from "@/lib/money";
import { PageShell } from "@/components/app/page-shell";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SupplierPaymentForm } from "@/components/app/supplier-payment-form";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const { id } = await params;
  const supplier = await getSupplier(id);
  if (!supplier) notFound();
  const { entries, balancePaisa } = await supplierLedger(id);

  return (
    <PageShell title={supplier.name}>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <div className="rounded-[10px] border border-line bg-cream-50 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
                  Outstanding balance
                </div>
                <div className="text-[28px] font-bold text-sage-900">
                  {formatPaisa(balancePaisa)}
                </div>
              </div>
              <div className="text-right text-[13px] text-sage-500">
                {supplier.phone && <div>{supplier.phone}</div>}
                {supplier.panNo && <div>PAN: {supplier.panNo}</div>}
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-[15px] font-semibold text-sage-900">
              Ledger
            </h2>
            {entries.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-line bg-cream-50 p-6 text-center text-[14px] text-sage-500">
                Nothing here yet.
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Detail</TH>
                    <TH numeric>Change</TH>
                    <TH numeric>Balance</TH>
                  </TR>
                </THead>
                <tbody>
                  {entries.map((e, i) => (
                    <TR key={i}>
                      <TD>{e.dateBs}</TD>
                      <TD>
                        {e.description}{" "}
                        {e.kind === "purchase" ? (
                          <Badge tone="neutral">Purchase</Badge>
                        ) : e.kind === "payment" ? (
                          <Badge tone="ok">Payment</Badge>
                        ) : (
                          <Badge tone="info">Return</Badge>
                        )}
                      </TD>
                      <TD numeric>
                        {e.deltaPaisa > 0 ? "+" : ""}
                        {formatPaisa(e.deltaPaisa, false)}
                      </TD>
                      <TD numeric>{formatPaisa(e.balancePaisa, false)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </div>

        <SupplierPaymentForm supplierId={id} />
      </div>
    </PageShell>
  );
}
