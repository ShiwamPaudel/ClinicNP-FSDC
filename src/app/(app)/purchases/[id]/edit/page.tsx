import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { requireModulePage, getModules } from "@/lib/modules";
import { buysForUse, hasExpiry } from "@/lib/supplies";
import { getPurchase } from "@/lib/repos/purchases";
import { getFiscalYearByLabel } from "@/lib/repos/fiscal";
import { listItems } from "@/lib/repos/items";
import { listSuppliers } from "@/lib/repos/suppliers";
import { adFromIso, bsFromDbText, bsToDbText, fiscalYearOf, toBS } from "@/lib/bs";
import { formatPaisa } from "@/lib/money";
import { PageShell } from "@/components/app/page-shell";
import {
  PurchaseForm,
  type PurchaseFormInitial,
} from "@/components/app/purchase-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

/** Paisa as the rupees a box shows: "30", "22.50"; blank for nothing. */
function rupees(paisa: number, blankIfZero = false): string {
  if (blankIfZero && paisa === 0) return "";
  const r = paisa / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

/**
 * Change a saved purchase.
 *
 * The same form as a new purchase, filled in, and saved only after the admin
 * re-types their password. What may change is decided by `updatePurchase` —
 * quantities never below what has already left the shelf, and a line whose
 * batch has moved keeps its item and cannot be removed. This page shows those
 * lines locked so nobody spends time on an edit that will be refused.
 */
export default async function EditPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  await requireModulePage("supplies");

  const { id } = await params;
  const [p, items, suppliers, modules] = await Promise.all([
    getPurchase(id),
    listItems(),
    listSuppliers(),
    getModules(),
  ]);
  if (!p) notFound();
  const forUse = buysForUse(modules);

  const title = p.purchaseNo ? `Edit ${p.purchaseNo}` : "Edit purchase";
  const back = (
    <Link href={`/purchases/${p.id}`}>
      <Button variant="secondary">
        <ArrowLeft className="h-4 w-4" />
        Back to the purchase
      </Button>
    </Link>
  );

  // A closed year's purchases are final, the same as its bills.
  const fy = fiscalYearOf(bsFromDbText(p.dateBs));
  const fyRow = await getFiscalYearByLabel(fy.label);
  if (!fyRow || fyRow.status !== "open") {
    return (
      <PageShell title={title} actions={back}>
        <EmptyState
          icon={Lock}
          message={`Fiscal year ${fy.label} is closed, so this purchase can no longer be changed. Correct it with a purchase return in the open year.`}
        />
      </PageShell>
    );
  }

  const initial: PurchaseFormInitial = {
    purchaseId: p.id,
    purchaseNo: p.purchaseNo,
    supplierId: p.supplierId,
    supplierInvoiceNo: p.supplierInvoiceNo,
    dateBs: p.dateBs,
    applyVat: p.vatPaisa > 0,
    billDiscountRupees: rupees(p.billDiscountPaisa, true),
    roundingRupees: rupees(p.roundingPaisa, true),
    lines: p.lines.map((l) => ({
      lineId: l.lineId,
      locked: l.batchHasMoved,
      itemId: l.itemId,
      unitLevel: l.unitLevel,
      batchNo: l.batchNo,
      // Bought for use, a line has no expiry to show (C-035).
      expiryDateBs: hasExpiry(l.expiryDateAd)
        ? bsToDbText(toBS(adFromIso(l.expiryDateAd)))
        : "",
      qty: String(l.qty),
      freeQty: String(l.freeQty),
      costRupees: rupees(l.costPaisa),
      discountRupees: rupees(l.discountPaisa),
      // Blank when none was recorded (every purchase before 0022): a blank is
      // sent as "no change", so re-saving an old purchase cannot touch prices.
      sellRupees: rupees(l.sellingRatePaisa, true),
    })),
  };

  const lockedCount = initial.lines.filter((l) => l.locked).length;
  // Paid as it was entered (0023). The edit leaves it alone; it is paid or
  // undone from Payables, where every payment lives.
  const paidPaisa = p.payments
    .filter((x) => !x.voided)
    .reduce((s, x) => s + x.amountPaisa, 0);

  return (
    <PageShell title={title} actions={back}>
      {lockedCount > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-[10px] border border-line bg-cream-50 px-4 py-3 text-[13px] text-sage-700">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-sage-500" />
          <span>
            {forUse ? (
              <>
                {lockedCount === 1 ? "One line has" : `${lockedCount} lines have`}{" "}
                been partly returned to the supplier. Those lines keep their
                item and cannot be removed, and their quantity cannot go below
                what was returned. Everything else can change.
              </>
            ) : (
              <>
                {lockedCount === 1 ? "One line has" : `${lockedCount} lines have`}{" "}
                stock that has already been sold, returned or counted. Those lines
                keep their item and cannot be removed, and their quantity cannot go
                below what has already left the shelf. Everything else can change.
              </>
            )}
          </span>
        </p>
      )}
      {paidPaisa > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-[10px] border border-line bg-cream-50 px-4 py-3 text-[13px] text-sage-700">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-sage-500" />
          <span>
            {formatPaisa(paidPaisa)} was paid on this purchase. Editing it
            doesn&apos;t change that payment — undo it in{" "}
            <Link href="/payables" className="underline underline-offset-2">
              Payables
            </Link>{" "}
            if it was wrong.
          </span>
        </p>
      )}
      <PurchaseForm items={items} suppliers={suppliers} initial={initial} forUse={forUse} />
    </PageShell>
  );
}
