import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { requireModulePage, getModules } from "@/lib/modules";
import { buysForUse } from "@/lib/supplies";
import { getItem } from "@/lib/repos/items";
import { listSuppliers } from "@/lib/repos/suppliers";
import { PageShell } from "@/components/app/page-shell";
import { ItemForm } from "@/components/app/item-form";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  await requireModulePage("supplies");
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();
  const [suppliers, modules] = await Promise.all([listSuppliers(), getModules()]);
  return (
    <PageShell title={`Edit ${item.brandName}`}>
      <ItemForm item={item} suppliers={suppliers} forUse={buysForUse(modules)} />
    </PageShell>
  );
}
