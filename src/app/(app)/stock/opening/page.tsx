import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listItems } from "@/lib/repos/items";
import { StockTabs } from "@/components/app/stock-tabs";
import { OpeningStockForm } from "@/components/app/opening-stock-form";

export const metadata = { title: "Opening stock" };

export default async function OpeningStockPage() {
  await requireAdmin();
  await requireModulePage("pharmacy");
  const items = await listItems();

  return (
    <>
      <StockTabs />
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
        <OpeningStockForm items={items} />
      </main>
    </>
  );
}
