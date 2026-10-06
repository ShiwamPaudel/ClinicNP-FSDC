"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { formatBS, today } from "@/lib/bs";
import { strings } from "@/lib/strings";

/** App header: today's BS date + a plain-language connectivity chip. */
export function Header({ title }: { title: string }) {
  const [online, setOnline] = useState(true);
  const [bsLabel, setBsLabel] = useState("");

  useEffect(() => {
    setBsLabel(formatBS(today(), { form: "long", monthScript: "en" }));
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <header className="flex h-14 items-center justify-between border-b border-line bg-cream-50 px-6">
      <h1 className="text-[18px] font-semibold text-sage-900">{title}</h1>
      <div className="flex items-center gap-4">
        <span className="text-[13px] text-sage-500 tnum">{bsLabel}</span>
        {online ? (
          <span className="flex items-center gap-1.5 text-[13px] text-sage-500">
            <Wifi className="h-4 w-4" />
            {strings.online}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-[999px] bg-info-100 px-2.5 py-1 text-[13px] text-info-600">
            <WifiOff className="h-4 w-4" />
            {strings.offline}
          </span>
        )}
      </div>
    </header>
  );
}
