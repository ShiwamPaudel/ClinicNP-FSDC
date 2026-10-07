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
 * Not behind either module as a page, like Dues. Suppliers show with either
 * module — a clinic buys its materials on credit too — and laboratories only
 * with the clinic. Owner only, like Suppliers and the laboratory statements.
 */
export default async function PayablesPage() {
  await requireAdmin();
  const modules = await getModules();
  // Suppliers are paid by a clinic as much as by a pharmacy: they show with
  // either module. Laboratories are the clinic's alone.
  const suppliersOn = modules.pharmacy || modules.clinic;
  const [suppliers, labs, payments] = await Promise.all([
    suppliersOn ? supplierPayables() : Promise.resolve([]),
    modules.clinic ? labPayables() : Promise.resolve([]),
    recentPayments({ suppliers: suppliersOn, labs: modules.clinic }),
  ]);

  return (
    <PageShell title="Payables">
      <PayablesView
        showSuppliers={suppliersOn}
        showLabs={modules.clinic}
        suppliers={suppliers}
        labs={labs}
        payments={payments}
      />
    </PageShell>
  );
}
