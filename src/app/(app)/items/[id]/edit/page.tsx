import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
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
  await requireModulePage("pharmacy");
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();
  const suppliers = await listSuppliers();
  return (
    <PageShell title={`Edit ${item.brandName}`}>
      <ItemForm item={item} suppliers={suppliers} />
    </PageShell>
  );
}
