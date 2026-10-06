import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listServices, listServiceGroups } from "@/lib/repos/services";
import { listDoctors } from "@/lib/repos/doctors";
import { listLabPartners } from "@/lib/repos/lab-partners";
import { getCompany } from "@/lib/repos/company";
import { ServicesManager } from "@/components/clinic/services-manager";

export const metadata = { title: "Services" };

export default async function ServicesSettingsPage() {
  await requireAdmin();
  await requireModulePage("clinic");

  const [groups, services, doctors, partners, company] = await Promise.all([
    listServiceGroups(true),
    listServices(true),
    listDoctors(true),
    listLabPartners(),
    getCompany(),
  ]);

  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <ServicesManager
        groups={groups}
        services={services}
        doctors={doctors}
        partners={partners}
        vatRegistered={company?.vatRegistered ?? false}
      />
    </main>
  );
}
