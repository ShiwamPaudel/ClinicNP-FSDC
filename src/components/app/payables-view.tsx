"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Undo2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { recordPaymentAction } from "@/app/(app)/suppliers/actions";
import { recordPartnerPaymentAction } from "@/app/(app)/settings/catalog-actions";
import { voidPaymentAction, recordDoctorPayoutAction } from "@/app/(app)/payables/actions";
import { toPaisa, formatPaisa, paisaToRupees } from "@/lib/money";
import { bsToDbText, today } from "@/lib/bs";
import { PAYABLE_METHOD_LABEL, payableMethodLabel } from "@/lib/payables";
import type { PayableParty, PaymentMade } from "@/lib/repos/payables";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

/**
 * "Pay" for one party, for a screen other than Payables — a doctor's
 * statement — so the same dialog records the payment wherever it is made.
 */
export function PayPartyButton({ party, label = "Record a payment" }: { party: PayableParty; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Wallet className="h-4 w-4" />
        {label}
      </Button>
      <PayDialog party={open ? party : null} onClose={() => setOpen(false)} />
    </>
  );
}

/** A laboratory can also be settled by adjustment, as on its statement. */
const SUPPLIER_METHODS = ["cash", "bank", "cheque", "qr"];
const LAB_METHODS = ["cash", "bank", "cheque", "qr", "adjustment"];

export function PayablesView({
  showSuppliers,
  showLabs,
  suppliers,
  labs,
  doctors = [],
  payments,
}: {
  showSuppliers: boolean;
  showLabs: boolean;
  suppliers: PayableParty[];
  labs: PayableParty[];
  /** doctors' shares not yet paid (C-037); shown with the clinic */
  doctors?: PayableParty[];
  payments: PaymentMade[];
}) {
  const [paying, setPaying] = useState<PayableParty | null>(null);
  const owed = (rows: PayableParty[]) =>
    rows.reduce((s, r) => s + Math.max(0, r.owedPaisa), 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {showSuppliers && (
          <Tile label="Owed to suppliers" value={owed(suppliers)} />
        )}
        {showLabs && <Tile label="Owed to laboratories" value={owed(labs)} />}
        {showLabs && <Tile label="Owed to doctors" value={owed(doctors)} />}
      </div>

      {showSuppliers && (
        <PartySection
          title="Suppliers"
          empty="No suppliers yet. Add one under Suppliers."
          rows={suppliers}
          onPay={setPaying}
          detailHref={(p) => `/suppliers/${p.id}`}
          detailLabel="Ledger"
        />
      )}

      {showLabs && (
        <PartySection
          title="Laboratories"
          empty="No outside laboratories are set up yet."
          rows={labs}
          onPay={setPaying}
          detailHref={(p) => `/reports/lab-partners?partner=${p.id}`}
          detailLabel="Statement"
        />
      )}

      {showLabs && (
        <PartySection
          title="Doctors"
          empty="No doctor has a share yet. Set one under Settings → Doctors."
          rows={doctors}
          onPay={setPaying}
          detailHref={(p) => `/reports/doctors?doctor=${p.id}`}
          detailLabel="Statement"
        />
      )}

      <PaymentsSection payments={payments} />

      <PayDialog party={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] border border-line bg-cream-50 p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
        {label}
      </div>
      <div className="mt-1 tnum text-[24px] font-bold text-sage-900">
        {formatPaisa(value)}
      </div>
    </div>
  );
}

function PartySection({
  title,
  empty,
  rows,
  onPay,
  detailHref,
  detailLabel,
}: {
  title: string;
  empty: string;
  rows: PayableParty[];
  onPay: (p: PayableParty) => void;
  detailHref: (p: PayableParty) => string;
  detailLabel: string;
}) {
  return (
    <section>
      <h2 className="mb-2 text-[15px] font-semibold text-sage-900">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState message={empty} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH numeric>Owed now</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {rows.map((p) => (
              <TR key={p.id}>
                <TD>
                  <span className="font-medium text-sage-900">{p.name}</span>
                  {!p.active && (
                    <Badge tone="neutral" className="ml-2">
                      Switched off
                    </Badge>
                  )}
                </TD>
                <TD
                  numeric
                  className={cn(
                    "whitespace-nowrap",
                    p.owedPaisa > 0 ? "font-semibold text-danger-600" : "text-sage-500",
                  )}
                >
                  {p.owedPaisa < 0
                    ? `${formatPaisa(-p.owedPaisa)} paid ahead`
                    : formatPaisa(p.owedPaisa)}
                </TD>
                <TD className="text-right">
                  <span className="inline-flex items-center gap-1">
                    <Link
                      href={detailHref(p)}
                      className="px-2 text-[13px] text-clinic-700 hover:underline"
                    >
                      {detailLabel}
                    </Link>
                    <Button variant="secondary" onClick={() => onPay(p)}>
                      <Wallet className="h-4 w-4" />
                      Pay
                    </Button>
                  </span>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}

function PayDialog({
  party,
  onClose,
}: {
  party: PayableParty | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [dateBs, setDateBs] = useState(bsToDbText(today()));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const owedPaisa = party?.owedPaisa ?? 0;
  const amt = toPaisa(Number(amount) || 0);
  const methods = party?.kind === "lab" ? LAB_METHODS : SUPPLIER_METHODS;

  function close() {
    if (busy) return;
    setAmount("");
    setNote("");
    setMethod("cash");
    setDateBs(bsToDbText(today()));
    onClose();
  }

  async function submit() {
    if (!party) return;
    if (!(Number(amount) > 0) || amt <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    setBusy(true);
    const res =
      party.kind === "doctor"
        ? await recordDoctorPayoutAction({
            doctorId: party.id,
            dateBs,
            amountPaisa: amt,
            method,
            note,
          })
        : party.kind === "supplier"
        ? await recordPaymentAction({
            supplierId: party.id,
            dateBs,
            amountPaisa: amt,
            method,
            note,
          })
        : await recordPartnerPaymentAction({
            partnerId: party.id,
            dateBs,
            amountPaisa: amt,
            method,
            note,
          });
    setBusy(false);
    if (res.ok) {
      toast.success(`Payment to ${party.name} recorded`);
      setAmount("");
      setNote("");
      setMethod("cash");
      onClose();
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  return (
    <Dialog
      open={party !== null}
      onClose={close}
      title={party ? `Pay ${party.name}` : "Pay"}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            {strings.cancel}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Record payment"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-[14px] text-sage-700">
          {owedPaisa > 0
            ? `Owed now: ${formatPaisa(owedPaisa)}. Pay all of it or part of it.`
            : owedPaisa < 0
              ? `Already paid ahead by ${formatPaisa(-owedPaisa)}.`
              : "Nothing is owed right now."}
        </p>

        <Field label="Date">
          <DatePickerBS value={dateBs} onChange={setDateBs} typable />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (रू)">
            <Input
              numeric
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={owedPaisa > 0 ? String(paisaToRupees(owedPaisa)) : "0"}
            />
          </Field>
          <Field label="How it was paid">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {PAYABLE_METHOD_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {owedPaisa > 0 && amt > 0 && amt < owedPaisa && (
          <p className="text-[12px] text-sage-500">
            {formatPaisa(owedPaisa - amt)} will still be owed.
          </p>
        )}
        {amt > 0 && amt > Math.max(0, owedPaisa) && (
          <p className="text-[12px] font-medium text-warn-600">
            This is {formatPaisa(amt - Math.max(0, owedPaisa))} more than is owed.
            The extra is kept as paid ahead.
          </p>
        )}

        <Field label="Note" hint="Cheque number, bill number, or what it settles">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

function PaymentsSection({ payments }: { payments: PaymentMade[] }) {
  const router = useRouter();
  const toast = useToast();
  const [undoing, setUndoing] = useState<PaymentMade | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    setUndoing(null);
    setReason("");
  }

  async function undo() {
    if (!undoing) return;
    if (!reason.trim()) {
      toast.error("Say why this payment is being undone.");
      return;
    }
    setBusy(true);
    const res = await voidPaymentAction({
      kind: undoing.kind,
      paymentId: undoing.id,
      reason,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
      return;
    }
    toast.success("Payment undone. It is owed again.");
    setUndoing(null);
    setReason("");
    router.refresh();
  }

  return (
    <section>
      <h2 className="mb-2 text-[15px] font-semibold text-sage-900">
        Payments made
      </h2>
      {payments.length === 0 ? (
        <EmptyState icon={Wallet} message="No payments recorded yet." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Paid to</TH>
              <TH numeric>Amount</TH>
              <TH>How</TH>
              <TH className="hidden sm:table-cell">By</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {payments.map((p) => (
              <TR
                key={`${p.kind}-${p.id}`}
                className={p.voided ? "text-sage-500" : undefined}
              >
                <TD className="whitespace-nowrap font-mono text-[13px]">{p.dateBs}</TD>
                <TD>
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {p.partyName}{" "}
                      <span className="text-[12px] font-normal text-sage-500">
                        {p.kind === "supplier" ? "Supplier" : p.kind === "doctor" ? "Doctor" : "Laboratory"}
                      </span>
                    </span>
                    {p.purchaseId && (
                      <Link
                        href={`/purchases/${p.purchaseId}`}
                        className="font-mono text-[12px] text-clinic-700 hover:underline"
                      >
                        Paid with {p.purchaseNo ?? "a purchase"}
                      </Link>
                    )}
                    {p.note && !p.purchaseId && (
                      <span className="text-[12px] text-sage-500">{p.note}</span>
                    )}
                    {p.voided && (
                      <span className="text-[12px] text-sage-500">
                        Undone{p.voidedByName ? ` by ${p.voidedByName}` : ""}
                        {p.voidReason ? ` — ${p.voidReason}` : ""}
                      </span>
                    )}
                  </span>
                </TD>
                <TD
                  numeric
                  className={cn(
                    "whitespace-nowrap",
                    p.voided ? "line-through" : "font-semibold",
                  )}
                >
                  {formatPaisa(p.amountPaisa)}
                </TD>
                <TD>{payableMethodLabel(p.method)}</TD>
                <TD className="hidden sm:table-cell">{p.userName || "—"}</TD>
                <TD className="text-right">
                  {p.voided ? (
                    <Badge tone="neutral">Undone</Badge>
                  ) : (
                    p.yearOpen && (
                      <Button variant="ghost" onClick={() => setUndoing(p)}>
                        <Undo2 className="h-4 w-4" />
                        Undo
                      </Button>
                    )
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <Dialog
        open={undoing !== null}
        onClose={close}
        title="Undo this payment?"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={undo} disabled={busy}>
              {busy ? "…" : "Undo payment"}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void undo();
          }}
        >
          <p className="text-[14px] text-sage-700">
            {undoing ? formatPaisa(undoing.amountPaisa) : ""} goes back onto what
            is owed to {undoing?.partyName ?? "them"}. Use this only for a
            payment entered by mistake.
          </p>
          <Field label="Why is it being undone?">
            <Input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. typed the wrong amount"
            />
          </Field>
        </form>
      </Dialog>
    </section>
  );
}
