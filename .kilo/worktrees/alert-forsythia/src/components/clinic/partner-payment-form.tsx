"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import { useToast } from "@/components/ui/toast";
import { recordPartnerPaymentAction } from "@/app/(app)/settings/catalog-actions";
import { toPaisa, formatPaisa, paisaToRupees } from "@/lib/money";
import { bsToDbText, today } from "@/lib/bs";
import { strings } from "@/lib/strings";

const METHODS: [string, string][] = [
  ["cash", "Cash"],
  ["bank", "Bank transfer"],
  ["cheque", "Cheque"],
  ["qr", "QR / digital wallet"],
  ["adjustment", "Adjustment"],
];

export function PartnerPaymentForm({
  partnerId,
  partnerName,
  owedPaisa,
}: {
  partnerId: string;
  partnerName: string;
  owedPaisa: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [dateBs, setDateBs] = useState(bsToDbText(today()));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const amt = toPaisa(Number(amount) || 0);
    if (amt <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    setBusy(true);
    const res = await recordPartnerPaymentAction({
      partnerId,
      dateBs,
      amountPaisa: amt,
      method,
      note,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Payment recorded");
      setAmount("");
      setNote("");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Wallet className="h-4 w-4" />
        Record a payment
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Pay ${partnerName}`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-sage-700">
            {owedPaisa > 0
              ? `Owed at the end of this period: ${formatPaisa(owedPaisa)}.`
              : "Nothing is outstanding for this period."}
          </p>

          <Field label="Date">
            <DatePickerBS value={dateBs} onChange={setDateBs} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount" hint="In rupees">
              <Input
                numeric
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={
                  owedPaisa > 0 ? String(paisaToRupees(owedPaisa)) : "0"
                }
              />
            </Field>
            <Field label="How it was paid">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Note" hint="Cheque number, or what it settles">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {strings.cancel}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Record payment"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
