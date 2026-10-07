"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Header } from "@/components/app/header";
import { cn } from "@/lib/cn";

export const STOCK_TABS = [
  { href: "/stock", label: "Current" },
  { href: "/stock/low", label: "Low stock" },
  { href: "/stock/near-expiry", label: "Near expiry" },
  { href: "/stock/expired", label: "Expired" },
  { href: "/stock/out", label: "Stock out" },
  { href: "/stock/opening", label: "Opening stock" },
  { href: "/stock/shelves", label: "Shelves" },
];

/** The tab bar itself. Rendered through StockTabs, which knows the modules. */
export function StockTabsNav({
  counts,
  showShelves,
}: {
  counts?: Record<string, number>;
  showShelves: boolean;
}) {
  const pathname = usePathname();
  const tabs = STOCK_TABS.filter(
    (t) => showShelves || t.href !== "/stock/shelves",
  );
  return (
    <>
      <Header title="Stock" />
      <div className="border-b border-line bg-cream-50 px-6">
        <div className="mx-auto flex max-w-[1240px] gap-1">
          {tabs.map((t) => {
            const active =
              pathname === t.href ||
              (t.href !== "/stock" && pathname.startsWith(t.href));
            const count = counts?.[t.href];
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3 py-2.5 text-[14px]",
                  active
                    ? "border-sage-700 font-semibold text-sage-900"
                    : "border-transparent text-sage-500 hover:text-sage-700",
                )}
              >
                {t.label}
                {count ? (
                  <span className="rounded-[999px] bg-warn-100 px-1.5 text-[11px] font-semibold text-warn-600">
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
