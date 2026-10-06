import type { Viewport } from "next";
import { redirect } from "next/navigation";
import { requireUser, isDoctor } from "@/lib/session";
import { getModules } from "@/lib/modules";
import { appNameFor } from "@/lib/app-name";
import { DoctorShell } from "@/components/doctor/doctor-shell";

/**
 * The doctor's phone.
 *
 * A separate tree, not a narrow version of the back office. A doctor holds a
 * phone in one hand between patients: everything here is one column, thumb
 * height, and readable at arm's length. The sidebar, the tables and the
 * keyboard shortcuts that make the counter fast make no sense at all here.
 */
export const viewport: Viewport = {
  themeColor: "#20342a",
  width: "device-width",
  initialScale: 1,
  // The bar at the bottom sits above the phone's own home indicator.
  viewportFit: "cover",
};

export default async function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // Everyone else has their own front door.
  if (!isDoctor(user.role)) redirect("/dashboard");

  const modules = await getModules();

  return (
    <DoctorShell name={user.name} appName={appNameFor(modules)}>
      {children}
    </DoctorShell>
  );
}
