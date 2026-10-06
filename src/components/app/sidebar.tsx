"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { clearCachesOnLogout } from "@/offline/catalog-cache";
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Nav } from "@/components/app/nav";
import { AppLogo, AppMark } from "@/components/ui/wordmark";
import { PinSwitch, type SwitchableUser } from "@/components/app/pin-switch";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/repos/users";
import type { ModuleFlags } from "@/lib/repos/company";

const STORAGE_KEY = "clinicnp:nav-collapsed";

export function Sidebar({
  user,
  switchable,
  appName,
  modules,
}: {
  user: { name: string; role: Role };
  switchable: SwitchableUser[];
  appName: string;
  modules: ModuleFlags;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);

  // Load the saved preference after mount (avoids an SSR/client mismatch).
  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  /**
   * On a phone the menu starts as icons only. A 232px menu on a 390px screen
   * leaves 158px for the day's takings, which is not a screen anybody can read
   * — and the owner checking the day close on their phone is a real thing this
   * product is for. The width preference still belongs to the person: opening
   * it here works, it just is not where a narrow screen starts.
   */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      setNarrow(mq.matches);
      if (mq.matches) setCollapsed(true);
      else setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      // A phone's choice is for this screen only; it does not become the
      // preference that a desktop then inherits.
      if (!narrow) localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col bg-sage-900 py-4 text-cream-50 transition-[width] duration-200",
        collapsed ? "w-[68px] px-2" : "w-[232px] px-3",
      )}
    >
      <div
        className={cn(
          "flex items-center pb-4",
          collapsed ? "flex-col gap-3 px-0" : "justify-between px-2 pt-1",
        )}
      >
        {collapsed ? (
          <AppMark name={appName} />
        ) : (
          <AppLogo name={appName} className="pl-1" />
        )}
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          title={collapsed ? "Expand menu" : "Collapse menu"}
          className="rounded-[8px] p-1.5 text-cream-50/60 hover:bg-sage-700/40 hover:text-cream-50"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* The menu is the only part that scrolls. The wordmark stays at the top
          and the person's name and Sign out stay at the bottom, because those
          are what somebody reaches for on a shared counter machine. `min-h-0`
          is what makes it work at all: a flex child will not shrink below its
          content without it, so the list would otherwise push the footer off
          the bottom of a short screen and take itself with it. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Nav role={user.role} modules={modules} collapsed={collapsed} />
      </div>

      <div className="mt-auto flex flex-col gap-1 border-t border-sage-700/50 pt-3">
        {!collapsed && (
          <div className="px-2 pb-1">
            <div className="text-[14px] font-medium">{user.name}</div>
            <div className="text-[12px] text-cream-50/60">
              {user.role === "admin" ? strings.roleAdmin : strings.roleStaff}
            </div>
          </div>
        )}
        {switchable.length > 0 && !collapsed && <PinSwitch users={switchable} />}
        <button
          onClick={() => {
            // Caches go; the queues stay. A bill or a registration that has
            // not reached the server yet is work nobody else has a copy of.
            void clearCachesOnLogout()
              .catch(() => {})
              .finally(() => signOut({ redirectTo: "/login" }));
          }}
          title={collapsed ? strings.logout : undefined}
          className={cn(
            "flex items-center gap-2 rounded-[8px] py-1.5 text-[13px] text-cream-50/70 hover:bg-sage-700/40 hover:text-cream-50",
            collapsed ? "justify-center px-2" : "px-2",
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && strings.logout}
        </button>
      </div>
    </aside>
  );
}
