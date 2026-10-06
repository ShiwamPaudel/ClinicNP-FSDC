import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listLabPartners, partnerBalancePaisa } from "@/lib/repos/lab-partners";
import { LabPartnersManager } from "@/components/clinic/lab-partners-manager";

export const metadata = { title: "Lab partners" };

export default async function LabPartnersSettingsPage() {
  await requireAdmin();
  await requireModulePage("clinic");
  const partners = await listLabPartners(true);
  const rows = await Promise.all(
    partners.map(async (p) => ({
      ...p,
      balancePaisa: await partnerBalancePaisa(p.id),
    })),
  );

  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <LabPartnersManager initial={rows} />
    </main>
  );
}
