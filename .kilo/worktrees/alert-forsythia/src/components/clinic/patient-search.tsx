"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { formatPatientNo } from "@/lib/patient-no";
import { displayAge } from "@/lib/age";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

export interface PatientRow {
  id: string;
  patientNo: number | null;
  name: string;
  sex: "f" | "m" | "o";
  ageValue: number | null;
  ageUnit: "y" | "m" | "d" | null;
  ageAsOfAd: string | null;
  dobAd: string | null;
  phone: string;
  address: string;
  note: string;
}

const SEX_SHORT: Record<string, string> = { f: "F", m: "M", o: "—" };

/**
 * Patient search. Filtering happens in the browser against the rows already
 * loaded, so typing stays instant — the same reason item search is instant at
 * the counter. Name, phone and number all match.
 */
export function PatientSearch({
  patients,
  todayAd,
}: {
  patients: PatientRow[];
  todayAd: string;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return patients;
    const digits = term.replace(/\D/g, "");
    return patients.filter((p) => {
      if (p.name.toLowerCase().includes(term)) return true;
      if (digits && p.phone.replace(/\D/g, "").includes(digits)) return true;
      if (p.patientNo != null) {
        if (String(p.patientNo).includes(digits || term)) return true;
        if (formatPatientNo(p.patientNo).toLowerCase().includes(term)) return true;
      }
      return false;
    });
  }, [q, patients]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[280px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, phone or patient number"
            className="h-11 w-full rounded-[8px] border border-line bg-cream-50 pl-9 pr-3 text-[15px] outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20"
          />
        </div>
        <Link href="/patients/new">
          <Button>
            <UserPlus className="h-4 w-4" />
            Register patient
          </Button>
        </Link>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          message={
            q
              ? "Nobody matches that. Check the spelling, or register them as a new patient."
              : "No patients yet. Register the first one to get started."
          }
          action={
            <Link href="/patients/new">
              <Button>
                <UserPlus className="h-4 w-4" />
                Register patient
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <p className="text-[13px] text-sage-500">
            {filtered.length} {filtered.length === 1 ? "patient" : "patients"}
          </p>
          <ul className="flex flex-col gap-1.5">
            {filtered.map((p) => {
              const age = displayAge(
                {
                  value: p.ageValue,
                  unit: p.ageUnit,
                  asOfAd: p.ageAsOfAd,
                  dobAd: p.dobAd,
                },
                todayAd,
              );
              return (
                <li key={p.id}>
                  <Link
                    href={`/patients/${p.id}`}
                    className={cn(
                      "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] border border-line",
                      "bg-cream-50 px-4 py-3 transition-colors hover:bg-clinic-75",
                    )}
                  >
                    <span className="w-[92px] shrink-0 font-mono text-[13px] text-clinic-700">
                      {p.patientNo != null ? formatPatientNo(p.patientNo) : "—"}
                    </span>
                    <span className="min-w-[180px] flex-1 text-[16px] font-semibold text-sage-900">
                      {p.name}
                      {p.note && (
                        <span className="ml-2 rounded-[999px] bg-danger-100 px-2 py-0.5 text-[11px] font-medium text-danger-600">
                          Allergy
                        </span>
                      )}
                    </span>
                    <span className="w-[90px] shrink-0 text-[13px] text-sage-500">
                      {age.short} · {SEX_SHORT[p.sex]}
                    </span>
                    <span className="w-[120px] shrink-0 font-mono text-[13px] text-sage-500">
                      {p.phone}
                    </span>
                    <span className="min-w-[140px] flex-1 truncate text-[13px] text-sage-500">
                      {p.address}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
