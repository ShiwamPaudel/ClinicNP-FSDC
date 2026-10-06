import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canBill } from "@/lib/session";
import { getBillDetail } from "@/lib/repos/bills";
import { getBillDues } from "@/lib/repos/dues";
import { getCompany } from "@/lib/repos/company";
import { SALE_METHOD_LABEL, MONEY_METHOD_LABEL, type SaleMethod } from "@/lib/dues";
import { formatPatientNo } from "@/lib/patient-no";
import { adFromIso, toBS, formatBS, bsFromDbText } from "@/lib/bs";
import { formatPaisa } from "@/lib/money";
import { formatDocNo } from "@/lib/invoice-number";
import { PageShell } from "@/components/app/page-shell";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BillActions } from "@/components/app/bill-actions";
import { BillDuesPanel } from "@/components/app/bill-dues-panel";
import { ClosedYearBanner } from "@/components/app/closed-year-banner";
import type { PrintBill } from "@/lib/print-types";
import { expiryForPrint } from "@/lib/print-batches";

function bsShort(iso: string): string {
  return formatBS(toBS(adFromIso(iso)));
}

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const bill = await getBillDetail(id);
  if (!bill) notFound();
  const company = await getCompany();
  const dues = bill.paymentMethod === "credit" ? await getBillDues(id) : null;
  const who = {
    name: bill.registeredName || bill.patientName,
    patientNo: bill.patientNo,
  };

  const invoiceLabel =
    bill.invoiceNo != null
      ? formatDocNo("SI", bill.fiscalLabel, bill.invoiceNo)
      : "Pending";

  const printBill: PrintBill = {
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
    invoiceLabel,
    provisional: bill.invoiceNo == null,
    dateBsLong: formatBS(bsFromDbText(bill.dateBs), {
      form: "long",
      monthScript: "en",
    }),
    timeStr: "",
    patientName: bill.patientName,
    patient: bill.patientNo != null || bill.registeredName
      ? {
          patientNo: bill.patientNo,
          name: bill.registeredName || bill.patientName,
          ageSex: "",
        }
      : null,
    serviceLines: bill.serviceLines.map((l) => ({
      name: l.name,
      doctorName: l.doctorName,
      qty: l.qty,
      ratePaisa: l.ratePaisa,
      discountPaisa: l.discountPaisa,
      amountPaisa: l.amountPaisa,
      rateOverridden: l.rateOverridden,
      followupNote: l.followupNote,
    })),
    lines: bill.lines.map((l) => ({
      name: l.brandName,
      genericName: l.genericName,
      controlled: l.controlled,
      qty: l.qty,
      unitName: l.unitName,
      ratePaisa: l.ratePaisa,
      discountPaisa: l.discountPaisa,
      amountPaisa: l.amountPaisa,
      rateOverridden: l.rateOverridden,
      batches: l.batches.map((b) => ({
        batchNo: b.batchNo,
        expiry: expiryForPrint(b.expiryDateAd),
      })),
    })),
    subtotalPaisa: bill.subtotalPaisa,
    billDiscountPaisa: bill.discountPaisa,
    vatPaisa: bill.vatPaisa,
    totalPaisa: bill.totalPaisa,
    paymentMethod: bill.paymentMethod as "cash" | "qr" | "credit",
    tenderedPaisa: bill.tenderedPaisa,
    changePaisa: Math.max(0, bill.tenderedPaisa - bill.totalPaisa),
    // A reprint says what the bill said the day it was made: what was paid
    // then and what was left owing. What is owed now is on the screen.
    paidNowPaisa: dues?.paidAtSalePaisa,
    paidNowMethod: dues?.paidNowMethod ?? undefined,
    duePaisa: dues?.duePaisa,
    userName: bill.userName,
  };

  return (
    <PageShell title={invoiceLabel}>
      {bill.yearClosed && <ClosedYearBanner label={bill.fiscalLabel} />}
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[14px] text-sage-500">{bill.dateBs}</span>
            {bill.status === "cancelled" && <Badge tone="danger">Cancelled</Badge>}
            {bill.status !== "cancelled" &&
              dues &&
              (dues.balancePaisa > 0 ? (
                <Badge tone="warn">Owes {formatPaisa(dues.balancePaisa)}</Badge>
              ) : (
                <Badge tone="ok">Dues cleared</Badge>
              ))}
          </div>
          <BillActions
            billId={bill.id}
            printBill={printBill}
            isAdmin={user.role === "admin"}
            canCancel={bill.status !== "cancelled" && !bill.yearClosed}
            yearClosed={bill.yearClosed}
            paidBackPaisa={dues ? dues.receivedPaisa : 0}
          />
        </div>

        {(bill.registeredName || bill.patientName) && (
          <div className="text-[14px] text-sage-700">
            Patient:{" "}
            {bill.patientId ? (
              <Link
                href={`/patients/${bill.patientId}`}
                className="font-medium text-clinic-700 hover:underline"
              >
                {bill.registeredName || bill.patientName}
              </Link>
            ) : (
              <span className="font-medium">{bill.patientName}</span>
            )}
            {bill.patientNo != null && (
              <span className="ml-2 font-mono text-[12px] text-clinic-700">
                {formatPatientNo(bill.patientNo)}
              </span>
            )}
          </div>
        )}

        {bill.serviceLines.length > 0 && (
          <section>
            <h2 className="mb-2 text-[15px] font-semibold text-sage-900">
              Services
            </h2>
            <Table>
              <THead>
                <TR>
                  <TH>Service</TH>
                  <TH>Doctor</TH>
                  <TH numeric>Qty</TH>
                  <TH numeric>Rate</TH>
                  <TH numeric>Disc.</TH>
                  <TH numeric>Amount</TH>
                </TR>
              </THead>
              <tbody>
                {bill.serviceLines.map((l) => (
                  <TR key={l.id}>
                    <TD className="font-medium text-sage-900">
                      {l.name}
                      {l.followupNote && (
                        <div className="text-[12px] font-normal text-clinic-700">
                          {l.followupNote}
                        </div>
                      )}
                      {l.partnerName && (
                        <div className="text-[12px] font-normal text-sage-500">
                          Sent to {l.partnerName}
                        </div>
                      )}
                      {l.refundedQty > 0 && (
                        <div className="text-[12px] font-normal text-danger-600">
                          {l.refundedQty === l.qty
                            ? "Refunded"
                            : `${l.refundedQty} of ${l.qty} refunded`}
                        </div>
                      )}
                    </TD>
                    <TD className="text-sage-500">{l.doctorName || "—"}</TD>
                    <TD numeric>{l.qty}</TD>
                    <TD numeric>
                      {formatPaisa(l.ratePaisa, false)}
                      {l.rateOverridden && (
                        <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-magenta-600 align-middle" />
                      )}
                    </TD>
                    <TD numeric>{formatPaisa(l.discountPaisa, false)}</TD>
                    <TD numeric>{formatPaisa(l.amountPaisa, false)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </section>
        )}

        {bill.lines.length > 0 && bill.serviceLines.length > 0 && (
          <h2 className="text-[15px] font-semibold text-sage-900">Medicines</h2>
        )}

        {/* A bill of services alone has no medicine block, not an empty one. */}
        {bill.lines.length > 0 && (
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH>Batch / expiry</TH>
              <TH numeric>Qty</TH>
              <TH numeric>Rate</TH>
              <TH numeric>Disc.</TH>
              <TH numeric>Amount</TH>
            </TR>
          </THead>
          <tbody>
            {bill.lines.map((l) => (
              <TR key={l.id}>
                <TD className="font-medium text-sage-900">
                  {l.brandName}
                  {l.controlled && <Badge tone="info" className="ml-2">Rx</Badge>}
                </TD>
                <TD className="text-[12px]">
                  {l.batches.map((b, i) => (
                    <div key={i} className="font-mono">
                      {b.batchNo} · {bsShort(b.expiryDateAd)}
                    </div>
                  ))}
                </TD>
                <TD numeric>
                  {l.qty} {l.unitName}
                </TD>
                <TD numeric>
                  {formatPaisa(l.ratePaisa, false)}
                  {l.rateOverridden && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-magenta-600 align-middle" />
                  )}
                </TD>
                <TD numeric>{formatPaisa(l.discountPaisa, false)}</TD>
                <TD numeric>{formatPaisa(l.amountPaisa, false)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
        )}

        <div className="flex justify-end">
          <div className="w-64 rounded-[10px] border border-line bg-cream-50 p-4">
            <Row label="Subtotal" value={formatPaisa(bill.subtotalPaisa)} />
            {bill.discountPaisa > 0 && (
              <Row label="Discount" value={`− ${formatPaisa(bill.discountPaisa, false)}`} />
            )}
            {company.vatRegistered && bill.vatPaisa > 0 && (
              <Row label="VAT (13%)" value={formatPaisa(bill.vatPaisa)} />
            )}
            <div className="mt-2 border-t border-line pt-2 text-[16px] font-semibold">
              <Row label="Total" value={formatPaisa(bill.totalPaisa)} />
            </div>
            {dues && (
              <div className="mt-2 border-t border-line pt-2">
                <Row
                  label={
                    dues.paidNowMethod && dues.paidAtSalePaisa > 0
                      ? `Paid at billing (${MONEY_METHOD_LABEL[dues.paidNowMethod]})`
                      : "Paid at billing"
                  }
                  value={formatPaisa(dues.paidAtSalePaisa)}
                />
                {dues.receivedPaisa > 0 && (
                  <Row label="Paid back since" value={formatPaisa(dues.receivedPaisa)} />
                )}
                {dues.returnedAgainstDuePaisa > 0 && (
                  <Row
                    label="Taken off by returns"
                    value={formatPaisa(dues.returnedAgainstDuePaisa)}
                  />
                )}
                {dues.settledInFull && (
                  <Row
                    label="Marked paid in full"
                    value={formatPaisa(
                      Math.max(
                        0,
                        dues.duePaisa -
                          dues.receivedPaisa -
                          dues.returnedAgainstDuePaisa,
                      ),
                    )}
                  />
                )}
                <div className="mt-1 text-[15px] font-semibold">
                  <Row
                    label="Still owed"
                    value={formatPaisa(dues.balancePaisa)}
                    tone={dues.balancePaisa > 0 ? "warn" : "plain"}
                  />
                </div>
              </div>
            )}
            <div className="mt-2 text-[13px] text-sage-500">
              {SALE_METHOD_LABEL[bill.paymentMethod as SaleMethod] ?? bill.paymentMethod} · by {bill.userName}
            </div>
          </div>
        </div>

        {dues && bill.status !== "cancelled" && (
          <BillDuesPanel
            billId={bill.id}
            invoiceLabel={invoiceLabel}
            dateBs={bill.dateBs}
            who={who}
            balancePaisa={dues.balancePaisa}
            payments={dues.payments}
            canReceive={canBill(user.role)}
          />
        )}
      </div>
    </PageShell>
  );
}

function Row({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "warn";
}) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[14px]">
      <span className="text-sage-600">{label}</span>
      <span className={tone === "warn" ? "tnum text-warn-600" : "tnum text-sage-900"}>
        {value}
      </span>
    </div>
  );
}
