"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarClock, Phone } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  APPOINTMENT_STATUS_LABEL,
  describeDuration,
  formatTime,
  type AppointmentStatus,
} from "@/lib/appointment-types";
import { formatPatientNo } from "@/lib/patient-no";
import { displayAge } from "@/lib/age";
import {
  adFromIso,
  adToIso,
  bsFromDbText,
  bsToDbText,
  formatBS,
  toAD,
  toBS,
  today,
} from "@/lib/bs";
import { cn } from "@/lib/cn";

export interface ScheduleRow {
  id: string;
  timeHhmm: string;
  durationMin: number;
  status: AppointmentStatus;
  reason: string;
  cancelReason: string;
  patientName: string;
  patientNo: number | null;
  patientPhone: string;
  patientSex: string;
  patientAgeValue: number | null;
  patientAgeUnit: string | null;
  patientAgeAsOfAd: string | null;
  patientDobAd: string | null;
}

export interface DoctorDay {
  dateAd: string;
  dateBs: string;
  count: number;
  first: string;
}

const STATUS_TONE: Record<AppointmentStatus, BadgeTone> = {
  booked: "info",
  arrived: "ok",
  seen: "neutral",
  cancelled: "danger",
  missed: "warn",
};

const SEX_SHORT: Record<string, string> = { f: "F", m: "M", o: "—" };

/**
 * A doctor's own list, on a phone.
 *
 * One card per person, time first, because the question a doctor asks this
 * screen is never "who" — it is "who is next, and when". The phone number is a
 * tap that dials, since half of what a doctor does with this list is ring
 * somebody to say they are running late.
 */
export function DoctorSchedule({
  doctorName,
  dateBs,
  isToday,
  todayAd,
  rows,
  upcoming,
}: {
  doctorName: string;
  dateBs: string;
  isToday: boolean;
  todayAd: string;
  rows: ScheduleRow[];
  upcoming: DoctorDay[];
}) {
  const router = useRouter();

  function go(bs: string) {
    router.push(`/my/schedule?on=${bs}`);
  }

  function step(days: number) {
    const moved = adFromIso(adToIso(toAD(bsFromDbText(dateBs))));
    moved.setDate(moved.getDate() + days);
    go(bsToDbText(toBS(moved)));
  }

  const open = rows.filter(
    (r) => r.status === "booked" || r.status === "arrived",
  );

  return (
    <div className="flex flex-col gap-4">
      {/* which day */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => step(-1)}
          aria-label="The day before"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-line bg-cream-50 text-sage-700 active:bg-cream-200"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[16px] font-semibold text-sage-900">
            {isToday
              ? "Today"
              : formatBS(bsFromDbText(dateBs), {
                  form: "long",
                  monthScript: "en",
                })}
          </div>
          <div className="text-[12px] text-sage-500">
            {isToday
              ? formatBS(bsFromDbText(dateBs), {
                  form: "long",
                  monthScript: "en",
                })
              : `${open.length} ${open.length === 1 ? "person" : "people"}`}
          </div>
        </div>
        <button
          onClick={() => step(1)}
          aria-label="The day after"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-line bg-cream-50 text-sage-700 active:bg-cream-200"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {!isToday && (
        <button
          onClick={() => go(bsToDbText(today()))}
          className="mx-auto w-fit rounded-[999px] border border-line bg-cream-50 px-4 py-1.5 text-[13px] text-sage-700"
        >
          Back to today
        </button>
      )}

      {/* the day itself */}
      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          message={
            isToday
              ? "Nobody is booked in with you today."
              : "Nobody is booked in with you on this day."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => {
            const age = displayAge(
              {
                value: r.patientAgeValue,
                unit: r.patientAgeUnit as "y" | "m" | "d" | null,
                asOfAd: r.patientAgeAsOfAd,
                dobAd: r.patientDobAd,
              },
              todayAd,
            );
            const closed = r.status === "cancelled" || r.status === "missed";
            return (
              <li
                key={r.id}
                className={cn(
                  "rounded-[10px] border border-line bg-cream-50 p-4",
                  closed && "opacity-55",
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[20px] font-semibold text-sage-900 tnum">
                    {formatTime(r.timeHhmm)}
                  </span>
                  <Badge tone={STATUS_TONE[r.status]}>
                    {APPOINTMENT_STATUS_LABEL[r.status]}
                  </Badge>
                </div>

                <div className="pt-1.5 text-[17px] font-semibold text-sage-900">
                  {r.patientName}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[13px] text-sage-500">
                  <span>
                    {age.short} · {SEX_SHORT[r.patientSex] ?? "—"}
                  </span>
                  <span className="font-mono text-clinic-700">
                    {r.patientNo != null ? formatPatientNo(r.patientNo) : "—"}
                  </span>
                  <span>{describeDuration(r.durationMin)}</span>
                </div>

                {r.reason && (
                  <p className="pt-2 text-[14px] text-sage-700">{r.reason}</p>
                )}
                {r.cancelReason && (
                  <p className="pt-2 text-[13px] text-danger-600">
                    {r.cancelReason}
                  </p>
                )}

                {r.patientPhone && !closed && (
                  <a
                    href={`tel:${r.patientPhone}`}
                    className="mt-3 flex h-11 items-center justify-center gap-2 rounded-[10px] border border-line bg-cream-100 text-[15px] font-medium text-sage-900 active:bg-cream-200"
                  >
                    <Phone className="h-4 w-4" />
                    {r.patientPhone}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* what is coming up */}
      {upcoming.length > 0 && (
        <section className="pt-2">
          <h2 className="pb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-sage-500">
            Coming up
          </h2>
          <ul className="flex flex-col gap-1.5">
            {upcoming.map((d) => (
              <li key={d.dateAd}>
                <Link
                  href={`/my/schedule?on=${d.dateBs}`}
                  className="flex items-center gap-3 rounded-[10px] border border-line bg-cream-50 px-4 py-3 active:bg-clinic-75"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px] text-sage-900">
                    {formatBS(bsFromDbText(d.dateBs), {
                      form: "long",
                      monthScript: "en",
                    })}
                  </span>
                  <span className="shrink-0 text-[13px] text-sage-500">
                    {d.count} {d.count === 1 ? "person" : "people"} · from{" "}
                    {formatTime(d.first)}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-sage-300" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {doctorName && (
        <p className="pt-2 text-center text-[12px] text-sage-500">
          This is {doctorName}&apos;s list. Only consultations booked with you
          appear here.
        </p>
      )}
    </div>
  );
}
