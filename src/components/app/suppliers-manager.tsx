"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { saveSupplierAction } from "@/app/(app)/suppliers/actions";
import { formatPaisa } from "@/lib/money";
import type { Supplier } from "@/lib/repos/suppliers";
import { strings } from "@/lib/strings";

export interface SupplierRow extends Supplier {
  balancePaisa: number;
}

interface FormState {
  name: string;
  panNo: string;
  phone: string;
  address: string;
  contactPerson: string;
  terms: string;
  active: boolean;
}

const BLANK: FormState = {
  name: "",
  panNo: "",
  phone: "",
  address: "",
  contactPerson: "",
  terms: "",
  active: true,
};

export function SuppliersManager({ initial }: { initial: SupplierRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function openNew() {
    setEditId(null);
    setForm(BLANK);
    setOpen(true);
  }

  function openEdit(s: SupplierRow) {
    setEditId(s.id);
    setForm({
      name: s.name,
      panNo: s.panNo,
      phone: s.phone,
      address: s.address,
      contactPerson: s.contactPerson,
      terms: s.terms,
      active: s.active,
    });
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    const res = await saveSupplierAction({ id: editId ?? undefined, ...form });
    setBusy(false);
    if (res.ok) {
      toast.success(editId ? strings.saved : "Supplier added");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Add supplier
        </Button>
      </div>

      {initial.length === 0 ? (
        <EmptyState
          icon={Truck}
          message="No suppliers yet. Add one to record purchases and payments."
          action={<Button onClick={openNew}>Add supplier</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Supplier</TH>
              <TH>Phone</TH>
              <TH>PAN</TH>
              <TH numeric>You owe</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {initial.map((s) => (
              <TR key={s.id}>
                <TD>
                  <Link
                    href={`/suppliers/${s.id}`}
                    className="font-medium text-sage-900 hover:text-sage-600"
                  >
                    {s.name}
                  </Link>
                  {!s.active && (
                    <Badge tone="neutral" className="ml-2">
                      Inactive
                    </Badge>
                  )}
                </TD>
                <TD>{s.phone || "—"}</TD>
                <TD>{s.panNo || "—"}</TD>
                <TD numeric>
                  {s.balancePaisa > 0 ? (
                    <span className="text-warn-600">
                      {formatPaisa(s.balancePaisa)}
                    </span>
                  ) : (
                    formatPaisa(0)
                  )}
                </TD>
                <TD className="text-right">
                  <Button variant="ghost" onClick={() => openEdit(s)}>
                    {strings.edit}
                  </Button>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit supplier" : "Add supplier"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {strings.cancel}
            </Button>
            <Button onClick={submit} disabled={busy}>
              {editId ? strings.save : strings.add}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="PAN">
              <Input value={form.panNo} onChange={(e) => set("panNo", e.target.value)} />
            </Field>
          </div>
          <Field label="Address">
            <Input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact person">
              <Input
                value={form.contactPerson}
                onChange={(e) => set("contactPerson", e.target.value)}
              />
            </Field>
            <Field label="Payment terms">
              <Input value={form.terms} onChange={(e) => set("terms", e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
            />
            Active
          </label>
        </div>
      </Dialog>
    </div>
  );
}
