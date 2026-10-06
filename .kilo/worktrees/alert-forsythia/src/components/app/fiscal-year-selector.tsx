"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

export interface FiscalYearOption {
  label: string;
  status: "open" | "closed";
}

/**
 * The fiscal-year selector (Design.md §5). Admin and Accountant only — the
 * counter never sees it. Choosing a year puts `fy` in the address so the whole
 * page, its exports and a shared link all agree on which year is being read.
 */
export function FiscalYearSelector({
  years,
  current,
}: {
  years: FiscalYearOption[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function choose(label: string) {
    const next = new URLSearchParams(params.toString());
    const open = years.find((y) => y.status === "open")?.label;
    if (label === open) next.delete("fy");
    else next.set("fy", label);
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  return (
    <label className="flex items-center gap-2 text-[13px] text-sage-500">
      <span className="sr-only">Fiscal year</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => choose(e.target.value)}
        className="h-9 rounded-[8px] border border-line bg-cream-50 px-2.5 text-[13px] text-sage-900 outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20"
      >
        {years.map((y) => (
          <option key={y.label} value={y.label}>
            {y.label}
            {y.status === "open" ? " · current" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
