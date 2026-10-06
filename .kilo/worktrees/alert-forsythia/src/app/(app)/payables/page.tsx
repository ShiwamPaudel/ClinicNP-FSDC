import { requireAdmin } from "@/lib/session";
import { getModules } from "@/lib/modules";
import {
  supplierPayables,
  labPayables,
  recentPayments,
} from "@/lib/repos/payables";
import { PageShell } from "@/components/app/page-shell";
import { PayablesView } from "@/components/app/payables-view";

export const metadata = { title: "Payables" };

/**
 * Payables — what the clinic owes suppliers and laboratories, paying it, and
 * undoing a payment typed wrong. The mirror of Dues.
 *
 * Not behind either module as a page, like Dues; each half only shows while
 * its own module is on, because suppliers are pharmacy and laboratories are
 * clinic. Owner only, like Suppliers and the laboratory statements it draws on.
 */
export default async function PayablesPage() {
  await requireAdmin();
  const modules = await getModules();
  const [suppliers, labs, payments] = await Promise.all([
    modules.pharmacy ? supplierPayables() : Promise.resolve([]),
    modules.clinic ? labPayables() : Promise.resolve([]),
    recentPayments({ suppliers: modules.pharmacy, labs: modules.clinic }),
  ]);

  return (
    <PageShell title="Payables">
      <PayablesView
        showSuppliers={modules.pharmacy}
        showLabs={modules.clinic}
        suppliers={suppliers}
        labs={labs}
        payments={payments}
      />
    </PageShell>
  );
}
