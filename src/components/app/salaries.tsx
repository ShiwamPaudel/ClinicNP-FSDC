"use client";

/**
 * Salaries (C-037): the month sheet, and the dialogs that change it — pay,
 * bonus or deduction, advance, undo — plus the staff form and the salary-rate
 * form. Every figure is the server's; these only collect what was typed.
 */
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, HandCoins, Minus, Pencil, Plus, Undo2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  addSalaryLineAction,
  giveAdvanceAction,
  paySalaryAction,
  saveStaffAction,
  setPayRateAction,
  undoSalaryEntryAction,
} from "@/app/(app)/salaries/actions";
import { formatPaisa, paisaToRupees, toPaisa } from "@/lib/money";
import { PAYABLE_METHOD_LABEL, payableMethodLabel } from "@/lib/payables";
import { monthLabel } from "@/lib/payroll";
import type { SheetRow } from "@/lib/repos/payroll";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

const METHODS = ["cash", "bank", "cheque", "qr"] as const;

const LINE_LABEL: Record<string, string> = {
  bonus: "Bonus",
  deduction: "Deduction",
  advance_recovery: "Advance recovered",
};

function useDone() {
  const router = useRouter();
  const toast = useToast();
  return {
    toast,
    async run(p: Promise<{ ok: boolean; userMessage?: string }>, success: string): Promise<boolean> {
      const res = await p;
      if (!res.ok) {
        toast.error(res.userMessage ?? strings.somethingWentWrong);
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// the month sheet
// ---------------------------------------------------------------------------

export function SalarySheet({
  monthBs,
  rows,
  todayBs,
}: {
  monthBs: string;
  rows: SheetRow[];
  todayBs: string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState<SheetRow | null>(null);
  const [lining, setLining] = useState<SheetRow | null>(null);
  const [advancing, setAdvancing] = useState<SheetRow | null>(null);
  const [undoing, setUndoing] = useState<{ kind: "payment" | "line"; id: string; what: string } | null>(
    null,
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        message={`Nobody is on the payroll for ${monthLabel(monthBs)}. Add staff, with the month their salary starts.`}
      />
    );
  }

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH>Staff</TH>
            <TH numeric>Salary</TH>
            <TH numeric className="hidden md:table-cell">Bonus</TH>
            <TH numeric className="hidden md:table-cell">Deductions</TH>
            <TH numeric>Net</TH>
            <TH numeric>Paid</TH>
            <TH numeric>Left</TH>
            <TH />
          </TR>
        </THead>
        <tbody>
          {rows.map((r) => {
            const p = r.pay;
            const deductions = p.ssfStaffPaisa + p.sstPaisa + p.deductionPaisa + p.advanceRecoveredPaisa;
            const isOpen = open.has(r.staff.id);
            return (
              <Fragment key={r.staff.id}>
                <TR selected={isOpen}>
                  <TD>
                    <button
                      type="button"
                      onClick={() => toggle(r.staff.id)}
                      aria-expanded={isOpen}
                      className="flex items-start gap-2 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-sage-500" />
                      ) : (
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-sage-500" />
                      )}
                      <span className="flex flex-col">
                        <span className="font-medium text-sage-900">{r.staff.name}</span>
                        <span className="text-[12px] text-sage-500">
                          {[r.staff.designation, r.rate.ssfEnrolled ? "SSF" : ""].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </TD>
                  <TD numeric>{formatPaisa(p.salaryPaisa, false)}</TD>
                  <TD numeric className="hidden md:table-cell">
                    {p.bonusPaisa ? formatPaisa(p.bonusPaisa, false) : "—"}
                  </TD>
                  <TD numeric className="hidden md:table-cell">
                    {deductions ? formatPaisa(deductions, false) : "—"}
                  </TD>
                  <TD numeric className="font-semibold">{formatPaisa(p.netPaisa, false)}</TD>
                  <TD numeric>{formatPaisa(p.paidPaisa, false)}</TD>
                  <TD
                    numeric
                    className={cn(
                      "whitespace-nowrap font-semibold",
                      p.leftPaisa > 0 ? "text-danger-600" : p.leftPaisa < 0 ? "text-warn-600" : "text-ok-600",
                    )}
                  >
                    {p.leftPaisa === 0 ? "Paid" : p.leftPaisa < 0 ? `${formatPaisa(-p.leftPaisa, false)} over` : formatPaisa(p.leftPaisa, false)}
                  </TD>
                  <TD className="text-right">
                    <Button variant="secondary" onClick={() => setPaying(r)} className="px-2.5 sm:px-4">
                      <Wallet className="h-4 w-4" />
                      <span className="hidden sm:inline">Pay</span>
                    </Button>
                  </TD>
                </TR>
                {isOpen && (
                  <tr className="border-b border-line bg-cream-100">
                    <td colSpan={8} className="px-4 py-3">
                      <RowDetail
                        row={r}
                        onLine={() => setLining(r)}
                        onAdvance={() => setAdvancing(r)}
                        onUndo={setUndoing}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </Table>

      <PayDialog row={paying} monthBs={monthBs} todayBs={todayBs} onClose={() => setPaying(null)} />
      <LineDialog row={lining} monthBs={monthBs} onClose={() => setLining(null)} />
      <AdvanceDialog row={advancing} todayBs={todayBs} onClose={() => setAdvancing(null)} />
      <UndoDialog target={undoing} onClose={() => setUndoing(null)} />
    </>
  );
}

function RowDetail({
  row,
  onLine,
  onAdvance,
  onUndo,
}: {
  row: SheetRow;
  onLine: () => void;
  onAdvance: () => void;
  onUndo: (t: { kind: "payment" | "line"; id: string; what: string }) => void;
}) {
  const p = row.pay;
  const parts: [string, number][] = [
    ["Salary", p.salaryPaisa],
    ["Bonus", p.bonusPaisa],
    ["SSF 11%", -p.ssfStaffPaisa],
    ["Tax 1%", -p.sstPaisa],
    ["Deductions", -p.deductionPaisa],
    ["Advance recovered", -p.advanceRecoveredPaisa],
  ];
  return (
    <div className="flex flex-col gap-3 text-[13.5px]">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sage-700">
        {parts
          .filter(([, v]) => v !== 0 || false)
          .map(([k, v]) => (
            <span key={k}>
              {k}: <span className="tnum font-medium text-sage-900">{v < 0 ? "−" : ""}{formatPaisa(Math.abs(v), false)}</span>
            </span>
          ))}
        {p.ssfEmployerPaisa > 0 && (
          <span className="text-sage-500">
            Clinic&apos;s SSF 20%: <span className="tnum">{formatPaisa(p.ssfEmployerPaisa, false)}</span>
          </span>
        )}
        {row.advanceOutstandingPaisa > 0 && (
          <span className="text-warn-600">
            Advance still to recover: <span className="tnum font-medium">{formatPaisa(row.advanceOutstandingPaisa, false)}</span>
          </span>
        )}
      </div>

      {(row.lines.length > 0 || row.payments.length > 0) && (
        <ul className="flex flex-col gap-1">
          {row.lines.map((l) => (
            <li key={l.id} className={cn("flex items-center gap-2", l.voided && "text-sage-400 line-through")}>
              <Badge tone={l.kind === "bonus" ? "ok" : "neutral"}>{LINE_LABEL[l.kind]}</Badge>
              {l.label !== LINE_LABEL[l.kind] && <span>{l.label}</span>}
              <span className="tnum">{formatPaisa(l.amountPaisa, false)}</span>
              {!l.voided && (
                <button
                  type="button"
                  className="text-[12px] text-clinic-700 hover:underline"
                  onClick={() => onUndo({ kind: "line", id: l.id, what: `${LINE_LABEL[l.kind]} of ${formatPaisa(l.amountPaisa)}` })}
                >
                  Undo
                </button>
              )}
            </li>
          ))}
          {row.payments.map((pm) => (
            <li key={pm.id} className={cn("flex items-center gap-2", pm.voided && "text-sage-400 line-through")}>
              <Badge tone="info">Paid</Badge>
              <span className="tnum">{pm.dateBs}</span>
              <span className="tnum font-medium">{formatPaisa(pm.amountPaisa, false)}</span>
              <span className="text-sage-500">
                {payableMethodLabel(pm.method)}
                {pm.note ? ` · ${pm.note}` : ""}
                {pm.userName ? ` · ${pm.userName}` : ""}
              </span>
              {!pm.voided && (
                <button
                  type="button"
                  className="text-[12px] text-clinic-700 hover:underline"
                  onClick={() => onUndo({ kind: "payment", id: pm.id, what: `Payment of ${formatPaisa(pm.amountPaisa)}` })}
                >
                  Undo
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onLine}>
          <Plus className="h-4 w-4" />
          Bonus or deduction
        </Button>
        <Button variant="secondary" onClick={onAdvance}>
          <HandCoins className="h-4 w-4" />
          Give an advance
        </Button>
        <a
          href={`/salaries/staff/${row.staff.id}`}
          className="inline-flex h-10 items-center px-2 text-[13px] text-clinic-700 hover:underline"
        >
          All months
        </a>
      </div>
    </div>
  );
}

function MethodSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {METHODS.map((m) => (
        <option key={m} value={m}>
          {PAYABLE_METHOD_LABEL[m]}
        </option>
      ))}
    </Select>
  );
}

function PayDialog({
  row,
  monthBs,
  todayBs,
  onClose,
}: {
  row: SheetRow | null;
  monthBs: string;
  todayBs: string;
  onClose: () => void;
}) {
  const { run, toast } = useDone();
  const [dateBs, setDateBs] = useState(todayBs);
  const [amount, setAmount] = useState("");
  const [recover, setRecover] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [forId, setForId] = useState<string | null>(null);

  // Fill the boxes each time the dialog opens for somebody.
  if (row && forId !== row.staff.id) {
    const left = Math.max(0, row.pay.leftPaisa);
    const rec = Math.min(row.advanceOutstandingPaisa, left);
    setForId(row.staff.id);
    setRecover(rec > 0 ? String(paisaToRupees(rec)) : "");
    setAmount(String(paisaToRupees(Math.max(0, left - rec))));
    setNote("");
    setMethod("cash");
    setDateBs(todayBs);
  }
  if (!row && forId !== null) setForId(null);

  const rec = toPaisa(Number(recover) || 0);
  const amt = toPaisa(Number(amount) || 0);

  async function submit() {
    if (!row) return;
    if (amt <= 0 && rec <= 0) {
      toast.error("Enter an amount to pay.");
      return;
    }
    setBusy(true);
    const ok = await run(
      paySalaryAction({
        staffId: row.staff.id,
        monthBs,
        dateBs,
        amountPaisa: amt,
        method,
        note,
        recoverAdvancePaisa: rec,
      }),
      `Salary paid to ${row.staff.name}`,
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open={row !== null}
      onClose={() => !busy && onClose()}
      title={row ? `Pay ${row.staff.name} · ${monthLabel(monthBs)}` : "Pay"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {strings.cancel}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Record payment"}
          </Button>
        </>
      }
    >
      {row && (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-sage-700">
            Net for the month {formatPaisa(row.pay.netPaisa)} · paid {formatPaisa(row.pay.paidPaisa)} · left{" "}
            <span className="font-semibold">{formatPaisa(Math.max(0, row.pay.leftPaisa))}</span>
          </p>
          {row.advanceOutstandingPaisa > 0 && (
            <Field
              label="Recover from the advance (रू)"
              hint={`${formatPaisa(row.advanceOutstandingPaisa)} of the advance is still to recover. This much is taken off this month.`}
            >
              <Input numeric inputMode="decimal" value={recover} onChange={(e) => setRecover(e.target.value)} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Paid now (रू)">
              <Input numeric autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="How">
              <MethodSelect value={method} onChange={setMethod} />
            </Field>
          </div>
          <Field label="Date">
            <DatePickerBS value={dateBs} onChange={setDateBs} typable />
          </Field>
          <Field label="Note" hint="Cheque number, or anything to remember">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

function LineDialog({
  row,
  monthBs,
  onClose,
}: {
  row: SheetRow | null;
  monthBs: string;
  onClose: () => void;
}) {
  const { run, toast } = useDone();
  const [kind, setKind] = useState<"bonus" | "deduction">("bonus");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!row) return;
    const amt = toPaisa(Number(amount) || 0);
    if (amt <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    setBusy(true);
    const ok = await run(
      addSalaryLineAction({ staffId: row.staff.id, monthBs, kind, label, amountPaisa: amt }),
      kind === "bonus" ? "Bonus added" : "Deduction added",
    );
    setBusy(false);
    if (ok) {
      setLabel("");
      setAmount("");
      onClose();
    }
  }

  return (
    <Dialog
      open={row !== null}
      onClose={() => !busy && onClose()}
      title={row ? `${row.staff.name} · ${monthLabel(monthBs)}` : ""}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {strings.cancel}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Add"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="group" aria-label="Bonus or deduction" className="inline-flex self-start rounded-[8px] border border-line bg-cream-100 p-0.5">
          {(["bonus", "deduction"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "inline-flex items-center gap-1 rounded-[6px] px-3 py-1 text-[13px]",
                kind === k ? "bg-sage-700 text-cream-50" : "text-sage-600",
              )}
            >
              {k === "bonus" ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
              {k === "bonus" ? "Bonus" : "Deduction"}
            </button>
          ))}
        </div>
        <Field label="For">
          <Input
            autoFocus
            value={label}
            placeholder={kind === "bonus" ? "Dashain bonus, overtime…" : "2 days' absence, income tax…"}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <Field label="Amount (रू)">
          <Input numeric inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function AdvanceDialog({
  row,
  todayBs,
  onClose,
}: {
  row: SheetRow | null;
  todayBs: string;
  onClose: () => void;
}) {
  const { run, toast } = useDone();
  const [dateBs, setDateBs] = useState(todayBs);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!row) return;
    const amt = toPaisa(Number(amount) || 0);
    if (amt <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    setBusy(true);
    const ok = await run(
      giveAdvanceAction({ staffId: row.staff.id, dateBs, amountPaisa: amt, method, note }),
      `Advance given to ${row.staff.name}`,
    );
    setBusy(false);
    if (ok) {
      setAmount("");
      setNote("");
      onClose();
    }
  }

  return (
    <Dialog
      open={row !== null}
      onClose={() => !busy && onClose()}
      title={row ? `Advance to ${row.staff.name}` : ""}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {strings.cancel}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Give advance"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13.5px] text-sage-600">
          Paid ahead of salary. When a later salary is paid, part or all of it is taken back.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (रू)">
            <Input numeric autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="How">
            <MethodSelect value={method} onChange={setMethod} />
          </Field>
        </div>
        <Field label="Date">
          <DatePickerBS value={dateBs} onChange={setDateBs} typable />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function UndoDialog({
  target,
  onClose,
}: {
  target: { kind: "payment" | "line"; id: string; what: string } | null;
  onClose: () => void;
}) {
  const { run, toast } = useDone();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!target) return;
    if (!reason.trim()) {
      toast.error("Say why this is being undone.");
      return;
    }
    setBusy(true);
    const ok = await run(undoSalaryEntryAction({ ...target, reason }), "Undone");
    setBusy(false);
    if (ok) {
      setReason("");
      onClose();
    }
  }

  return (
    <Dialog
      open={target !== null}
      onClose={() => !busy && onClose()}
      title="Undo this?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? "…" : "Undo"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-sage-700">
          {target?.what}. It stays on record, marked as undone. Use this only for a mistake.
        </p>
        <Field label="Why is it being undone?">
          <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. typed the wrong amount" />
        </Field>
      </div>
    </Dialog>
  );
}

/** Undo one payment from a staff member's own page. */
export function UndoPaymentButton({ id, what }: { id: string; what: string }) {
  const [target, setTarget] = useState<{ kind: "payment"; id: string; what: string } | null>(null);
  return (
    <>
      <Button variant="ghost" onClick={() => setTarget({ kind: "payment", id, what })}>
        <Undo2 className="h-4 w-4" />
        Undo
      </Button>
      <UndoDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// staff and their salary
// ---------------------------------------------------------------------------

export interface StaffFormValue {
  id?: string;
  name: string;
  designation: string;
  phone: string;
  panNo: string;
  ssfNo: string;
  bankAccount: string;
  note: string;
  joinedBs: string | null;
  leftBs: string | null;
}

const BLANK_STAFF: StaffFormValue = {
  name: "",
  designation: "",
  phone: "",
  panNo: "",
  ssfNo: "",
  bankAccount: "",
  note: "",
  joinedBs: null,
  leftBs: null,
};

/** Add a person (with their salary), or edit one's details. */
export function StaffFormButton({
  staff,
  currentMonth,
  label,
}: {
  staff?: StaffFormValue;
  currentMonth: string;
  label: string;
}) {
  const { toast } = useDone();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<StaffFormValue>(staff ?? BLANK_STAFF);
  const [salary, setSalary] = useState("");
  const [fromMonth, setFromMonth] = useState(currentMonth);
  const [ssf, setSsf] = useState(false);
  const [sst, setSst] = useState(true);
  const [busy, setBusy] = useState(false);
  const isNew = !staff?.id;

  const set = <K extends keyof StaffFormValue>(k: K, val: StaffFormValue[K]) => setV((s) => ({ ...s, [k]: val }));

  async function submit() {
    if (!v.name.trim()) {
      toast.error("Enter the name.");
      return;
    }
    if (isNew && !(Number(salary) >= 0 && salary !== "")) {
      toast.error("Enter the monthly salary.");
      return;
    }
    setBusy(true);
    const { id, ...details } = v;
    const res = await saveStaffAction({
      id,
      staff: details,
      rate: isNew
        ? { fromMonthBs: fromMonth, monthlySalaryPaisa: toPaisa(Number(salary) || 0), ssfEnrolled: ssf, sstApplies: !ssf && sst }
        : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
      return;
    }
    toast.success(isNew ? `${v.name} added` : strings.saved);
    setOpen(false);
    if (isNew) {
      setV(BLANK_STAFF);
      setSalary("");
    }
    router.refresh();
  }

  return (
    <>
      <Button variant={isNew ? "primary" : "secondary"} onClick={() => setOpen(true)}>
        {isNew ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={isNew ? "Add staff" : `Edit ${staff?.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              {strings.cancel}
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Saving…" : strings.save}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input autoFocus value={v.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Job">
            <Input value={v.designation} placeholder="Receptionist, dental assistant…" onChange={(e) => set("designation", e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={v.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Bank account">
            <Input value={v.bankAccount} onChange={(e) => set("bankAccount", e.target.value)} />
          </Field>
          <Field label="PAN">
            <Input value={v.panNo} onChange={(e) => set("panNo", e.target.value)} />
          </Field>
          <Field label="SSF number">
            <Input value={v.ssfNo} onChange={(e) => set("ssfNo", e.target.value)} />
          </Field>
          <Field label="Joined">
            <DatePickerBS value={v.joinedBs ?? ""} onChange={(x) => set("joinedBs", x || null)} typable clearable />
          </Field>
          {!isNew && (
            <Field label="Left" hint="Leave empty while they still work here">
              <DatePickerBS value={v.leftBs ?? ""} onChange={(x) => set("leftBs", x || null)} typable clearable />
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field label="Note">
              <Input value={v.note} onChange={(e) => set("note", e.target.value)} />
            </Field>
          </div>
          {isNew && (
            <div className="grid gap-3 rounded-[8px] border border-line bg-cream-100 p-3 sm:col-span-2 sm:grid-cols-2">
              <Field label="Monthly salary (रू)">
                <Input numeric inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} />
              </Field>
              <Field label="Paid from">
                <MonthSelect value={fromMonth} onChange={setFromMonth} around={currentMonth} />
              </Field>
              <RateChecks ssf={ssf} sst={sst} onSsf={setSsf} onSst={setSst} />
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

function RateChecks({
  ssf,
  sst,
  onSsf,
  onSst,
}: {
  ssf: boolean;
  sst: boolean;
  onSsf: (v: boolean) => void;
  onSst: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <label className="flex items-center gap-2 text-[14px] text-sage-900">
        <input type="checkbox" checked={ssf} onChange={(e) => onSsf(e.target.checked)} />
        On the Social Security Fund (11% from salary, 20% from the clinic)
      </label>
      <label className={cn("flex items-center gap-2 text-[14px]", ssf ? "text-sage-400" : "text-sage-900")}>
        <input type="checkbox" checked={!ssf && sst} disabled={ssf} onChange={(e) => onSst(e.target.checked)} />
        Take 1% social security tax {ssf ? "(not for SSF members)" : ""}
      </label>
    </div>
  );
}

/** Twelve months either side of `around`, newest first. */
function MonthSelect({ value, onChange, around }: { value: string; onChange: (v: string) => void; around: string }) {
  const months: string[] = [];
  const [y, m] = around.split("-").map(Number) as [number, number];
  for (let i = 12; i >= -12; i--) {
    const n = y * 12 + (m - 1) + i;
    months.push(`${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`);
  }
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {months.map((mo) => (
        <option key={mo} value={mo}>
          {monthLabel(mo)}
        </option>
      ))}
    </Select>
  );
}

/** A new salary from a month on. Earlier months keep what they were paid at. */
export function PayRateButton({
  staffId,
  currentMonth,
  current,
}: {
  staffId: string;
  currentMonth: string;
  current: { monthlySalaryPaisa: number; ssfEnrolled: boolean; sstApplies: boolean } | null;
}) {
  const { run, toast } = useDone();
  const [open, setOpen] = useState(false);
  const [salary, setSalary] = useState(current ? String(paisaToRupees(current.monthlySalaryPaisa)) : "");
  const [fromMonth, setFromMonth] = useState(currentMonth);
  const [ssf, setSsf] = useState(current?.ssfEnrolled ?? false);
  const [sst, setSst] = useState(current?.sstApplies ?? true);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (salary === "" || !(Number(salary) >= 0)) {
      toast.error("Enter the monthly salary.");
      return;
    }
    setBusy(true);
    const ok = await run(
      setPayRateAction({
        staffId,
        fromMonthBs: fromMonth,
        monthlySalaryPaisa: toPaisa(Number(salary) || 0),
        ssfEnrolled: ssf,
        sstApplies: !ssf && sst,
      }),
      "Salary changed",
    );
    setBusy(false);
    if (ok) setOpen(false);
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Wallet className="h-4 w-4" />
        Change salary
      </Button>
      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Change salary"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              {strings.cancel}
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Saving…" : strings.save}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Monthly salary (रू)">
            <Input numeric autoFocus inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} />
          </Field>
          <Field label="From">
            <MonthSelect value={fromMonth} onChange={setFromMonth} around={currentMonth} />
          </Field>
          <RateChecks ssf={ssf} sst={sst} onSsf={setSsf} onSst={setSst} />
          <p className="text-[12.5px] text-sage-500 sm:col-span-2">
            Months before this keep the salary they had.
          </p>
        </div>
      </Dialog>
    </>
  );
}
