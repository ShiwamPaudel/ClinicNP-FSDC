import { requireBillingUser } from "@/lib/session";
import { getCompany } from "@/lib/repos/company";
import { adToIso, bsToDbText, formatBS, today } from "@/lib/bs";
import { PosScreen } from "@/components/pos/pos-screen";
import { getModules } from "@/lib/modules";
import { appNameFor } from "@/lib/app-name";
import type { PosConfig } from "@/components/pos/bill-table";
import type { AttachedPatient } from "@/stores/bill-store";
import { getPatient } from "@/lib/repos/patients";
import { displayAge } from "@/lib/age";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const user = await requireBillingUser();
  const sp = await searchParams;
  const company = await getCompany();
  const modules = await getModules();
  const bsToday = today();

  const config: PosConfig = {
    appName: appNameFor(modules),
    vatRegistered: company.vatRegistered,
    vatInclusive: company.vatInclusive,
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

  // "New bill" on a patient's card opens the counter with them already on the
  // bill. Only the id travels in the address (Rules §6); the rest is read here.
  let startPatient: AttachedPatient | undefined;
  if (modules.clinic && typeof sp.patient === "string" && sp.patient) {
    const p = await getPatient(sp.patient);
    if (p && p.active && !p.mergedIntoId) {
      startPatient = {
        id: p.id,
        patientNo: p.patientNo,
        name: p.name,
        sex: p.sex,
        ageShort: displayAge(
          { value: p.ageValue, unit: p.ageUnit, asOfAd: p.ageAsOfAd, dobAd: p.dobAd },
          config.todayIso,
        ).short,
      };
    }
  }

  return <PosScreen config={config} startPatient={startPatient} />;
}
