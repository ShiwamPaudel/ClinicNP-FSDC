import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { recentPatients } from "@/lib/repos/patients";
import { adToIso } from "@/lib/bs";
import { PageShell } from "@/components/app/page-shell";
import { PatientSearch } from "@/components/clinic/patient-search";

export const metadata = { title: "Patients" };

export default async function PatientsPage() {
  await requireUser();
  await requireModulePage("clinic");

  // The whole recent slice goes to the browser so typing filters instantly;
  // Phase 5 extends this to the counter's cached 2,000.
  const patients = await recentPatients(2000);

  return (
    <PageShell title="Patients">
      <PatientSearch
        todayAd={adToIso(new Date())}
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
