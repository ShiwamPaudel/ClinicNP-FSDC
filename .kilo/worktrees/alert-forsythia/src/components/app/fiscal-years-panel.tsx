"use client";

import { useState, useTransition } from "react";
import { Lock, CalendarRange, CheckCircle2, Download } from "lucide-react";
import { closeYearAction } from "@/app/(app)/settings/actions";
import { pendingCount } from "@/offline/outbox";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export interface FiscalYearView {
  id: number;
  label: string;
  status: "open" | "closed";
  closedAt: string | null;
  nextInvoiceNo: number;
}

export function FiscalYearsPanel({
  years,
  openLabel,
  nextLabel,
  backupsKept,
}: {
  years: FiscalYearView[];
  openLabel: string | null;
  nextLabel: string | null;
  /** a private store is connected, so the close keeps its own backup */
  backupsKept: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState<{ closed: string; opened: string; backup: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const phrase = openLabel ? `close ${openLabel}` : "";

  function runClose() {
    startTransition(async () => {
      // The queue of bills waiting to be sent lives on this device.
      let waiting = 0;
      try {
        waiting = await pendingCount();
      } catch {
        waiting = 0;
      }
      const res = await closeYearAction(waiting);
      if (!res.ok) {
        toast.error(res.userMessage ?? "Something went wrong. Please try again.");
        return;
      }
      setConfirming(false);
      setTyped("");
      setDone({
        closed: res.closedLabel ?? "",
        opened: res.openedLabel ?? "",
        backup: res.backupName ?? "",
      });
    });
  }

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-sage-900">
            Fiscal years
          </h1>
          <p className="mt-1 text-[14px] text-sage-500">
            One year is open at a time. Closed years stay readable and printable
            forever — they just can&apos;t be changed.
          </p>
        </div>
        {openLabel && nextLabel && (
          <Button onClick={() => setConfirming(true)} disabled={pending}>
            <Lock className="h-4 w-4" />
            Close {openLabel} and start {nextLabel}
          </Button>
        )}
      </header>

      <div className="rounded-[10px] border border-line bg-cream-50">
        <Table>
          <THead>
            <TR>
              <TH>Year</TH>
              <TH>Status</TH>
              <TH>Next invoice number</TH>
              <TH>Closed on</TH>
            </TR>
          </THead>
          <tbody>
            {years.map((y) => (
              <TR key={y.id}>
                <TD>
                  <span className="inline-flex items-center gap-2 font-mono text-[14px] text-sage-900">
                    <CalendarRange className="h-4 w-4 text-sage-500" />
                    {y.label}
                  </span>
                </TD>
                <TD>
                  {y.status === "open" ? (
                    <Badge tone="ok">Open — current year</Badge>
                  ) : (
                    <Badge tone="info">Closed</Badge>
                  )}
                </TD>
                <TD className="font-mono">
                  {y.status === "open" ? y.nextInvoiceNo : "—"}
                </TD>
                <TD className="text-sage-500">
                  {y.closedAt ? y.closedAt.slice(0, 10) : "—"}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>

      <Dialog
        open={confirming}
        onClose={() => {
          setConfirming(false);
          setTyped("");
        }}
        title={`Close ${openLabel ?? ""} and start ${nextLabel ?? ""}?`}
      >
        <div className="text-[14px] leading-[1.5] text-sage-900">
          <p>Here&apos;s what happens, in order:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sage-500">
            <li>Any bill still waiting to be sent stops this — nothing is lost.</li>
            {backupsKept ? (
              <li>
                A backup is saved first, and kept in Settings → Backup. If it
                can&apos;t be saved, nothing closes.
              </li>
            ) : (
              <li>
                You need a backup from the last day. Automatic backups are not
                set up, so download one now and keep the file safe:{" "}
                <a
                  href="/api/backup/download"
                  className="inline-flex items-center gap-1 font-medium text-sage-900 underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download a backup
                </a>
              </li>
            )}
            <li>{nextLabel} opens, and invoice numbers restart at 1.</li>
            <li>{openLabel} closes. It stays readable and printable, but nothing in it can change.</li>
          </ol>
          <p className="mt-3">
            Stock, suppliers and balances carry over untouched. This can&apos;t be
            undone from here.
          </p>
          <label className="mt-4 block text-[13px] font-medium text-sage-900">
            Type <span className="font-mono text-magenta-600">{phrase}</span> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className="mt-1.5 h-10 w-full rounded-[8px] border border-line bg-cream-50 px-3 text-[14px] outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setConfirming(false);
              setTyped("");
            }}
          >
            Not now
          </Button>
          <Button
            variant="destructive"
            disabled={typed.trim().toLowerCase() !== phrase || pending}
            onClick={runClose}
          >
            {pending ? "Closing…" : "Close the year"}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={done !== null}
        onClose={() => {
          setDone(null);
          location.reload();
        }}
        title="Year closed"
      >
        <div className="flex flex-col gap-2 text-[14px] text-sage-900">
          <p className="flex items-center gap-2 text-ok-600">
            <CheckCircle2 className="h-4 w-4" />
            {done?.opened} is now the current year.
          </p>
          <p className="text-sage-500">
            {done?.closed} is closed — you can still read and print it.
            Invoice numbers start again at 1.
          </p>
          {done?.backup ? (
            <p className="text-sage-500">
              A backup was saved first:{" "}
              <span className="font-mono text-sage-900">{done.backup}</span>. It
              is in Settings → Backup.
            </p>
          ) : (
            <p className="text-sage-500">
              Keep the backup you downloaded. It is the way back to how things
              were before the year closed.
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            onClick={() => {
              setDone(null);
              location.reload();
            }}
          >
            Done
          </Button>
        </div>
      </Dialog>
    </>
  );
}
