import { listFiscalYears } from "@/lib/repos/fiscal";
import { FiscalYearSelector } from "@/components/app/fiscal-year-selector";
import { ClosedYearBanner } from "@/components/app/closed-year-banner";
import type { Role } from "@/lib/repos/users";

export interface ResolvedYear {
  label: string;
  id: number | null;
  isClosed: boolean;
}

/**
 * Resolves which fiscal year a register or report is being read in.
 * `?fy=2082/83` selects a year; no parameter means the open one.
 */
export async function resolveFiscalYear(fyParam?: string): Promise<ResolvedYear> {
  const years = await listFiscalYears();
  const open = years.find((y) => y.status === "open") ?? null;
  const picked = fyParam ? years.find((y) => y.bsLabel === fyParam) : null;
  const chosen = picked ?? open;
  return {
    label: chosen?.bsLabel ?? "",
    id: chosen?.id ?? null,
    isClosed: chosen ? chosen.status === "closed" : false,
  };
}

/**
 * Header-right selector plus the closed-year banner. Hidden entirely for
 * counter staff — the year filter is an Admin/Accountant tool (PRD §4A.1).
 */
export async function FiscalYearBar({
  role,
  current,
}: {
  role: Role;
  current: string;
}) {
  if (role !== "admin" && role !== "accountant") return null;
  const years = await listFiscalYears();
  if (years.length === 0) return null;

  return (
    <FiscalYearSelector
      years={years.map((y) => ({ label: y.bsLabel, status: y.status }))}
      current={current}
    />
  );
}

export { ClosedYearBanner };
