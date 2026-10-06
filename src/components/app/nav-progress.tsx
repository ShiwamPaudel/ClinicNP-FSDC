"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Top navigation progress bar. App Router blocks on the server render of the
 * next page, so a tab click can feel dead for a beat. This paints a 2px bar
 * the instant a same-app link is clicked and completes it once the new route
 * has rendered (detected via a pathname change). No dependency, no polling.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const prevPath = useRef(pathname);

  // Start on any click that will navigate within the app.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/") || a.target === "_blank") return;
      if (a.hasAttribute("download")) return;
      // Ignore in-page anchors and navigations to the current path.
      const url = new URL(href, location.href);
      if (url.pathname === location.pathname) return;
      setState("loading");
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The new route has rendered when the pathname actually changes.
  useEffect(() => {
    if (pathname !== prevPath.current) {
      prevPath.current = pathname;
      setState("done");
      const t = setTimeout(() => setState("idle"), 500);
      return () => clearTimeout(t);
    }
  }, [pathname]);

  if (state === "idle") return null;
  return <div id="nav-progress" data-state={state} aria-hidden="true" />;
}
