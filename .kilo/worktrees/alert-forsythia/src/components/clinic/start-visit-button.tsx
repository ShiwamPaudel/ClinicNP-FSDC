"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Stethoscope } from "lucide-react";
import { startVisitAction } from "@/app/(app)/patients/actions";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { VISIT_TYPE_LABEL, type VisitType } from "@/lib/visit-types";

const inputClass =
  "h-10 w-full rounded-[8px] border border-line bg-cream-50 px-3 text-[14px] outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20";

/**
 * Start a visit in one step from the patient card. Only what the front desk
 * needs at the door — the doctor's own notes go on the visit itself.
 */
export function StartVisitButton({
  patientId,
  todayAd,
  todayBs,
  label = "Start visit",
}: {
  patientId: string;
  /** Today, resolved on the server through lib/bs.ts (Rules §1.5). */
  todayAd: string;
  todayBs: string;
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<VisitType>("new");
  const [department, setDepartment] = useState("");
  const [complaint, setComplaint] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const created = await startVisitAction({
        patientId,
        dateAd: todayAd,
        dateBs: todayBs,
        type,
        department,
        complaint,
      });
      if (!created.ok) {
        toast.error(
          created.userMessage ?? "Something went wrong. Please try again.",
        );
        return;
      }
      setOpen(false);
      toast.success("Visit started");
      router.push(`/visits/${created.id}`);
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Stethoscope className="h-4 w-4" />
        {label}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Start a visit">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-sage-900">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as VisitType)}
              className={inputClass}
            >
              {(Object.keys(VISIT_TYPE_LABEL) as VisitType[]).map((t) => (
                <option key={t} value={t}>
                  {VISIT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-sage-900">
              Department (optional)
            </span>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className={inputClass}
              placeholder="e.g. OPD, Ultrasound"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-medium text-sage-900">
              What brings them in? (optional)
            </span>
            <input
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
              className={inputClass}
              placeholder="In their own words"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Starting…" : "Start visit"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
