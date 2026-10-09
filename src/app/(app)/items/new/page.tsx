import { requireAdmin } from "@/lib/session";
import { requireModulePage, getModules } from "@/lib/modules";
import { buysForUse } from "@/lib/supplies";
import { listSuppliers } from "@/lib/repos/suppliers";
import { PageShell } from "@/components/app/page-shell";
import { ItemForm } from "@/components/app/item-form";

export default async function NewItemPage() {
  await requireAdmin();
  await requireModulePage("supplies");
  const [suppliers, modules] = await Promise.all([listSuppliers(), getModules()]);
  return (
    <PageShell title="Add item">
      <ItemForm suppliers={suppliers} forUse={buysForUse(modules)} />
    </PageShell>
  );
}
