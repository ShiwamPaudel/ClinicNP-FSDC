import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { recentPatients } from "@/lib/repos/patients";
import { PageShell } from "@/components/app/page-shell";
import { MergePatients } from "@/components/clinic/merge-patients";

export const metadata = { title: "Merge patients" };

export default async function MergePatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ keep?: string }>;
}) {
  await requireAdmin();
  await requireModulePage("clinic");

  const { keep } = await searchParams;
  const patients = await recentPatients(2000);

  return (
    <PageShell title="Merge patients">
      <MergePatients
        initialKeepId={keep ?? null}
        patients={patients.map((p) => ({
          id: p.id,
          patientNo: p.patientNo,
          name: p.name,
          sex: p.sex,
          ageValue: p.ageValue,
          ageUnit: p.ageUnit,
          ageAsOfAd: p.ageAsOfAd,
          dobAd: p.dobAd,
          phone: p.phone,
          address: p.address,
          note: p.note,
        }))}
      />
    </PageShell>
  );
}
