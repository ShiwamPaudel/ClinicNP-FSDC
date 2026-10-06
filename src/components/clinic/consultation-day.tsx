"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ulid } from "ulid";
import { CalendarPlus, CalendarClock, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import {
  PatientPicker,
  type FoundPatient,
  type DraftPatient,
} from "@/components/clinic/patient-picker";
import {
  bookConsultationAction,
  rescheduleConsultationAction,
  setConsultationStatusAction,
} from "@/app/(app)/doctors/actions";
import {
  APPOINTMENT_STATUS_LABEL,
  DURATION_CHOICES,
  describeDuration,
  formatTime,
  slotChoices,
  type AppointmentStatus,
} from "@/lib/appointment-types";
import { formatPatientNo } from "@/lib/patient-no";
import { displayAge } from "@/lib/age";
import { formatBS, bsFromDbText } from "@/lib/bs";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

export interface DayRow {
  id: string;
  timeHhmm: string;
  durationMin: number;
  status: AppointmentStatus;
  reason: string;
  cancelReason: string;
  patientId: string;
  patientName: string;
  patientNo: number | null;
  patientPhone: string;
  patientSex: string;
  patientAgeValue: number | null;
  patientAgeUnit: string | null;
  patientAgeAsOfAd: string | null;
  patientDobAd: string | null;
}

export interface DayDoctor {
  id: string;
  name: string;
  active: boolean;
  email: string;
  hasLogin: boolean;
  notifyPush: boolean;
  notifyEmail: boolean;
}

const STATUS_TONE: Record<AppointmentStatus, BadgeTone> = {
  booked: "info",
  arrived: "ok",
  seen: "neutral",
  cancelled: "danger",
  missed: "warn",
};

const SEX_SHORT: Record<string, string> = { f: "F", m: "M", o: "—" };

/** The default length of a consultation, until somebody changes it. */
const DEFAULT_MINUTES = 15;

export function ConsultationDay({
  doctor,
  dateBs,
  rows,
  todayAd,
  nextDayBs,
  canBook,
}: {
  doctor: DayDoctor;
  dateBs: string;
  rows: DayRow[];
  todayAd: string;
  nextDayBs: string | null;
  canBook: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [bookOpen, setBookOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // the booking being written
  const [chosen, setChosen] = useState<FoundPatient | null>(null);
  const [draft, setDraft] = useState<DraftPatient | null>(null);
  const [whenBs, setWhenBs] = useState(dateBs);
  const [time, setTime] = useState("10:00");
  const [minutes, setMinutes] = useState<number>(DEFAULT_MINUTES);
  const [reason, setReason] = useState("");

  // moving one
  const [moving, setMoving] = useState<DayRow | null>(null);
  const [moveBs, setMoveBs] = useState(dateBs);
  const [moveTime, setMoveTime] = useState("10:00");
  const [moveMinutes, setMoveMinutes] = useState<number>(DEFAULT_MINUTES);

  // calling one off
  const [cancelling, setCancelling] = useState<DayRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  function openBook() {
    setChosen(null);
    setDraft(null);
    setWhenBs(dateBs);
    setTime(suggestNextTime(rows));
    setMinutes(DEFAULT_MINUTES);
    setReason("");
    setBookOpen(true);
  }

  async function submitBooking() {
    const patientId = chosen ? chosen.id : draft ? "new" : "";
    if (!patientId) {
      toast.error("Say who the consultation is for.");
      return;
    }
    if (draft && !draft.name.trim()) {
      toast.error("Enter the patient's name.");
      return;
    }

    setBusy(true);
    const res = await bookConsultationAction(
      {
        // Minted here so a retry books one consultation and not two.
        id: ulid(),
        doctorId: doctor.id,
        patientId,
        dateBs: whenBs,
        timeHhmm: time,
        durationMin: minutes,
        reason,
      },
      draft ?? undefined,
    );
    setBusy(false);

    if (res.ok) {
      toast.success(strings.consultationBooked);
      if (res.alerts) toast.info(res.alerts);
      setBookOpen(false);
      router.refresh();
      // Booked onto another day? Go and look at it, or the front desk is left
      // staring at a day that did not change.
      if (whenBs !== dateBs) router.push(`/doctors/${doctor.id}?on=${whenBs}`);
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  async function submitMove() {
    if (!moving) return;
    setBusy(true);
    const res = await rescheduleConsultationAction({
      id: moving.id,
      dateBs: moveBs,
      timeHhmm: moveTime,
      durationMin: moveMinutes,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(strings.consultationMoved);
      if (res.alerts) toast.info(res.alerts);
      setMoving(null);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  async function submitCancel() {
    if (!cancelling) return;
    setBusy(true);
    const res = await setConsultationStatusAction({
      id: cancelling.id,
      status: "cancelled",
      cancelReason,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(strings.consultationCancelled);
      if (res.alerts) toast.info(res.alerts);
      setCancelling(null);
      setCancelReason("");
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  async function moveStatus(row: DayRow, status: AppointmentStatus) {
    const res = await setConsultationStatusAction({
      id: row.id,
      status,
      cancelReason: "",
    });
    if (res.ok) {
      toast.success(strings.saved);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  const open = rows.filter((r) => r.status === "booked" || r.status === "arrived");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-sage-500">
          {open.length === 0
            ? "Nobody booked on this day."
            : `${open.length} ${open.length === 1 ? "person" : "people"} booked`}
          {rows.length > open.length &&
            ` · ${rows.length - open.length} closed off`}
        </p>
        {canBook && (
          <Button onClick={openBook} disabled={!doctor.active}>
            <CalendarPlus className="h-4 w-4" />
            {strings.bookConsultation}
          </Button>
        )}
      </div>

      {!doctor.active && (
        <p className="rounded-[10px] border border-line bg-warn-100 px-4 py-3 text-[13px] text-warn-600">
          {doctor.name} is switched off in Settings, so nobody new can be booked
          in with them. Anything already booked is still here.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          message={
            nextDayBs
              ? `Nobody is booked with ${doctor.name} on this day. The next day they have anybody is ${formatBS(
                  bsFromDbText(nextDayBs),
                  { form: "long", monthScript: "en" },
                )}.`
              : `Nobody is booked with ${doctor.name} on this day.`
          }
          action={
            nextDayBs ? (
              <Link href={`/doctors/${doctor.id}?on=${nextDayBs}`}>
                <Button variant="secondary">Go to that day</Button>
              </Link>
            ) : canBook && doctor.active ? (
              <Button onClick={openBook}>{strings.bookConsultation}</Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
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
                  closed && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <div className="w-[92px] shrink-0">
                    <div className="text-[16px] font-semibold text-sage-900 tnum">
                      {formatTime(r.timeHhmm)}
                    </div>
                    <div className="text-[12px] text-sage-500">
                      {describeDuration(r.durationMin)}
                    </div>
                  </div>

                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`/patients/${r.patientId}`}
                        className="text-[15px] font-semibold text-sage-900 hover:text-clinic-700 hover:underline"
                      >
                        {r.patientName}
                      </Link>
                      <span className="font-mono text-[12px] text-clinic-700">
                        {r.patientNo != null ? formatPatientNo(r.patientNo) : "—"}
                      </span>
                      <span className="text-[13px] text-sage-500">
                        {age.short} · {SEX_SHORT[r.patientSex] ?? "—"}
                      </span>
                      <Badge tone={STATUS_TONE[r.status]}>
                        {APPOINTMENT_STATUS_LABEL[r.status]}
                      </Badge>
                    </div>
                    {r.patientPhone && (
                      <a
                        href={`tel:${r.patientPhone}`}
                        className="mt-1 flex w-fit items-center gap-1.5 font-mono text-[13px] text-sage-500 hover:text-clinic-700"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {r.patientPhone}
                      </a>
                    )}
                    {r.reason && (
                      <p className="mt-1 text-[13px] text-sage-600">{r.reason}</p>
                    )}
                    {r.cancelReason && (
                      <p className="mt-1 text-[13px] text-danger-600">
                        {r.cancelReason}
                      </p>
                    )}
                  </div>

                  {canBook && !closed && (
                    <div className="flex flex-wrap items-center gap-2">
                      {r.status === "booked" && (
                        <Button
                          variant="secondary"
                          onClick={() => moveStatus(r, "arrived")}
                        >
                          They&apos;re here
                        </Button>
                      )}
                      {r.status === "arrived" && (
                        <Button
                          variant="secondary"
                          onClick={() => moveStatus(r, "seen")}
                        >
                          Seen
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setMoving(r);
                          setMoveBs(dateBs);
                          setMoveTime(r.timeHhmm);
                          setMoveMinutes(r.durationMin);
                        }}
                      >
                        Move
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setCancelling(r);
                          setCancelReason("");
                        }}
                      >
                        Call off
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ---- book ---- */}
      <Dialog
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        title={`${strings.bookConsultation} with ${doctor.name}`}
        className="max-w-lg"
      >
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <PatientPicker
            chosen={chosen}
            draft={draft}
            onChoose={(p) => {
              setChosen(p);
              if (p) setDraft(null);
            }}
            onDraftChange={(d) => {
              setDraft(d);
              if (d) setChosen(null);
            }}
          />

          <Field label={strings.whenIsIt}>
            <DatePickerBS value={whenBs} onChange={setWhenBs} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={strings.atWhatTime}>
              <TimeChooser value={time} onChange={setTime} />
            </Field>
            <Field label={strings.howLong}>
              <Select
                value={String(minutes)}
                onChange={(e) => setMinutes(Number(e.target.value))}
              >
                {DURATION_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {describeDuration(m)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label={strings.reasonGiven}
            hint="Optional — what they said on the phone"
          >
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder="Chest pain since Monday"
            />
          </Field>

          <p className="rounded-[8px] bg-sage-75 px-3 py-2 text-[12px] text-sage-600">
            {alertLine(doctor)}
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setBookOpen(false)}>
            {strings.cancel}
          </Button>
          <Button
            onClick={submitBooking}
            disabled={busy || (!chosen && !draft?.name.trim())}
          >
            {busy ? "Booking…" : "Book it"}
          </Button>
        </div>
      </Dialog>

      {/* ---- move ---- */}
      <Dialog
        open={moving !== null}
        onClose={() => setMoving(null)}
        title={moving ? `Move ${moving.patientName}` : "Move"}
      >
        <div className="flex flex-col gap-4">
          <Field label={strings.whenIsIt}>
            <DatePickerBS value={moveBs} onChange={setMoveBs} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={strings.atWhatTime}>
              <TimeChooser value={moveTime} onChange={setMoveTime} />
            </Field>
            <Field label={strings.howLong}>
              <Select
                value={String(moveMinutes)}
                onChange={(e) => setMoveMinutes(Number(e.target.value))}
              >
                {DURATION_CHOICES.map((m) => (
                  <option key={m} value={m}>
                    {describeDuration(m)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setMoving(null)}>
            {strings.cancel}
          </Button>
          <Button onClick={submitMove} disabled={busy}>
            {busy ? "Moving…" : "Move it"}
          </Button>
        </div>
      </Dialog>

      {/* ---- call off ---- */}
      <Dialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title={cancelling ? `Call off ${cancelling.patientName}` : "Call off"}
      >
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-sage-600">
            The consultation stays on the record as called off. {doctor.name} is
            told.
          </p>
          <Field label={strings.whyCancelled} hint="Optional">
            <Input
              autoFocus
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={300}
              placeholder="Patient rang to say they can't come"
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCancelling(null)}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={submitCancel} disabled={busy}>
            {busy ? "Calling off…" : "Call it off"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

/** Says, before they book, whether the doctor will actually hear about it. */
function alertLine(doctor: DayDoctor): string {
  const ways: string[] = [];
  if (doctor.notifyPush && doctor.hasLogin) ways.push("on their phone");
  if (doctor.notifyEmail && doctor.email) ways.push("by email");
  if (ways.length === 0) {
    return `${doctor.name} will not be told automatically — there is no phone or email set up for them.`;
  }
  return `${doctor.name} will be told ${ways.join(" and ")} as soon as this is booked.`;
}

/**
 * A list of the usual times, plus the ability to type any other one. A clinic
 * that runs to the quarter hour should not have to type, and a clinic that
 * squeezes somebody in at 13:05 should not be told it cannot.
 */
function TimeChooser({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const choices = slotChoices();
  return (
    <div className="flex gap-2">
      <Select
        value={choices.includes(value) ? value : ""}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="flex-1"
      >
        <option value="">Another time</option>
        {choices.map((c) => (
          <option key={c} value={c}>
            {formatTime(c)}
          </option>
        ))}
      </Select>
      <Input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-[124px]"
        aria-label="Time"
      />
    </div>
  );
}

/**
 * Where to put the next one: after the last thing already booked, rounded up
 * to the next quarter hour, or ten in the morning on an empty day.
 */
function suggestNextTime(rows: DayRow[]): string {
  const open = rows.filter((r) => r.status === "booked" || r.status === "arrived");
  if (open.length === 0) return "10:00";
  let latest = 0;
  for (const r of open) {
    const [h = 0, m = 0] = r.timeHhmm.split(":").map(Number);
    latest = Math.max(latest, h * 60 + m + r.durationMin);
  }
  const rounded = Math.min(Math.ceil(latest / 15) * 15, 23 * 60 + 45);
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(
    rounded % 60,
  ).padStart(2, "0")}`;
}
