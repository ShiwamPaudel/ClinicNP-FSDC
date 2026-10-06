"use client";

/**
 * update-recovery.tsx — what happens when a new version is deployed while
 * somebody has the app open.
 *
 * The service worker holds a list of the exact files the old version was built
 * from. A deploy replaces those files with new ones under new names, so a page
 * that has been sitting open all morning asks for a file that is no longer
 * there, and a piece of the screen fails to load. On a counter that looks like
 * the product breaking, at the worst possible moment.
 *
 * So: when a piece of the app fails to load, reload the page once. Once, and
 * only once per session — a reload loop would be far worse than the problem it
 * is fixing, and if a second failure happens the fault is not a stale version
 * and reloading will not mend it.
 *
 * Nothing in the outbox is at risk either way: the queues live in IndexedDB and
 * survive a reload, which is exactly why they are there.
 */
import { useEffect } from "react";

const TRIED = "clinicnp:reloaded-after-update";

export function UpdateRecovery() {
  useEffect(() => {
    function looksLikeStaleBuild(message: string): boolean {
      return (
        /Loading chunk .* failed/i.test(message) ||
        /Failed to fetch dynamically imported module/i.test(message) ||
        /Importing a module script failed/i.test(message)
      );
    }

    function recover(message: string) {
      if (!looksLikeStaleBuild(message)) return;
      try {
        if (sessionStorage.getItem(TRIED)) return;
        sessionStorage.setItem(TRIED, "1");
      } catch {
        // A browser that will not remember cannot be reloaded safely, because
        // there would be nothing to stop it looping. Leave it alone.
        return;
      }
      window.location.reload();
    }

    const onError = (e: ErrorEvent) => recover(e.message ?? "");
    const onRejection = (e: PromiseRejectionEvent) =>
      recover(
        e.reason instanceof Error ? e.reason.message : String(e.reason ?? ""),
      );

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // A successful load means this version is fine, so the next stale-build
    // failure is allowed its own single reload.
    const clear = setTimeout(() => {
      try {
        sessionStorage.removeItem(TRIED);
      } catch {
        // nothing to clear
      }
    }, 10_000);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      clearTimeout(clear);
    };
  }, []);

  return null;
}
