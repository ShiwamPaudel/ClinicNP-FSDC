import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { getPatient } from "@/lib/repos/patients";
import { adToIso } from "@/lib/bs";
import { PageShell } from "@/components/app/page-shell";
import { PatientForm } from "@/components/clinic/patient-form";

export const metadata = { title: "Edit patient" };

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  await requireModulePage("clinic");

  const { id } = await params;
  const p = await getPatient(id);
  if (!p) notFound();

  return (
    <PageShell title="Edit patient">
      <PatientForm
        mode="edit"
        todayAd={adToIso(new Date())}
        initial={{
          id: p.id,
          name: p.name,
          sex: p.sex,
          ageValue: p.ageValue != null ? String(p.ageValue) : "",
          ageUnit: p.ageUnit ?? "y",
          dobAd: p.dobAd ?? "",
          phone: p.phone,
          address: p.address,
          guardianName: p.guardianName,
          bloodGroup: p.bloodGroup,
          note: p.note,
          referredBy: p.referredBy,
        }}
      />
    </PageShell>
  );
}
