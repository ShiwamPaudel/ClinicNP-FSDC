import { requireAdmin } from "@/lib/session";
import { getModules } from "@/lib/modules";
import { ModulesPanel } from "@/components/app/modules-panel";

export const metadata = { title: "Modules" };

export default async function ModulesPage() {
  await requireAdmin();
  const modules = await getModules();

  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <ModulesPanel initial={modules} />
    </main>
  );
}
