"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { CalendarDays, UserRound, WifiOff } from "lucide-react";
import { AppMark } from "@/components/ui/wordmark";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/my/schedule", label: "Consultations", icon: CalendarDays },
  { href: "/my/profile", label: "You", icon: UserRound },
];

/**
 * One column, a bar at the top and a bar at the bottom.
 *
 * The bottom bar is where a thumb reaches without the hand moving, which is
 * the only place a control belongs on a phone somebody is holding while
 * standing up.
 */
export function DoctorShell({
  name,
  appName,
  children,
}: {
  name: string;
  appName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [online, setOnline] = useState(true);

  useEffect(() => {
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
    <div className="flex min-h-[100dvh] flex-col bg-cream-100">
      <header
        className="sticky top-0 z-30 flex items-center gap-3 bg-sage-900 px-4 text-cream-50"
        style={{
          paddingTop: "max(12px, env(safe-area-inset-top))",
          paddingBottom: "12px",
        }}
      >
        <AppMark name={appName} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{name}</div>
          <div className="text-[12px] text-cream-50/60">{appName}</div>
        </div>
        {!online && (
          <span className="flex items-center gap-1.5 rounded-[999px] bg-cream-50/15 px-2.5 py-1 text-[12px]">
            <WifiOff className="h-3.5 w-3.5" />
            {strings.offline}
          </span>
        )}
        <button
          onClick={() => signOut({ redirectTo: "/login" })}
          className="rounded-[8px] px-2 py-1.5 text-[13px] text-cream-50/70 hover:bg-sage-700/50 hover:text-cream-50"
        >
          {strings.logout}
        </button>
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-cream-50"
        style={{ paddingBottom: "max(6px, env(safe-area-inset-bottom))" }}
      >
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2.5 text-[12px] font-medium",
                active ? "text-sage-900" : "text-sage-500",
              )}
            >
              <Icon
                className={cn("h-6 w-6", active && "text-sage-700")}
                strokeWidth={active ? 2 : 1.6}
              />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
