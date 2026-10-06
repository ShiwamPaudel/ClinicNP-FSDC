import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canBill } from "@/lib/session";
import {
  ingestBill,
  InsufficientStockError,
  ServiceLineError,
  DueBillError,
} from "@/lib/repos/bills";
import { getModules } from "@/lib/modules";
import { recordAudit } from "@/lib/repos/audit";
import { ingestBillSchema } from "@/lib/validators";
import {
  checkRateLimit,
  BILL_INGEST,
  tooManyRequestsBody,
} from "@/lib/rate-limit";

/**
 * POST /api/bills — the outbox target. Idempotent on the bill ULID:
 * retrying the same bill creates exactly one sale (Rules §1.8).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, userMessage: "Please sign in." },
      { status: 401 },
    );
  }


  if (!canBill(session.user.role)) {
    return NextResponse.json(
      { ok: false, userMessage: "You don't have permission to do that." },
      { status: 403 },
    );
  }

  const limit = await checkRateLimit(BILL_INGEST, session.user.id);
  if (!limit.ok) {
    return NextResponse.json(tooManyRequestsBody(), {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, userMessage: "Couldn't read the bill." },
      { status: 400 },
    );
  }

  const parsed = ingestBillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, userMessage: "That bill couldn't be saved." },
      { status: 400 },
    );
  }

  // A module that is off cannot be billed through, even by a payload that was
  // queued while it was on.
  const modules = await getModules();
  if (!modules.pharmacy && parsed.data.lines.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "module_off",
        userMessage: "Medicines aren't being sold here any more.",
      },
      { status: 409 },
    );
  }
  if (!modules.clinic && (parsed.data.serviceLines?.length ?? 0) > 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "module_off",
        userMessage: "Services aren't being billed here any more.",
      },
      { status: 409 },
    );
  }
  // With patients switched on, money owed belongs to a registered patient, as
  // a service does, so it can be found again by name, phone or number. Only a
  // bill from a counter that knows about part payments is held to this; one
  // queued before then lands as it always would have (see ingestBill).
  if (
    modules.clinic &&
    parsed.data.paymentMethod === "credit" &&
    parsed.data.paidNowPaisa !== undefined &&
    !parsed.data.patientId &&
    !parsed.data.patient
  ) {
    return NextResponse.json(
      {
        ok: false,
        code: "dues_patient",
        userMessage: "A bill on dues needs a patient on it.",
      },
      { status: 409 },
    );
  }

  try {
    const result = await ingestBill({
      ...parsed.data,
      userId: session.user.id,
    });

    // A price set from the counter is a change to the shop's price list, made
    // by whoever happened to be serving. It goes in the audit log for the same
    // reason a rate override does: somebody will ask where that price came
    // from, and "the first bill" should be an answer with a name on it.
    if (result.firstPriced?.length) {
      await recordAudit(session.user.id, "item.first_price", {
        billId: result.id,
        priced: result.firstPriced,
      });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Not enough stock: a definite business rejection, not a transient fault.
    if (err instanceof InsufficientStockError) {
      return NextResponse.json(
        {
          ok: false,
          code: "insufficient_stock",
          userMessage:
            "Not enough stock for one or more items — stock may have changed. Please review the bill.",
        },
        { status: 409 },
      );
    }
    // A service line the server cannot honour: a definite rejection with a
    // reason the counter can act on, never a silent re-price.
    if (err instanceof ServiceLineError) {
      return NextResponse.json(
        { ok: false, code: "service_line", userMessage: err.userMessage },
        { status: 409 },
      );
    }
    if (err instanceof DueBillError) {
      return NextResponse.json(
        { ok: false, code: "dues_patient", userMessage: err.userMessage },
        { status: 409 },
      );
    }
    console.error("[/api/bills]", err);
    return NextResponse.json(
      { ok: false, userMessage: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
