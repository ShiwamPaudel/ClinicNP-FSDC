import Link from "next/link";
import { AlertTriangle, Paperclip } from "lucide-react";
import { formatPatientNo } from "@/lib/patient-no";
import { displayAge } from "@/lib/age";
import { formatPaisa } from "@/lib/money";
import { formatSize, isImage } from "@/lib/files";
import { cn } from "@/lib/cn";
import type { Patient } from "@/lib/repos/patients";
import type { Visit } from "@/lib/repos/visits";
import { VISIT_TYPE_LABEL } from "@/lib/visit-types";
import type { Attachment } from "@/lib/repos/attachments";

const SEX_LABEL: Record<string, string> = {
  f: "Female",
  m: "Male",
  o: "Other",
};

/**
 * The navy identity header. Navy marks who this is about — the one place the
 * clinic colour carries a person rather than a thing (Design.md §1).
 */
export function PatientHeader({
  patient,
  todayAd,
  sinceBs,
}: {
  patient: Patient;
  todayAd: string;
  sinceBs: string | null;
}) {
  const age = displayAge(
    {
      value: patient.ageValue,
      unit: patient.ageUnit,
      asOfAd: patient.ageAsOfAd,
      dobAd: patient.dobAd,
    },
    todayAd,
  );

  return (
    <div className="overflow-hidden rounded-[10px] border border-line">
      <div className="bg-clinic-900 px-5 py-4 text-cream-50">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-[14px] text-clinic-150">
            {patient.patientNo != null
              ? formatPatientNo(patient.patientNo)
              : "Not numbered yet"}
          </span>
          <span className="text-[18px] font-semibold">{patient.name}</span>
          <span
            className="text-[14px] text-clinic-150"
            title={
              age.exact
                ? "Worked out from the date of birth"
                : age.asOfAd
                  ? `Age recorded on ${age.asOfAd}`
                  : undefined
            }
          >
            {age.short} · {SEX_LABEL[patient.sex] ?? "—"}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-clinic-150">
          <span className="font-mono">{patient.phone || "No phone"}</span>
          <span>{patient.address || "No address"}</span>
          {sinceBs && <span className="ml-auto">Since {sinceBs}</span>}
        </div>
        {!age.exact && age.asOfAd && (
          <p className="mt-1 text-[11px] text-clinic-150/80">
            Age as recorded on {age.asOfAd}
          </p>
        )}
      </div>

      {patient.note && (
        <div className="flex items-start gap-2 bg-danger-100 px-5 py-2.5 text-[14px] text-danger-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">Allergy / note:</span> {patient.note}
          </span>
        </div>
      )}

      {patient.mergedIntoId && (
        <div className="bg-info-100 px-5 py-2.5 text-[13px] text-info-600">
          This record was merged into{" "}
          <Link
            href={`/patients/${patient.mergedIntoId}`}
            className="font-semibold underline"
          >
            another patient
          </Link>
          . Its number is retired and is never given to anyone else.
        </div>
      )}
    </div>
  );
}

export interface TimelineBill {
  id: string;
  invoiceLabel: string;
  dateBs: string;
  totalPaisa: number;
  visitId: string | null;
}

/**
 * The visit timeline: one navy spine, a filled node for a visit and a hollow
 * one for a bill with no visit. It is the only decorative line in the product,
 * and it earns its place — eighteen months of a person reads in one scroll
 * (Design.md §4.2).
 */
export function VisitTimeline({
  visits,
  bills,
  attachments,
}: {
  visits: Visit[];
  bills: TimelineBill[];
  attachments: Attachment[];
}) {
  const filesByVisit = new Map<string, Attachment[]>();
  const loose: Attachment[] = [];
  for (const a of attachments) {
    if (a.visitId) {
      if (!filesByVisit.has(a.visitId)) filesByVisit.set(a.visitId, []);
      filesByVisit.get(a.visitId)!.push(a);
    } else {
      loose.push(a);
    }
  }

  const billsWithoutVisit = bills.filter((b) => !b.visitId);

  type Entry =
    | { kind: "visit"; dateBs: string; dateAd: string; visit: Visit }
    | { kind: "bill"; dateBs: string; dateAd: string; bill: TimelineBill };

  const entries: Entry[] = [
    ...visits.map((v) => ({
      kind: "visit" as const,
      dateBs: v.dateBs,
      dateAd: v.dateAd,
      visit: v,
    })),
    ...billsWithoutVisit.map((b) => ({
      kind: "bill" as const,
      dateBs: b.dateBs,
      dateAd: b.dateBs,
      bill: b,
    })),
  ].sort((a, b) => b.dateBs.localeCompare(a.dateBs));

  if (entries.length === 0 && loose.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-line bg-cream-50 px-5 py-10 text-center text-[14px] text-sage-500">
        Nothing recorded yet. Start a visit to begin this patient&apos;s history.
      </p>
    );
  }

  return (
    <div className="relative pl-6">
      {/* the spine */}
      <span
        aria-hidden="true"
        className="absolute bottom-2 left-[5px] top-2 w-px bg-clinic-500/40"
      />

      <ul className="flex flex-col gap-5">
        {entries.map((e) => {
          const isVisit = e.kind === "visit";
          const files = isVisit ? (filesByVisit.get(e.visit.id) ?? []) : [];
          return (
            <li key={isVisit ? e.visit.id : e.bill.id} className="relative">
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -left-6 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-clinic-500",
                  isVisit ? "bg-clinic-500" : "bg-cream-100",
                )}
              />
              {isVisit ? (
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <span className="font-mono text-[13px] text-sage-900">
                      {e.visit.dateBs}
                    </span>
                    <Link
                      href={`/visits/${e.visit.id}`}
                      className="text-[14px] font-semibold text-clinic-700 hover:underline"
                    >
                      Visit{" "}
                      {e.visit.visitNo != null
                        ? `V-${e.visit.fiscalLabel}-${String(e.visit.visitNo).padStart(6, "0")}`
                        : ""}
                    </Link>
                    <span className="text-[13px] text-sage-500">
                      {VISIT_TYPE_LABEL[e.visit.type]}
                      {e.visit.department ? ` · ${e.visit.department}` : ""}
                    </span>
                    {e.visit.status === "cancelled" && (
                      <span className="rounded-[999px] bg-danger-100 px-2 py-0.5 text-[11px] font-medium text-danger-600">
                        Cancelled
                      </span>
                    )}
                  </div>
                  {e.visit.complaint && (
                    <p className="mt-0.5 text-[13px] text-sage-600">
                      {e.visit.complaint}
                    </p>
                  )}
                  {files.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {files.map((f) => (
                        <li key={f.id}>
                          <a
                            href={`/api/files/${f.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-[999px] bg-clinic-75 px-2.5 py-1 text-[12px] text-clinic-700 hover:bg-clinic-150"
                          >
                            <Paperclip className="h-3 w-3" />
                            {f.title || f.fileName}
                            <span className="text-clinic-500">
                              {isImage(f.mime) ? "" : " PDF"} ·{" "}
                              {formatSize(f.sizeBytes)}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-[13px] text-sage-900">
                    {e.bill.dateBs}
                  </span>
                  <Link
                    href={`/bills/${e.bill.id}`}
                    className="text-[14px] text-sage-700 hover:underline"
                  >
                    Bill {e.bill.invoiceLabel}
                  </Link>
                  <span className="ml-auto font-mono text-[14px] text-sage-900">
                    {formatPaisa(e.bill.totalPaisa)}
                  </span>
                </div>
              )}
            </li>
          );
        })}

        {loose.length > 0 && (
          <li className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-6 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-clinic-500 bg-cream-100"
            />
            <div className="text-[13px] text-sage-500">Files not tied to a visit</div>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {loose.map((f) => (
                <li key={f.id}>
                  <a
                    href={`/api/files/${f.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-[999px] bg-clinic-75 px-2.5 py-1 text-[12px] text-clinic-700 hover:bg-clinic-150"
                  >
                    <Paperclip className="h-3 w-3" />
                    {f.title || f.fileName}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>
    </div>
  );
}
