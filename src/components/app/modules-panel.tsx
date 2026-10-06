"use client";

import { useState, useTransition } from "react";
import { Stethoscope, Pill } from "lucide-react";
import { setModulesAction } from "@/app/(app)/settings/actions";
import { useToast } from "@/components/ui/toast";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface ModuleFlags {
  pharmacy: boolean;
  clinic: boolean;
}

type ModuleKey = keyof ModuleFlags;

const COPY: Record<
  ModuleKey,
  { title: string; on: string; offConfirm: string; icon: typeof Pill }
> = {
  pharmacy: {
    title: "Pharmacy",
    on: "Medicines, batches and expiry, purchases, suppliers, stock and the medicine lines at the counter.",
    offConfirm:
      "Turning off the pharmacy hides medicines, purchases, suppliers and stock. Nothing is deleted — turn it back on any time.",
    icon: Pill,
  },
  clinic: {
    title: "Clinic",
    on: "Patients and their visits, services and doctors, report files, and the service lines at the counter.",
    offConfirm:
      "Turning off the clinic hides patients, visits and services. Nothing is deleted — turn it back on any time.",
    icon: Stethoscope,
  },
};

export function ModulesPanel({ initial }: { initial: ModuleFlags }) {
  const [flags, setFlags] = useState<ModuleFlags>(initial);
  const [confirming, setConfirming] = useState<ModuleKey | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const onlyOneLeft = (key: ModuleKey) =>
    flags[key] && !flags[key === "pharmacy" ? "clinic" : "pharmacy"];

  function commit(next: ModuleFlags) {
    const previous = flags;
    setFlags(next);
    startTransition(async () => {
      const res = await setModulesAction(next);
      if (!res.ok) {
        setFlags(previous);
        toast.error(res.userMessage ?? "Something went wrong. Please try again.");
        return;
      }
      toast.success("Saved");
    });
  }

  function toggle(key: ModuleKey) {
    if (flags[key]) {
      setConfirming(key);
      return;
    }
    commit({ ...flags, [key]: true });
  }

  return (
    <>
      <header className="mb-5">
        <h1 className="font-display text-[28px] font-semibold text-sage-900">
          Modules
        </h1>
        <p className="mt-1 text-[14px] text-sage-500">
          Switch off a part of the system you don&apos;t use. Nothing is ever
          deleted — switching it back on brings everything back exactly as it was.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {(Object.keys(COPY) as ModuleKey[]).map((key) => {
          const copy = COPY[key];
          const Icon = copy.icon;
          const last = onlyOneLeft(key);
          return (
            <div
              key={key}
              className="flex items-start gap-4 rounded-[10px] border border-line bg-cream-50 p-4"
            >
              <span
                className={cn(
                  "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px]",
                  key === "clinic"
                    ? "bg-clinic-75 text-clinic-700"
                    : "bg-sage-75 text-sage-700",
                )}
              >
                <Icon className="h-5 w-5" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-semibold text-sage-900">
                  {copy.title}
                </div>
                <p className="mt-0.5 text-[13px] leading-[1.45] text-sage-500">
                  {copy.on}
                </p>
                {last && (
                  <p className="mt-2 text-[12px] text-warn-600">
                    At least one part of the system has to stay switched on.
                  </p>
                )}
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={flags[key]}
                aria-label={`${copy.title} module`}
                disabled={last || pending}
                onClick={() => toggle(key)}
                className={cn(
                  "relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-700 focus-visible:ring-offset-2",
                  flags[key] ? "bg-sage-700" : "bg-sage-300",
                  (last || pending) && "cursor-not-allowed opacity-60",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-cream-50 transition-[left]",
                    flags[key] ? "left-[22px]" : "left-0.5",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>

      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={confirming ? `Turn off ${COPY[confirming].title.toLowerCase()}?` : ""}
      >
        <p className="text-[14px] leading-[1.45] text-sage-900">
          {confirming ? COPY[confirming].offConfirm : ""}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(null)}>
            Keep it on
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              const key = confirming;
              setConfirming(null);
              if (key) commit({ ...flags, [key]: false });
            }}
          >
            Turn it off
          </Button>
        </div>
      </Dialog>
    </>
  );
}
