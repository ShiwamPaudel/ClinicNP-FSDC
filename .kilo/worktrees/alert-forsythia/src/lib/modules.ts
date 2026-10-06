/**
 * modules.ts — the module boundary (PRD §3.1, Architecture §2.2).
 *
 * Modules are enforced on the SERVER. Hiding nav is cosmetics; this is the
 * boundary. A disabled module's URL returns 404 and never explains why — a 403
 * would confirm that the data exists (D-030).
 *
 * Note on middleware: Architecture §2.2 suggests middleware should also 404
 * disabled prefixes, but middleware runs on the edge and D-005 deliberately
 * keeps libSQL out of the edge runtime, so it cannot read these flags. Every
 * page, route handler and server action calls a guard from this file instead;
 * that is the real boundary, and it satisfies the same acceptance test.
 */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getModuleFlags, type ModuleFlags } from "@/lib/repos/company";
import { appNameFor } from "@/lib/app-name";

export type ModuleName = "pharmacy" | "clinic";
export type { ModuleFlags };

/**
 * The module flags for this request. `cache()` de-duplicates the read across
 * every component and guard in a single render — never query the flags ad hoc.
 */
export const getModules = cache(async (): Promise<ModuleFlags> => {
  return getModuleFlags();
});

/** The derived product name for this request (D-025). */
export async function getAppName(): Promise<string> {
  return appNameFor(await getModules());
}

/** Thrown by server actions and route handlers when a module is off. */
export class ModuleDisabledError extends Error {
  readonly code = "module_disabled" as const;
  /** Deliberately says nothing about which module, or that one exists. */
  readonly userMessage = "That page isn't available.";
  constructor() {
    super("module disabled");
    this.name = "ModuleDisabledError";
  }
}

/**
 * Guard for PAGES and LAYOUTS: renders the 404 page when the module is off.
 * `notFound()` throws, so nothing after this line runs.
 */
export async function requireModulePage(module: ModuleName): Promise<void> {
  const modules = await getModules();
  if (!modules[module]) notFound();
}

/**
 * Guard for SERVER ACTIONS and ROUTE HANDLERS. Throws ModuleDisabledError,
 * which the caller maps to a 404 response or a plain-language action result.
 */
export async function requireModule(module: ModuleName): Promise<void> {
  const modules = await getModules();
  if (!modules[module]) throw new ModuleDisabledError();
}

/** At least one module must stay on (PRD §3.1). */
export const LAST_MODULE_MESSAGE =
  "At least one part of the system has to stay switched on.";

export function isLastModuleOn(next: ModuleFlags): boolean {
  return !next.pharmacy && !next.clinic;
}
