"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useBillStore } from "@/stores/bill-store";
import { counterTotals, clampPercent, type DiscountMode } from "@/lib/discount";
import { toPaisa, formatPaisa, change } from "@/lib/money";
import type { PosConfig } from "@/components/pos/bill-table";
import { npLabels } from "@/lib/strings";
import { cn } from "@/lib/cn";

export interface PaymentPaneHandle {
  focusTendered: () => void;
}

/**
 * 'credit' is what a bill on dues is stored as. On screen it is Dues, the
 * word the counter uses: the patient pays part of it now, or none of it, and
 * owes the rest.
 */
const METHODS: { key: "cash" | "qr" | "credit"; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "qr", label: "QR" },
  { key: "credit", label: "Dues" },
];

export const PaymentPane = forwardRef<
  PaymentPaneHandle,
  { config: PosConfig; saving: boolean; lang: "en" | "np"; onSave: () => void }
>(({ config, saving, lang, onSave }, ref) => {
  const {
    lines,
    serviceLines,
    patient,
    patientName,
    paymentMethod,
    tenderedPaisa,
    paidNowPaisa,
    paidNowMethod,
    billDiscountPaisa,
    billDiscountMode,
    billDiscountPercent,
    setPatientName,
    setPaymentMethod,
    setTendered,
    setPaidNow,
    setPaidNowMethod,
    setBillDiscount,
    setBillDiscountMode,
    setBillDiscountPercent,
  } = useBillStore();

  const tenderRef = useRef<HTMLInputElement>(null);
  const paidNowRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => ({
    // QR has no box to type into, so it lands on Save, where Enter saves.
    focusTendered: () =>
      (paymentMethod === "credit"
        ? paidNowRef.current
        : paymentMethod === "cash"
          ? tenderRef.current
          : saveRef.current
      )?.focus(),
  }));

  // What was typed in each money box, kept as typed so "12." is not turned
  // into "12" under the cursor. Each is cleared when the bill is: the store
  // goes back to nothing, and the box follows. They used to be left showing
  // the last bill's figures over a total that no longer used them.
  const [paidNowText, setPaidNowText] = useState("");
  const [tenderText, setTenderText] = useState("");
  const [discText, setDiscText] = useState("");
  // A box is cleared only when it shows an amount the store no longer has —
  // which is what a reset looks like — never while somebody is typing.
  const paisaIn = (text: string) => toPaisa(Number(text) || 0);
  useEffect(() => {
    if (paidNowPaisa === 0 && paisaIn(paidNowText) !== 0) setPaidNowText("");
  }, [paidNowPaisa, paidNowText]);
  useEffect(() => {
    if (tenderedPaisa === 0 && paisaIn(tenderText) !== 0) setTenderText("");
  }, [tenderedPaisa, tenderText]);
  useEffect(() => {
    const shown =
      billDiscountMode === "percent"
        ? (Number(discText) || 0) !== 0
        : paisaIn(discText) !== 0;
    const held =
      billDiscountMode === "percent"
        ? billDiscountPercent !== 0
        : billDiscountPaisa !== 0;
    if (shown && !held) setDiscText("");
  }, [billDiscountMode, billDiscountPaisa, billDiscountPercent, discText]);

  /** Switching between rupees and percent keeps the number typed and reads it the new way. */
  function chooseDiscountMode(mode: DiscountMode) {
    if (mode === billDiscountMode) return;
    const n = Number(discText) || 0;
    setBillDiscountMode(mode);
    if (mode === "percent") {
      setBillDiscountPercent(n);
      setBillDiscount(0);
    } else {
      setBillDiscount(toPaisa(n));
      setBillDiscountPercent(0);
    }
  }

  // Services count towards the total exactly as medicines do. Leaving them out
  // is not a rounding difference: a consultation-only bill totalled zero, the
  // Save button stayed disabled, and the counter could not bill a patient who
  // had bought nothing but a service.
  const totals = counterTotals(
    lines,
    serviceLines,
    {
      mode: billDiscountMode,
      amountPaisa: billDiscountPaisa,
      percent: billDiscountPercent,
    },
    {
      vatRegistered: config.vatRegistered,
      vatInclusive: config.vatInclusive,
      roundingOn: config.roundingOn,
    },
  );
  const percentTooBig = billDiscountMode === "percent" && billDiscountPercent > 100;
  const changeDue = change(tenderedPaisa, totals.totalPaisa);
  const hasControlled = lines.some((l) => l.item.controlledFlag);
  const onDues = paymentMethod === "credit";
  // With patients switched on, whoever owes is attached in the patient bar.
  // Without them, the name typed here is the only record of who owes it.
  const duesNeedsName = onDues && !config.clinicOn;
  const needsPatient =
    (hasControlled || duesNeedsName) && patientName.trim() === "";
  const leftOnDues = Math.max(0, totals.totalPaisa - paidNowPaisa);
  const paysItAll = onDues && totals.totalPaisa > 0 && paidNowPaisa >= totals.totalPaisa;

  return (
    <div className="flex h-full w-full flex-col gap-4 bg-sage-900 p-5 text-cream-50">
      <div>
        <label
          htmlFor="pos-patient-name"
          className="mb-1 block text-[12px] text-cream-50/70"
        >
          Patient name{" "}
          {(hasControlled || duesNeedsName) && (
            <span className="text-magenta-100">(required)</span>
          )}
        </label>
        <input
          id="pos-patient-name"
          value={patientName}
          onChange={(e) => setPatientName(e.target.value)}
          placeholder={
            duesNeedsName
              ? "Who owes this bill"
              : "Optional — printed on the bill"
          }
          className={cn(
            "h-10 w-full rounded-[8px] border bg-sage-950/40 px-3 text-[14px] text-cream-50 placeholder:text-cream-50/40 focus:outline-none",
            needsPatient ? "border-magenta-600" : "border-sage-700",
          )}
        />
      </div>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-sage-700/60 pt-3 text-[14px]">
        <Row label="Subtotal" value={formatPaisa(totals.subtotalPaisa)} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-cream-50/70">Bill discount</span>
          <div className="flex items-center gap-1.5">
            <div
              className="flex rounded-[8px] bg-sage-950/40 p-0.5"
              role="group"
              aria-label="Discount in rupees or percent"
            >
              {(
                [
                  ["amount", "रू"],
                  ["percent", "%"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => chooseDiscountMode(mode)}
                  aria-pressed={billDiscountMode === mode}
                  aria-label={mode === "amount" ? "Discount in rupees" : "Discount in percent"}
                  className={cn(
                    "h-7 min-w-[30px] rounded-[6px] px-1.5 text-[13px] font-medium transition-colors",
                    billDiscountMode === mode
                      ? "bg-cream-50 text-sage-900"
                      : "text-cream-50/70 hover:bg-sage-700",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              inputMode="decimal"
              aria-label={
                billDiscountMode === "percent"
                  ? "Bill discount, percent"
                  : "Bill discount, rupees"
              }
              value={discText}
              onChange={(e) => {
                setDiscText(e.target.value);
                const n = Number(e.target.value) || 0;
                if (billDiscountMode === "percent") setBillDiscountPercent(n);
                else setBillDiscount(toPaisa(n));
              }}
              placeholder="0"
              className={cn(
                "h-8 w-20 rounded-[8px] border bg-sage-950/40 px-2 text-right text-[14px] tnum text-cream-50 focus:outline-none",
                percentTooBig ? "border-warn-100" : "border-sage-700",
              )}
            />
          </div>
        </div>
        {billDiscountMode === "percent" && billDiscountPercent > 0 && (
          <div className="flex items-center justify-between text-[12px] text-cream-50/70">
            <span>
              {percentTooBig
                ? "At most 100%"
                : `${clampPercent(billDiscountPercent)}% of ${formatPaisa(totals.subtotalPaisa)}`}
            </span>
            <span className="tnum">− {formatPaisa(totals.billDiscountPaisa)}</span>
          </div>
        )}
        {config.vatRegistered && (
          <Row
            label={config.vatInclusive ? "VAT 13% (included)" : "VAT 13%"}
            value={formatPaisa(totals.vatPaisa)}
          />
        )}
      </div>

      <div className="flex items-center justify-between border-t border-sage-700/60 pt-3">
        <span className="text-[16px] font-semibold">Total</span>
        <span className="text-[28px] font-bold tnum">
          {formatPaisa(totals.totalPaisa)}
        </span>
      </div>

      <div className="flex gap-2">
        {METHODS.map((m) => (
          <button
            key={m.key}
            onClick={() => setPaymentMethod(m.key)}
            aria-pressed={paymentMethod === m.key}
            className={cn(
              "flex-1 rounded-[8px] py-2 text-[14px] font-medium transition-colors",
              paymentMethod === m.key
                ? "bg-cream-50 text-sage-900"
                : "bg-sage-700/50 text-cream-50 hover:bg-sage-700",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {paymentMethod === "cash" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="pos-tendered" className="text-[14px] text-cream-50/70">
              Tendered
            </label>
            <input
              id="pos-tendered"
              ref={tenderRef}
              inputMode="decimal"
              value={tenderText}
              onChange={(e) => {
                setTenderText(e.target.value);
                setTendered(toPaisa(Number(e.target.value) || 0));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
              }}
              placeholder="0"
              className="h-10 w-32 rounded-[8px] border border-sage-700 bg-sage-950/40 px-3 text-right text-[16px] tnum text-cream-50 focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[14px] text-cream-50/70">Change</span>
            <span className="text-[18px] font-semibold tnum">
              {formatPaisa(changeDue)}
            </span>
          </div>
        </div>
      )}

      {onDues && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="pos-paid-now" className="text-[14px] text-cream-50/70">
              Paying now
            </label>
            <input
              id="pos-paid-now"
              ref={paidNowRef}
              inputMode="decimal"
              value={paidNowText}
              onChange={(e) => {
                setPaidNowText(e.target.value);
                setPaidNow(toPaisa(Number(e.target.value) || 0));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
              }}
              placeholder="0"
              className="h-10 w-32 rounded-[8px] border border-sage-700 bg-sage-950/40 px-3 text-right text-[16px] tnum text-cream-50 focus:outline-none"
            />
          </div>
          {paidNowPaisa > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-cream-50/70">Paid by</span>
              <div className="flex gap-1" role="group" aria-label="How it is being paid now">
                {(["cash", "qr"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaidNowMethod(m)}
                    aria-pressed={paidNowMethod === m}
                    className={cn(
                      "rounded-[8px] px-3 py-1 text-[13px] font-medium transition-colors",
                      paidNowMethod === m
                        ? "bg-cream-50 text-sage-900"
                        : "bg-sage-700/50 text-cream-50 hover:bg-sage-700",
                    )}
                  >
                    {m === "cash" ? "Cash" : "QR"}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[14px] text-cream-50/70">Left on dues</span>
            <span className="text-[18px] font-semibold tnum text-warn-100">
              {formatPaisa(leftOnDues)}
            </span>
          </div>
          {paysItAll ? (
            <p className="text-[12px] text-warn-100">
              That pays the whole bill. Choose Cash or QR instead.
            </p>
          ) : (
            config.clinicOn &&
            !patient && (
              <p className="text-[12px] text-cream-50/70">
                Attach the patient who owes this — press{" "}
                <kbd className="rounded-[4px] bg-sage-700 px-1 text-[11px]">F4</kbd>.
              </p>
            )
          )}
        </div>
      )}

      <button
        ref={saveRef}
        onClick={onSave}
        disabled={saving || (lines.length === 0 && serviceLines.length === 0) || needsPatient}
        className="mt-1 h-12 rounded-[8px] bg-magenta-600 text-[16px] font-semibold text-cream-50 hover:bg-magenta-700 disabled:opacity-50"
      >
        {saving ? (
          "Saving…"
        ) : lang === "np" ? (
          <span>
            <span className="deva">{npLabels.save}</span> &amp; print · F9
          </span>
        ) : (
          "Save & print  ·  F9"
        )}
      </button>
      {needsPatient && (
        <p className="text-[12px] text-magenta-100">
          {hasControlled
            ? "Enter the patient name for the prescription item before saving."
            : "Enter the name of whoever owes this bill before saving."}
        </p>
      )}
    </div>
  );
});
PaymentPane.displayName = "PaymentPane";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-cream-50/70">{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
