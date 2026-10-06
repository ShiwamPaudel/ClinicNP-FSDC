import { redirect } from "next/navigation";
import { UserRound } from "lucide-react";
import { requireUser, isDoctor } from "@/lib/session";
import { getDoctorByUserId } from "@/lib/repos/doctors";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Not set up yet" };

/**
 * A Doctor sign-in that has not been attached to a doctor yet.
 *
 * Showing an empty list would be worse than saying nothing: an empty list
 * looks like a quiet day, and a doctor would sit through an afternoon of
 * patients believing nobody had been booked.
 */
export default async function NotLinkedPage() {
  const user = await requireUser();
  if (!isDoctor(user.role)) redirect("/dashboard");

  // Sorted out since? Go straight through.
  const doctor = await getDoctorByUserId(user.id);
  if (doctor) redirect("/my/schedule");

  return (
    <EmptyState
      icon={UserRound}
      message="This sign-in isn't attached to a doctor yet, so there is nothing to show. Ask the clinic to attach it under Settings, then sign in again."
    />
  );
}
