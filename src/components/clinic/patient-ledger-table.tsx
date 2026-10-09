"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, ReceiptText } from "lucide-react";
import { formatPaisa } from "@/lib/money";
import { nepalTime } from "@/lib/clock";
import type { LedgerRow } from "@/lib/patient-ledger";
import { updateVisitAction } from "@/app/(app)/patients/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { HistoryRowForm, type RowFormOptions } from "@/components/clinic/history-row-form";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

/**
 * The history table, with a way to add to it: a new row (notes, and a charge
 * if there is one), and the treatment notes of an existing row edited where
 * they are read (C-036). Without `rowOptions` it only reads.
 */
export function PatientHistory({
  rows,
  patientId,
  rowOptions,
}: {
  rows: LedgerRow[];
  patientId: string;
  /** Present when this person may add rows and edit notes. */
  rowOptions?: RowFormOptions;
}) {
  const [adding, setAdding] = useState(false);
  const [lastBill, setLastBill] = useState<{
    id: string;
    label: string;
    totalPaisa: number;
  } | null>(null);
  const canWrite = rowOptions !== undefined;

  return (
    <div className="flex flex-col gap-3">
      <PatientLedgerTable rows={rows} patientId={patientId} canEdit={canWrite} />
      {lastBill && (
        <p className="flex flex-wrap items-center gap-2 rounded-[10px] border border-ok-600/30 bg-ok-100 px-4 py-2.5 text-[13.5px] text-sage-900">
          <ReceiptText className="h-4 w-4 text-ok-600" />
          Bill {lastBill.label} saved for {formatPaisa(lastBill.totalPaisa)}.
          <Link
            href={`/bills/${lastBill.id}`}
            className="font-medium text-clinic-700 hover:underline"
          >
            Open or print it
          </Link>
        </p>
      )}
      {canWrite &&
        (adding ? (
          <HistoryRowForm
            patientId={patientId}
            options={rowOptions}
            onDone={(bill) => {
              setAdding(false);
              setLastBill(bill);
            }}
          />
        ) : (
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                setLastBill(null);
                setAdding(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add row
            </Button>
          </div>
        ))}
    </div>
  );
}

/**
 * A patient's history laid out like the clinic's paper card: date, what was
 * done, what it cost, what was paid, and what is owed after it. Oldest first,
 * the way a card is filled in.
 */
export function PatientLedgerTable({
  rows,
  patientId,
  canEdit = false,
}: {
  rows: LedgerRow[];
  patientId?: string;
  /** Whether a row's treatment notes can be edited in place. */
  canEdit?: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-line bg-cream-50 px-5 py-10 text-center text-[14px] text-sage-500">
        Nothing yet. Add a row or make a bill to begin this history.
      </p>
    );
  }

  const charged = rows.reduce((s, r) => s + (r.feePaisa ?? 0), 0);
  const paid = rows.reduce((s, r) => s + (r.paymentPaisa ?? 0), 0);
  const owed = rows[rows.length - 1]!.balancePaisa;

  return (
    // Scrolls inside itself on a phone, so the page never does.
    <div className="overflow-x-auto rounded-[10px] border-2 border-clinic-700/70 bg-cream-50">
      <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
        <thead>
          <tr className="bg-clinic-75 text-[13px] font-semibold text-clinic-900">
            <th className="w-[112px] border-b-2 border-r border-clinic-700/40 px-3 py-2 text-center">
              Date
            </th>
            <th className="border-b-2 border-r border-clinic-700/40 px-3 py-2 text-center">
              Treatment notes
            </th>
            <th className="w-[124px] border-b-2 border-r border-clinic-700/40 px-3 py-2 text-center">
              Service charge
            </th>
            <th className="w-[112px] border-b-2 border-r border-clinic-700/40 px-3 py-2 text-center">
              Payment
            </th>
            <th className="w-[124px] border-b-2 border-clinic-700/40 px-3 py-2 text-center">
              Due / Advance
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const editable =
              canEdit && patientId !== undefined && r.visitId !== null && r.treatment !== null;
            return (
              <tr key={r.key} className="border-b border-clinic-700/25 align-top last:border-b-0">
                <td className="border-r border-clinic-700/25 px-3 py-2.5 tnum">
                  <div className="text-sage-900">{r.dateBs}</div>
                  {r.at && (
                    <div className="text-[12px] text-sage-500">{nepalTime(r.at)}</div>
                  )}
                </td>
                <td className="border-r border-clinic-700/25 px-3 py-2.5">
                  <div
                    className={cn(
                      "font-medium",
                      r.kind === "payment" ? "text-ok-600" : "text-sage-900",
                    )}
                  >
                    {r.title}
                  </div>
                  {editing === r.key && editable ? (
                    <NotesEditor
                      visitId={r.visitId!}
                      patientId={patientId!}
                      initial={r.treatment ?? ""}
                      onClose={() => setEditing(null)}
                    />
                  ) : (
                    <>
                      {r.notes.map((n, i) => (
                        <div
                          key={i}
                          className="whitespace-pre-line text-[12.5px] leading-snug text-sage-600"
                        >
                          {n}
                        </div>
                      ))}
                      <div className="mt-1 flex gap-3 text-[12px]">
                        {r.kind === "bill" && r.billId && (
                          <Link href={`/bills/${r.billId}`} className="text-clinic-700 hover:underline">
                            Bill
                          </Link>
                        )}
                        {r.visitId && (
                          <Link href={`/visits/${r.visitId}`} className="text-clinic-700 hover:underline">
                            Visit
                          </Link>
                        )}
                        {editable && (
                          <button
                            type="button"
                            onClick={() => setEditing(r.key)}
                            className="inline-flex items-center gap-1 text-clinic-700 hover:underline"
                          >
                            <Pencil className="h-3 w-3" />
                            {r.treatment ? "Edit notes" : "Add notes"}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </td>
                <td className="border-r border-clinic-700/25 px-3 py-2.5 text-right tnum">
                  {r.feePaisa != null ? formatPaisa(r.feePaisa, false) : ""}
                </td>
                <td className="border-r border-clinic-700/25 px-3 py-2.5 text-right tnum">
                  {r.paymentPaisa != null && r.paymentPaisa !== 0
                    ? formatPaisa(r.paymentPaisa, false)
                    : r.kind === "bill"
                      ? "—"
                      : ""}
                </td>
                <td className="px-3 py-2.5 text-right tnum">
                  <Balance paisa={r.balancePaisa} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-clinic-700/40 bg-clinic-75/60 font-semibold text-clinic-900">
            <td className="px-3 py-2" />
            <td className="px-3 py-2 text-right">Total</td>
            <td className="px-3 py-2 text-right tnum">{formatPaisa(charged, false)}</td>
            <td className="px-3 py-2 text-right tnum">{formatPaisa(paid, false)}</td>
            <td className="px-3 py-2 text-right tnum">
              <Balance paisa={owed} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** The treatment notes of one row, edited in the cell they are read in. */
function NotesEditor({
  visitId,
  patientId,
  initial,
  onClose,
}: {
  visitId: string;
  patientId: string;
  initial: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await updateVisitAction({ id: visitId, patientId, findings: text });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
      return;
    }
    toast.success("Notes saved");
    onClose();
    router.refresh();
  }

  return (
    <div className="mt-1.5 flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        autoFocus
        aria-label="Treatment notes"
        className="w-full rounded-[8px] border border-line bg-cream-50 px-2.5 py-1.5 text-[13.5px] leading-[1.45] outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20"
      />
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>
          {busy ? "…" : "Save notes"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {strings.cancel}
        </Button>
      </div>
    </div>
  );
}

function Balance({ paisa }: { paisa: number }) {
  if (paisa === 0) return <span className="text-sage-500">—</span>;
  if (paisa > 0) {
    return (
      <span className="font-semibold text-warn-600">
        {formatPaisa(paisa, false)} due
      </span>
    );
  }
  return (
    <span className="font-semibold text-ok-600">
      {formatPaisa(-paisa, false)} advance
    </span>
  );
}
