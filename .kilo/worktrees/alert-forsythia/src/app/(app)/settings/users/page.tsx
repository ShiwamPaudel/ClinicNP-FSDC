import { listUsers } from "@/lib/repos/users";
import { UsersManager } from "@/components/app/users-manager";

export default async function UsersSettingsPage() {
  const users = await listUsers();
  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      <UsersManager initial={users} />
    </main>
  );
}
