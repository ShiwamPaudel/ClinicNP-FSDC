import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listDoctors } from "@/lib/repos/doctors";
import { countsByDoctorOn, appointmentsOn } from "@/lib/repos/appointments";
import { adToIso, toAD, bsFromDbText, bsToDbText, today, formatBS } from "@/lib/bs";
import { PageShell } from "@/components/app/page-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { DayStepper } from "@/components/clinic/day-stepper";
import { DoctorCard } from "@/components/clinic/doctor-card";

export const metadata = { title: "Doctors" };

/**
 * The board: every doctor, and how full their day is.
 *
 * The front desk opens this to answer one question — who can see this person
 * — so what matters is the count, not the list. The list is one tap away.
 */
export default async function DoctorsBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ on?: string }>;
}) {
  await requireUser();
  await requireModulePage("clinic");

  const sp = await searchParams;
  const onBs = sp.on && /^\d{4}-\d{2}-\d{2}$/.test(sp.on) ? sp.on : bsToDbText(today());
  const onAd = adToIso(toAD(bsFromDbText(onBs)));

  const [doctors, counts, all] = await Promise.all([
    listDoctors(),
    countsByDoctorOn(onAd),
    appointmentsOn(onAd),
  ]);

  const totalBooked = all.filter(
    (a) => a.status === "booked" || a.status === "arrived",
  ).length;

  return (
    <PageShell title="Doctors">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DayStepper valueBs={onBs} basePath="/doctors" />
          <span className="text-[14px] text-sage-500">
            {formatBS(bsFromDbText(onBs), { form: "long", monthScript: "en" })} ·{" "}
            {totalBooked === 0
              ? "nobody booked"
              : `${totalBooked} ${totalBooked === 1 ? "person" : "people"} booked`}
          </span>
        </div>

        {doctors.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            message="No doctors yet. Add the doctors who see patients, then you can book people in with them."
            action={
              <Link href="/settings/doctors">
                <Button>Add a doctor</Button>
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {doctors.map((d) => (
              <li key={d.id}>
                <DoctorCard
                  doctor={{
                    id: d.id,
                    name: d.name,
                    qualification: d.qualification,
                    specialty: d.specialty,
                    hasLogin: d.userId != null,
                  }}
                  dateBs={onBs}
                  booked={counts.get(d.id)?.booked ?? 0}
                  total={counts.get(d.id)?.total ?? 0}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
