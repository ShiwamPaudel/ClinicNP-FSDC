"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * use-phone-alerts — turning alerts on for this one phone.
 *
 * "This one phone" is the whole idea. A doctor with a phone and a tablet turns
 * them on twice, and turning them off on the tablet leaves the phone alone.
 * Nothing here is remembered by the browser beyond what the browser itself
 * holds, so the truth is always read back from it rather than from a flag we
 * set and hope stayed right.
 */
export type AlertState =
  | "checking"
  | "unsupported"
  | "blocked"
  | "off"
  | "on";

export interface PhoneAlerts {
  state: AlertState;
  busy: boolean;
  /** Turn them on for this phone. Resolves to a plain line, or empty on success. */
  enable: () => Promise<string>;
  disable: () => Promise<string>;
  /** Ask the server to send one, so the doctor sees it land. */
  test: () => Promise<{ ok: boolean; message: string }>;
}

/** The key arrives as text and the browser wants bytes. */
function toBytes(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function keyToText(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function usePhoneAlerts(publicKey: string): PhoneAlerts {
  const [state, setState] = useState<AlertState>("checking");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported() || !publicKey) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("blocked");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        // Nothing is installed to receive an alert yet. On a fresh install this
        // sorts itself out a moment later; on a browser that never installs it,
        // it never will.
        setState("unsupported");
        return;
      }
      const existing = await reg.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    } catch {
      setState("unsupported");
    }
  }, [publicKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async (): Promise<string> => {
    if (!supported() || !publicKey) return "This phone can't show alerts from here.";
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return permission === "denied"
          ? "This phone has been told not to show alerts from here. Allow them in the browser settings, then try again."
          : "Alerts were not turned on.";
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          // Every alert this sends shows something the doctor can see. The
          // browser insists on the promise and it is one worth keeping.
          userVisibleOnly: true,
          applicationServerKey: toBytes(publicKey) as BufferSource,
        });
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" }, // sweep-ok: a wire header
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh: keyToText(sub.getKey("p256dh")),
          auth: keyToText(sub.getKey("auth")),
          label: navigator.userAgent.slice(0, 120),
        }),
      });
      const body = (await res.json()) as { ok: boolean; userMessage?: string };
      if (!body.ok) {
        setState("off");
        return body.userMessage ?? "Couldn't turn alerts on. Try again.";
      }

      setState("on");
      return "";
    } catch {
      await refresh();
      return "Couldn't turn alerts on. Try again.";
    } finally {
      setBusy(false);
    }
  }, [publicKey, refresh]);

  const disable = useCallback(async (): Promise<string> => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        // Tell the server before the browser forgets the address, or there is
        // nothing left to tell it about.
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" }, // sweep-ok: a wire header
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
      return "";
    } catch {
      await refresh();
      return "Couldn't turn alerts off. Try again.";
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const test = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body = (await res.json()) as { ok: boolean; userMessage?: string };
      return {
        ok: body.ok,
        message: body.userMessage ?? "Sent. It should appear in a moment.",
      };
    } catch {
      return { ok: false, message: "Couldn't send it just now. Try again." };
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, enable, disable, test };
}
