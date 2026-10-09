import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listVisits, visitCountsOn, type VisitStatus } from "@/lib/repos/visits";
import { resolveRange } from "@/lib/date-range";
import { adToIso } from "@/lib/bs";
import { PageShell } from "@/components/app/page-shell";
import { Button } from "@/components/ui/button";
import { RangePicker } from "@/components/app/range-picker";
import { VisitList } from "@/components/clinic/visit-list";

export const metadata = { title: "Visits" };

/**
 * Visits, opening on today's: who came, who is waiting, who has been seen.
 * This is also the day's queue — the separate Today page it replaced (C-038)
 * was this list with Today picked.
 */
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
  const range = resolveRange({ preset: "today", ...sp });
  const status = (sp.status as VisitStatus | undefined) ?? null;
  const todayAd = adToIso(new Date());
  const isToday = range.fromIso === todayAd && range.toIso === todayAd;

  const [visits, counts] = await Promise.all([
    listVisits({ fromIso: range.fromIso, toIso: range.toIso, status }),
    isToday ? visitCountsOn(todayAd) : null,
  ]);

  return (
    <PageShell
      title="Visits"
      actions={
        <Link href="/patients/new">
          <Button>
            <UserPlus className="h-4 w-4" />
            Register patient
          </Button>
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RangePicker current={range.preset ?? ""} />
          <span className="text-[13px] text-sage-500">
            {range.label}
            {counts &&
              ` · ${counts.total} ${counts.total === 1 ? "person" : "people"} · ${counts.waiting} waiting · ${counts.seen} seen`}
          </span>
        </div>
        <VisitList
          visits={visits}
          todayAd={todayAd}
          showDate={!isToday}
          emptyMessage={
            isToday
              ? "Nobody has been registered today yet. Register a patient to start the day."
              : "No visits in this period."
          }
        />
      </div>
    </PageShell>
  );
}
