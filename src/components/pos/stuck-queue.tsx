"use client";

/**
 * stuck-queue.tsx — what to do when something will not send.
 *
 * A queue that retries forever in silence is how a day's work disappears. Once
 * an item has failed several times it is almost never going to succeed on its
 * own: the stock ran out, the module was switched off, the details were
 * refused. So after three failures the counter says so, in the words of the
 * problem, and offers the only two honest choices — try it again now, or take
 * it out and deal with it by hand.
 *
 * Nothing is ever discarded without somebody choosing to.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { listOutbox, flushOutbox, discardBill } from "@/offline/outbox";
import {
  listPatientOutbox,
  flushPatientOutbox,
  discardPatient,
} from "@/offline/patient-outbox";
import { formatPaisa } from "@/lib/money";

/** How many failures before the counter stops hoping and starts explaining. */
const STUCK_AFTER = 3;

interface StuckRow {
  kind: "bill" | "patient";
  id: string;
  what: string;
  reason: string;
  attempts: number;
}

export function StuckQueue({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<StuckRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [bills, patients] = await Promise.all([
      listOutbox(),
      listPatientOutbox(),
    ]);
    const stuck: StuckRow[] = [
      ...bills
        .filter((b) => b.attempts >= STUCK_AFTER)
        .map((b) => ({
          kind: "bill" as const,
          id: b.id,
          what: `Bill for ${formatPaisa(
            b.lines.reduce((s, l) => s + l.qty * l.ratePaisa - l.discountPaisa, 0) +
              (b.serviceLines ?? []).reduce(
                (s, l) => s + l.qty * l.ratePaisa - l.discountPaisa,
                0,
              ),
          )}${b.patientName ? ` · ${b.patientName}` : ""}`,
          reason: b.lastError ?? "It would not send.",
          attempts: b.attempts,
        })),
      ...patients
        .filter((p) => p.attempts >= STUCK_AFTER)
        .map((p) => ({
          kind: "patient" as const,
          id: p.id,
          what: `Registration for ${p.name}`,
          reason: p.lastError ?? "It would not send.",
          attempts: p.attempts,
        })),
    ];
    setRows(stuck);
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  if (rows.length === 0) return null;

  async function retry() {
    setBusy(true);
    await flushPatientOutbox();
    await flushOutbox();
    await refresh();
    setBusy(false);
    toast.success("Tried again");
  }

  async function discard(row: StuckRow) {
    setBusy(true);
    if (row.kind === "bill") await discardBill(row.id);
    else await discardPatient(row.id);
    await refresh();
    setBusy(false);
    toast.success("Taken out of the queue");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-[999px] bg-danger-100 px-3 py-1.5 text-[13px] font-medium text-danger-600"
      >
        <AlertTriangle className="h-4 w-4" />
        {rows.length} not sent
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="These have not been sent"
      >
        <p className="mb-4 text-[14px] text-sage-700">
          Each of these has been tried several times and has not gone through.
          Nothing has been lost — they are still on this machine.
        </p>

        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li
              key={`${r.kind}-${r.id}`}
              className="rounded-[8px] border border-line p-3"
            >
              <div className="text-[14px] font-medium text-sage-900">
                {r.what}
              </div>
              <div className="mt-0.5 text-[13px] text-danger-600">{r.reason}</div>
              <div className="mt-0.5 text-[12px] text-sage-500">
                Tried {r.attempts} times
              </div>
              {isAdmin && (
                <button
                  onClick={() => void discard(r)}
                  disabled={busy}
                  className="mt-2 inline-flex items-center gap-1 text-[13px] text-danger-600 hover:underline"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Take it out of the queue
                </button>
              )}
            </li>
          ))}
        </ul>

        {!isAdmin && (
          <p className="mt-4 text-[13px] text-sage-500">
            Show this to the owner — only they can take something out of the
            queue.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={retry} disabled={busy}>
            <RefreshCw className="h-4 w-4" />
            {busy ? "Trying…" : "Try again now"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
