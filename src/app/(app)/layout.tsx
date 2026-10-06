import { requireBackOfficeUser, canBill } from "@/lib/session";
import { getModules } from "@/lib/modules";
import { appNameFor } from "@/lib/app-name";
import { listUsers } from "@/lib/repos/users";
import { getDateCalendar } from "@/lib/repos/company";
import { Sidebar } from "@/components/app/sidebar";
import { DateCalendarProvider } from "@/components/ui/date-calendar-context";
import { GlobalShortcuts } from "@/components/app/global-shortcuts";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireBackOfficeUser();
  const modules = await getModules();
  const all = await listUsers();
  const dateCalendar = await getDateCalendar();
  const switchable = all
    // A doctor's sign-in never appears in quick-switch: it belongs to one
    // person on their own phone, not to the shared counter machine.
    .filter((u) => u.active && u.hasPin && u.role !== "doctor" && u.id !== user.id)
    .map((u) => ({ id: u.id, name: u.name, role: u.role }));

  return (
    <div className="flex h-screen overflow-hidden bg-cream-100">
      {/* F2 opens New bill from any page — for whoever can bill. */}
      {canBill(user.role) && <GlobalShortcuts />}
      <Sidebar
        user={{ name: user.name, role: user.role }}
        switchable={switchable}
        appName={appNameFor(modules)}
        modules={modules}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <DateCalendarProvider calendar={dateCalendar}>{children}</DateCalendarProvider>
      </div>
    </div>
  );
}
