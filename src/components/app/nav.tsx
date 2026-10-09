"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  Package,
  ShoppingCart,
  Truck,
  ReceiptText,
  BarChart3,
  Settings,
  Receipt,
  CalendarClock,
  CalendarCheck,
  Users,
  Stethoscope,
  FlaskConical,
  HandCoins,
  Banknote,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "@/lib/repos/users";
import type { ModuleFlags } from "@/lib/repos/company";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /**
   * Only with the pharmacy on. Stock is counted for what is sold; a clinic
   * that only uses what it buys keeps no stock (C-035).
   */
  pharmacyOnly?: boolean;
}

/**
 * Nav is grouped when both modules are on and flat when only one is, so a
 * pharmacy-only install looks exactly like it did in v1 (Design.md §3).
 * Group membership is presentation only — the real boundary is requireModule
 * on the server.
 */
interface NavGroup {
  /**
   * null = ungrouped, always shown. "supplies" is shown with either module:
   * a clinic buys materials from suppliers too, without selling medicine.
   */
  module: "clinic" | "pharmacy" | "supplies" | null;
  label?: string;
  /**
   * How many tiles sit side by side when the menu is open. Two is the default
   * and what the sidebar is laid out for; the first block stays at one because
   * Dashboard and New bill are the two things reached most often and a
   * full-width row is a bigger target than half of one.
   */
  columns?: 1 | 2;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    module: null,
    columns: 1,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/billing", label: "New bill", icon: Receipt },
    ],
  },
  {
    module: "clinic",
    label: "Clinic",
    items: [
      { href: "/visits/today", label: "Today", icon: CalendarClock },
      { href: "/patients", label: "Patients", icon: Users },
      { href: "/visits", label: "Visits", icon: Stethoscope },
      { href: "/doctors", label: "Doctors", icon: CalendarCheck },
      { href: "/lab", label: "Laboratory", icon: FlaskConical },
    ],
  },
  {
    // Called "Supplies" on a clinic with no pharmacy (see groupLabel).
    module: "supplies",
    label: "Pharmacy",
    items: [
      { href: "/stock", label: "Stock", icon: Boxes, pharmacyOnly: true },
      { href: "/items", label: "Items", icon: Package, adminOnly: true },
      { href: "/purchases", label: "Purchases", icon: ShoppingCart, adminOnly: true },
      { href: "/suppliers", label: "Suppliers", icon: Truck, adminOnly: true },
    ],
  },
  {
    module: null,
    items: [
      { href: "/bills", label: "Bills", icon: ReceiptText },
      // Medicine and services both go on dues, so it sits with Bills rather
      // than inside either module's group.
      { href: "/dues", label: "Dues", icon: HandCoins },
      // What the clinic owes suppliers and laboratories — the other side of
      // Dues, so it sits beside it. Owner only, like Suppliers.
      { href: "/payables", label: "Payables", icon: Banknote, adminOnly: true },
      // Staff and what they are paid each month (C-037). Owner only.
      { href: "/salaries", label: "Salaries", icon: WalletCards, adminOnly: true },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/settings/company", label: "Settings", icon: Settings, adminOnly: true },
    ],
  },
];

export function Nav({
  role,
  modules,
  collapsed = false,
}: {
  role: Role;
  modules: ModuleFlags;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  const groupOn = (m: NavGroup["module"]) =>
    m === null ||
    (m === "supplies" ? modules.pharmacy || modules.clinic : modules[m]);

  const visible = GROUPS.map((g) => ({
    ...g,
    label:
      g.module === "supplies" && !modules.pharmacy ? "Supplies" : g.label,
    items: g.items.filter(
      (i) =>
        (!i.adminOnly || role === "admin") &&
        (!i.pharmacyOnly || modules.pharmacy) &&
        groupOn(g.module),
    ),
  })).filter((g) => g.items.length > 0);

  // Labels only earn their place when more than one module's group is showing.
  const labelledGroups = visible.filter((g) => g.module !== null).length;
  const showLabels = labelledGroups > 1;

  return (
    <nav className="flex flex-col gap-1">
      {visible.map((group, gi) => {
        // Collapsed is icons only at 68px wide, where a second column would
        // leave nothing to hit.
        const twoUp = !collapsed && (group.columns ?? 2) === 2;
        return (
        <div key={group.module ?? `plain-${gi}`} className="flex flex-col gap-1">
          {/* An unlabelled block after a labelled one needs a line of its own,
              or Bills and Dues read as though they belong to Pharmacy. The
              first block needs none — nothing is above it. */}
          {group.module === null && gi > 0 && (
            <div className="my-2 border-t border-cream-50/15" />
          )}
          {group.module !== null &&
            showLabels &&
            (collapsed ? (
              <div className="my-1.5 border-t border-cream-50/15" />
            ) : (
              <div
                className={cn(
                  "mt-3 px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]",
                  group.module === "clinic"
                    ? "text-clinic-150"
                    : "text-sage-300",
                )}
              >
                {group.label}
              </div>
            ))}

          <div
            className={cn(
              "grid gap-1",
              twoUp ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            {group.items.map((item, ii) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              // An odd one left at the end takes the whole row rather than
              // sitting in a half-empty one — which is also what gives
              // "Laboratory" the width its name needs.
              const spans =
                twoUp &&
                group.items.length % 2 === 1 &&
                ii === group.items.length - 1;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  // In two columns a long name can run out of room, so it is
                  // clipped rather than allowed to wrap the tile to two lines.
                  // The title puts the whole name back within reach.
                  title={collapsed || twoUp ? item.label : undefined}
                  className={cn(
                    "flex items-center rounded-[8px] py-2 transition-colors",
                    collapsed
                      ? "justify-center gap-3 px-2 text-[14px]"
                      : twoUp
                        ? "gap-1.5 px-2 text-[13px]"
                        : "gap-3 px-3 text-[14px]",
                    spans && "col-span-2",
                    active
                      ? "bg-sage-700 text-cream-50"
                      : "text-cream-50/70 hover:bg-sage-700/40 hover:text-cream-50",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {!collapsed && (
                    <span className="min-w-0 truncate">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
        );
      })}
    </nav>
  );
}
