import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { requireModulePage, getModules } from "@/lib/modules";
import { buysForUse } from "@/lib/supplies";
import { listItems } from "@/lib/repos/items";
import { listSuppliers } from "@/lib/repos/suppliers";
import { PageShell } from "@/components/app/page-shell";
import { PurchaseForm } from "@/components/app/purchase-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PackagePlus } from "lucide-react";

export default async function NewPurchasePage() {
  await requireAdmin();
  await requireModulePage("supplies");
  const [items, suppliers, modules] = await Promise.all([
    listItems(),
    listSuppliers(),
    getModules(),
  ]);

  if (items.length === 0 || suppliers.length === 0) {
    return (
      <PageShell title="New purchase">
        <EmptyState
          icon={PackagePlus}
          message={
            items.length === 0
              ? "Add at least one item before recording a purchase."
              : "Add a supplier before recording a purchase."
          }
          action={
            <Link href={items.length === 0 ? "/items/new" : "/suppliers"}>
              <Button>{items.length === 0 ? "Add item" : "Add supplier"}</Button>
            </Link>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="New purchase">
      <PurchaseForm items={items} suppliers={suppliers} forUse={buysForUse(modules)} />
    </PageShell>
  );
}
