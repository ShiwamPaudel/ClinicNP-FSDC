import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listDoctors } from "@/lib/repos/doctors";
import { listUsers } from "@/lib/repos/users";
import { mailConfigured } from "@/lib/email";
import { pushConfigured } from "@/lib/push";
import { DoctorsManager } from "@/components/clinic/doctors-manager";

export const metadata = { title: "Doctors" };

export default async function DoctorsSettingsPage() {
  await requireAdmin();
  await requireModulePage("clinic");
  const [doctors, users] = await Promise.all([listDoctors(true), listUsers()]);

  // Only sign-ins made with the Doctor role can be attached to a doctor. An
  // owner's account is not a doctor's account even when the owner is a doctor.
  const logins = users
    .filter((u) => u.role === "doctor" && u.active)
    .map((u) => ({ id: u.id, name: u.name, username: u.username }));

  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <DoctorsManager
        initial={doctors}
        logins={logins}
        emailReady={mailConfigured()}
        phoneAlertsReady={pushConfigured()}
      />
    </main>
  );
}
