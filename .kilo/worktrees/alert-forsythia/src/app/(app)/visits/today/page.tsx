import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { visitsOn, visitCountsOn } from "@/lib/repos/visits";
import { adToIso, today, formatBS } from "@/lib/bs";
import { PageShell } from "@/components/app/page-shell";
import { Button } from "@/components/ui/button";
import { VisitList } from "@/components/clinic/visit-list";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  await requireUser();
  await requireModulePage("clinic");

  const todayAd = adToIso(new Date());
  const [visits, counts] = await Promise.all([
    visitsOn(todayAd),
    visitCountsOn(todayAd),
  ]);

  return (
    <PageShell
      title="Today"
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
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="text-[15px] text-sage-900">
            {formatBS(today(), { form: "long", monthScript: "en" })}
          </span>
          <span className="text-[14px] text-sage-500">
            {counts.total} {counts.total === 1 ? "person" : "people"} ·{" "}
            {counts.waiting} waiting · {counts.seen} seen
          </span>
        </div>

        <VisitList
          visits={visits}
          todayAd={todayAd}
          emptyMessage="Nobody has been registered today yet. Register a patient to start the day."
        />
      </div>
    </PageShell>
  );
}
