import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listRacks, shelfRows } from "@/lib/repos/racks";
import { getFloorSize } from "@/lib/repos/company";
import { StockTabs } from "@/components/app/stock-tabs";
import { ShelfPlan } from "@/components/app/shelf-plan";

export const metadata = { title: "Shelves" };

export default async function ShelvesPage() {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const [racks, items, floor] = await Promise.all([
    listRacks(),
    shelfRows(),
    getFloorSize(),
  ]);

  return (
    <>
      <StockTabs />
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
        <ShelfPlan racks={racks} items={items} floor={floor} />
      </main>
    </>
  );
}
