"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import { useToast } from "@/components/ui/toast";
import { recordPaymentAction } from "@/app/(app)/suppliers/actions";
import { toPaisa } from "@/lib/money";
import { bsToDbText, today } from "@/lib/bs";
import { strings } from "@/lib/strings";

export function SupplierPaymentForm({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const toast = useToast();
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
    const res = await recordPaymentAction({
      supplierId,
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
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  return (
    <div className="rounded-[10px] border border-line bg-cream-50 p-5">
      <h2 className="mb-3 text-[15px] font-semibold text-sage-900">
        Record a payment
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date">
          <DatePickerBS value={dateBs} onChange={setDateBs} />
        </Field>
        <Field label="Amount (रू)">
          <Input
            numeric
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="cheque">Cheque</option>
          </Select>
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={submit} disabled={busy}>
          Record payment
        </Button>
      </div>
    </div>
  );
}
