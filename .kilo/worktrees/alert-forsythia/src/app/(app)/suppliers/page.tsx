import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listSuppliers, supplierBalance } from "@/lib/repos/suppliers";
import { PageShell } from "@/components/app/page-shell";
import {
  SuppliersManager,
  type SupplierRow,
} from "@/components/app/suppliers-manager";

export default async function SuppliersPage() {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const suppliers = await listSuppliers(true);
  const rows: SupplierRow[] = await Promise.all(
    suppliers.map(async (s) => ({
      ...s,
      balancePaisa: await supplierBalance(s.id),
    })),
  );
  return (
    <PageShell title="Suppliers">
      <SuppliersManager initial={rows} />
    </PageShell>
  );
}
