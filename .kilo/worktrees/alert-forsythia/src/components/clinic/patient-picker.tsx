"use client";

import { useEffect, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatPatientNo } from "@/lib/patient-no";
import { AGE_UNIT_OPTIONS, type AgeUnit } from "@/lib/age";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

export interface FoundPatient {
  id: string;
  patientNo: number | null;
  name: string;
  sex: "f" | "m" | "o";
  phone: string;
  ageShort: string;
}

/** Somebody the clinic has never heard of, typed in on the spot. */
export interface DraftPatient {
  name: string;
  sex: "f" | "m" | "o";
  ageValue: number | null;
  ageUnit: AgeUnit | null;
  phone: string;
  address: string;
}

export const BLANK_DRAFT: DraftPatient = {
  name: "",
  sex: "f",
  ageValue: null,
  ageUnit: "y",
  phone: "",
  address: "",
};

/**
 * Who is this for?
 *
 * Somebody phoning to book has usually never been to the clinic, so
 * registering them cannot mean leaving this screen and starting again. Search
 * first, because a returning patient must not become a second copy of
 * themselves; register here only when the search genuinely finds nobody.
 */
export function PatientPicker({
  chosen,
  draft,
  onChoose,
  onDraftChange,
}: {
  chosen: FoundPatient | null;
  draft: DraftPatient | null;
  onChoose: (p: FoundPatient | null) => void;
  onDraftChange: (d: DraftPatient | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundPatient[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/patients/search?q=${encodeURIComponent(term)}`,
        );
        const body = (await res.json()) as {
          ok: boolean;
          patients?: FoundPatient[];
        };
        setResults(body.ok && body.patients ? body.patients : []);
      } catch {
        // No connection: the search simply finds nothing. Registering someone
        // new still works, and the booking is saved the moment it can be.
        setResults([]);
      } finally {
        setSearching(false);
        setSearched(true);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  // ---- already picked ----
  if (chosen) {
    return (
      <Field label={strings.whoIsThisFor}>
        <div className="flex items-center gap-3 rounded-[8px] border border-clinic-150 bg-clinic-75 px-3 py-2.5">
          <span className="font-mono text-[12px] text-clinic-700">
            {chosen.patientNo != null ? formatPatientNo(chosen.patientNo) : "New"}
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-sage-900">
            {chosen.name}
          </span>
          <span className="text-[13px] text-sage-500">
            {chosen.ageShort}
            {chosen.phone ? ` · ${chosen.phone}` : ""}
          </span>
          <button
            type="button"
            onClick={() => onChoose(null)}
            aria-label="Choose somebody else"
            className="rounded-[6px] p-1 text-sage-500 hover:bg-cream-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </Field>
    );
  }

  // ---- registering someone new ----
  if (draft) {
    return (
      <div className="flex flex-col gap-4 rounded-[10px] border border-clinic-150 bg-clinic-75 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-clinic-900">
            {strings.registerSomeoneNew}
          </span>
          <button
            type="button"
            onClick={() => onDraftChange(null)}
            className="text-[13px] text-clinic-700 hover:underline"
          >
            Search instead
          </button>
        </div>

        <Field label="Name">
          <Input
            autoFocus
            value={draft.name}
            onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
            placeholder="Full name"
          />
        </Field>

        <div className="grid grid-cols-[1fr_1fr_1.2fr] gap-3">
          <Field label="Sex">
            <Select
              value={draft.sex}
              onChange={(e) =>
                onDraftChange({
                  ...draft,
                  sex: e.target.value as "f" | "m" | "o",
                })
              }
            >
              <option value="f">Female</option>
              <option value="m">Male</option>
              <option value="o">Other</option>
            </Select>
          </Field>
          <Field label="Age">
            <Input
              numeric
              inputMode="numeric"
              value={draft.ageValue ?? ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                onDraftChange({
                  ...draft,
                  ageValue: digits === "" ? null : Number(digits),
                });
              }}
            />
          </Field>
          <Field label="In">
            <Select
              value={draft.ageUnit ?? "y"}
              onChange={(e) =>
                onDraftChange({ ...draft, ageUnit: e.target.value as AgeUnit })
              }
            >
              {AGE_UNIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={strings.phone}>
            <Input
              inputMode="tel"
              value={draft.phone}
              onChange={(e) => onDraftChange({ ...draft, phone: e.target.value })}
            />
          </Field>
          <Field label={strings.address}>
            <Input
              value={draft.address}
              onChange={(e) =>
                onDraftChange({ ...draft, address: e.target.value })
              }
            />
          </Field>
        </div>
      </div>
    );
  }

  // ---- searching ----
  return (
    <Field label={strings.whoIsThisFor} hint={strings.searchPatientHint}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-500" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={strings.searchPatientHint}
          className="pl-9"
        />
      </div>

      {q.trim().length >= 2 && (
        <div className="mt-1 max-h-[220px] overflow-y-auto rounded-[8px] border border-line bg-cream-50">
          {searching && results.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-sage-500">Looking…</p>
          ) : results.length === 0 ? (
            <div className="px-3 py-3">
              <p className="text-[13px] text-sage-500">
                {searched ? strings.nobodyByThatName : "Looking…"}
              </p>
            </div>
          ) : (
            <ul>
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onChoose(p)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-0",
                      "hover:bg-clinic-75",
                    )}
                  >
                    <span className="w-[78px] shrink-0 font-mono text-[12px] text-clinic-700">
                      {p.patientNo != null ? formatPatientNo(p.patientNo) : "—"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-sage-900">
                      {p.name}
                    </span>
                    <span className="shrink-0 text-[12px] text-sage-500">
                      {p.ageShort}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => onDraftChange({ ...BLANK_DRAFT, name: q.trim() })}
        className="mt-2 flex w-fit items-center gap-1.5 text-[13px] font-medium text-clinic-700 hover:underline"
      >
        <UserPlus className="h-4 w-4" />
        {strings.registerSomeoneNew}
      </button>
    </Field>
  );
}
