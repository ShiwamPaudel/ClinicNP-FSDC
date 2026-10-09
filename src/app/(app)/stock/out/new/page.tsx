import { requireAdmin } from "@/lib/session";
import { requireModulePage, getModules } from "@/lib/modules";
import { listItems } from "@/lib/repos/items";
import { allBatchesWithStock } from "@/lib/repos/batches";
import { listSuppliers } from "@/lib/repos/suppliers";
import { STOCK_OUT_REASONS } from "@/lib/repos/adjustments";
import { adToIso, bsToDbText, today } from "@/lib/bs";
import { StockOutForm } from "@/components/app/stock-out-form";
import { Header } from "@/components/app/header";

export const metadata = { title: "Record stock out" };

export default async function NewStockOutPage() {
  await requireAdmin();
  await requireModulePage("pharmacy");

  const modules = await getModules();
  const [items, batches, suppliers] = await Promise.all([
    listItems(true),
    allBatchesWithStock(),
    listSuppliers(),
  ]);

  // "Used in the clinic" only exists when the clinic module is on (PRD §4A.2).
  const reasons = STOCK_OUT_REASONS.filter(
    (r) => !r.clinicOnly || modules.clinic,
  );

  const byItem = new Map(items.map((i) => [i.id, i]));

  return (
    <>
      <Header title="Record stock out" />
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
        <StockOutForm
          reasons={reasons}
          suppliers={suppliers
            .filter((s) => s.active)
            .map((s) => ({ id: s.id, name: s.name }))}
          items={items
            .filter((i) => i.active)
            .map((i) => ({
              id: i.id,
              name: i.brandName,
              units: i.units.map((u) => ({
                level: u.level,
                name: u.name,
                factorToBase: u.factorToBase,
              })),
            }))}
          batches={batches.map((b) => ({
            id: b.id,
            itemId: b.itemId,
            itemName: byItem.get(b.itemId)?.brandName ?? "",
            batchNo: b.batchNo,
            expiryDateAd: b.expiryDateAd,
            remainingBaseQty: b.remainingBaseQty,
            costPaisaPerBase: b.costPaisaPerBase,
          }))}
          todayAd={adToIso(new Date())}
          todayBs={bsToDbText(today())}
        />
      </main>
    </>
  );
}
