"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitMerge, ArrowRight } from "lucide-react";
import { mergePatientsAction } from "@/app/(app)/patients/actions";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatPatientNo } from "@/lib/patient-no";
import { cn } from "@/lib/cn";
import type { PatientRow } from "@/components/clinic/patient-search";

function Row({
  p,
  selected,
  onPick,
}: {
  p: PatientRow;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "flex w-full items-center gap-3 rounded-[8px] border px-3 py-2 text-left text-[13px]",
        selected
          ? "border-clinic-700 bg-clinic-150"
          : "border-line bg-cream-50 hover:bg-cream-200",
      )}
    >
      <span className="w-[86px] shrink-0 font-mono text-clinic-700">
        {p.patientNo != null ? formatPatientNo(p.patientNo) : "—"}
      </span>
      <span className="flex-1 font-medium text-sage-900">{p.name}</span>
      <span className="font-mono text-sage-500">{p.phone}</span>
    </button>
  );
}

/**
 * Merging is a human decision, always (Rules §2.7). Nothing here happens
 * automatically: an Admin picks which record survives, sees exactly what moves,
 * and types to confirm.
 */
export function MergePatients({
  patients,
  initialKeepId,
}: {
  patients: PatientRow[];
  initialKeepId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [keepId, setKeepId] = useState<string | null>(initialKeepId);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return patients.slice(0, 40);
    const digits = term.replace(/\D/g, "");
    return patients
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (digits && p.phone.replace(/\D/g, "").includes(digits)) ||
          (p.patientNo != null && String(p.patientNo).includes(digits || term)),
      )
      .slice(0, 40);
  }, [q, patients]);

  const keep = patients.find((p) => p.id === keepId) ?? null;
  const merge = patients.find((p) => p.id === mergeId) ?? null;
  const ready = keep && merge && keep.id !== merge.id;

  function run() {
    if (!ready) return;
    startTransition(async () => {
      const res = await mergePatientsAction(keep!.id, merge!.id);
      if (!res.ok) {
        toast.error(res.userMessage ?? "Something went wrong. Please try again.");
        return;
      }
      toast.success("Patients merged");
      router.push(`/patients/${keep!.id}`);
    });
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <p className="text-[14px] leading-[1.5] text-sage-500">
        Two records for the same person? Pick the one to keep and the one to
        merge into it. Visits, bills and files all move across. The merged
        record&apos;s number is retired — it is never given to anyone else, and
        this can&apos;t be undone.
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, phone or patient number"
        className="h-11 rounded-[8px] border border-line bg-cream-50 px-3 text-[15px] outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-sage-900">
            Keep this record
          </h2>
          <div className="flex flex-col gap-1.5">
            {filtered.map((p) => (
              <Row
                key={`k-${p.id}`}
                p={p}
                selected={keepId === p.id}
                onPick={() => setKeepId(p.id)}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-[14px] font-semibold text-sage-900">
            Merge this one into it
          </h2>
          <div className="flex flex-col gap-1.5">
            {filtered
              .filter((p) => p.id !== keepId)
              .map((p) => (
                <Row
                  key={`m-${p.id}`}
                  p={p}
                  selected={mergeId === p.id}
                  onPick={() => setMergeId(p.id)}
                />
              ))}
          </div>
        </section>
      </div>

      {ready && (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-cream-50 p-4">
          <span className="text-[14px] text-sage-900">
            <span className="font-semibold">{merge!.name}</span>{" "}
            <span className="font-mono text-[13px] text-sage-500">
              {merge!.patientNo != null ? formatPatientNo(merge!.patientNo) : ""}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 text-sage-500" />
          <span className="text-[14px] text-sage-900">
            <span className="font-semibold">{keep!.name}</span>{" "}
            <span className="font-mono text-[13px] text-clinic-700">
              {keep!.patientNo != null ? formatPatientNo(keep!.patientNo) : ""}
            </span>
          </span>
          <Button
            className="ml-auto"
            onClick={() => {
              setTyped("");
              setConfirming(true);
            }}
          >
            <GitMerge className="h-4 w-4" />
            Merge
          </Button>
        </div>
      )}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Merge these two records?"
      >
        <p className="text-[14px] leading-[1.5] text-sage-900">
          Everything under <span className="font-semibold">{merge?.name}</span>{" "}
          moves to <span className="font-semibold">{keep?.name}</span>. The
          merged record stays visible, pointing at the one you kept, and its
          number is retired for good. This can&apos;t be undone.
        </p>
        <label className="mt-4 block text-[13px] font-medium text-sage-900">
          Type <span className="font-mono text-magenta-600">merge</span> to confirm
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            className="mt-1.5 h-10 w-full rounded-[8px] border border-line bg-cream-50 px-3 text-[14px] outline-none focus:border-sage-700"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Not now
          </Button>
          <Button
            variant="destructive"
            disabled={typed.trim().toLowerCase() !== "merge" || pending}
            onClick={run}
          >
            {pending ? "Merging…" : "Merge records"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
