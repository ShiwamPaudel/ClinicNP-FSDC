"use client";

/**
 * dues-list.tsx — who owes the shop money, and what has been paid back.
 *
 * Grouped by person rather than listed by bill: somebody who comes in to
 * settle up asks "how much do I owe?", not "how much is on bill 45?". Each
 * person opens to show the bills behind the figure.
 */
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, HandCoins, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  ReceiveDuesDialog,
  type ReceivableBill,
} from "@/components/app/receive-dues-dialog";
import { voidDueReceiptAction } from "@/app/(app)/dues/actions";
import {
  MONEY_METHOD_LABEL,
  isMoneyMethod,
  type DuePerson,
  type OwedBill,
} from "@/lib/dues";
import type { DueReceipt } from "@/lib/repos/dues";
import { formatPaisa } from "@/lib/money";
import { formatDocNo } from "@/lib/invoice-number";
import { formatPatientNo } from "@/lib/patient-no";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

function invoiceLabel(b: { invoiceNo: number | null; fiscalLabel: string }): string {
  return b.invoiceNo != null
    ? formatDocNo("SI", b.fiscalLabel, b.invoiceNo)
    : "Pending";
}

/** Paid at the counter plus paid back since. Returns are not payments. */
function paidSoFar(b: OwedBill): number {
  return b.totalPaisa - b.duePaisa + b.receivedPaisa;
}

function ageTone(days: number): "danger" | "warn" | "neutral" {
  return days > 30 ? "danger" : days > 15 ? "warn" : "neutral";
}

function matches(
  query: string,
  p: { name: string; phone?: string; patientNo: number | null },
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  return (
    p.name.toLowerCase().includes(q) ||
    (digits.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(digits)) ||
    (digits.length > 0 && p.patientNo != null && String(p.patientNo) === String(Number(digits)))
  );
}

export function DuesList({
  people,
  receipts,
  canReceive,
  isAdmin,
  openKey,
}: {
  people: DuePerson[];
  receipts: DueReceipt[];
  /** may take money: Owner and Staff, never the Accountant */
  canReceive: boolean;
  /** may undo a payment entered by mistake */
  isAdmin: boolean;
  /** a person to open straight away, when arriving from their patient card */
  openKey?: string;
}) {
  const [tab, setTab] = useState<"owed" | "paid">("owed");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(openKey ? [openKey] : []),
  );
  const [receiving, setReceiving] = useState<DuePerson | null>(null);

  const totalOwedPaisa = people.reduce((s, p) => s + p.owedPaisa, 0);
  const oldest = people.reduce((m, p) => Math.max(m, p.oldestDays), 0);

  const shownPeople = useMemo(
    () => people.filter((p) => matches(q, p)),
    [people, q],
  );
  const shownReceipts = useMemo(
    () =>
      receipts.filter(
        (r) =>
          matches(q, r) ||
          r.bills.some((b) => invoiceLabel(b).toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [receipts, q],
  );

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <Summary
            label="Owed to you"
            value={formatPaisa(totalOwedPaisa)}
            tone={totalOwedPaisa > 0 ? "warn" : "plain"}
          />
        </div>
        <Summary
          label="People who owe"
          value={String(people.length)}
        />
        <Summary
          label="Oldest"
          value={people.length > 0 ? `${oldest} ${oldest === 1 ? "day" : "days"}` : "—"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex shrink-0 gap-1" role="tablist" aria-label="Dues">
          {(
            [
              ["owed", `Owed (${people.length})`],
              ["paid", "Paid back"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={
                tab === value
                  ? "rounded-[8px] bg-sage-700 px-3 py-2 text-[13px] font-medium text-cream-50"
                  : "rounded-[8px] border border-line px-3 py-2 text-[13px] text-sage-700 hover:bg-cream-200"
              }
            >
              {text}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-auto sm:max-w-sm sm:flex-1">
          <Input
            aria-label="Search dues"
            placeholder="Search name, phone or patient number…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {tab === "owed" ? (
        people.length === 0 ? (
          <EmptyState icon={HandCoins} message={strings.nothingOwed} />
        ) : shownPeople.length === 0 ? (
          <EmptyState icon={HandCoins} message="Nobody who owes matches that search." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Who</TH>
                <TH numeric className="hidden sm:table-cell">Bills</TH>
                <TH numeric>{strings.owed}</TH>
                <TH className="hidden sm:table-cell">Oldest</TH>
                <TH />
              </TR>
            </THead>
            <tbody>
              {shownPeople.map((p) => {
                const open = expanded.has(p.key);
                return (
                  <Fragment key={p.key}>
                    <TR selected={open}>
                      <TD>
                        <button
                          onClick={() => toggle(p.key)}
                          aria-expanded={open}
                          className="flex items-start gap-2 text-left"
                        >
                          {open ? (
                            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-sage-500" />
                          ) : (
                            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-sage-500" />
                          )}
                          <span className="flex flex-col">
                            <span
                              className={cn(
                                "font-medium",
                                p.name ? "text-sage-900" : "italic text-sage-500",
                              )}
                            >
                              {p.name || "No name on the bill"}
                            </span>
                            <span className="flex flex-wrap gap-x-2 text-[12px]">
                              {p.patientNo != null && (
                                <span className="whitespace-nowrap font-mono text-clinic-700">
                                  {formatPatientNo(p.patientNo)}
                                </span>
                              )}
                              {p.phone && (
                                <span className="whitespace-nowrap font-mono text-sage-500">
                                  {p.phone}
                                </span>
                              )}
                              <span className="whitespace-nowrap text-sage-500 sm:hidden">
                                {p.bills.length} {p.bills.length === 1 ? "bill" : "bills"} ·{" "}
                                {p.oldestDays} d
                              </span>
                            </span>
                          </span>
                        </button>
                      </TD>
                      <TD numeric className="hidden sm:table-cell">
                        {p.bills.length}
                      </TD>
                      <TD numeric className="whitespace-nowrap font-semibold text-warn-600">
                        {formatPaisa(p.owedPaisa)}
                      </TD>
                      <TD className="hidden sm:table-cell">
                        <Badge tone={ageTone(p.oldestDays)}>{p.oldestDays} d</Badge>
                      </TD>
                      <TD className="text-right">
                        {canReceive && (
                          <Button
                            variant="secondary"
                            onClick={() => setReceiving(p)}
                            aria-label={strings.receivePayment}
                            className="px-2.5 sm:px-4"
                          >
                            <HandCoins className="h-4 w-4" />
                            <span className="hidden sm:inline">{strings.receivePayment}</span>
                          </Button>
                        )}
                      </TD>
                    </TR>
                    {open && (
                      <tr className="border-b border-line bg-cream-100">
                        <td colSpan={5} className="px-3 py-3">
                          <PersonBills person={p} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        )
      ) : receipts.length === 0 ? (
        <EmptyState icon={HandCoins} message={strings.noPaymentsYet} />
      ) : shownReceipts.length === 0 ? (
        <EmptyState icon={HandCoins} message="No payment matches that search." />
      ) : (
        <ReceiptsTable receipts={shownReceipts} isAdmin={isAdmin} />
      )}

      <ReceiveDuesDialog
        open={receiving !== null}
        onClose={() => setReceiving(null)}
        who={{
          name: receiving?.name ?? "",
          patientNo: receiving?.patientNo ?? null,
        }}
        bills={(receiving?.bills ?? []).map(
          (b): ReceivableBill => ({
            id: b.id,
            label: invoiceLabel(b),
            dateBs: b.dateBs,
            balancePaisa: b.balancePaisa,
          }),
        )}
      />
    </div>
  );
}

function PersonBills({ person }: { person: DuePerson }) {
  return (
    <div className="flex flex-col gap-2">
      {person.patientId && (
        <Link
          href={`/patients/${person.patientId}`}
          className="self-start text-[13px] font-medium text-clinic-700 hover:underline"
        >
          Open patient card
        </Link>
      )}
      {/* A phone gets the bills one under another; a table this wide would
          push the whole list off the side of the screen. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {person.bills.map((b) => (
          <li
            key={b.id}
            className="rounded-[8px] border border-line bg-cream-50 px-3 py-2 text-[13px]"
          >
            <div className="flex items-baseline justify-between gap-2">
              <Link
                href={`/bills/${b.id}`}
                className="min-w-0 truncate font-mono text-sage-900 hover:text-sage-600"
              >
                {invoiceLabel(b)}
              </Link>
              <span className="shrink-0 whitespace-nowrap font-semibold tnum text-warn-600">
                {formatPaisa(b.balancePaisa, false)}
              </span>
            </div>
            <div className="text-[12px] text-sage-500 tnum">
              {b.dateBs} · bill {formatPaisa(b.totalPaisa, false)} · paid{" "}
              {formatPaisa(paidSoFar(b), false)}
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-[8px] border border-line bg-cream-50 sm:block">
        <table className="w-full border-collapse text-[13px]">
          <thead className="bg-sage-75 text-[12px] font-semibold text-sage-900">
            <tr>
              <th className="px-3 py-1.5 text-left">Bill</th>
              <th className="px-3 py-1.5 text-left">Date</th>
              <th className="px-3 py-1.5 text-right">Bill total</th>
              <th className="px-3 py-1.5 text-right">Paid so far</th>
              <th className="px-3 py-1.5 text-right">{strings.owed}</th>
            </tr>
          </thead>
          <tbody>
            {person.bills.map((b) => (
              <tr key={b.id} className="border-t border-line">
                <td className="px-3 py-1.5">
                  <Link
                    href={`/bills/${b.id}`}
                    className="font-mono text-sage-900 hover:text-sage-600"
                  >
                    {invoiceLabel(b)}
                  </Link>
                </td>
                <td className="px-3 py-1.5">{b.dateBs}</td>
                <td className="px-3 py-1.5 text-right tnum">
                  {formatPaisa(b.totalPaisa, false)}
                </td>
                <td className="px-3 py-1.5 text-right tnum">
                  {formatPaisa(paidSoFar(b), false)}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold tnum text-warn-600">
                  {formatPaisa(b.balancePaisa, false)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReceiptsTable({
  receipts,
  isAdmin,
}: {
  receipts: DueReceipt[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [undoing, setUndoing] = useState<DueReceipt | null>(null);
  const [busy, setBusy] = useState(false);

  async function undo() {
    if (!undoing) return;
    setBusy(true);
    const res = await voidDueReceiptAction(
      undoing.receiptId,
      undoing.bills.map((b) => b.id),
    );
    setBusy(false);
    if (!res.ok) {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
      return;
    }
    toast.success("Payment undone. It is owed again.");
    setUndoing(null);
    router.refresh();
  }

  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH>Date</TH>
            <TH>Who</TH>
            <TH>Against</TH>
            <TH numeric>Amount</TH>
            <TH>Paid by</TH>
            <TH className="hidden sm:table-cell">Taken by</TH>
            <TH />
          </TR>
        </THead>
        <tbody>
          {receipts.map((r) => (
            <TR key={r.receiptId} className={r.voided ? "text-sage-500" : undefined}>
              <TD>{r.dateBs}</TD>
              <TD>
                <span className="flex flex-col">
                  <span className={r.name ? undefined : "italic"}>
                    {r.name || "No name on the bill"}
                  </span>
                  {r.patientNo != null && (
                    <span className="font-mono text-[12px] text-clinic-700">
                      {formatPatientNo(r.patientNo)}
                    </span>
                  )}
                  {r.note && (
                    <span className="text-[12px] text-sage-500">{r.note}</span>
                  )}
                </span>
              </TD>
              <TD>
                <span className="flex flex-col">
                  {r.bills.map((b) => (
                    <Link
                      key={b.id}
                      href={`/bills/${b.id}`}
                      className="font-mono text-[13px] text-sage-900 hover:text-sage-600"
                    >
                      {invoiceLabel(b)}
                    </Link>
                  ))}
                </span>
              </TD>
              <TD
                numeric
                className={cn("whitespace-nowrap", r.voided ? "line-through" : "font-semibold")}
              >
                {formatPaisa(r.amountPaisa)}
              </TD>
              <TD>{isMoneyMethod(r.method) ? MONEY_METHOD_LABEL[r.method] : r.method}</TD>
              <TD className="hidden sm:table-cell">{r.userName || "—"}</TD>
              <TD className="text-right">
                {r.voided ? (
                  <Badge tone="neutral">Undone</Badge>
                ) : r.billCancelled ? (
                  <Badge tone="danger">Bill cancelled</Badge>
                ) : (
                  isAdmin &&
                  r.yearOpen && (
                    <Button variant="ghost" onClick={() => setUndoing(r)}>
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

      <Dialog
        open={undoing !== null}
        onClose={() => setUndoing(null)}
        title="Undo this payment?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUndoing(null)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={undo} disabled={busy}>
              Undo payment
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-sage-700">
          {undoing ? formatPaisa(undoing.amountPaisa) : ""} goes back onto what{" "}
          {undoing?.name || "they"} owe. Only do this for a payment entered by
          mistake — the payment stays listed here, marked as undone.
        </p>
      </Dialog>
    </>
  );
}

function Summary({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "warn";
}) {
  return (
    <div className="rounded-[10px] border border-line bg-cream-50 p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
        {label}
      </div>
      <div
        className={cn(
          "text-[22px] font-bold tnum",
          tone === "warn" ? "text-warn-600" : "text-sage-900",
        )}
      >
        {value}
      </div>
    </div>
  );
}
