import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser, canBook } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { getDoctor } from "@/lib/repos/doctors";
import {
  appointmentsForDoctorOn,
  nextBusyDay,
} from "@/lib/repos/appointments";
import {
  adToIso,
  toAD,
  toBS,
  adFromIso,
  bsFromDbText,
  bsToDbText,
  today,
  formatBS,
} from "@/lib/bs";
import { Header } from "@/components/app/header";
import { DayStepper } from "@/components/clinic/day-stepper";
import { ConsultationDay } from "@/components/clinic/consultation-day";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const doctor = await getDoctor((await params).id);
  return { title: doctor ? doctor.name : "Doctor" };
}

export default async function DoctorDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ on?: string }>;
}) {
  const user = await requireUser();
  await requireModulePage("clinic");

  const { id } = await params;
  const sp = await searchParams;

  const doctor = await getDoctor(id);
  if (!doctor) notFound();

  const onBs =
    sp.on && /^\d{4}-\d{2}-\d{2}$/.test(sp.on) ? sp.on : bsToDbText(today());
  const onAd = adToIso(toAD(bsFromDbText(onBs)));

  const [rows, nextDay] = await Promise.all([
    appointmentsForDoctorOn(doctor.id, onAd),
    nextBusyDay(doctor.id, onAd),
  ]);

  // "Nobody today — next is Thursday" saves the front desk stepping through
  // five empty days to find out where this doctor actually is.
  const nextDayBs =
    nextDay && nextDay !== onAd ? bsToDbText(toBS(adFromIso(nextDay))) : null;

  return (
    <>
      <Header title={doctor.name} />
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
        <div className="flex flex-col gap-5">
          <Link
            href={`/doctors?on=${onBs}`}
            className="flex w-fit items-center gap-1.5 text-[13px] text-sage-500 hover:text-sage-700"
          >
            <ArrowLeft className="h-4 w-4" />
            All doctors
          </Link>

          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <div>
              <h2 className="text-[20px] font-semibold text-sage-900">
                {doctor.name}
              </h2>
              <p className="text-[13px] text-sage-500">
                {[doctor.specialty, doctor.qualification]
                  .filter(Boolean)
                  .join(" · ") || "—"}
                {doctor.nmcNo && ` · NMC ${doctor.nmcNo}`}
              </p>
            </div>
            <span className="text-[14px] text-sage-500">
              {formatBS(bsFromDbText(onBs), { form: "long", monthScript: "en" })}
            </span>
          </div>

          <DayStepper valueBs={onBs} basePath={`/doctors/${doctor.id}`} />

          <ConsultationDay
            doctor={{
              id: doctor.id,
              name: doctor.name,
              active: doctor.active,
              email: doctor.email,
              hasLogin: doctor.userId != null,
              notifyPush: doctor.notifyPush,
              notifyEmail: doctor.notifyEmail,
            }}
            dateBs={onBs}
            rows={rows.map((r) => ({
              id: r.id,
              timeHhmm: r.timeHhmm,
              durationMin: r.durationMin,
              status: r.status,
              reason: r.reason,
              cancelReason: r.cancelReason,
              patientId: r.patientId,
              patientName: r.patientName,
              patientNo: r.patientNo,
              patientPhone: r.patientPhone,
              patientSex: r.patientSex,
              patientAgeValue: r.patientAgeValue,
              patientAgeUnit: r.patientAgeUnit,
              patientAgeAsOfAd: r.patientAgeAsOfAd,
              patientDobAd: r.patientDobAd,
            }))}
            todayAd={adToIso(new Date())}
            nextDayBs={nextDayBs}
            canBook={canBook(user.role)}
          />
        </div>
      </main>
    </>
  );
}
