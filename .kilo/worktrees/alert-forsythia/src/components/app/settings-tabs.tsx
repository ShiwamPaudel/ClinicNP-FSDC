"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Header } from "@/components/app/header";
import { cn } from "@/lib/cn";

// Settings tabs. A tab marked with a module appears only when that module is
// on — a pharmacy-only install should not be told about doctors it has none
// of, and a clinic-only one has no shelves of medicine to draw.
const TABS: {
  href: string;
  label: string;
  clinic?: boolean;
  pharmacy?: boolean;
}[] = [
  { href: "/settings/company", label: "Company" },
  { href: "/settings/modules", label: "Modules" },
  { href: "/settings/services", label: "Services", clinic: true },
  { href: "/settings/doctors", label: "Doctors", clinic: true },
  { href: "/settings/lab-partners", label: "Lab partners", clinic: true },
  { href: "/settings/racks", label: "Shop layout", pharmacy: true },
  { href: "/settings/fiscal-years", label: "Fiscal years" },
  { href: "/settings/users", label: "Users" },
  { href: "/settings/backup", label: "Backup" },
  { href: "/settings/audit", label: "Audit log" },
];

export function SettingsTabs({
  clinicOn,
  pharmacyOn,
}: {
  clinicOn: boolean;
  pharmacyOn: boolean;
}) {
  const pathname = usePathname();
  return (
    <>
      <Header title="Settings" />
      <div className="border-b border-line bg-cream-50 px-6">
        <div className="mx-auto flex max-w-[1240px] gap-1">
          {TABS.filter(
            (t) => (clinicOn || !t.clinic) && (pharmacyOn || !t.pharmacy),
          ).map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "border-b-2 px-3 py-2.5 text-[14px]",
                  active
                    ? "border-sage-700 font-semibold text-sage-900"
                    : "border-transparent text-sage-500 hover:text-sage-700",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
