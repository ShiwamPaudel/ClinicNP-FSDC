"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { saveLabPartnerAction } from "@/app/(app)/settings/catalog-actions";
import { formatPaisa } from "@/lib/money";
import { strings } from "@/lib/strings";
import type { LabPartner } from "@/lib/repos/lab-partners";

export interface LabPartnerRow extends LabPartner {
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

export function LabPartnersManager({ initial }: { initial: LabPartnerRow[] }) {
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

  function openEdit(p: LabPartnerRow) {
    setEditId(p.id);
    setForm({
      name: p.name,
      panNo: p.panNo,
      phone: p.phone,
      address: p.address,
      contactPerson: p.contactPerson,
      terms: p.terms,
      active: p.active,
    });
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    const res = await saveLabPartnerAction(editId, {
      ...form,
      name: form.name.trim(),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(editId ? strings.saved : "Laboratory added");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-[13px] text-sage-500">
          Laboratories that samples are sent to. What is owed builds up from the
          cost on each test billed, and comes down as payments are recorded.
        </p>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Add laboratory
        </Button>
      </div>

      {initial.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          message="No outside laboratories yet. Add one if tests are sent out."
        />
      ) : (
        <div className="rounded-[10px] border border-line bg-cream-50">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Contact</TH>
                <TH>Phone</TH>
                <TH>PAN</TH>
                <TH>Terms</TH>
                <TH className="text-right">Owed</TH>
                <TH>Status</TH>
                <TH> </TH>
              </TR>
            </THead>
            <tbody>
              {initial.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium text-sage-900">{p.name}</TD>
                  <TD className="text-sage-500">{p.contactPerson || "—"}</TD>
                  <TD className="font-mono text-[13px]">{p.phone || "—"}</TD>
                  <TD className="font-mono text-[13px]">{p.panNo || "—"}</TD>
                  <TD className="text-sage-500">{p.terms || "—"}</TD>
                  <TD className="text-right font-mono tnum">
                    {p.balancePaisa === 0 ? "—" : formatPaisa(p.balancePaisa)}
                  </TD>
                  <TD>
                    <Badge tone={p.active ? "ok" : "neutral"}>
                      {p.active ? "Active" : "Off"}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <button
                      onClick={() => openEdit(p)}
                      className="text-[13px] text-clinic-700 hover:underline"
                    >
                      Edit
                    </button>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit laboratory" : "Add laboratory"}
      >
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <Input
              value={form.name}
              autoFocus
              onChange={(e) => set("name", e.target.value)}
              placeholder="Everest Diagnostic Laboratory"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Contact person">
              <Input
                value={form.contactPerson}
                onChange={(e) => set("contactPerson", e.target.value)}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="PAN">
              <Input
                value={form.panNo}
                onChange={(e) => set("panNo", e.target.value)}
              />
            </Field>
            <Field label="Settlement terms" hint="For example, monthly">
              <Input
                value={form.terms}
                onChange={(e) => set("terms", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Address">
            <Input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
              className="h-4 w-4"
            />
            Still sending samples here
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {strings.cancel}
          </Button>
          <Button onClick={submit} disabled={busy || !form.name.trim()}>
            {busy ? "Saving…" : strings.save}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
