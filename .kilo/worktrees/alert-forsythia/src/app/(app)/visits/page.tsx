import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listVisits, type VisitStatus } from "@/lib/repos/visits";
import { resolveRange } from "@/lib/date-range";
import { adToIso } from "@/lib/bs";
import { PageShell } from "@/components/app/page-shell";
import { RangePicker } from "@/components/app/range-picker";
import { VisitList } from "@/components/clinic/visit-list";

export const metadata = { title: "Visits" };

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    fy?: string;
    status?: string;
  }>;
}) {
  await requireUser();
  await requireModulePage("clinic");

  const sp = await searchParams;
  const range = resolveRange(sp);
  const status = (sp.status as VisitStatus | undefined) ?? null;

  const visits = await listVisits({
    fromIso: range.fromIso,
    toIso: range.toIso,
    status,
  });

  return (
    <PageShell title="Visits">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RangePicker current={range.preset ?? ""} />
          <span className="text-[13px] text-sage-500">{range.label}</span>
        </div>
        <VisitList
          visits={visits}
          todayAd={adToIso(new Date())}
          showDate
          emptyMessage="No visits in this period."
        />
      </div>
    </PageShell>
  );
}
