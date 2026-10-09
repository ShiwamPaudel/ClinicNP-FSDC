"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import { useToast } from "@/components/ui/toast";
import { addHistoryRowAction } from "@/app/(app)/patients/history-actions";
import { formatPaisa, toPaisa } from "@/lib/money";
import { rowCharge, rowPaymentProblem, type RowPayMode } from "@/lib/visit-row";
import type { BillConfig } from "@/lib/bill-calc";
import type { PosService } from "@/lib/pos-types";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

export interface RowFormOptions {
  services: PosService[];
  doctors: { id: string; name: string }[];
  partners: { id: string; name: string }[];
  billConfig: BillConfig;
  canEditRate: boolean;
  /** Today in the clinic's calendar, as the date box holds it. */
  todayBs: string;
}

interface ChargeLine {
  key: number;
  serviceId: string;
  qty: string;
  rateRupees: string;
  labPartnerId: string;
}

/** Paisa as the rupees a box shows: "1000", "22.50". */
function rupees(paisa: number): string {
  const r = paisa / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

/**
 * One new line on the patient's history, typed where the card is read: the
 * date, the doctor, what was done, and — if anything was charged — the
 * services, and what was paid. The server makes the visit and the bill.
 */
export function HistoryRowForm({
  patientId,
  options,
  onDone,
}: {
  patientId: string;
  options: RowFormOptions;
  onDone: (bill: { id: string; label: string; totalPaisa: number } | null) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { services, doctors, partners, billConfig, canEditRate, todayBs } = options;
  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

  const [dateBs, setDateBs] = useState(todayBs);
  const [doctorId, setDoctorId] = useState(doctors.length === 1 ? doctors[0]!.id : "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ChargeLine[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [payMode, setPayMode] = useState<RowPayMode>("full");
  const [method, setMethod] = useState<"cash" | "qr">("cash");
  const [paidRupees, setPaidRupees] = useState("");
  const [busy, setBusy] = useState(false);

  const charging = lines.length > 0;

  const charge = useMemo(
    () =>
      rowCharge(
        lines
          .filter((l) => byId.has(l.serviceId))
          .map((l) => ({
            qty: Number(l.qty) || 0,
            ratePaisa: toPaisa(Number(l.rateRupees) || 0),
            vatApplicable: byId.get(l.serviceId)!.vatApplicable,
          })),
        billConfig,
      ),
    [lines, byId, billConfig],
  );
  const paidPaisa =
    payMode === "full" ? charge.totalPaisa : payMode === "part" ? toPaisa(Number(paidRupees) || 0) : 0;
  const payProblem = charging ? rowPaymentProblem(payMode, paidPaisa, charge.totalPaisa) : null;

  function addLine() {
    setLines((ls) => [
      ...ls,
      { key: nextKey, serviceId: "", qty: "1", rateRupees: "", labPartnerId: "" },
    ]);
    setNextKey((k) => k + 1);
    // A bill is dated the day it is made.
    setDateBs(todayBs);
  }

  function setLine(key: number, patch: Partial<ChargeLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickService(key: number, serviceId: string) {
    const s = byId.get(serviceId);
    setLine(key, {
      serviceId,
      rateRupees: s ? rupees(s.ratePaisa) : "",
      labPartnerId: s?.outsourced ? (s.defaultLabPartnerId ?? partners[0]?.id ?? "") : "",
    });
    if (s?.defaultDoctorId && !doctorId) setDoctorId(s.defaultDoctorId);
  }

  async function save() {
    if (!notes.trim() && !charging) {
      toast.error("Type the treatment notes, or add a service.");
      return;
    }
    for (const [i, l] of lines.entries()) {
      const s = byId.get(l.serviceId);
      if (!s) {
        toast.error(`Service ${i + 1}: choose a service, or remove it.`);
        return;
      }
      if (!(Number(l.qty) >= 1)) {
        toast.error(`${s.name}: enter the quantity.`);
        return;
      }
      if (s.doctorRequired && !doctorId) {
        toast.error(`${s.name} needs a doctor. Choose one.`);
        return;
      }
    }
    if (payProblem) {
      toast.error(payProblem);
      return;
    }
    setBusy(true);
    const res = await addHistoryRowAction({
      patientId,
      dateBs,
      notes,
      doctorId: doctorId || null,
      services: lines.map((l) => ({
        serviceId: l.serviceId,
        qty: Number(l.qty),
        ratePaisa: toPaisa(Number(l.rateRupees) || 0),
        labPartnerId: l.labPartnerId || null,
      })),
      payment: {
        mode: payMode,
        amountPaisa: payMode === "part" ? paidPaisa : 0,
        method,
      },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
      // Notes saved without their bill still changed the card.
      router.refresh();
      return;
    }
    toast.success(res.invoiceLabel ? `Row added · bill ${res.invoiceLabel}` : "Row added");
    onDone(
      res.billId
        ? { id: res.billId, label: res.invoiceLabel ?? "", totalPaisa: res.totalPaisa ?? 0 }
        : null,
    );
    router.refresh();
  }

  return (
    <section className="rounded-[10px] border-2 border-clinic-700/70 bg-cream-50 p-4">
      <h3 className="mb-3 text-[14px] font-semibold text-clinic-900">New row</h3>

      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Date">
          {charging ? (
            <div className="flex h-10 items-center rounded-[8px] border border-line bg-cream-100 px-3 text-[14px] text-sage-700">
              Today
            </div>
          ) : (
            <DatePickerBS value={dateBs} onChange={setDateBs} typable />
          )}
        </Field>
        <Field label="Doctor">
          <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">— None —</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-sage-900">Treatment notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="e.g. RCT 36, access opening and BMP done. Review in 1 week."
          className="rounded-[8px] border border-line bg-cream-50 px-3 py-2 text-[14px] leading-[1.45] outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20"
        />
      </label>

      {/* What was charged, if anything */}
      <div className="mt-4 flex flex-col gap-2">
        {lines.map((l) => {
          const s = byId.get(l.serviceId);
          return (
            <div
              key={l.key}
              className="grid gap-2 rounded-[8px] border border-line bg-cream-100 p-2.5 sm:grid-cols-[minmax(0,2fr)_80px_130px_auto] sm:items-end"
            >
              <Field label="Service">
                <Select value={l.serviceId} onChange={(e) => pickService(l.key, e.target.value)}>
                  <option value="">— Choose —</option>
                  {services.map((sv) => (
                    <option key={sv.id} value={sv.id}>
                      {sv.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Qty">
                <Input
                  numeric
                  inputMode="numeric"
                  value={l.qty}
                  onChange={(e) => setLine(l.key, { qty: e.target.value.replace(/\D/g, "") })}
                />
              </Field>
              <Field label="Rate (रू)">
                <Input
                  numeric
                  inputMode="decimal"
                  value={l.rateRupees}
                  disabled={!canEditRate}
                  title={canEditRate ? undefined : "Only someone allowed to change rates can change this."}
                  onChange={(e) => setLine(l.key, { rateRupees: e.target.value })}
                />
              </Field>
              <div className="flex h-10 items-center">
                <button
                  type="button"
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  aria-label="Remove service"
                  className="rounded-[8px] p-2 text-danger-600 hover:bg-danger-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {s?.outsourced && partners.length > 1 && (
                <div className="sm:col-span-4">
                  <Field label="Laboratory">
                    <Select
                      value={l.labPartnerId}
                      onChange={(e) => setLine(l.key, { labPartnerId: e.target.value })}
                    >
                      {partners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              )}
            </div>
          );
        })}
        <div>
          <Button variant="secondary" onClick={addLine} disabled={services.length === 0}>
            <Plus className="h-4 w-4" />
            {charging ? "Add another service" : "Add a charge"}
          </Button>
          {services.length === 0 && (
            <span className="ml-3 text-[12.5px] text-sage-500">
              No services are set up yet.{" "}
              <Link href="/settings/services" className="underline underline-offset-2">
                Add them
              </Link>
            </span>
          )}
        </div>
      </div>

      {charging && (
        <div className="mt-4 flex flex-col items-end gap-1.5 border-t border-line pt-3">
          {billConfig.vatRegistered && charge.vatPaisa > 0 && (
            <>
              <Row label="Taxable amount" value={formatPaisa(charge.taxablePaisa, false)} />
              <Row
                label={billConfig.vatInclusive ? "VAT 13% (included)" : "VAT 13%"}
                value={formatPaisa(charge.vatPaisa, false)}
              />
            </>
          )}
          <div className="flex w-64 justify-between border-t border-line pt-1.5 text-[15px] font-semibold text-sage-900">
            <span>Service charge</span>
            <span className="tnum">{formatPaisa(charge.totalPaisa)}</span>
          </div>

          <div
            role="group"
            aria-label="Payment"
            className="mt-2 inline-flex rounded-[8px] border border-line bg-cream-100 p-0.5"
          >
            {(
              [
                ["full", "Paid in full"],
                ["part", "Part paid"],
                ["credit", "On credit"],
              ] as const
            ).map(([m, label]) => (
              <Chip key={m} active={payMode === m} onClick={() => setPayMode(m)}>
                {label}
              </Chip>
            ))}
          </div>
          {payMode === "part" && (
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-[14px] text-sage-700">Paid now (रू)</span>
              <Input
                numeric
                inputMode="decimal"
                className="w-28 text-right"
                aria-label="Paid now, rupees"
                value={paidRupees}
                onChange={(e) => setPaidRupees(e.target.value)}
              />
            </div>
          )}
          {payMode !== "credit" && (
            <div
              role="group"
              aria-label="How it was paid"
              className="inline-flex rounded-[8px] border border-line bg-cream-100 p-0.5"
            >
              <Chip active={method === "cash"} onClick={() => setMethod("cash")}>
                Cash
              </Chip>
              <Chip active={method === "qr"} onClick={() => setMethod("qr")}>
                QR
              </Chip>
            </div>
          )}
          <Row label="Payment" value={formatPaisa(paidPaisa, false)} />
          <Row label="Due" value={formatPaisa(Math.max(0, charge.totalPaisa - paidPaisa), false)} />
          {payProblem && payMode === "part" && paidRupees !== "" && (
            <p className="flex items-center gap-1.5 text-[12px] text-danger-600">
              <TriangleAlert className="h-3.5 w-3.5" />
              {payProblem}
            </p>
          )}
          <p className="max-w-[340px] text-right text-[12px] text-sage-500">
            Saving makes a bill for this, dated today. Anything unpaid goes on Dues.
          </p>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onDone(null)} disabled={busy}>
          {strings.cancel}
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? "…" : charging ? "Save row and bill" : "Save row"}
        </Button>
      </div>
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-[6px] px-2.5 py-0.5 text-[13px] transition-colors",
        active ? "bg-sage-700 text-cream-50" : "text-sage-600 hover:text-sage-900",
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-64 justify-between text-[14px] text-sage-700">
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
