"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { subscribeOutbox } from "@/offline/outbox";
import { subscribePatientOutbox } from "@/offline/patient-outbox";
import { strings } from "@/lib/strings";

/** Plain-language connectivity + pending-bills status (Rules §1, Design §4). */
export function StatusChip() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [pendingPatients, setPendingPatients] = useState(0);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const unsub = subscribeOutbox(setPending);
    const unsubPatients = subscribePatientOutbox(setPendingPatients);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      unsub();
      unsubPatients();
    };
  }, []);

  // Two queues, one message: what the person at the counter needs to know is
  // how much work has not left this machine, not which list it is on.
  const waiting = pending + pendingPatients;

  function what(): string {
    const parts: string[] = [];
    if (pending > 0) parts.push(`${pending} ${pending === 1 ? "bill" : "bills"}`);
    if (pendingPatients > 0) {
      parts.push(
        `${pendingPatients} ${pendingPatients === 1 ? "registration" : "registrations"}`,
      );
    }
    return parts.join(" and ");
  }

  if (!online) {
    return (
      <span className="flex items-center gap-1.5 rounded-[999px] bg-info-100 px-3 py-1.5 text-[13px] text-info-600">
        <WifiOff className="h-4 w-4" />
        {waiting > 0 ? `Offline — ${what()} waiting` : strings.offline}
      </span>
    );
  }
  if (waiting > 0) {
    return (
      <span className="flex items-center gap-1.5 rounded-[999px] bg-info-100 px-3 py-1.5 text-[13px] text-info-600">
        <RefreshCw className="h-4 w-4 animate-spin" />
        {`Sending ${what()}…`}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-sage-500">
      <Wifi className="h-4 w-4" />
      {strings.online}
    </span>
  );
}
