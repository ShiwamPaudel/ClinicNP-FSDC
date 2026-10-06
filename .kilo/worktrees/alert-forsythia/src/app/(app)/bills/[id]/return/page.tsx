import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getBillDetail } from "@/lib/repos/bills";
import {
  returnedBaseByLine,
  refundedQtyByServiceLine,
} from "@/lib/repos/sale-returns";
import { getCompany } from "@/lib/repos/company";
import { getBillDues } from "@/lib/repos/dues";
import { bsFromDbText, formatBS } from "@/lib/bs";
import { formatDocNo } from "@/lib/invoice-number";
import { PageShell } from "@/components/app/page-shell";
import {
  SaleReturnForm,
  type ReturnLineData,
  type RefundServiceLineData,
} from "@/components/app/sale-return-form";

export default async function SaleReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const bill = await getBillDetail(id);
  if (!bill) notFound();
  const company = await getCompany();
  const returnedBase = await returnedBaseByLine(id);
  const refundedQty = await refundedQtyByServiceLine(id);
  const dues = bill.paymentMethod === "credit" ? await getBillDues(id) : null;

  const invoiceLabel =
    bill.invoiceNo != null
      ? formatDocNo("SI", bill.fiscalLabel, bill.invoiceNo)
      : "Pending";

  const lines: ReturnLineData[] = bill.lines.map((l) => ({
    billLineId: l.id,
    itemId: l.itemId,
    name: l.brandName,
    unitName: l.unitName,
    factorToBase: l.factorToBase,
    soldQty: l.qty,
    alreadyReturnedUnits: Math.round(
      (returnedBase.get(l.id) ?? 0) / (l.factorToBase || 1),
    ),
    ratePaisa: l.ratePaisa,
    lineAmountPaisa: l.amountPaisa,
  }));

  const serviceLines: RefundServiceLineData[] = bill.serviceLines.map((l) => ({
    billServiceLineId: l.id,
    name: l.name,
    doctorName: l.doctorName,
    soldQty: l.qty,
    alreadyRefundedQty: refundedQty.get(l.id) ?? 0,
    lineAmountPaisa: l.amountPaisa,
  }));

  // Services alone means the word on screen is "refund"; a medicine makes it
  // a return, because something physically comes back.
  const heading =
    serviceLines.length > 0 && bill.lines.length === 0 ? "Refund" : "Return";

  return (
    <PageShell title={`${heading} — ${invoiceLabel}`}>
      <SaleReturnForm
        billId={id}
        invoiceLabel={invoiceLabel}
        company={{
          name: company.name,
          address: company.address,
          phone: company.phone,
          panNo: company.panNo,
          ddaNo: company.ddaNo,
          invoiceFooter: company.invoiceFooter,
          vatRegistered: company.vatRegistered,
          logoUrl: company.logoUrl,
        }}
        dateBsLong={formatBS(bsFromDbText(bill.dateBs), {
          form: "long",
          monthScript: "en",
        })}
        lines={lines}
        serviceLines={serviceLines}
        yearClosedNote={bill.yearClosed ? bill.fiscalLabel : ""}
        owedPaisa={dues?.balancePaisa ?? 0}
      />
    </PageShell>
  );
}
