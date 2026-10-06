"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, Ban, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cancelBillAction } from "@/app/(app)/bills/actions";
import { InvoiceA4 } from "@/components/print/invoice-a4";
import type { PrintBill } from "@/lib/print-types";
import { formatPaisa } from "@/lib/money";
import { strings } from "@/lib/strings";

export function BillActions({
  billId,
  printBill,
  isAdmin,
  canCancel,
  yearClosed = false,
  paidBackPaisa = 0,
}: {
  billId: string;
  printBill: PrintBill;
  isAdmin: boolean;
  canCancel: boolean;
  /** A closed year is readable and printable, never changeable (D-029). */
  yearClosed?: boolean;
  /** on a bill on dues: money already paid back against it since */
  paidBackPaisa?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doCancel() {
    setBusy(true);
    const res = await cancelBillAction(billId);
    setBusy(false);
    setConfirmCancel(false);
    if (res.ok) {
      toast.success("Bill cancelled");
      router.refresh();
    } else toast.error(res.userMessage ?? strings.somethingWentWrong);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        Reprint
      </Button>
      {/* A closed year is otherwise read-and-print only, but a refund is
          money owed to a person who is standing at the counter now. It goes
          into the year that is open, referencing this bill, so the closed
          year's own figures never move. */}
      <Link href={`/bills/${billId}/return`}>
        <Button variant="secondary">
          <RotateCcw className="h-4 w-4" />
          {yearClosed ? "Refund" : "Sales return"}
        </Button>
      </Link>
      {isAdmin && canCancel && (
        <Button variant="destructive" onClick={() => setConfirmCancel(true)}>
          <Ban className="h-4 w-4" />
          Cancel bill
        </Button>
      )}

      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this bill?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
              Keep bill
            </Button>
            <Button variant="destructive" onClick={doCancel} disabled={busy}>
              Cancel bill
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-sage-700">
          The bill stays in the register marked <b>Cancelled</b> and keeps its
          number. The stock goes back to the shelf.
        </p>
        {paidBackPaisa > 0 && (
          <p className="mt-3 rounded-[8px] bg-warn-100 px-3 py-2 text-[14px] text-warn-600">
            {formatPaisa(paidBackPaisa)} was paid back against this bill after
            it was made. Cancelling it does not give that money back — hand it
            back to them yourself.
          </p>
        )}
      </Dialog>

      {/* hidden print area for reprint */}
      <div className="print-area">
        <InvoiceA4 bill={printBill} />
      </div>
    </div>
  );
}
