"use client";

/**
 * bill-dues-panel.tsx — on a bill that went on dues: what came in against it
 * since, and a way to take the rest.
 */
import { useState } from "react";
import Link from "next/link";
import { HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { ReceiveDuesDialog } from "@/components/app/receive-dues-dialog";
import { MONEY_METHOD_LABEL, isMoneyMethod } from "@/lib/dues";
import type { DuePaymentRow } from "@/lib/repos/dues";
import { formatPaisa } from "@/lib/money";
import { strings } from "@/lib/strings";

export function BillDuesPanel({
  billId,
  invoiceLabel,
  dateBs,
  who,
  balancePaisa,
  payments,
  canReceive,
}: {
  billId: string;
  invoiceLabel: string;
  dateBs: string;
  who: { name: string; patientNo: number | null };
  balancePaisa: number;
  payments: DuePaymentRow[];
  canReceive: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-sage-900">
          {strings.dues}
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href="/dues"
            className="text-[13px] font-medium text-sage-600 hover:underline"
          >
            Everything owed
          </Link>
          {canReceive && balancePaisa > 0 && (
            <Button variant="secondary" onClick={() => setOpen(true)}>
              <HandCoins className="h-4 w-4" />
              {strings.receivePayment}
            </Button>
          )}
        </div>
      </div>

      {payments.length === 0 ? (
        <p className="text-[14px] text-sage-600">
          {balancePaisa > 0
            ? "Nothing has been paid back on this bill yet."
            : "Nothing is owed on this bill."}
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH numeric>Amount</TH>
              <TH>Paid by</TH>
              <TH>Taken by</TH>
              <TH>Note</TH>
            </TR>
          </THead>
          <tbody>
            {payments.map((p) => (
              <TR key={p.id} className={p.voided ? "text-sage-500" : undefined}>
                <TD>{p.dateBs}</TD>
                <TD numeric className={p.voided ? "line-through" : undefined}>
                  {formatPaisa(p.amountPaisa)}
                </TD>
                <TD>
                  {isMoneyMethod(p.method) ? MONEY_METHOD_LABEL[p.method] : p.method}
                </TD>
                <TD>{p.userName || "—"}</TD>
                <TD>
                  {p.voided ? <Badge tone="neutral">Undone</Badge> : p.note || "—"}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <ReceiveDuesDialog
        open={open}
        onClose={() => setOpen(false)}
        who={who}
        bills={[{ id: billId, label: invoiceLabel, dateBs, balancePaisa }]}
      />
    </section>
  );
}
