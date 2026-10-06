/**
 * push.ts — sending an alert to a phone that has the app installed.
 *
 * Two keys, set once and never changed: a public one the browser is given when
 * it agrees to be alerted, and a private one only this server holds. Change
 * the pair and every device already registered goes deaf, silently, so they
 * are configuration and not something the app generates on the fly.
 *
 * Nothing here throws at the caller. A phone that has been wiped, a browser
 * that has revoked permission, a delivery service having a bad afternoon —
 * none of that is a reason a consultation fails to book. Every send reports
 * what happened and the caller writes it down.
 */
import "server-only";
import webpush from "web-push";
import {
  devicesForUser,
  forgetDevice,
  markDeviceFailed,
  markDeviceUsed,
} from "@/lib/repos/alerts";

/** What lands on the phone. Kept small — a lock screen shows two lines. */
export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping it should open. */
  url: string;
  /** Groups replacements: a second alert with the same tag replaces the first. */
  tag?: string;
}

export interface PushOutcome {
  sent: number;
  failed: number;
  /** Empty when nothing went wrong; otherwise one plain line about the last failure. */
  detail: string;
}

/** The public half, safe to hand to a browser. Empty when not configured. */
export function pushPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let armed = false;

function arm(): boolean {
  if (armed) return true;
  if (!pushConfigured()) return false;
  webpush.setVapidDetails(
    // Delivery services want a way to contact whoever is sending. A plain
    // address is enough and is never shown to anybody.
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  armed = true;
  return true;
}

/**
 * Alert every device this person has registered.
 *
 * A device that answers 404 or 410 has been thrown away — the browser is
 * telling us this address will never work again — so it is forgotten rather
 * than retried forever.
 */
export async function pushToUser(
  userId: string,
  message: PushMessage,
): Promise<PushOutcome> {
  if (!arm()) {
    return { sent: 0, failed: 0, detail: "Alerts to phones are not set up yet." };
  }

  const devices = await devicesForUser(userId);
  if (devices.length === 0) {
    return { sent: 0, failed: 0, detail: "No phone has alerts switched on." };
  }

  const payload = JSON.stringify(message);
  let sent = 0;
  let failed = 0;
  let detail = "";

  await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: d.endpoint,
            keys: { p256dh: d.p256dh, auth: d.auth },
          },
          payload,
          { TTL: 60 * 60 * 24 },
        );
        sent++;
        await markDeviceUsed(d.endpoint);
      } catch (err) {
        failed++;
        const status =
          typeof err === "object" && err !== null && "statusCode" in err
            ? Number((err as { statusCode: unknown }).statusCode)
            : 0;
        if (status === 404 || status === 410) {
          await forgetDevice(d.endpoint);
          detail = "One phone no longer accepts alerts and was removed.";
        } else {
          // Never repeat back what the library said (Rules §1.1c).
          await markDeviceFailed(d.endpoint, `send failed (${status || "no reply"})`);
          detail = "An alert could not be delivered to one phone.";
        }
      }
    }),
  );

  return { sent, failed, detail };
}
