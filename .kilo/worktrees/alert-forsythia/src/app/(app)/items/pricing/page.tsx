import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listItems } from "@/lib/repos/items";
import { PageShell } from "@/components/app/page-shell";
import { PricingGrid } from "@/components/app/pricing-grid";

export default async function PricingPage() {
  await requireAdmin();
  await requireModulePage("pharmacy");

  // Inactive items too: a medicine can be switched off and still need a price
  // before it is switched back on.
  const items = await listItems(true);

  return (
    <PageShell title="Set prices">
      <PricingGrid
        items={items.map((i) => ({
          id: i.id,
          brandName: i.brandName,
          genericName: i.genericName,
          category: i.category,
          units: i.units.map((u) => ({
            level: u.level,
            name: u.name,
            factorToBase: u.factorToBase,
            sellingRatePaisa: u.sellingRatePaisa,
            isDefaultSelling: u.isDefaultSelling,
          })),
        }))}
      />
    </PageShell>
  );
}
