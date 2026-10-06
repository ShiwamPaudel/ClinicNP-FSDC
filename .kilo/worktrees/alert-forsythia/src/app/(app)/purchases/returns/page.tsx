import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listSuppliers } from "@/lib/repos/suppliers";
import { listItems } from "@/lib/repos/items";
import { returnableBatches } from "@/lib/repos/batches";
import { PageShell } from "@/components/app/page-shell";
import {
  PurchaseReturnForm,
  type ReturnBatch,
} from "@/components/app/purchase-return-form";

export default async function PurchaseReturnPage() {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const [suppliers, items, batches] = await Promise.all([
    listSuppliers(),
    listItems(true),
    returnableBatches(),
  ]);

  const unitsByItem = new Map(items.map((i) => [i.id, i.units]));

  const rows: ReturnBatch[] = batches.map((b) => {
    const units = unitsByItem.get(b.itemId) ?? [];
    const base = units.find((u) => u.level === 0);
    return {
      id: b.id,
      itemId: b.itemId,
      brandName: b.brandName,
      batchNo: b.batchNo,
      expiryDateAd: b.expiryDateAd,
      supplierId: b.supplierId,
      remainingBaseQty: b.remainingBaseQty,
      costPaisaPerBase: b.costPaisaPerBase,
      baseUnitName: base?.name ?? "unit",
      units: units.map((u) => ({
        level: u.level,
        name: u.name,
        factorToBase: u.factorToBase,
      })),
    };
  });

  return (
    <PageShell title="Purchase return">
      <PurchaseReturnForm suppliers={suppliers} batches={rows} />
    </PageShell>
  );
}
