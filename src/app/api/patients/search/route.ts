import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getModules } from "@/lib/modules";
import { searchPatients } from "@/lib/repos/patients";
import { displayAge } from "@/lib/age";
import { adToIso } from "@/lib/bs";

/**
 * GET /api/patients/search?q= — the counter's patient lookup.
 *
 * Returns only what the patient bar shows: enough to recognise the right
 * person and nothing more. No notes, no address, no history.
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
  if (!modules.clinic) return NextResponse.json({ ok: false }, { status: 404 });

  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json({ ok: true, patients: [] });

  const todayAd = adToIso(new Date());
  const found = await searchPatients(q, 12);

  return NextResponse.json({
    ok: true,
    patients: found.map((p) => ({
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
