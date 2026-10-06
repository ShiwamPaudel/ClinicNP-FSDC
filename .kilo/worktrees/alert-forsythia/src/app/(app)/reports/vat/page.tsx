import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getCompany } from "@/lib/repos/company";
import { vatSummary } from "@/lib/repos/reports";
import { resolveRange } from "@/lib/date-range";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";

export default async function VatReportPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; fy?: string }>;
}) {
  await requireAdmin();
  const company = await getCompany();
  if (!company.vatRegistered) redirect("/reports");

  const sp = await searchParams;
  const range = resolveRange(sp);
  const v = await vatSummary(range.fromIso, range.toIso);

  return (
    <ReportFrame
      fy={sp.fy}
      title="VAT report"
      rangeLabel={range.label}
      preset={range.preset}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Sales (Annexure 5 — taxable sales)"
          taxable={v.salesTaxablePaisa}
          vat={v.salesVatPaisa}
        />
        <Panel
          title="Purchases (Annexure 10 — taxable purchases)"
          taxable={v.purchaseTaxablePaisa}
          vat={v.purchaseVatPaisa}
        />
      </div>
      <div className="mt-4 rounded-[10px] border border-line bg-cream-50 p-4">
        <div className="flex justify-between text-[15px] font-semibold text-sage-900">
          <span>Net VAT payable</span>
          <span className="tnum">
            {formatPaisa(v.salesVatPaisa - v.purchaseVatPaisa)}
          </span>
        </div>
        <p className="mt-1 text-[12px] text-sage-500">
          Sales VAT collected minus purchase VAT paid, for the selected range.
        </p>
      </div>
    </ReportFrame>
  );
}

function Panel({
  title,
  taxable,
  vat,
}: {
  title: string;
  taxable: number;
  vat: number;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-cream-50 p-5">
      <h2 className="mb-3 text-[14px] font-semibold text-sage-900">{title}</h2>
      <div className="flex justify-between py-1 text-[14px]">
        <span className="text-sage-600">Taxable amount</span>
        <span className="tnum">{formatPaisa(taxable)}</span>
      </div>
      <div className="flex justify-between py-1 text-[14px]">
        <span className="text-sage-600">VAT (13%)</span>
        <span className="tnum">{formatPaisa(vat)}</span>
      </div>
    </div>
  );
}
