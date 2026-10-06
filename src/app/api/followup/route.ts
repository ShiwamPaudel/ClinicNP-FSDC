import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getModules } from "@/lib/modules";
import { getServiceForBilling, lastConsultationAd } from "@/lib/repos/services";
import { resolveFollowup } from "@/lib/clinic-calc";

/**
 * GET /api/followup — what should this consultation cost for this patient?
 *
 * The counter cannot answer this from its cache: it needs the date of the
 * patient's last consultation with this doctor. The same rule runs again at
 * ingest, where it is authoritative; this call is so the person at the desk
 * sees the right number and the right words before taking the money.
 *
 * When the connection is down this call simply fails, the counter charges the
 * full rate and says so on the line. It never guesses.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, userMessage: "Please sign in." },
      { status: 401 },
    );
  }

  const modules = await getModules();
  if (!modules.clinic) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") ?? "";
  const patientId = url.searchParams.get("patientId") ?? "";
  const doctorId = url.searchParams.get("doctorId");
  const dateAd = url.searchParams.get("dateAd") ?? "";

  if (!serviceId || !patientId || !/^\d{4}-\d{2}-\d{2}$/.test(dateAd)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const service = await getServiceForBilling(serviceId);
  if (!service) return NextResponse.json({ ok: false }, { status: 404 });

  // Only a consultation has a follow-up window at all.
  if (!service.isConsultation || service.followupDays <= 0) {
    return NextResponse.json({
      ok: true,
      applied: false,
      ratePaisa: service.ratePaisa,
      note: "",
    });
  }

  const lastAd = await lastConsultationAd(patientId, doctorId, dateAd);
  const outcome = resolveFollowup(
    {
      ratePaisa: service.ratePaisa,
      followupDays: service.followupDays,
      followupRatePaisa: service.followupRatePaisa,
    },
    dateAd,
    lastAd,
  );

  return NextResponse.json({
    ok: true,
    applied: outcome.applied,
    ratePaisa: outcome.ratePaisa,
    note: outcome.note,
    daysSince: outcome.daysSince,
  });
}
