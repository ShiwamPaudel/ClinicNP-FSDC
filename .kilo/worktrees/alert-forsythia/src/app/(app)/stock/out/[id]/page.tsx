import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import {
  getStockOut,
  STOCK_OUT_REASONS,
  type StockOutReason,
} from "@/lib/repos/adjustments";
import { getCompany } from "@/lib/repos/company";
import { formatPaisa } from "@/lib/money";
import { adFromIso, toBS, formatBS, bsFromDbText } from "@/lib/bs";
import { PageShell } from "@/components/app/page-shell";
import { PrintButton } from "@/components/app/print-button";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StockOutNote } from "@/components/print/stock-out-note";

const LABEL: Record<StockOutReason, string> = Object.fromEntries(
  STOCK_OUT_REASONS.map((r) => [r.key, r.label]),
) as Record<StockOutReason, string>;

export default async function StockOutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  await requireModulePage("pharmacy");

  const { id } = await params;
  const entry = await getStockOut(id);
  if (!entry) notFound();
  const company = await getCompany();

  const label =
    entry.adjustmentNo != null
      ? `SO-${entry.fiscalLabel}-${String(entry.adjustmentNo).padStart(6, "0")}`
      : "Stock out";

  const noteData = {
    company: {
      name: company.name,
      address: company.address,
      phone: company.phone,
      panNo: company.panNo,
      ddaNo: company.ddaNo,
      invoiceFooter: company.invoiceFooter,
      vatRegistered: company.vatRegistered,
      logoUrl: company.logoUrl,
    },
    noteLabel: label,
    reasonLabel: LABEL[entry.reason] ?? entry.reason,
    addedBack: entry.direction === "in",
    supplierName: entry.supplierName,
    dateBsLong: formatBS(bsFromDbText(entry.dateBs), {
      form: "long",
      monthScript: "en" as const,
    }),
    note: entry.note,
    lines: entry.lines.map((l) => ({
      name: l.brandName,
      batchNo: l.batchNo,
      expiry: formatBS(toBS(adFromIso(l.expiryDateAd))),
      qty: l.qtyEntered,
      unitName: l.unitName,
      costPaisa: l.costPaisa,
    })),
    totalPaisa: entry.totalCostPaisa,
    userName: entry.userName,
  };

  return (
    <PageShell
      title={label}
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/stock/out"
            className="flex items-center gap-1.5 text-[13px] text-sage-500 hover:text-sage-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Stock out register
          </Link>
          <PrintButton label="Print note" />
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={entry.direction === "in" ? "ok" : "neutral"}>
            {LABEL[entry.reason] ?? entry.reason}
            {entry.direction === "in" ? " · added back" : ""}
          </Badge>
          <span className="text-[14px] text-sage-500">{entry.dateBs}</span>
          {entry.supplierName && (
            <span className="text-[14px] text-sage-500">
              Supplier: {entry.supplierName}
            </span>
          )}
          <span className="text-[14px] text-sage-500">By {entry.userName}</span>
        </div>

        {entry.note && (
          <p className="rounded-[10px] bg-cream-200 px-4 py-3 text-[14px] text-sage-900">
            {entry.note}
          </p>
        )}

        <div className="rounded-[10px] border border-line bg-cream-50">
          <Table>
            <THead>
              <TR>
                <TH>Medicine</TH>
                <TH>Batch</TH>
                <TH>Expiry</TH>
                <TH>Quantity</TH>
                <TH>Value</TH>
              </TR>
            </THead>
            <tbody>
              {entry.lines.map((l, i) => (
                <TR key={i}>
                  <TD className="font-medium text-sage-900">{l.brandName}</TD>
                  <TD className="font-mono">{l.batchNo}</TD>
                  <TD>{formatBS(toBS(adFromIso(l.expiryDateAd)))}</TD>
                  <TD numeric>
                    {l.qtyEntered} {l.unitName}
                  </TD>
                  <TD numeric>{formatPaisa(l.costPaisa)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <div className="flex justify-end gap-6 border-t border-line px-4 py-3">
            <span className="text-[14px] text-sage-500">Value of this entry</span>
            <span className="font-mono text-[16px] font-semibold text-sage-900">
              {formatPaisa(entry.totalCostPaisa)}
            </span>
          </div>
        </div>
      </div>

      {/* hidden print area — revealed only when printing (styles/print.css) */}
      <div className="print-area">
        <StockOutNote data={noteData} />
      </div>
    </PageShell>
  );
}
