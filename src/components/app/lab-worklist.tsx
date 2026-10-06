"use client";

/**
 * lab-worklist.tsx — one stage of the laboratory queue.
 *
 * Grouped by bill rather than listed by test, because the work is grouped that
 * way: a patient billed for a blood count, an LFT and a sugar is one person
 * sitting down once and one needle. A flat list of tests would have somebody
 * calling the same patient back three times.
 *
 * Each card is a patient, and the whole card can be moved on in one click. The
 * per-test buttons are still there for the case the flat list was hiding — a
 * urine sample that has not been produced yet while the blood has been drawn.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Undo2,
  StickyNote,
  Phone,
  FlaskConical,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  advanceLabAction,
  revertLabAction,
  setLabNoteAction,
} from "@/app/(app)/lab/actions";
import { cn } from "@/lib/cn";

export interface LabDisplayRow {
  lineId: string;
  billId: string;
  visitId: string | null;
  billLabel: string;
  dateLabel: string;
  /** Days since the bill. 0 today. */
  waitingDays: number;
  patientKey: string;
  patientLabel: string;
  ageSex: string;
  phone: string;
  testName: string;
  sampleType: string;
  partnerName: string;
  note: string;
  /** Already-formatted "at 14:20 · Baisakh 12" for the stage just completed. */
  stampLabel: string;
}

export type AdvanceStage =
  | "to_collect"
  | "to_dispatch"
  | "awaiting_report"
  | "report_in";
export type RevertStage =
  | "to_dispatch"
  | "awaiting_report"
  | "report_in"
  | "done";

export function LabWorklist({
  rows,
  stage,
  actionLabel,
  revertLabel,
  emptyTitle,
  emptyBody,
}: {
  rows: LabDisplayRow[];
  /** The stage these rows are in. "done" has nothing to advance to. */
  stage: AdvanceStage | "done";
  actionLabel: string;
  /** What undoing means here, e.g. "Not collected after all". */
  revertLabel: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  // Group by bill: one card per patient's visit to the counter.
  const cards = new Map<string, LabDisplayRow[]>();
  for (const r of rows) {
    if (!cards.has(r.billId)) cards.set(r.billId, []);
    cards.get(r.billId)!.push(r);
  }

  async function advance(lineIds: string[]) {
    if (stage === "done") return;
    setBusy(lineIds[0] ?? null);
    let moved = 0;
    let firstError = "";
    for (const lineId of lineIds) {
      const res = await advanceLabAction({ lineId, from: stage });
      if (res.ok) moved++;
      else if (!firstError) firstError = res.userMessage ?? "";
    }
    setBusy(null);
    if (moved > 0) {
      toast.success(`${actionLabel} — ${moved} test${moved === 1 ? "" : "s"}.`);
      router.refresh();
    }
    if (firstError) toast.error(firstError);
  }

  async function revert(lineId: string) {
    setBusy(lineId);
    const res = await revertLabAction({ lineId, from: stage as RevertStage });
    setBusy(null);
    if (res.ok) {
      toast.success("Put back.");
      router.refresh();
    } else {
      toast.error(res.userMessage ?? "That could not be undone.");
    }
  }

  async function saveNote(lineId: string) {
    setBusy(lineId);
    const res = await setLabNoteAction({ lineId, note: noteText });
    setBusy(null);
    if (res.ok) {
      setNoteFor(null);
      setNoteText("");
      router.refresh();
    } else {
      toast.error(res.userMessage ?? "That note could not be saved.");
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-line bg-cream-50 p-10 text-center">
        <FlaskConical className="mx-auto mb-2 h-6 w-6 text-sage-500" />
        <p className="text-[15px] font-medium text-sage-900">{emptyTitle}</p>
        <p className="mx-auto mt-1 max-w-[440px] text-[13px] text-sage-500">
          {emptyBody}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {[...cards.entries()].map(([billId, tests]) => {
        const head = tests[0]!;
        const samples = [...new Set(tests.map((t) => t.sampleType).filter(Boolean))];
        return (
          <div
            key={billId}
            className="overflow-hidden rounded-[10px] border border-line bg-cream-50"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-sage-900">
                    {head.patientLabel}
                  </span>
                  {head.ageSex && (
                    <span className="text-[13px] text-sage-500">
                      {head.ageSex}
                    </span>
                  )}
                  {head.phone && (
                    <a
                      href={`tel:${head.phone}`}
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-sage-700 hover:text-sage-900"
                    >
                      <Phone className="h-3 w-3" />
                      {head.phone}
                    </a>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-sage-500">
                  <span>{head.billLabel}</span>
                  <span>·</span>
                  <span>{head.dateLabel}</span>
                  {head.waitingDays > 0 && stage !== "done" && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-medium",
                        head.waitingDays >= 3 ? "text-danger-600" : "text-warn-600",
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      waiting {head.waitingDays} day
                      {head.waitingDays === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                {samples.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {samples.map((s) => (
                      <span
                        key={s}
                        className="rounded-[4px] bg-magenta-100 px-1.5 py-0.5 text-[11px] font-semibold text-magenta-700"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {stage !== "done" && tests.length > 1 && (
                <Button
                  onClick={() => advance(tests.map((t) => t.lineId))}
                  disabled={busy !== null}
                >
                  <Check className="h-4 w-4" />
                  {actionLabel} — all {tests.length}
                </Button>
              )}
            </div>

            <ul className="divide-y divide-line">
              {tests.map((t) => (
                <li key={t.lineId} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] text-sage-900">
                          {t.testName}
                        </span>
                        {t.sampleType && (
                          <span className="text-[11px] font-medium text-magenta-700">
                            {t.sampleType}
                          </span>
                        )}
                        {t.partnerName && (
                          <span className="text-[12px] text-sage-500">
                            → {t.partnerName}
                          </span>
                        )}
                      </div>
                      {t.stampLabel && (
                        <div className="text-[12px] text-sage-500">
                          {t.stampLabel}
                        </div>
                      )}
                      {t.note && (
                        <div className="mt-0.5 flex items-start gap-1 text-[12px] text-warn-600">
                          <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{t.note}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setNoteFor(noteFor === t.lineId ? null : t.lineId);
                          setNoteText(t.note);
                        }}
                        aria-label={`Add a note to ${t.testName}`}
                        className="rounded-[8px] p-2 text-sage-500 hover:bg-cream-200 hover:text-sage-900"
                      >
                        <StickyNote className="h-4 w-4" />
                      </button>

                      {stage !== "to_collect" && (
                        <button
                          type="button"
                          onClick={() => revert(t.lineId)}
                          disabled={busy !== null}
                          aria-label={`${revertLabel} — ${t.testName}`}
                          title={revertLabel}
                          className="rounded-[8px] p-2 text-sage-500 hover:bg-cream-200 hover:text-sage-900"
                        >
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )}

                      {stage !== "done" && (
                        <Button
                          variant={tests.length > 1 ? "secondary" : "primary"}
                          onClick={() => advance([t.lineId])}
                          disabled={busy !== null}
                        >
                          <Check className="h-4 w-4" />
                          {actionLabel}
                        </Button>
                      )}
                    </div>
                  </div>

                  {noteFor === t.lineId && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Input
                        id={`note-${t.lineId}`}
                        aria-label={`Note for ${t.testName}`}
                        className="min-w-[220px] flex-1"
                        placeholder="Why is it waiting? e.g. sample haemolysed, redrawing tomorrow"
                        value={noteText}
                        maxLength={300}
                        onChange={(e) => setNoteText(e.target.value)}
                      />
                      <Button
                        variant="secondary"
                        onClick={() => saveNote(t.lineId)}
                        disabled={busy !== null}
                      >
                        Save note
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
