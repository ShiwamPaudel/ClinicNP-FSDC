import Link from "next/link";
import { displayAge } from "@/lib/age";
import { patientLabel } from "@/lib/patient-no";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import type { VisitWithPatient } from "@/lib/repos/visits";
import { VISIT_TYPE_LABEL, VISIT_STATUS_LABEL } from "@/lib/visit-types";
import type { BadgeTone } from "@/components/ui/badge";

const SEX_SHORT: Record<string, string> = { f: "F", m: "M", o: "—" };

const STATUS_TONE: Record<string, BadgeTone> = {
  waiting: "warn",
  seen: "ok",
  closed: "neutral",
  cancelled: "danger",
};

export function VisitList({
  visits,
  todayAd,
  emptyMessage,
  showDate = false,
}: {
  visits: VisitWithPatient[];
  todayAd: string;
  emptyMessage: string;
  showDate?: boolean;
}) {
  if (visits.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <div className="rounded-[10px] border border-line bg-cream-50">
      <Table>
        <THead>
          <TR>
            <TH>Patient</TH>
            <TH>Age / Sex</TH>
            {showDate && <TH>Date (BS)</TH>}
            <TH>Type</TH>
            <TH>Department</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <tbody>
          {visits.map((v) => {
            const age = displayAge(
              {
                value: v.patientAgeValue,
                unit: (v.patientAgeUnit as "y" | "m" | "d" | null) ?? null,
                asOfAd: v.patientAgeAsOfAd,
                dobAd: v.patientDobAd,
              },
              todayAd,
            );
            return (
              <TR key={v.id}>
                <TD>
                  <Link
                    href={`/visits/${v.id}`}
                    className="flex flex-col hover:underline"
                  >
                    <span className="font-medium text-sage-900">
                      {v.patientName}
                    </span>
                    <span className="font-mono text-[12px] text-clinic-700">
                      {patientLabel(v.patientNo, v.patientId)}
                    </span>
                  </Link>
                </TD>
                <TD className="text-sage-500">
                  {age.short} · {SEX_SHORT[v.patientSex] ?? "—"}
                </TD>
                {showDate && <TD className="font-mono">{v.dateBs}</TD>}
                <TD>{VISIT_TYPE_LABEL[v.type]}</TD>
                <TD className="text-sage-500">{v.department || "—"}</TD>
                <TD>
                  <Badge tone={STATUS_TONE[v.status] ?? "neutral"}>
                    {VISIT_STATUS_LABEL[v.status]}
                  </Badge>
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
