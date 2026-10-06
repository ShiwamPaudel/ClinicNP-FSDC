import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getModules } from "@/lib/modules";
import { recentPatients } from "@/lib/repos/patients";
import { displayAge } from "@/lib/age";
import { adToIso } from "@/lib/bs";
import { checkRateLimit, CATALOG_SYNC, tooManyRequestsBody } from "@/lib/rate-limit";

/** How many recent patients the counter keeps locally (Architecture §2.1). */
const SLICE = 2000;

/**
 * GET /api/patients/recent — the counter's local patient slice.
 *
 * Identity fields only: enough to recognise the right person at the counter
 * and nothing more. No notes, no address, no history — those stay on the
 * server, where a session is required to read them.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, userMessage: "Please sign in." },
      { status: 401 },
    );
  }

  const modules = await getModules();
  if (!modules.clinic) return NextResponse.json({ ok: false }, { status: 404 });

  const limit = await checkRateLimit(CATALOG_SYNC, session.user.id);
  if (!limit.ok) {
    return NextResponse.json(tooManyRequestsBody(), {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  const todayAd = adToIso(new Date());
  const rows = await recentPatients(SLICE);

  return NextResponse.json({
    ok: true,
    patients: rows.map((p) => ({
      id: p.id,
      patientNo: p.patientNo,
      name: p.name,
      sex: p.sex,
      phone: p.phone,
      ageShort: displayAge(
        {
          value: p.ageValue,
          unit: p.ageUnit,
          asOfAd: p.ageAsOfAd,
          dobAd: p.dobAd,
        },
        todayAd,
      ).short,
    })),
  });
}
