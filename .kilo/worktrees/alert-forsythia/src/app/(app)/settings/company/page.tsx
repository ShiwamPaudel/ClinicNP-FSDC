import { getCompany } from "@/lib/repos/company";
import { CompanyForm } from "@/components/app/company-form";

export default async function CompanySettingsPage() {
  const company = await getCompany();
  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <CompanyForm initial={company} />
    </main>
  );
}
