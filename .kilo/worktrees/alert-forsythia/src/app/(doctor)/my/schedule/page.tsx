import { requireDoctor } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { getDoctor } from "@/lib/repos/doctors";
import {
  appointmentsForDoctorOn,
  appointmentsForDoctorBetween,
} from "@/lib/repos/appointments";
import {
  adToIso,
  adFromIso,
  toAD,
  toBS,
  bsFromDbText,
  bsToDbText,
  today,
} from "@/lib/bs";
import { DoctorSchedule, type DoctorDay } from "@/components/doctor/doctor-schedule";

export const metadata = { title: "Consultations" };

/** How far ahead the phone looks when it says what is coming up. */
const LOOK_AHEAD_DAYS = 14;

export default async function DoctorSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ on?: string }>;
}) {
  const { doctorId } = await requireDoctor();
  await requireModulePage("clinic");

  const sp = await searchParams;
  const onBs =
    sp.on && /^\d{4}-\d{2}-\d{2}$/.test(sp.on) ? sp.on : bsToDbText(today());
  const onAd = adToIso(toAD(bsFromDbText(onBs)));

  // What is coming up starts from tomorrow of the day being looked at, so the
  // list underneath never repeats what is already on the screen above it.
  const from = adFromIso(onAd);
  from.setDate(from.getDate() + 1);
  const to = adFromIso(onAd);
  to.setDate(to.getDate() + LOOK_AHEAD_DAYS);

  const [doctor, day, ahead] = await Promise.all([
    getDoctor(doctorId),
    appointmentsForDoctorOn(doctorId, onAd),
    appointmentsForDoctorBetween(doctorId, adToIso(from), adToIso(to)),
  ]);

  const upcoming = ahead.filter(
    (a) => a.status === "booked" || a.status === "arrived",
  );

  // Group what is coming up by the day it falls on.
  const byDay = new Map<string, DoctorDay>();
  for (const a of upcoming) {
    const existing = byDay.get(a.dateAd);
    const entry: DoctorDay = existing ?? {
      dateAd: a.dateAd,
      dateBs: a.dateBs,
      count: 0,
      first: a.timeHhmm,
    };
    entry.count += 1;
    if (a.timeHhmm < entry.first) entry.first = a.timeHhmm;
    byDay.set(a.dateAd, entry);
  }

  return (
    <DoctorSchedule
      doctorName={doctor?.name ?? ""}
      dateBs={onBs}
      isToday={onAd === adToIso(new Date())}
      todayAd={adToIso(new Date())}
      rows={day.map((r) => ({
        id: r.id,
        timeHhmm: r.timeHhmm,
        durationMin: r.durationMin,
        status: r.status,
        reason: r.reason,
        cancelReason: r.cancelReason,
        patientName: r.patientName,
        patientNo: r.patientNo,
        patientPhone: r.patientPhone,
        patientSex: r.patientSex,
        patientAgeValue: r.patientAgeValue,
        patientAgeUnit: r.patientAgeUnit,
        patientAgeAsOfAd: r.patientAgeAsOfAd,
        patientDobAd: r.patientDobAd,
      }))}
      upcoming={[...byDay.values()]
        .sort((a, b) => a.dateAd.localeCompare(b.dateAd))
        .map((d) => ({
          ...d,
          dateBs: d.dateBs || bsToDbText(toBS(adFromIso(d.dateAd))),
        }))}
    />
  );
}
