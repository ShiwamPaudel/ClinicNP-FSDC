/**
 * notify.ts — telling a doctor that somebody has been booked in with them.
 *
 * Two ways of saying the same sentence: an alert on the phone they carry, and
 * an email for the ones who live in their inbox. Both are best-effort and
 * neither can fail a booking — the consultation is already saved by the time
 * anything here runs, and what happened to each message is written down so the
 * front desk can see whether the doctor was actually told.
 */
import "server-only";
import { formatBS, bsFromDbText } from "@/lib/bs";
import { formatTime, describeDuration } from "@/lib/appointment-types";
import { pushToUser, pushConfigured } from "@/lib/push";
import { sendMail, mailConfigured } from "@/lib/email";
import { recordAlert } from "@/lib/repos/alerts";
import type { Doctor } from "@/lib/repos/doctors";
import type { AppointmentRow } from "@/lib/repos/appointments";
import { formatPatientNo } from "@/lib/patient-no";

export type BookingEvent = "booked" | "moved" | "cancelled";

const HEADLINE: Record<BookingEvent, string> = {
  booked: "New consultation booked",
  moved: "A consultation has been moved",
  cancelled: "A consultation was cancelled",
};

/** "Baisakh 12, 2083 at 2:30 PM" — how a clinic says when. */
function whenLine(a: AppointmentRow): string {
  const day = formatBS(bsFromDbText(a.dateBs), {
    form: "long",
    monthScript: "en",
  });
  return `${day} at ${formatTime(a.timeHhmm)}`;
}

function bodyLines(a: AppointmentRow, clinicName: string): string[] {
  const who =
    a.patientNo != null
      ? `${a.patientName} (${formatPatientNo(a.patientNo)})`
      : a.patientName;
  const lines = [
    `Patient: ${who}`,
    `When: ${whenLine(a)}`,
    `Expected to take: ${describeDuration(a.durationMin)}`,
  ];
  if (a.patientPhone) lines.push(`Phone: ${a.patientPhone}`);
  if (a.reason) lines.push(`Reason given: ${a.reason}`);
  if (clinicName) lines.push("", clinicName);
  return lines;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Tell the doctor. Returns nothing the caller has to act on — whether it
 * landed is on the booking's own alert history.
 */
export async function notifyDoctorOfBooking(
  doctor: Doctor,
  appointment: AppointmentRow,
  clinicName: string,
  event: BookingEvent = "booked",
): Promise<void> {
  const headline = HEADLINE[event];
  const lines = bodyLines(appointment, clinicName);

  // ---- the phone ----
  if (!doctor.notifyPush) {
    await recordAlert({
      appointmentId: appointment.id,
      channel: "push",
      target: doctor.name,
      status: "off",
      detail: "This doctor has alerts on their phone switched off.",
    });
  } else if (!doctor.userId) {
    await recordAlert({
      appointmentId: appointment.id,
      channel: "push",
      target: doctor.name,
      status: "off",
      detail: "This doctor has no sign-in, so there is no phone to alert.",
    });
  } else if (!pushConfigured()) {
    await recordAlert({
      appointmentId: appointment.id,
      channel: "push",
      target: doctor.name,
      status: "off",
      detail: "Alerts to phones are not set up yet.",
    });
  } else {
    const out = await pushToUser(doctor.userId, {
      title: headline,
      body: `${appointment.patientName} — ${whenLine(appointment)}`,
      url: "/my/schedule",
      tag: `booking-${appointment.id}`,
    });
    await recordAlert({
      appointmentId: appointment.id,
      channel: "push",
      target: doctor.name,
      status: out.sent > 0 ? "sent" : "failed",
      detail:
        out.sent > 0
          ? `Reached ${out.sent} ${out.sent === 1 ? "phone" : "phones"}.`
          : out.detail || "No phone could be reached.",
    });
  }

  // ---- the inbox ----
  if (!doctor.notifyEmail) {
    await recordAlert({
      appointmentId: appointment.id,
      channel: "email",
      target: doctor.email,
      status: "off",
      detail: "This doctor has email switched off.",
    });
  } else if (!doctor.email.trim()) {
    await recordAlert({
      appointmentId: appointment.id,
      channel: "email",
      target: "",
      status: "off",
      detail: "This doctor has no email address on file.",
    });
  } else if (!mailConfigured()) {
    await recordAlert({
      appointmentId: appointment.id,
      channel: "email",
      target: doctor.email,
      status: "off",
      detail: "Email is not set up yet.",
    });
  } else {
    const subject = `${headline}: ${appointment.patientName}, ${whenLine(appointment)}`;
    const text = [`${headline}`, "", ...lines].join("\n");
    const html = [
      `<p style="font:600 16px system-ui,sans-serif;margin:0 0 12px">${escapeHtml(headline)}</p>`,
      `<table style="font:14px system-ui,sans-serif;border-collapse:collapse">`,
      ...lines
        .filter((l) => l.includes(": "))
        .map((l) => {
          const at = l.indexOf(": ");
          return `<tr><td style="padding:2px 12px 2px 0;color:#4f7659">${escapeHtml(
            l.slice(0, at),
          )}</td><td style="padding:2px 0">${escapeHtml(l.slice(at + 2))}</td></tr>`;
        }),
      `</table>`,
      clinicName
        ? `<p style="font:13px system-ui,sans-serif;color:#4f7659;margin:16px 0 0">${escapeHtml(clinicName)}</p>`
        : "",
    ].join("");

    const out = await sendMail({ to: doctor.email, subject, text, html });
    await recordAlert({
      appointmentId: appointment.id,
      channel: "email",
      target: doctor.email,
      status: out.ok ? "sent" : "failed",
      detail: out.ok ? "Sent." : out.detail,
    });
  }
}
