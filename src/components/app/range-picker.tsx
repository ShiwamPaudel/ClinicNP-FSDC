"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

const PRESETS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "fy", label: "This fiscal year" },
];

export function RangePicker({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function pick(key: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("preset", key);
    sp.delete("from");
    sp.delete("to");
    router.push(`${pathname}?${sp.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => pick(p.key)}
          className={cn(
            "rounded-[999px] border px-3 py-1.5 text-[13px] transition-colors",
            current === p.key
              ? "border-sage-700 bg-sage-700 text-cream-50"
              : "border-line bg-cream-50 text-sage-700 hover:bg-cream-200",
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
