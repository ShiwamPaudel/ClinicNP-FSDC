"use client";

/**
 * receive-dues-dialog.tsx — somebody has come back to pay what they owe.
 *
 * The amount starts at everything owed, because that is the common case and
 * the one that should take a single press. A smaller amount is spread over
 * their bills oldest first; the split shown here comes from the same function
 * the server uses, so what is shown is what is recorded.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ulid } from "ulid";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { receiveDuesAction } from "@/app/(app)/dues/actions";
import { allocateOldestFirst, totalOwed, type MoneyMethod } from "@/lib/dues";
import { formatPaisa, paisaToRupees, toPaisa } from "@/lib/money";
import { formatPatientNo } from "@/lib/patient-no";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

export interface ReceivableBill {
  id: string;
  /** "SI-2083/84-000045" */
  label: string;
  dateBs: string;
  balancePaisa: number;
}

export function ReceiveDuesDialog({
  open,
  onClose,
  who,
  bills,
}: {
  open: boolean;
  onClose: () => void;
  who: { name: string; patientNo: number | null };
  /** oldest first — the order a payment clears them in */
  bills: ReceivableBill[];
}) {
  const router = useRouter();
  const toast = useToast();
  const owed = totalOwed(bills);

  // A fresh receipt every time the dialog opens: that id is what stops a
  // double press from recording the same money twice.
  const [receiptId, setReceiptId] = useState("");
  const [amountText, setAmountText] = useState("");
  const [method, setMethod] = useState<MoneyMethod>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReceiptId(ulid());
    setAmountText(owed > 0 ? String(paisaToRupees(owed)) : "");
    setMethod("cash");
    setNote("");
    // Only on opening: `owed` changing underneath an open dialog must not
    // overwrite what somebody is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const amount = toPaisa(Number(amountText) || 0);
  const tooMuch = amount > owed;
  const plan = allocateOldestFirst(
    Math.min(amount, owed),
    bills.map((b) => ({ id: b.id, balancePaisa: b.balancePaisa })),
  );
  const takes = new Map(plan.map((p) => [p.billId, p.amountPaisa]));
  const canSave = !busy && amount > 0 && !tooMuch && receiptId !== "";

  async function save() {
    if (!canSave) return;
    setBusy(true);
    const res = await receiveDuesAction({
      receiptId,
      billIds: bills.map((b) => b.id),
      amountPaisa: amount,
      method,
      note,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
      return;
    }
    const got = formatPaisa(res.amountPaisa ?? amount);
    toast.success(
      (res.stillOwedPaisa ?? 0) > 0
        ? `Received ${got}. ${formatPaisa(res.stillOwedPaisa ?? 0)} is still owed.`
        : `Received ${got}. Nothing more is owed.`,
    );
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={strings.receivePayment}
      className="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {strings.cancel}
          </Button>
          <Button variant="magenta" onClick={save} disabled={!canSave}>
            {busy ? "Saving…" : `Receive ${formatPaisa(Math.min(amount, owed))}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[16px] font-semibold text-sage-900">
              {who.name || "No name on the bill"}
            </div>
            {who.patientNo != null && (
              <div className="font-mono text-[12px] text-clinic-700">
                {formatPatientNo(who.patientNo)}
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[12px] text-sage-500">Owes</div>
            <div className="whitespace-nowrap text-[18px] font-bold text-warn-600 tnum">
              {formatPaisa(owed)}
            </div>
          </div>
        </div>

        {bills.length > 1 && (
          <div className="rounded-[8px] border border-line">
            <div className="border-b border-line bg-sage-75 px-3 py-1.5 text-[12px] font-semibold text-sage-900">
              Oldest bill is paid off first
            </div>
            <ul>
              {bills.map((b) => {
                const t = takes.get(b.id) ?? 0;
                return (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5 text-[13px] last:border-0"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-mono text-sage-900">{b.label}</span>
                      <span className="text-[12px] text-sage-500">
                        {b.dateBs} · owes {formatPaisa(b.balancePaisa, false)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 whitespace-nowrap text-right tnum",
                        t > 0 ? "font-semibold text-ok-600" : "text-sage-500",
                      )}
                    >
                      {t > 0 ? `− ${formatPaisa(t, false)}` : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Amount received"
            htmlFor="dues-amount"
            error={
              tooMuch
                ? `That is more than is owed. They owe ${formatPaisa(owed)}.`
                : undefined
            }
          >
            <Input
              id="dues-amount"
              numeric
              inputMode="decimal"
              autoFocus
              value={amountText}
              invalid={tooMuch}
              onChange={(e) => setAmountText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
            />
          </Field>
          <Field label="Paid by">
            <div className="flex gap-1" role="group" aria-label="Paid by">
              {(["cash", "qr"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  aria-pressed={method === m}
                  className={cn(
                    "h-10 flex-1 rounded-[8px] border text-[14px] font-medium transition-colors",
                    method === m
                      ? "border-sage-700 bg-sage-700 text-cream-50"
                      : "border-line bg-cream-50 text-sage-900 hover:bg-cream-200",
                  )}
                >
                  {m === "cash" ? "Cash" : "QR / wallet"}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Note" htmlFor="dues-note" hint="Optional — who brought it, or a cheque number.">
          <Input
            id="dues-note"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>

        {amount > 0 && !tooMuch && amount < owed && (
          <p className="text-[13px] text-sage-600">
            {formatPaisa(owed - amount)} will still be owed after this.
          </p>
        )}
      </div>
    </Dialog>
  );
}
