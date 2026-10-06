import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { patientVisitRegister } from "@/lib/repos/clinic-reports";
import { resolveRange } from "@/lib/date-range";
import { ReportFrame } from "@/components/app/report-frame";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatPatientNo } from "@/lib/patient-no";
import { VISIT_TYPE_LABEL, VISIT_STATUS_LABEL } from "@/lib/visit-types";
import type { VisitType, VisitStatus } from "@/lib/visit-types";

export default async function VisitRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    fy?: string;
  }>;
}) {
  await requireAdmin();
  await requireModulePage("clinic");

  const sp = await searchParams;
  const range = resolveRange(sp);
  const rows = await patientVisitRegister(range);

  return (
    <ReportFrame
      fy={sp.fy}
      title="Patient visit register"
      rangeLabel={range.label}
      preset={range.preset}
      exportReport="visit-register"
    >
      {rows.length === 0 ? (
        <EmptyState message="Nobody was seen in this period." />
      ) : (
        <div className="rounded-[10px] border border-line bg-cream-50">
          <Table>
            <THead>
              <TR>
                <TH>Date (BS)</TH>
                <TH>Visit</TH>
                <TH>Patient</TH>
                <TH>Type</TH>
                <TH>Department</TH>
                <TH>Doctor</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.visitId}>
                  <TD className="font-mono text-[13px]">{r.dateBs}</TD>
                  <TD className="font-mono text-[13px] text-clinic-700">
                    {r.visitNo != null
                      ? `V-${r.fiscalLabel}-${String(r.visitNo).padStart(6, "0")}`
                      : "—"}
                  </TD>
                  <TD>
                    <Link href={`/visits/${r.visitId}`} className="hover:underline">
                      <span className="font-medium text-sage-900">
                        {r.patientName}
                      </span>
                      <span className="ml-2 font-mono text-[12px] text-clinic-700">
                        {r.patientNo != null ? formatPatientNo(r.patientNo) : ""}
                      </span>
                    </Link>
                  </TD>
                  <TD>{VISIT_TYPE_LABEL[r.type as VisitType] ?? r.type}</TD>
                  <TD className="text-sage-500">{r.department || "—"}</TD>
                  <TD className="text-sage-500">{r.doctorName || "—"}</TD>
                  <TD>
                    <Badge tone={r.status === "cancelled" ? "danger" : "neutral"}>
                      {VISIT_STATUS_LABEL[r.status as VisitStatus] ?? r.status}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </ReportFrame>
  );
}
