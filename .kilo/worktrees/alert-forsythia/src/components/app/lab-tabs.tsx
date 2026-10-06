"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Header } from "@/components/app/header";
import { cn } from "@/lib/cn";
import type { LabStage } from "@/lib/repos/lab";

const TABS: { href: string; label: string; stage: LabStage }[] = [
  { href: "/lab", label: "To collect", stage: "to_collect" },
  { href: "/lab/dispatch", label: "To send", stage: "to_dispatch" },
  { href: "/lab/awaiting", label: "Awaiting report", stage: "awaiting_report" },
  { href: "/lab/reports", label: "Report in", stage: "report_in" },
  { href: "/lab/done", label: "Given out", stage: "done" },
];

export function LabTabs({ counts }: { counts: Record<LabStage, number> }) {
  const pathname = usePathname();
  return (
    <>
      <Header title="Laboratory" />
      <div className="border-b border-line bg-cream-50 px-6">
        <div className="mx-auto flex max-w-[1240px] gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const active =
              pathname === t.href ||
              (t.href !== "/lab" && pathname.startsWith(t.href));
            const count = counts[t.stage];
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[14px]",
                  active
                    ? "border-sage-700 font-semibold text-sage-900"
                    : "border-transparent text-sage-500 hover:text-sage-700",
                )}
              >
                {t.label}
                {count > 0 && t.stage !== "done" ? (
                  <span
                    className={cn(
                      "rounded-[999px] px-1.5 text-[11px] font-semibold",
                      // Only what is actually waiting on somebody is loud.
                      t.stage === "awaiting_report"
                        ? "bg-info-100 text-info-600"
                        : "bg-warn-100 text-warn-600",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
