"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ClipboardList, FlaskConical, Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  saveServiceAction,
  saveServiceGroupAction,
} from "@/app/(app)/settings/catalog-actions";
import { formatPaisa, toPaisa, paisaToRupees } from "@/lib/money";
import { strings } from "@/lib/strings";
import { SAMPLE_TYPES } from "@/lib/sample-types";
import type { Service, ServiceGroup } from "@/lib/repos/services";
import type { Doctor } from "@/lib/repos/doctors";
import type { LabPartner } from "@/lib/repos/lab-partners";

interface FormState {
  name: string;
  code: string;
  groupId: string;
  rate: string;
  doctorRequired: boolean;
  defaultDoctorId: string;
  outsourced: boolean;
  defaultLabPartnerId: string;
  partnerCost: string;
  sampleType: string;
  followupDays: string;
  followupRate: string;
  vatApplicable: boolean;
  active: boolean;
}

function blank(groupId: string): FormState {
  return {
    name: "",
    code: "",
    groupId,
    rate: "",
    doctorRequired: false,
    defaultDoctorId: "",
    outsourced: false,
    defaultLabPartnerId: "",
    partnerCost: "",
    sampleType: "",
    followupDays: "",
    followupRate: "",
    vatApplicable: false,
    active: true,
  };
}

const rupeesToPaisa = (s: string) => {
  const n = Number(s.trim());
  return Number.isFinite(n) && n > 0 ? toPaisa(n) : 0;
};
const paisaToField = (p: number) => (p > 0 ? String(paisaToRupees(p)) : "");
const intOr0 = (s: string) => {
  const n = Number(s.trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export function ServicesManager({
  groups,
  services,
  doctors,
  partners,
  vatRegistered,
}: {
  groups: ServiceGroup[];
  services: Service[];
  doctors: Doctor[];
  partners: LabPartner[];
  vatRegistered: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blank(groups[0]?.id ?? ""));
  const [busy, setBusy] = useState(false);

  const [groupOpen, setGroupOpen] = useState(false);
  const [groupEditId, setGroupEditId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState({
    name: "",
    sortOrder: 0,
    isConsultation: false,
    active: true,
  });

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const currentGroup = groups.find((g) => g.id === form.groupId);
  const isConsultationGroup = currentGroup?.isConsultation ?? false;

  function openNew() {
    setEditId(null);
    setForm(blank(groups[0]?.id ?? ""));
    setOpen(true);
  }

  function openEdit(s: Service) {
    setEditId(s.id);
    setForm({
      name: s.name,
      code: s.code,
      groupId: s.groupId,
      rate: paisaToField(s.ratePaisa),
      doctorRequired: s.doctorRequired,
      defaultDoctorId: s.defaultDoctorId ?? "",
      outsourced: s.outsourced,
      defaultLabPartnerId: s.defaultLabPartnerId ?? "",
      partnerCost: paisaToField(s.partnerCostPaisa),
      sampleType: s.sampleType,
      followupDays: s.followupDays > 0 ? String(s.followupDays) : "",
      followupRate: paisaToField(s.followupRatePaisa),
      vatApplicable: s.vatApplicable,
      active: s.active,
    });
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    const res = await saveServiceAction(editId, {
      name: form.name.trim(),
      code: form.code.trim(),
      groupId: form.groupId,
      ratePaisa: rupeesToPaisa(form.rate),
      doctorRequired: form.doctorRequired,
      defaultDoctorId: form.defaultDoctorId || null,
      outsourced: form.outsourced,
      defaultLabPartnerId: form.outsourced ? form.defaultLabPartnerId || null : null,
      partnerCostPaisa: form.outsourced ? rupeesToPaisa(form.partnerCost) : 0,
      sampleType: form.sampleType,
      followupDays: isConsultationGroup ? intOr0(form.followupDays) : 0,
      followupRatePaisa: isConsultationGroup ? rupeesToPaisa(form.followupRate) : 0,
      vatApplicable: form.vatApplicable,
      active: form.active,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(editId ? strings.saved : "Service added");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  function openGroupNew() {
    setGroupEditId(null);
    setGroupForm({
      name: "",
      sortOrder: (groups.at(-1)?.sortOrder ?? 0) + 10,
      isConsultation: false,
      active: true,
    });
    setGroupOpen(true);
  }

  function openGroupEdit(g: ServiceGroup) {
    setGroupEditId(g.id);
    setGroupForm({
      name: g.name,
      sortOrder: g.sortOrder,
      isConsultation: g.isConsultation,
      active: g.active,
    });
    setGroupOpen(true);
  }

  async function submitGroup() {
    setBusy(true);
    const res = await saveServiceGroupAction(groupEditId, {
      ...groupForm,
      name: groupForm.name.trim(),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(groupEditId ? strings.saved : "Group added");
      setGroupOpen(false);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  const byGroup = groups.map((g) => ({
    group: g,
    rows: services.filter((s) => s.groupId === g.id),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[640px] text-[13px] text-sage-500">
          Everything the clinic charges for that is not a medicine. Groups decide
          how services are sorted at the counter; a consultation group is the one
          the follow-up rule and the doctor&apos;s share apply to.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={openGroupNew}>
            <Plus className="h-4 w-4" />
            Add group
          </Button>
          <Button onClick={openNew} disabled={groups.length === 0}>
            <Plus className="h-4 w-4" />
            Add service
          </Button>
        </div>
      </div>

      {services.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          message="No services yet. Add the consultations, tests and procedures this clinic charges for."
        />
      )}

      {byGroup.map(({ group, rows }) => (
        <section key={group.id}>
          <div className="mb-2 flex items-baseline gap-3">
            <h2 className="text-[15px] font-semibold text-sage-900">
              {group.name}
            </h2>
            {group.isConsultation && (
              <Badge tone="info">Consultation</Badge>
            )}
            {!group.active && <Badge tone="neutral">Off</Badge>}
            <button
              onClick={() => openGroupEdit(group)}
              className="text-[12px] text-clinic-700 hover:underline"
            >
              Edit group
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-line px-4 py-3 text-[13px] text-sage-500">
              Nothing in this group yet.
            </p>
          ) : (
            <div className="rounded-[10px] border border-line bg-cream-50">
              <Table>
                <THead>
                  <TR>
                    <TH>Service</TH>
                    <TH>Code</TH>
                    <TH className="text-right">Rate</TH>
                    <TH>Needs</TH>
                    <TH>Follow-up</TH>
                    <TH>Status</TH>
                    <TH> </TH>
                  </TR>
                </THead>
                <tbody>
                  {rows.map((s) => (
                    <TR key={s.id}>
                      <TD className="font-medium text-sage-900">{s.name}</TD>
                      <TD className="font-mono text-[13px] text-sage-500">
                        {s.code || "—"}
                      </TD>
                      <TD className="text-right font-mono tnum">
                        {formatPaisa(s.ratePaisa)}
                        {s.sampleRate && (
                          <span
                            className="ml-1.5 inline-flex items-center gap-1 text-[11px] text-warn-600"
                            title="This is a sample price from the starter list — set your own"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            sample
                          </span>
                        )}
                      </TD>
                      <TD className="text-sage-500">
                        <span className="flex flex-wrap gap-1.5">
                          {s.doctorRequired && <Badge tone="neutral">Doctor</Badge>}
                          {s.outsourced && (
                            <Badge tone="info">
                              <Send className="mr-1 inline h-3 w-3" />
                              Outside lab
                            </Badge>
                          )}
                          {s.sampleType && (
                            <Badge tone="neutral">
                              <FlaskConical className="mr-1 inline h-3 w-3" />
                              {s.sampleType}
                            </Badge>
                          )}
                          {!s.doctorRequired && !s.outsourced && !s.sampleType && "—"}
                        </span>
                      </TD>
                      <TD className="text-sage-500">
                        {s.followupDays > 0
                          ? `${s.followupDays} days · ${
                              s.followupRatePaisa === 0
                                ? "free"
                                : formatPaisa(s.followupRatePaisa)
                            }`
                          : "—"}
                      </TD>
                      <TD>
                        <Badge tone={s.active ? "ok" : "neutral"}>
                          {s.active ? "Active" : "Off"}
                        </Badge>
                      </TD>
                      <TD className="text-right">
                        <button
                          onClick={() => openEdit(s)}
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
        </section>
      ))}

      {/* ---------------- service form ---------------- */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit service" : "Add service"}
      >
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <Field label="Name">
            <Input
              value={form.name}
              autoFocus
              onChange={(e) => set("name", e.target.value)}
              placeholder="USG — Abdomen and Pelvis"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Group">
              <Select
                value={form.groupId}
                onChange={(e) => set("groupId", e.target.value)}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Short code" hint="Optional, for fast typing at the counter">
              <Input
                value={form.code}
                onChange={(e) => set("code", e.target.value)}
                placeholder="usgap"
              />
            </Field>
          </div>

          <Field label="Rate" hint="In rupees. Can still be changed on the bill.">
            <Input
              numeric
              value={form.rate}
              onChange={(e) => set("rate", e.target.value)}
              placeholder="1200"
            />
          </Field>

          <div className="rounded-[8px] border border-line p-3">
            <label className="flex items-center gap-2 text-[14px] text-sage-900">
              <input
                type="checkbox"
                checked={form.doctorRequired}
                onChange={(e) => set("doctorRequired", e.target.checked)}
                className="h-4 w-4"
              />
              The bill must name a doctor
            </label>
            <div className="mt-3">
              <Field label="Usual doctor" hint="Filled in automatically at the counter">
                <Select
                  value={form.defaultDoctorId}
                  onChange={(e) => set("defaultDoctorId", e.target.value)}
                >
                  <option value="">No usual doctor</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>

          <div className="rounded-[8px] border border-line p-3">
            <label className="flex items-center gap-2 text-[14px] text-sage-900">
              <input
                type="checkbox"
                checked={form.outsourced}
                onChange={(e) => set("outsourced", e.target.checked)}
                className="h-4 w-4"
              />
              Sent to an outside laboratory
            </label>
            {form.outsourced && (
              <div className="mt-3 grid grid-cols-2 gap-4">
                <Field label="Laboratory">
                  <Select
                    value={form.defaultLabPartnerId}
                    onChange={(e) => set("defaultLabPartnerId", e.target.value)}
                  >
                    <option value="">Choose one</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="What the laboratory charges" hint="In rupees, per test">
                  <Input
                    numeric
                    value={form.partnerCost}
                    onChange={(e) => set("partnerCost", e.target.value)}
                    placeholder="400"
                  />
                </Field>
              </div>
            )}
          </div>

          {/* What has to be collected. This drives the sample-collection
              screen, so a test with a sample type set appears there the
              moment it is billed. */}
          <Field
            label="Sample collected"
            htmlFor="sampleType"
            hint="Leave blank for anything that collects nothing"
          >
            <Select
              id="sampleType"
              value={form.sampleType}
              onChange={(e) => set("sampleType", e.target.value)}
            >
              <option value="">— Nothing collected —</option>
              {SAMPLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>

          {isConsultationGroup && (
            <div className="rounded-[8px] border border-line p-3">
              <p className="mb-3 text-[13px] font-medium text-sage-900">
                Follow-up
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Within how many days" hint="Leave blank for no follow-up rule">
                  <Input
                    numeric
                    value={form.followupDays}
                    onChange={(e) => set("followupDays", e.target.value)}
                    placeholder="7"
                  />
                </Field>
                <Field label="Follow-up rate" hint="Blank or 0 means free">
                  <Input
                    numeric
                    value={form.followupRate}
                    onChange={(e) => set("followupRate", e.target.value)}
                    placeholder="0"
                  />
                </Field>
              </div>
            </div>
          )}

          {vatRegistered && (
            <label className="flex items-center gap-2 text-[14px] text-sage-900">
              <input
                type="checkbox"
                checked={form.vatApplicable}
                onChange={(e) => set("vatApplicable", e.target.checked)}
                className="h-4 w-4"
              />
              VAT applies to this service
            </label>
          )}

          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
              className="h-4 w-4"
            />
            Offered at the moment
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

      {/* ---------------- group form ---------------- */}
      <Dialog
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        title={groupEditId ? "Edit group" : "Add group"}
      >
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <Input
              value={groupForm.name}
              autoFocus
              onChange={(e) =>
                setGroupForm((g) => ({ ...g, name: e.target.value }))
              }
              placeholder="Physiotherapy"
            />
          </Field>
          <Field label="Where it sits in the list" hint="Lower numbers come first">
            <Input
              numeric
              value={String(groupForm.sortOrder)}
              onChange={(e) =>
                setGroupForm((g) => ({
                  ...g,
                  sortOrder: intOr0(e.target.value),
                }))
              }
            />
          </Field>
          <label className="flex items-start gap-2 text-[14px] text-sage-900">
            <input
              type="checkbox"
              checked={groupForm.isConsultation}
              onChange={(e) =>
                setGroupForm((g) => ({ ...g, isConsultation: e.target.checked }))
              }
              className="mt-1 h-4 w-4"
            />
            <span>
              These are consultations
              <span className="block text-[12px] text-sage-500">
                The follow-up rule and the doctor&apos;s per-consultation share
                apply to services in this group.
              </span>
            </span>
          </label>
          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input
              type="checkbox"
              checked={groupForm.active}
              onChange={(e) =>
                setGroupForm((g) => ({ ...g, active: e.target.checked }))
              }
              className="h-4 w-4"
            />
            Shown at the counter
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setGroupOpen(false)}>
            {strings.cancel}
          </Button>
          <Button onClick={submitGroup} disabled={busy || !groupForm.name.trim()}>
            {busy ? "Saving…" : strings.save}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
