import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { saveDevice, forgetDevice } from "@/lib/repos/alerts";
import { pushDeviceSchema } from "@/lib/validators";

/**
 * POST /api/push/subscribe — this phone would like to be told.
 *
 * What the browser hands over is an address only it and the delivery service
 * understand, plus two keys that let this server encrypt a message nobody in
 * between can read. It is stored against the person signed in, and it is
 * deleted the moment they turn alerts off.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, userMessage: "Please sign in." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, userMessage: "Couldn't turn alerts on. Try again." },
      { status: 400 },
    );
  }

  const parsed = pushDeviceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, userMessage: "Couldn't turn alerts on. Try again." },
      { status: 400 },
    );
  }

  await saveDevice({
    userId: session.user.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.p256dh,
    auth: parsed.data.auth,
    label: parsed.data.label,
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/push/subscribe — this phone no longer wants to be told. */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, userMessage: "Please sign in." },
      { status: 401 },
    );
  }

  let body: { endpoint?: string };
  try {
    body = (await req.json()) as { endpoint?: string };
  } catch {
    body = {};
  }

  if (body.endpoint) await forgetDevice(body.endpoint);
  return NextResponse.json({ ok: true });
}
