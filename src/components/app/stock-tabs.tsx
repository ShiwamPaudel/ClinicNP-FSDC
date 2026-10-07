import { getModules } from "@/lib/modules";
import { StockTabsNav } from "@/components/app/stock-tabs-nav";

/**
 * The Stock tabs. Shelves is the shop's rack layout, which is a pharmacy's
 * concern: a clinic keeping only its own materials is not offered it.
 */
export async function StockTabs({ counts }: { counts?: Record<string, number> }) {
  const modules = await getModules();
  return <StockTabsNav counts={counts} showShelves={modules.pharmacy} />;
}
