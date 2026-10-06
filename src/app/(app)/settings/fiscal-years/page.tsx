import { requireAdmin } from "@/lib/session";
import { listFiscalYears } from "@/lib/repos/fiscal";
import { fiscalYearFromLabel, nextFiscalYear } from "@/lib/bs";
import { FiscalYearsPanel } from "@/components/app/fiscal-years-panel";
import { backupStorage, keepsBackups } from "@/lib/backups";

export const metadata = { title: "Fiscal years" };

export default async function FiscalYearsPage() {
  await requireAdmin();
  const years = await listFiscalYears();
  const open = years.find((y) => y.status === "open") ?? null;
  const backupsKept = keepsBackups(await backupStorage());

  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <FiscalYearsPanel
        years={years.map((y) => ({
          id: y.id,
          label: y.bsLabel,
          status: y.status,
          closedAt: y.closedAt,
          nextInvoiceNo: y.nextInvoiceNo,
        }))}
        openLabel={open?.bsLabel ?? null}
        nextLabel={
          open ? nextFiscalYear(fiscalYearFromLabel(open.bsLabel)).label : null
        }
        backupsKept={backupsKept}
      />
    </main>
  );
}
