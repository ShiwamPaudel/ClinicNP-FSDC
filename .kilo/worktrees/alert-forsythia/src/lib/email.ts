/**
 * email.ts — sending one plain message to one address.
 *
 * Written against Resend's send call directly rather than pulling in their
 * package: this is one POST with an API key on it, and a dependency that
 * wraps one call is a dependency to keep updated forever (Rules §3).
 *
 * Nothing here throws at the caller, for the same reason nothing in push.ts
 * does: a mail service having a bad afternoon is not a reason a consultation
 * fails to book.
 */
import "server-only";

export interface MailMessage {
  to: string;
  subject: string;
  /** The message as it reads with no styling at all. Always sent. */
  text: string;
  /** The same message laid out. Optional. */
  html?: string;
}

export interface MailOutcome {
  ok: boolean;
  /** One plain line about what happened. Never the service's own words. */
  detail: string;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && senderAddress());
}

/**
 * Who the message comes from. Must be an address on a domain the mail service
 * has been shown to own, or nothing will go out.
 */
export function senderAddress(): string {
  return process.env.MAIL_FROM ?? "";
}

const SEND_URL = "https://api.resend.com/emails";

export async function sendMail(msg: MailMessage): Promise<MailOutcome> {
  if (!msg.to.trim()) {
    return { ok: false, detail: "No email address on file." };
  }
  if (!mailConfigured()) {
    return { ok: false, detail: "Email is not set up yet." };
  }

  try {
    const res = await fetch(SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json", // sweep-ok: a wire header, not a screen
      },
      body: JSON.stringify({
        from: senderAddress(),
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      }),
      // A clinic should never wait on a mail service to finish saving a booking.
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // The service's own wording is written for whoever integrated it, not
      // for anybody using this (Rules §1.1c). It goes to the log, not a screen.
      const body = await res.text().catch(() => "");
      console.error("[email] send refused", res.status, body.slice(0, 300));
      return {
        ok: false,
        detail:
          res.status === 401 || res.status === 403
            ? "Email is set up with the wrong key."
            : "The email could not be sent just now.",
      };
    }

    return { ok: true, detail: "" };
  } catch (err) {
    console.error("[email] send failed", err);
    return { ok: false, detail: "The email could not be sent just now." };
  }
}
