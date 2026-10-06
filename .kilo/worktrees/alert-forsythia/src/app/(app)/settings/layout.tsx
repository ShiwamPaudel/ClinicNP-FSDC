import { requireAdmin } from "@/lib/session";
import { getModules } from "@/lib/modules";
import { SettingsTabs } from "@/components/app/settings-tabs";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Settings is Admin-only (Company details, users, backup/restore — PRD 4.7).
  await requireAdmin();
  const modules = await getModules();
  return (
    <>
      <SettingsTabs clinicOn={modules.clinic} pharmacyOn={modules.pharmacy} />
      {children}
    </>
  );
}
