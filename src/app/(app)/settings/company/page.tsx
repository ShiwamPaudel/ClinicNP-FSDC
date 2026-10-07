import { getCompany } from "@/lib/repos/company";
import { getModules } from "@/lib/modules";
import { CompanyForm } from "@/components/app/company-form";

export default async function CompanySettingsPage() {
  const [company, modules] = await Promise.all([getCompany(), getModules()]);
  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <CompanyForm initial={company} pharmacyOn={modules.pharmacy} />
    </main>
  );
}
