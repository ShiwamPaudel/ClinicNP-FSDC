"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Users as UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { createUserAction, updateUserAction } from "@/app/(app)/settings/actions";
import type { User, Role } from "@/lib/repos/users";
import { strings } from "@/lib/strings";

interface FormState {
  name: string;
  username: string;
  password: string;
  pin: string;
  role: Role;
  canEditRate: boolean;
}

const EMPTY: FormState = {
  name: "",
  username: "",
  password: "",
  pin: "",
  role: "staff",
  canEditRate: false,
};

export function UsersManager({ initial }: { initial: User[] }) {
  const router = useRouter();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submitNew() {
    setBusy(true);
    const res = await createUserAction(form);
    setBusy(false);
    if (res.ok) {
      toast.success("User added");
      setAddOpen(false);
      setForm(EMPTY);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  async function submitEdit() {
    if (!editing) return;
    setBusy(true);
    const res = await updateUserAction({
      id: editing.id,
      name: form.name,
      role: form.role,
      canEditRate: form.canEditRate,
      password: form.password || undefined,
      pin: form.pin || undefined,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(strings.saved);
      setEditing(null);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  async function toggleActive(u: User) {
    const res = await updateUserAction({ id: u.id, active: !u.active });
    if (res.ok) {
      toast.success(u.active ? "User deactivated" : "User activated");
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  function openEdit(u: User) {
    setEditing(u);
    setForm({
      name: u.name,
      username: u.username,
      password: "",
      pin: "",
      role: u.role,
      canEditRate: u.canEditRate,
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[14px] text-sage-500">
          Everyone who can sign in. A doctor signs in to their own booked
          consultations and nothing else — attach the sign-in to them under
          Doctors once it is made.
        </p>
        <Button
          onClick={() => {
            setForm(EMPTY);
            setAddOpen(true);
          }}
        >
          <UserPlus className="h-4 w-4" />
          {strings.addUser}
        </Button>
      </div>

      {initial.length === 0 ? (
        <EmptyState icon={UsersIcon} message={strings.emptyUsers} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Username</TH>
              <TH>Role</TH>
              <TH>Rate edit</TH>
              <TH>PIN</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {initial.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium text-sage-900">{u.name}</TD>
                <TD>{u.username}</TD>
                <TD>
                  {u.role === "admin" ? (
                    <Badge tone="neutral">Admin</Badge>
                  ) : u.role === "accountant" ? (
                    <Badge tone="info">Accountant</Badge>
                  ) : u.role === "doctor" ? (
                    <Badge tone="info">Doctor</Badge>
                  ) : (
                    <Badge tone="info">Staff</Badge>
                  )}
                </TD>
                <TD>{u.canEditRate ? "Yes" : "No"}</TD>
                <TD>{u.hasPin ? "Set" : "—"}</TD>
                <TD>
                  {u.active ? (
                    <Badge tone="ok">Active</Badge>
                  ) : (
                    <Badge tone="danger">Inactive</Badge>
                  )}
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => openEdit(u)}>
                      {strings.edit}
                    </Button>
                    <Button variant="ghost" onClick={() => toggleActive(u)}>
                      {u.active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {/* Add dialog */}
      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={strings.addUser}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              {strings.cancel}
            </Button>
            <Button onClick={submitNew} disabled={busy}>
              {strings.add}
            </Button>
          </>
        }
      >
        <UserFields form={form} set={set} isNew />
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : strings.edit}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {strings.cancel}
            </Button>
            <Button onClick={submitEdit} disabled={busy}>
              {strings.save}
            </Button>
          </>
        }
      >
        <UserFields form={form} set={set} isNew={false} />
      </Dialog>
    </div>
  );
}

function UserFields({
  form,
  set,
  isNew,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  isNew: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field label={strings.fullName}>
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      {isNew && (
        <Field label={strings.username} hint="At least 3 characters">
          <Input
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
          />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field
          label={isNew ? strings.password : "New password"}
          hint={isNew ? "At least 6 characters" : "Leave blank to keep"}
        >
          <Input
            type="password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
          />
        </Field>
        <Field
          label={`${strings.pin} (4 digits)`}
          hint={isNew ? "Optional — for quick-switch" : "Leave blank to keep"}
        >
          <Input
            inputMode="numeric"
            maxLength={4}
            value={form.pin}
            onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label={strings.role}>
          <Select
            value={form.role}
            onChange={(e) => set("role", e.target.value as Role)}
          >
            <option value="staff">{strings.roleStaff}</option>
            <option value="accountant">{strings.roleAccountant}</option>
            <option value="doctor">{strings.roleDoctor}</option>
            <option value="admin">{strings.roleAdmin}</option>
          </Select>
        </Field>
        <label className="mt-7 flex items-center gap-2 text-[14px] text-sage-900">
          <input
            type="checkbox"
            checked={form.canEditRate}
            onChange={(e) => set("canEditRate", e.target.checked)}
          />
          {strings.canEditRate}
        </label>
      </div>
    </div>
  );
}
