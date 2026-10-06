"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import {
  updateVisitAction,
  cancelVisitAction,
} from "@/app/(app)/patients/actions";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  VISIT_TYPE_LABEL,
  VISIT_STATUS_LABEL,
  type VisitType,
  type VisitStatus,
} from "@/lib/visit-types";

const inputClass =
  "h-10 w-full rounded-[8px] border border-line bg-cream-50 px-3 text-[14px] outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20";

export interface VisitFormState {
  id: string;
  patientId: string;
  type: VisitType;
  status: VisitStatus;
  department: string;
  complaint: string;
  findings: string;
  advice: string;
  bp: string;
  pulse: string;
  tempC: string;
  weightKg: string;
  spo2: string;
}

/** Five small inputs on one line, all optional, all blank by default. Nothing
 *  here validates or interprets a physiological value (Rules §2.5). */
function Vital({
  label,
  suffix,
  value,
  onChange,
  disabled,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex w-[88px] flex-col gap-1">
      <span className="text-[12px] text-sage-500">{label}</span>
      <span className="relative">
        <input
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full rounded-[8px] border border-line bg-cream-50 pl-2.5 pr-8 text-right font-mono text-[14px] outline-none focus:border-sage-700 disabled:opacity-50"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-sage-500">
          {suffix}
        </span>
      </span>
    </label>
  );
}

export function VisitDetail({
  initial,
  isAdmin,
}: {
  initial: VisitFormState;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState(initial);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  const cancelled = v.status === "cancelled";
  const set = <K extends keyof VisitFormState>(k: K, value: VisitFormState[K]) =>
    setV((p) => ({ ...p, [k]: value }));

  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  function save() {
    startTransition(async () => {
      const res = await updateVisitAction({
        id: v.id,
        patientId: v.patientId,
        type: v.type,
        department: v.department,
        complaint: v.complaint,
        findings: v.findings,
        advice: v.advice,
        status: v.status === "cancelled" ? undefined : v.status,
        vitals: {
          bp: v.bp,
          pulse: num(v.pulse),
          tempC: num(v.tempC),
          weightKg: num(v.weightKg),
          spo2: num(v.spo2),
        },
      });
      if (!res.ok) {
        toast.error(res.userMessage ?? "Something went wrong. Please try again.");
        return;
      }
      toast.success("Visit saved");
      router.refresh();
    });
  }

  function cancel() {
    startTransition(async () => {
      const res = await cancelVisitAction(v.id, reason, v.patientId);
      if (!res.ok) {
        toast.error(res.userMessage ?? "Something went wrong. Please try again.");
        return;
      }
      setCancelling(false);
      set("status", "cancelled");
      toast.success("Visit cancelled");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {cancelled && (
        <div className="rounded-[10px] bg-danger-100 px-4 py-3 text-[14px] text-danger-600">
          This visit was cancelled. It stays on the record and is left out of the
          counts.
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <label className="flex w-[180px] flex-col gap-1">
          <span className="text-[13px] font-medium text-sage-900">Type</span>
          <select
            value={v.type}
            disabled={cancelled}
            onChange={(e) => set("type", e.target.value as VisitType)}
            className={inputClass}
          >
            {(Object.keys(VISIT_TYPE_LABEL) as VisitType[]).map((t) => (
              <option key={t} value={t}>
                {VISIT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex w-[180px] flex-col gap-1">
          <span className="text-[13px] font-medium text-sage-900">Status</span>
          <select
            value={v.status}
            disabled={cancelled}
            onChange={(e) => set("status", e.target.value as VisitStatus)}
            className={inputClass}
          >
            {(["waiting", "seen", "closed"] as const).map((s) => (
              <option key={s} value={s}>
                {VISIT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[200px] flex-1 flex-col gap-1">
          <span className="text-[13px] font-medium text-sage-900">Department</span>
          <input
            value={v.department}
            disabled={cancelled}
            onChange={(e) => set("department", e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-sage-900">Vitals</h2>
        <div className="flex flex-wrap gap-2">
          <Vital label="BP" suffix="" value={v.bp} disabled={cancelled} onChange={(x) => set("bp", x)} />
          <Vital label="Pulse" suffix="/min" value={v.pulse} disabled={cancelled} onChange={(x) => set("pulse", x)} />
          <Vital label="Temp" suffix="°C" value={v.tempC} disabled={cancelled} onChange={(x) => set("tempC", x)} />
          <Vital label="Weight" suffix="kg" value={v.weightKg} disabled={cancelled} onChange={(x) => set("weightKg", x)} />
          <Vital label="SpO₂" suffix="%" value={v.spo2} disabled={cancelled} onChange={(x) => set("spo2", x)} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        {(
          [
            ["complaint", "What brings them in"],
            ["findings", "Findings"],
            ["advice", "Advice"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-sage-900">{label}</span>
            <textarea
              value={v[key]}
              disabled={cancelled}
              onChange={(e) => set(key, e.target.value)}
              rows={3}
              className="rounded-[8px] border border-line bg-cream-50 px-3 py-2 text-[14px] leading-[1.45] outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20 disabled:opacity-50"
            />
          </label>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={pending || cancelled}>
          {pending ? "Saving…" : "Save visit"}
        </Button>
        {isAdmin && !cancelled && (
          <Button variant="destructive" onClick={() => setCancelling(true)}>
            <Ban className="h-4 w-4" />
            Cancel visit
          </Button>
        )}
      </div>

      <Dialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Cancel this visit?"
      >
        <p className="text-[14px] text-sage-900">
          The visit stays on the patient&apos;s record, marked cancelled, and is
          left out of the counts. Visits are never deleted.
        </p>
        <label className="mt-4 block text-[13px] font-medium text-sage-900">
          Why is it being cancelled?
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
            className="mt-1.5 h-10 w-full rounded-[8px] border border-line bg-cream-50 px-3 text-[14px] outline-none focus:border-sage-700"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCancelling(false)}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || pending}
            onClick={cancel}
          >
            Cancel visit
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
