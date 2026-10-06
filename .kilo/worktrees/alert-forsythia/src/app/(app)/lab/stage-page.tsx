/**
 * stage-page.tsx — the five laboratory screens, which differ only in wording.
 *
 * Each stage is the same list of tests filtered a different way, so the page is
 * written once and the five routes hand it a stage and the words for it. What
 * changes between them is what the button says, and that is the part worth
 * getting right: "Sample collected" is what the person did, not what the
 * software is about to do.
 */
import { requireBillingUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { labCounts, labWorklist, type LabStage } from "@/lib/repos/lab";
import { adFromIso, adToIso, bsFromDbText, formatBS, toBS } from "@/lib/bs";
import { LabTabs } from "@/components/app/lab-tabs";
import {
  LabWorklist,
  type LabDisplayRow,
  type AdvanceStage,
} from "@/components/app/lab-worklist";

/** Whole days between two ISO dates, never negative. */
function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** "Baisakh 12 · 14:20" for a stored timestamp. */
function stampAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const bs = formatBS(toBS(adFromIso(adToIso(d))), {
    form: "short",
    monthScript: "en",
  });
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
  return `${bs} · ${time}`;
}

export interface StageCopy {
  actionLabel: string;
  revertLabel: string;
  emptyTitle: string;
  emptyBody: string;
  /** Prefix for the line that says when the previous step happened. */
  stampPrefix: string;
}

export async function LabStagePage({
  stage,
  copy,
}: {
  stage: LabStage;
  copy: StageCopy;
}) {
  await requireBillingUser();
  await requireModulePage("clinic");

  const [counts, rows] = await Promise.all([labCounts(), labWorklist(stage)]);
  const todayIso = adToIso(new Date());

  const display: LabDisplayRow[] = rows.map((r) => {
    // The stamp shown is the one for the step just completed, which is the
    // useful one: on the "to send" list you want to know when it was drawn.
    const stampIso =
      stage === "to_dispatch"
        ? r.collectedAt
        : stage === "awaiting_report"
          ? r.dispatchedAt
          : stage === "report_in"
            ? r.reportReceivedAt
            : stage === "done"
              ? r.reportGivenAt
              : null;
    const at = stampAt(stampIso);

    return {
      lineId: r.lineId,
      billId: r.billId,
      visitId: r.visitId,
      billLabel:
        r.invoiceNo != null ? `Bill #${r.invoiceNo}` : "Bill pending number",
      dateLabel: formatBS(bsFromDbText(r.dateBs), {
        form: "short",
        monthScript: "en",
      }),
      waitingDays: daysBetween(r.dateAd, todayIso),
      patientKey: r.patientId ?? r.billId,
      patientLabel:
        r.patientNo != null
          ? `P-${String(r.patientNo).padStart(6, "0")} · ${r.patientName}`
          : r.patientName,
      ageSex: r.ageSex,
      phone: r.patientPhone,
      testName: r.testName,
      sampleType: r.sampleType,
      partnerName: r.partnerName,
      note: r.note,
      stampLabel: at ? `${copy.stampPrefix} ${at}` : "",
    };
  });

  return (
    <>
      <LabTabs counts={counts} />
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
        <LabWorklist
          rows={display}
          stage={stage as AdvanceStage | "done"}
          actionLabel={copy.actionLabel}
          revertLabel={copy.revertLabel}
          emptyTitle={copy.emptyTitle}
          emptyBody={copy.emptyBody}
        />
      </main>
    </>
  );
}
