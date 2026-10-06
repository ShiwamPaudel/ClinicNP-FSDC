"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Keys that work on every back-office page. Today that is one: F2 opens New
 * bill, as the counter's own shortcut sheet has always promised and as nothing
 * outside the counter used to do (C-031).
 *
 * Leaving a page someone has been typing into would throw that away without a
 * word — a purchase half-entered is twenty minutes of work — so F2 asks first
 * whenever anything has been typed on this page since it was opened. Typing in
 * a search box does not count: there is nothing to lose in a search.
 */
export function GlobalShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const typedHere = useRef(false);

  // A new page starts clean.
  useEffect(() => {
    typedHere.current = false;
  }, [pathname]);

  useEffect(() => {
    function onInput(e: Event) {
      const el = e.target as HTMLInputElement | null;
      if (!el) return;
      const label = `${el.type ?? ""} ${el.placeholder ?? ""} ${el.getAttribute?.("aria-label") ?? ""}`;
      if (/search/i.test(label)) return;
      typedHere.current = true;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "F2" || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (
        typedHere.current &&
        !window.confirm(
          "Open New bill? What you have typed on this page and not saved will be lost.",
        )
      ) {
        return;
      }
      router.push("/billing");
    }
    document.addEventListener("input", onInput, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("input", onInput, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [router]);

  return null;
}
