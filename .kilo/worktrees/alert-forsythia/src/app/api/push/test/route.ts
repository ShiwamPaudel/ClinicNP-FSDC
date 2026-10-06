import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pushToUser, pushConfigured } from "@/lib/push";
import { countDevicesForUser } from "@/lib/repos/alerts";

/**
 * POST /api/push/test — prove it works, from the phone itself.
 *
 * Turning alerts on succeeds silently on every phone, including the ones where
 * they will never actually arrive: a browser in private mode, an iPhone that
 * has not been added to the home screen, a phone that has quietly revoked
 * permission. So there is a button that makes one appear, and if it does not
 * appear, the doctor knows now rather than the day they miss a consultation.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, userMessage: "Please sign in." },
      { status: 401 },
    );
  }

  if (!pushConfigured()) {
    return NextResponse.json({
      ok: false,
      userMessage: "Alerts to phones are not switched on yet for this clinic.",
    });
  }

  const devices = await countDevicesForUser(session.user.id);
  if (devices === 0) {
    return NextResponse.json({
      ok: false,
      userMessage: "Turn alerts on for this phone first.",
    });
  }

  const out = await pushToUser(session.user.id, {
    title: "Alerts are working",
    body: "This is what a new consultation will look like.",
    url: "/my/profile",
    tag: "test-alert",
  });

  if (out.sent === 0) {
    return NextResponse.json({
      ok: false,
      userMessage:
        out.detail || "Nothing could be sent to this phone. Try turning alerts off and on again.",
    });
  }

  return NextResponse.json({
    ok: true,
    userMessage:
      out.sent === 1
        ? "Sent. It should appear in a moment."
        : `Sent to ${out.sent} phones. It should appear in a moment.`,
  });
}
