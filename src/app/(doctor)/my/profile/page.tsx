import { requireDoctor } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { getDoctor } from "@/lib/repos/doctors";
import { pushPublicKey, pushConfigured } from "@/lib/push";
import { mailConfigured } from "@/lib/email";
import { DoctorProfile } from "@/components/doctor/doctor-profile";

export const metadata = { title: "You" };

export default async function DoctorProfilePage() {
  const { doctorId } = await requireDoctor();
  await requireModulePage("clinic");

  const doctor = await getDoctor(doctorId);
  if (!doctor) return null;

  return (
    <DoctorProfile
      doctor={{
        name: doctor.name,
        qualification: doctor.qualification,
        specialty: doctor.specialty,
        nmcNo: doctor.nmcNo,
        phone: doctor.phone,
        email: doctor.email,
        notifyPush: doctor.notifyPush,
        notifyEmail: doctor.notifyEmail,
      }}
      // Safe to hand to a browser: it is the half that only lets a delivery
      // service check the alert really came from this clinic.
      publicKey={pushPublicKey()}
      phoneAlertsReady={pushConfigured()}
      emailReady={mailConfigured()}
    />
  );
}
