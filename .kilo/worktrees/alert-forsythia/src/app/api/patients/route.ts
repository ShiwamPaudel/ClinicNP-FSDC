import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getModules } from "@/lib/modules";
import { canBill } from "@/lib/session";
import { createPatient } from "@/lib/repos/patients";
import { recordAudit } from "@/lib/repos/audit";
import { displayAge, isSaneAge } from "@/lib/age";
import { adToIso } from "@/lib/bs";
import {
  checkRateLimit,
  PATIENT_CREATE,
  tooManyRequestsBody,
} from "@/lib/rate-limit";

/**
 * POST /api/patients — register someone from the counter, without leaving the
 * bill.
 *
 * Idempotent on the id when the caller supplies one, so a retry (or, from
 * Phase 5, an offline registration replayed from the queue) can never create
 * the same person twice. `createPatient` allocates the lifetime number and
 * inserts the row in one transaction.
 */
const bodySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Enter a name"),
  sex: z.enum(["f", "m", "o"]),
  ageValue: z.number().int().nullable(),
  ageUnit: z.enum(["y", "m", "d"]).nullable(),
  phone: z.string().default(""),
  address: z.string().default(""),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, userMessage: "Please sign in." },
      { status: 401 },
    );
  }

  const modules = await getModules();
  if (!modules.clinic) return NextResponse.json({ ok: false }, { status: 404 });

  if (!canBill(session.user.role)) {
    return NextResponse.json(
      { ok: false, userMessage: "You can't register patients." },
      { status: 403 },
    );
  }

  const limit = await checkRateLimit(PATIENT_CREATE, session.user.id);
  if (!limit.ok) {
    return NextResponse.json(tooManyRequestsBody(), {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, userMessage: "Please check the details and try again." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        userMessage: parsed.error.issues[0]?.message ?? "Please check the details.",
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  if (
    input.ageValue !== null &&
    input.ageUnit !== null &&
    !isSaneAge(input.ageValue, input.ageUnit)
  ) {
    return NextResponse.json(
      { ok: false, userMessage: "That age doesn't look right. Please check it." },
      { status: 400 },
    );
  }

  const todayAd = adToIso(new Date());
  const patient = await createPatient({
    id: input.id,
    name: input.name.trim(),
    sex: input.sex,
    ageValue: input.ageValue,
    ageUnit: input.ageUnit,
    ageAsOfAd: input.ageValue !== null ? todayAd : null,
    dobAd: null,
    phone: input.phone.trim(),
    address: input.address.trim(),
    userId: session.user.id,
  });

  await recordAudit(session.user.id, "patient.created", {
    entity: "patient",
    entityId: patient.id,
    detail: `${patient.name} (from the counter)`,
  });

  return NextResponse.json({
    ok: true,
    patient: {
      id: patient.id,
      patientNo: patient.patientNo,
      name: patient.name,
      sex: patient.sex,
      phone: patient.phone,
      ageShort: displayAge(
        {
          value: patient.ageValue,
          unit: patient.ageUnit,
          asOfAd: patient.ageAsOfAd,
          dobAd: patient.dobAd,
        },
        todayAd,
      ).short,
    },
  });
}
