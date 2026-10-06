import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, History } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { getPurchase } from "@/lib/repos/purchases";
import { formatPaisa } from "@/lib/money";
import { expiryForPrint } from "@/lib/print-batches";
import { adFromIso, formatBS, toBS } from "@/lib/bs";
import { payableMethodLabel } from "@/lib/payables";
import { PageShell } from "@/components/app/page-shell";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

/**
 * One purchase, read back.
 *
 * Changing it is a separate screen behind the admin's password
 * (`/purchases/[id]/edit`), because a purchase has already created batches and
 * raised stock, and an edit has to respect whatever of that has since moved.
 * This page only reads.
 *
 * The totals block repeats the supplier's own order — lines, their discounts,
 * the discount on the whole bill, VAT, rounding — so this page can be read
 * against the paper it was copied from, line by line, which is the reason
 * somebody opens it (D-143).
 */
export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  await requireModulePage("pharmacy");

  const { id } = await params;
  const p = await getPurchase(id);
  if (!p) notFound();

  const title = p.purchaseNo ? `Purchase ${p.purchaseNo}` : "Purchase";
  // What was handed over as it was entered (0023). An undone payment is
  // listed but does not count.
  const livePayments = p.payments.filter((x) => !x.voided);
  const paidPaisa = livePayments.reduce((s, x) => s + x.amountPaisa, 0);
  const undone = p.payments.filter((x) => x.voided);

  return (
    <PageShell
      title={title}
      actions={
        <div className="flex gap-2">
          <Link href="/purchases">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              All purchases
            </Button>
          </Link>
          <Link href={`/purchases/${p.id}/edit`}>
            <Button>
              <Pencil className="h-4 w-4" />
              Edit purchase
            </Button>
          </Link>
        </div>
      }
    >
      <section className="mb-4 rounded-[10px] border border-line bg-cream-50 p-4">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Supplier">
            <Link
              href={`/suppliers/${p.supplierId}`}
              className="font-medium text-sage-900 underline-offset-2 hover:underline"
            >
              {p.supplierName}
            </Link>
          </Fact>
          <Fact label="Their invoice no.">
            {p.supplierInvoiceNo || "—"}
          </Fact>
          <Fact label="Date">{p.dateBs}</Fact>
          <Fact label="Entered by">{p.enteredBy ?? "—"}</Fact>
        </dl>
      </section>

      <Table>
        <THead>
          <TR>
            <TH>Item</TH>
            <TH>Batch no.</TH>
            <TH>Expiry</TH>
            <TH>Unit</TH>
            <TH numeric>Qty</TH>
            <TH numeric>Free</TH>
            <TH numeric>Cost/unit</TH>
            <TH numeric>Discount</TH>
            <TH numeric>Amount</TH>
            <TH numeric>Sell price</TH>
            <TH numeric>Left</TH>
          </TR>
        </THead>
        <tbody>
          {p.lines.map((l, i) => (
            <TR key={i}>
              <TD>
                <div className="font-medium text-sage-900">{l.brandName}</div>
                {l.genericName && (
                  <div className="text-[12px] text-sage-500">
                    {l.genericName}
                  </div>
                )}
              </TD>
              <TD className="font-mono">{l.batchNo}</TD>
              <TD className="font-mono">{expiryForPrint(l.expiryDateAd)}</TD>
              <TD>{l.unitName || "—"}</TD>
              <TD numeric>{l.qty}</TD>
              <TD numeric>{l.freeQty > 0 ? l.freeQty : "—"}</TD>
              <TD numeric>{formatPaisa(l.costPaisa, false)}</TD>
              <TD numeric>
                {l.discountPaisa > 0
                  ? formatPaisa(l.discountPaisa, false)
                  : "—"}
              </TD>
              <TD numeric>{formatPaisa(l.lineTotalPaisa, false)}</TD>
              {/* The price set on this purchase (0022). A dash is an older
                  purchase, from before the price was recorded here. */}
              <TD numeric>
                {l.sellingRatePaisa > 0
                  ? formatPaisa(l.sellingRatePaisa, false)
                  : "—"}
              </TD>
              {/* What this batch brought in and what is still on the shelf.
                  In base units, because that is what stock is counted in. */}
              <TD numeric>
                <span
                  className={
                    l.remainingBaseQty === 0 ? "text-sage-400" : undefined
                  }
                >
                  {l.remainingBaseQty} / {l.receivedBaseQty}
                </span>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>

      <section className="mt-4 flex flex-col items-end gap-1.5 rounded-[10px] border border-line bg-cream-50 p-6">
        <Row label="Subtotal" value={formatPaisa(p.subtotalPaisa, false)} />
        {p.discountPaisa > 0 && (
          <Row
            label="Line discounts"
            value={`- ${formatPaisa(p.discountPaisa, false)}`}
          />
        )}
        {p.billDiscountPaisa > 0 && (
          <Row
            label="Discount on the bill"
            value={`- ${formatPaisa(p.billDiscountPaisa, false)}`}
          />
        )}
        {p.vatPaisa > 0 && (
          <Row label="VAT (13%)" value={formatPaisa(p.vatPaisa, false)} />
        )}
        {/* May be up or down; formatPaisa carries the minus sign itself. */}
        {p.roundingPaisa !== 0 && (
          <Row label="Rounding" value={formatPaisa(p.roundingPaisa, false)} />
        )}
        <div className="mt-1.5 flex w-full max-w-[320px] items-center justify-between border-t border-line pt-2.5">
          <span className="text-[15px] font-semibold text-sage-900">
            Net total
          </span>
          <span className="text-[15px] font-semibold text-sage-900">
            {formatPaisa(p.totalPaisa)}
          </span>
        </div>
        <Row
          label="Paid when entered"
          value={
            paidPaisa > 0
              ? `${formatPaisa(paidPaisa, false)} · ${livePayments
                  .map((x) => payableMethodLabel(x.method))
                  .join(", ")}`
              : "—"
          }
        />
        <Row
          label="Left on credit"
          value={formatPaisa(Math.max(0, p.totalPaisa - paidPaisa), false)}
        />
        {undone.length > 0 && (
          <p className="max-w-[320px] text-right text-[12px] text-sage-500">
            {undone
              .map((x) => `${formatPaisa(x.amountPaisa)} paid with it was undone`)
              .join("; ")}
            .
          </p>
        )}
        <p className="max-w-[320px] text-right text-[12px] text-sage-500">
          Payments made later are on the{" "}
          <Link
            href={`/suppliers/${p.supplierId}`}
            className="underline-offset-2 hover:underline"
          >
            supplier&apos;s ledger
          </Link>{" "}
          and in{" "}
          <Link href="/payables" className="underline-offset-2 hover:underline">
            Payables
          </Link>
          .
        </p>
      </section>

      {p.lastEdit && (
        <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-sage-500">
          <History className="h-3.5 w-3.5 shrink-0" />
          Last changed by {p.lastEdit.byName} on {nepalTime(p.lastEdit.at)}.
          The full before-and-after is in the audit log.
        </p>
      )}
    </PageShell>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[12px] uppercase tracking-wide text-sage-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-[14px] text-sage-900">{children}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-full max-w-[320px] items-center justify-between">
      <span className="text-[14px] text-sage-700">{label}</span>
      <span className="text-[14px] tabular-nums text-sage-900">{value}</span>
    </div>
  );
}

/**
 * A stored UTC timestamp as the clinic reads it: the BS date and the time in
 * Nepal. The server runs on UTC, so formatting it with the server's own clock
 * would put an evening edit on the wrong day. Nepal has no daylight saving, so
 * a fixed +05:45 is exact.
 */
function nepalTime(isoUtc: string): string {
  const npt = new Date(new Date(isoUtc).getTime() + (5 * 60 + 45) * 60_000);
  const ymd = npt.toISOString().slice(0, 10);
  const hhmm = npt.toISOString().slice(11, 16);
  return `${formatBS(toBS(adFromIso(ymd)), { form: "long", monthScript: "en" })}, ${hhmm}`;
}
