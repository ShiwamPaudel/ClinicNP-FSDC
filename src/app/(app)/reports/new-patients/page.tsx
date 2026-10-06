import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { newVsReturning } from "@/lib/repos/clinic-reports";
import { resolveRange } from "@/lib/date-range";
import { ReportFrame } from "@/components/app/report-frame";

export default async function NewPatientsPage({
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
  const r = await newVsReturning(range);
  const pct =
    r.totalVisits > 0
      ? Math.round((r.returningPatients / r.totalVisits) * 100)
      : 0;

  return (
    <ReportFrame
      fy={sp.fy}
      title="New and returning patients"
      rangeLabel={range.label}
      preset={range.preset}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Visits" value={r.totalVisits} />
        <Tile label="First-ever visits" value={r.newPatients} />
        <Tile label="People coming back" value={r.returningPatients} />
      </div>
      <p className="mt-4 text-[14px] text-sage-700">
        {r.totalVisits === 0
          ? "Nobody was seen in this period."
          : `${pct}% of the visits in this period were by someone who had been here before.`}
      </p>
      <p className="mt-2 text-[12px] text-sage-500">
        A visit counts as a first-ever visit only if the patient had never been
        seen before — not merely that this was their first visit inside the
        chosen dates.
      </p>
    </ReportFrame>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] border border-line bg-cream-50 p-5">
      <div className="text-[13px] text-sage-500">{label}</div>
      <div className="mt-1 text-[28px] font-semibold tnum text-sage-900">
        {value}
      </div>
    </div>
  );
}
