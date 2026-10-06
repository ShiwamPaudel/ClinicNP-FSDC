import { requireBillingUser } from "@/lib/session";
import { getCompany } from "@/lib/repos/company";
import { adToIso, bsToDbText, formatBS, today } from "@/lib/bs";
import { PosScreen } from "@/components/pos/pos-screen";
import { getModules } from "@/lib/modules";
import { appNameFor } from "@/lib/app-name";
import type { PosConfig } from "@/components/pos/bill-table";

export default async function BillingPage() {
  const user = await requireBillingUser();
  const company = await getCompany();
  const modules = await getModules();
  const bsToday = today();

  const config: PosConfig = {
    appName: appNameFor(modules),
    vatRegistered: company.vatRegistered,
    roundingOn: company.roundingOn,
    rackDisplay: company.rackDisplay,
    minRateIsCost: company.minRateIsCost,
    clinicOn: modules.clinic,
    canEditRate: user.role === "admin" || user.canEditRate,
    isAdmin: user.role === "admin",
    userName: user.name,
    todayIso: adToIso(new Date()),
    todayBsLong: formatBS(bsToday, { form: "long", monthScript: "en" }),
    todayBsText: bsToDbText(bsToday),
    company: {
      name: company.name,
      address: company.address,
      phone: company.phone,
      panNo: company.panNo,
      ddaNo: company.ddaNo,
      invoiceFooter: company.invoiceFooter,
      vatRegistered: company.vatRegistered,
      logoUrl: company.logoUrl,
    },
  };

  return <PosScreen config={config} />;
}
