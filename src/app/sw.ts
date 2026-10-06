/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkOnly } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * The counter has to open with no connection at all — that is the whole point
 * of the outbox behind it. Everything else can want the network.
 *
 * Two rules matter here and both are about not lying to the person using it:
 *
 *  1. Nothing that writes is ever served from a cache. A queued bill or
 *     registration must reach the real server or stay in its queue; a cached
 *     "OK" would silently swallow a day's work.
 *
 *  2. A patient's file is never cached. The bytes are served through an
 *     authenticated route and must not sit in a browser cache on a shared
 *     counter machine after the person has signed out (Rules §1.13).
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Anything that changes something on the server, and the file route.
      matcher: ({ request, url }) =>
        request.method !== "GET" ||
        url.pathname.startsWith("/api/files/") ||
        url.pathname.startsWith("/api/backup/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        // With no connection and no cached copy of the page asked for, this
        // is where a navigation lands. It has to be a static page so it can
        // come out of the precache with nothing else available — the counter
        // itself is server-rendered and only works offline once visited.
        url: "/offline",
        matcher: ({ request }) => request.mode === "navigate",
      },
    ],
  },
});

serwist.addEventListeners();

/**
 * Alerts on a doctor's phone.
 *
 * A doctor is not sitting at the counter. They are in a car, or at another
 * hospital, and the only way they find out somebody has been booked in with
 * them at four o'clock is if their phone says so. That is what these two
 * listeners are for, and they are the whole of it: show what the server sent,
 * and when it is tapped, open the list.
 */
interface AlertPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

self.addEventListener("push", (event) => {
  let data: AlertPayload = {};
  try {
    data = (event.data?.json() as AlertPayload) ?? {};
  } catch {
    // Not something we sent, or it arrived mangled. Still show something —
    // a silent alert is worse than a vague one, because the doctor never
    // learns there was anything to look at.
    data = {};
  }

  const title = data.title || "Something new for you";
  const body = data.body || "Open the app to see what changed.";
  const url = data.url || "/my/schedule";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      // The same booking alerting twice replaces itself rather than stacking.
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
      // A booking is worth a buzz; the phone still honours its own quiet hours.
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data as { url?: string } | undefined)?.url ??
    "/my/schedule";

  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Already open somewhere? Bring that window forward rather than piling
      // up a new one every time an alert is tapped.
      for (const client of open) {
        const url = new URL(client.url);
        if (url.pathname.startsWith("/my")) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
