import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { doctorPayouts } from "@/lib/repos/clinic-reports";
import { resolveRange } from "@/lib/date-range";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export default async function DoctorPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string; fy?: string }>;
}) {
  await requireAdmin();
  await requireModulePage("clinic");

  const sp = await searchParams;
  const range = resolveRange(sp);
  const rows = await doctorPayouts(range);
  const total = rows.reduce((s, r) => s + r.sharePaisa, 0);

  return (
    <ReportFrame
      fy={sp.fy}
      title="Doctor payouts"
      rangeLabel={range.label}
      preset={range.preset}
      exportReport="doctor-payouts"
    >
      {rows.length === 0 ? (
        <EmptyState message="No doctor was named on a bill in this period." />
      ) : (
        <div className="rounded-[10px] border border-line bg-cream-50">
          <Table>
            <THead>
              <TR>
                <TH>Doctor</TH>
                <TH>Worked out as</TH>
                <TH className="text-right">Consultations</TH>
                <TH className="text-right">Other services</TH>
                <TH className="text-right">Billed</TH>
                <TH className="text-right">Owed to the doctor</TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.doctorId}>
                  <TD className="font-medium text-sage-900">{r.name}</TD>
                  <TD className="text-sage-500">{r.basisSummary || "—"}</TD>
                  <TD className="text-right tnum">{r.consultations}</TD>
                  <TD className="text-right tnum">{r.otherServices}</TD>
                  <TD className="text-right tnum">{formatPaisa(r.billedPaisa)}</TD>
                  <TD className="text-right tnum font-medium">
                    {formatPaisa(r.sharePaisa)}
                  </TD>
                </TR>
              ))}
              <TR>
                <TD className="font-semibold text-sage-900">Total</TD>
                <TD />
                <TD />
                <TD />
                <TD />
                <TD className="text-right tnum font-semibold">
                  {formatPaisa(total)}
                </TD>
              </TR>
            </tbody>
          </Table>
        </div>
      )}
      <p className="mt-3 text-[12px] text-sage-500">
        Each doctor&apos;s share was worked out when the bill was made and does
        not change afterwards, even if their terms are edited later. Where a
        share does not divide into whole paisa, the remainder stays with the
        clinic.
      </p>
    </ReportFrame>
  );
}
