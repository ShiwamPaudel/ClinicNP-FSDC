"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Stethoscope, Bell, BellOff, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { saveDoctorAction } from "@/app/(app)/settings/catalog-actions";
import { describeShare, SHARE_BASIS_LABEL, type ShareBasis } from "@/lib/clinic-calc";
import { strings } from "@/lib/strings";
import type { Doctor } from "@/lib/repos/doctors";

export interface DoctorLogin {
  id: string;
  name: string;
  username: string;
}

interface FormState {
  name: string;
  qualification: string;
  specialty: string;
  nmcNo: string;
  phone: string;
  email: string;
  userId: string;
  notifyPush: boolean;
  notifyEmail: boolean;
  shareBasis: ShareBasis;
  /** what the person types: a percentage, or rupees for a fixed amount */
  shareEntry: string;
  active: boolean;
}

const BLANK: FormState = {
  name: "",
  qualification: "",
  specialty: "",
  nmcNo: "",
  phone: "",
  email: "",
  userId: "",
  notifyPush: true,
  notifyEmail: true,
  shareBasis: "none",
  shareEntry: "",
  active: true,
};

const isPercent = (b: ShareBasis) => b === "pct_consult" || b === "pct_services";

/**
 * What the person typed → what is stored.
 *
 * A percentage is stored as basis points and a fixed amount as paisa, and both
 * happen to be the typed number times a hundred — 40% is 4000 basis points,
 * Rs 150 is 15000 paisa. One expression, not because the two are the same
 * thing, but because the arithmetic is.
 */
function toStoredValue(entry: string): number {
  const n = Number(entry.trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

/** What the database stores → what the person sees in the box. */
function toEntry(basis: ShareBasis, value: number): string {
  if (basis === "none" || value === 0) return "";
  return String(value / 100);
}

export function DoctorsManager({
  initial,
  logins,
  emailReady,
  phoneAlertsReady,
}: {
  initial: Doctor[];
  logins: DoctorLogin[];
  emailReady: boolean;
  phoneAlertsReady: boolean;
}) {
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

  function openEdit(d: Doctor) {
    setEditId(d.id);
    setForm({
      name: d.name,
      qualification: d.qualification,
      specialty: d.specialty,
      nmcNo: d.nmcNo,
      phone: d.phone,
      email: d.email,
      userId: d.userId ?? "",
      notifyPush: d.notifyPush,
      notifyEmail: d.notifyEmail,
      shareBasis: d.shareBasis,
      shareEntry: toEntry(d.shareBasis, d.shareValue),
      active: d.active,
    });
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    const res = await saveDoctorAction(editId, {
      name: form.name.trim(),
      qualification: form.qualification.trim(),
      specialty: form.specialty.trim(),
      nmcNo: form.nmcNo.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      userId: form.userId,
      notifyPush: form.notifyPush,
      notifyEmail: form.notifyEmail,
      shareBasis: form.shareBasis,
      shareValue: toStoredValue(form.shareEntry),
      active: form.active,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(editId ? strings.saved : "Doctor added");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  // Sign-ins already spoken for by another doctor should not be offered again.
  const takenBy = new Map(
    initial.filter((d) => d.userId).map((d) => [d.userId as string, d.id]),
  );
  const available = logins.filter(
    (l) => !takenBy.has(l.id) || takenBy.get(l.id) === editId,
  );

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <p className="max-w-[62ch] text-[13px] text-sage-500">
          A doctor here is a name on a slip and a share of the takings. Give one
          a sign-in and they can also see their own booked consultations on their
          phone — make the sign-in under{" "}
          <Link href="/settings/users" className="text-clinic-700 hover:underline">
            Users
          </Link>{" "}
          with the Doctor role first, then attach it here.
        </p>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Add doctor
        </Button>
      </div>

      {(!phoneAlertsReady || !emailReady) && (
        <div className="mb-4 rounded-[10px] border border-line bg-warn-100 px-4 py-3 text-[13px] text-warn-600">
          {!phoneAlertsReady && !emailReady
            ? "Alerts to phones and emails are not switched on yet, so nothing will reach a doctor when a consultation is booked. Everything else here works."
            : !phoneAlertsReady
              ? "Alerts to phones are not switched on yet. Emails will still go out."
              : "Email is not switched on yet. Alerts to phones will still go out."}
        </div>
      )}

      {initial.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          message="No doctors yet. Add the doctors who see patients here."
        />
      ) : (
        <div className="rounded-[10px] border border-line bg-cream-50">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Specialty</TH>
                <TH>NMC no.</TH>
                <TH>Email</TH>
                <TH>Sign-in</TH>
                <TH>Told when booked</TH>
                <TH>Share</TH>
                <TH>Status</TH>
                <TH> </TH>
              </TR>
            </THead>
            <tbody>
              {initial.map((d) => {
                const login = logins.find((l) => l.id === d.userId);
                return (
                  <TR key={d.id}>
                    <TD className="font-medium text-sage-900">
                      {d.name}
                      {d.qualification && (
                        <span className="ml-1.5 text-[12px] font-normal text-sage-500">
                          {d.qualification}
                        </span>
                      )}
                    </TD>
                    <TD className="text-sage-500">{d.specialty || "—"}</TD>
                    <TD className="font-mono text-[13px]">{d.nmcNo || "—"}</TD>
                    <TD className="text-[13px] text-sage-500">{d.email || "—"}</TD>
                    <TD className="text-[13px]">
                      {d.userId ? (
                        <span className="font-mono text-clinic-700">
                          {login?.username ?? "attached"}
                        </span>
                      ) : (
                        <span className="text-sage-300">—</span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2 text-sage-500">
                        {d.notifyPush ? (
                          <Bell className="h-4 w-4" aria-label="On their phone" />
                        ) : (
                          <BellOff
                            className="h-4 w-4 text-sage-300"
                            aria-label="Not on their phone"
                          />
                        )}
                        <Mail
                          className={
                            d.notifyEmail && d.email
                              ? "h-4 w-4"
                              : "h-4 w-4 text-sage-300"
                          }
                          aria-label={
                            d.notifyEmail && d.email ? "By email" : "Not by email"
                          }
                        />
                      </div>
                    </TD>
                    <TD>
                      {describeShare({ basis: d.shareBasis, value: d.shareValue })}
                    </TD>
                    <TD>
                      <Badge tone={d.active ? "ok" : "neutral"}>
                        {d.active ? "Active" : "Off"}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <button
                        onClick={() => openEdit(d)}
                        className="text-[13px] text-clinic-700 hover:underline"
                      >
                        Edit
                      </button>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit doctor" : "Add doctor"}
        className="max-w-lg"
      >
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <Field label="Name">
            <Input
              value={form.name}
              autoFocus
              onChange={(e) => set("name", e.target.value)}
              placeholder="Dr. Sunita Karki"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Qualification" hint="Printed under the name on a slip">
              <Input
                value={form.qualification}
                onChange={(e) => set("qualification", e.target.value)}
                placeholder="MBBS, MD"
              />
            </Field>
            <Field label="Specialty">
              <Input
                value={form.specialty}
                onChange={(e) => set("specialty", e.target.value)}
                placeholder="General Medicine"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="NMC number">
              <Input
                value={form.nmcNo}
                onChange={(e) => set("nmcNo", e.target.value)}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Email"
            hint="Where a booking is emailed. Leave blank if they don't want emails."
          >
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="doctor@example.com"
            />
          </Field>

          <Field
            label="Their sign-in"
            hint={
              available.length === 0
                ? "No Doctor sign-ins to attach yet. Make one under Users first."
                : "Only sign-ins made with the Doctor role appear here."
            }
          >
            <Select
              value={form.userId}
              onChange={(e) => set("userId", e.target.value)}
              disabled={available.length === 0}
            >
              <option value="">No sign-in</option>
              {available.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.username})
                </option>
              ))}
            </Select>
          </Field>

          <fieldset className="rounded-[10px] border border-line px-4 py-3">
            <legend className="px-1 text-[13px] font-medium text-sage-900">
              Tell them when somebody is booked in
            </legend>
            <label className="flex items-center gap-2 py-1 text-[14px] text-sage-900">
              <input
                type="checkbox"
                checked={form.notifyPush}
                onChange={(e) => set("notifyPush", e.target.checked)}
                className="h-4 w-4 accent-sage-700"
              />
              On their phone
            </label>
            <label className="flex items-center gap-2 py-1 text-[14px] text-sage-900">
              <input
                type="checkbox"
                checked={form.notifyEmail}
                onChange={(e) => set("notifyEmail", e.target.checked)}
                className="h-4 w-4 accent-sage-700"
              />
              By email
            </label>
            <p className="pt-1 text-[12px] text-sage-500">
              The doctor can change both of these themselves.
            </p>
          </fieldset>

          <Field
            label="What the doctor takes"
            hint="Changing this affects bills from now on. Bills already saved keep the share they were made with."
          >
            <Select
              value={form.shareBasis}
              onChange={(e) => set("shareBasis", e.target.value as ShareBasis)}
            >
              {(Object.keys(SHARE_BASIS_LABEL) as ShareBasis[]).map((b) => (
                <option key={b} value={b}>
                  {SHARE_BASIS_LABEL[b]}
                </option>
              ))}
            </Select>
          </Field>

          {form.shareBasis !== "none" && (
            <Field
              label={isPercent(form.shareBasis) ? "Percentage" : "Amount per consultation"}
              hint={
                isPercent(form.shareBasis)
                  ? "For example 40 for forty percent"
                  : "In rupees"
              }
            >
              <Input
                numeric
                value={form.shareEntry}
                onChange={(e) => set("shareEntry", e.target.value)}
                placeholder={isPercent(form.shareBasis) ? "40" : "150"}
              />
            </Field>
          )}

          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
              className="h-4 w-4 accent-sage-700"
            />
            Currently seeing patients
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
