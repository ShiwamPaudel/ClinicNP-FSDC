"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  registerPatientAction,
  updatePatientAction,
  checkDuplicatesAction,
  type PatientFormInput,
} from "@/app/(app)/patients/actions";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { AGE_UNIT_OPTIONS, type AgeUnit } from "@/lib/age";
import { formatPatientNo } from "@/lib/patient-no";
import type { Sex } from "@/lib/repos/patients";
import { cn } from "@/lib/cn";

export interface PatientFormValues {
  id?: string;
  name: string;
  sex: Sex | "";
  ageValue: string;
  ageUnit: AgeUnit;
  dobAd: string;
  phone: string;
  address: string;
  guardianName: string;
  bloodGroup: string;
  note: string;
  referredBy: string;
}

export const EMPTY_PATIENT: PatientFormValues = {
  name: "",
  sex: "",
  ageValue: "",
  ageUnit: "y",
  dobAd: "",
  phone: "",
  address: "",
  guardianName: "",
  bloodGroup: "",
  note: "",
  referredBy: "",
};

interface Duplicate {
  id: string;
  patientNo: number | null;
  name: string;
  phone: string;
  reason: string;
  lastVisitBs: string | null;
}

function Field({
  label,
  required,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1" htmlFor={htmlFor}>
      <span className="text-[13px] font-medium text-sage-900">
        {label}
        {required && <span className="ml-0.5 text-danger-600">*</span>}
      </span>
      {children}
      {hint && <span className="text-[12px] text-sage-500">{hint}</span>}
    </label>
  );
}

const inputClass =
  "h-10 rounded-[8px] border border-line bg-cream-50 px-3 text-[14px] outline-none " +
  "focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20";

export function PatientForm({
  mode,
  initial,
  todayAd,
}: {
  mode: "create" | "edit";
  initial: PatientFormValues;
  /** AD ISO date the entered age is true on. */
  todayAd: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState<PatientFormValues>(initial);
  const [dups, setDups] = useState<Duplicate[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const set = <K extends keyof PatientFormValues>(
    k: K,
    value: PatientFormValues[K],
  ) => setV((p) => ({ ...p, [k]: value }));

  // The duplicate check runs quietly as the front desk types, and appears
  // inline under the phone field — never as a blocking dialog (Design.md §5).
  useEffect(() => {
    const name = v.name.trim();
    const phone = v.phone.trim();
    if (name.length < 3 && phone.length < 5) {
      setDups([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await checkDuplicatesAction(name, phone, v.id);
      setDups(res.matches);
    }, 400);
    return () => clearTimeout(t);
  }, [v.name, v.phone, v.id]);

  function toInput(): PatientFormInput & { id?: string } {
    const usingDob = v.dobAd.trim() !== "";
    return {
      id: v.id,
      name: v.name,
      sex: v.sex as Sex,
      ageValue: usingDob ? null : v.ageValue === "" ? null : Number(v.ageValue),
      ageUnit: usingDob ? null : v.ageUnit,
      ageAsOfAd: usingDob ? null : todayAd,
      dobAd: usingDob ? v.dobAd : null,
      phone: v.phone,
      address: v.address,
      guardianName: v.guardianName,
      bloodGroup: v.bloodGroup,
      note: v.note,
      referredBy: v.referredBy,
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const payload = toInput();
      if (mode === "create") {
        const res = await registerPatientAction(payload);
        if (!res.ok) {
          toast.error(res.userMessage ?? "Something went wrong. Please try again.");
          return;
        }
        toast.success("Patient registered");
        router.push(`/patients/${res.id}`);
      } else {
        const res = await updatePatientAction({
          ...payload,
          id: v.id!,
        });
        if (!res.ok) {
          toast.error(res.userMessage ?? "Something went wrong. Please try again.");
          return;
        }
        toast.success("Patient updated");
        router.push(`/patients/${v.id}`);
      }
    });
  }

  const usingDob = v.dobAd.trim() !== "";

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name" required htmlFor="name">
            <input
              id="name"
              ref={nameRef}
              value={v.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputClass}
              autoComplete="off"
            />
          </Field>
        </div>

        <Field label="Sex" required htmlFor="sex">
          <select
            id="sex"
            value={v.sex}
            onChange={(e) => set("sex", e.target.value as Sex)}
            className={inputClass}
          >
            <option value="">Choose…</option>
            <option value="f">Female</option>
            <option value="m">Male</option>
            <option value="o">Other</option>
          </select>
        </Field>

        <Field
          label="Age"
          required={!usingDob}
          hint="Type the age the patient tells you. Date of birth below is optional."
        >
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              value={v.ageValue}
              disabled={usingDob}
              onChange={(e) => set("ageValue", e.target.value)}
              className={cn(inputClass, "w-24 text-right font-mono disabled:opacity-50")}
              aria-label="Age"
            />
            <select
              value={v.ageUnit}
              disabled={usingDob}
              onChange={(e) => set("ageUnit", e.target.value as AgeUnit)}
              className={cn(inputClass, "flex-1 disabled:opacity-50")}
              aria-label="Age unit"
            >
              {AGE_UNIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </Field>

        <Field label="Phone" required htmlFor="phone">
          <input
            id="phone"
            inputMode="tel"
            value={v.phone}
            onChange={(e) => set("phone", e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Date of birth"
          htmlFor="dob"
          hint="Only if the patient knows it. Then the age is always exact."
        >
          <input
            id="dob"
            type="date"
            value={v.dobAd}
            onChange={(e) => set("dobAd", e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Address"
            required
            htmlFor="address"
            hint="District, municipality/ward and tole."
          >
            <input
              id="address"
              value={v.address}
              onChange={(e) => set("address", e.target.value)}
              className={inputClass}
              autoComplete="off"
            />
          </Field>
        </div>
      </div>

      {/* duplicate warning: inline, soft, never a block */}
      {dups.length > 0 && (
        <div className="rounded-[10px] border border-warn-600/30 bg-warn-100 p-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-warn-600">
            <AlertTriangle className="h-4 w-4" />
            Is this the same person?
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {dups.map((d) => (
              <li key={d.id} className="text-[13px] text-sage-900">
                <Link
                  href={`/patients/${d.id}`}
                  className="font-mono text-clinic-700 hover:underline"
                >
                  {d.patientNo != null ? formatPatientNo(d.patientNo) : "—"}
                </Link>{" "}
                <span className="font-medium">{d.name}</span>
                <span className="text-sage-500">
                  {" "}
                  · {d.reason}
                  {d.lastVisitBs
                    ? ` · last visit ${d.lastVisitBs}`
                    : " · no visits yet"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-sage-500">
            If it&apos;s someone else, carry on — you can save anyway.
          </p>
        </div>
      )}

      <details className="rounded-[10px] border border-line bg-cream-50 p-4">
        <summary className="cursor-pointer text-[14px] font-medium text-sage-900">
          More details (optional)
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Guardian / attendant" htmlFor="guardian">
            <input
              id="guardian"
              value={v.guardianName}
              onChange={(e) => set("guardianName", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Blood group" htmlFor="blood">
            <input
              id="blood"
              value={v.bloodGroup}
              onChange={(e) => set("bloodGroup", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Referred by" htmlFor="ref">
            <input
              id="ref"
              value={v.referredBy}
              onChange={(e) => set("referredBy", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label="Note or known allergy"
            htmlFor="note"
            hint="Shown as a red strip on the patient's card."
          >
            <input
              id="note"
              value={v.note}
              onChange={(e) => set("note", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </details>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Register patient"
              : "Save changes"}
        </Button>
        <Link href={v.id ? `/patients/${v.id}` : "/patients"}>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}
