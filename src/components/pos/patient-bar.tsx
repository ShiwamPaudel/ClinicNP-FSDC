"use client";

/**
 * patient-bar.tsx — the navy strip above the bill saying who this is for.
 *
 * Navy carries a person, never a thing (Design.md §1). It is empty and quiet
 * on a medicine-only bill, and it is required the moment a service line
 * appears — a consultation belongs to someone.
 *
 * `P` opens it from anywhere at the counter. Search is by name, phone or
 * patient number, and someone who has never been here can be registered from
 * inside it without leaving the bill.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ulid } from "ulid";
import { UserPlus, X, Search, Loader2, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatPatientNo, provisionalPatientLabel } from "@/lib/patient-no";
import { enqueuePatient } from "@/offline/patient-outbox";
import { getCachedPatients, cachePatient } from "@/offline/catalog-cache";
import { AGE_UNIT_OPTIONS, type AgeUnit } from "@/lib/age";
import type { AttachedPatient } from "@/stores/bill-store";
import { cn } from "@/lib/cn";

interface Found {
  id: string;
  patientNo: number | null;
  name: string;
  sex: string;
  phone: string;
  ageShort: string;
}

export function PatientBar({
  patient,
  required,
  requiredFor = "service",
  onAttach,
  onClear,
  openSignal,
  onOpenChange,
}: {
  patient: AttachedPatient | null;
  /** true once a service line exists, or the bill is going on dues: the bill
   *  cannot be saved without someone */
  required: boolean;
  /** why it is required, so the prompt can say so */
  requiredFor?: "service" | "dues";
  onAttach: (p: AttachedPatient) => void;
  onClear: () => void;
  /** incremented by the counter when F4 or `P` is pressed */
  openSignal: number;
  /** told when the search opens and closes, so the counter's keys stand down */
  onOpenChange?: (open: boolean) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  // The highlighted result, chosen with the arrows and attached with Enter.
  const [activeIdx, setActiveIdx] = useState(0);
  const [searching, setSearching] = useState(false);
  const [offline, setOffline] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sex: "f",
    ageValue: "",
    ageUnit: "y" as AgeUnit,
    phone: "",
  });
  const inputRef = useRef<HTMLInputElement>(null);
  /** Set only for someone registered here while the connection was down. */
  const pendingSnapshot = useRef<AttachedPatient["snapshot"] | null>(null);

  useEffect(() => {
    if (openSignal > 0) {
      setOpen(true);
      setRegistering(false);
    }
  }, [openSignal]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // A new list starts at its first row.
  useEffect(() => setActiveIdx(0), [results]);

  /** The local slice, searched the same way the server searches. */
  const searchLocally = useCallback(async (q: string): Promise<Found[]> => {
    const query = q.trim().toLowerCase();
    const digits = query.replace(/[^0-9]/g, "");
    const rows = await getCachedPatients();
    return rows
      .filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          (digits.length >= 3 && r.phone.replace(/\s/g, "").includes(digits)) ||
          (digits.length > 0 && String(r.patientNo ?? "") === digits),
      )
      .slice(0, 12)
      .map((r) => ({
        id: r.id,
        patientNo: r.patientNo,
        name: r.name,
        sex: r.sex,
        phone: r.phone,
        ageShort: r.ageShort,
      }));
  }, []);

  const search = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(
          `/api/patients/search?q=${encodeURIComponent(q.trim())}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const body = (await res.json()) as { patients: Found[] };
          setResults(body.patients ?? []);
          setOffline(false);
        } else {
          setResults(await searchLocally(q));
        }
      } catch {
        // The connection is down. The counter searches what it has locally
        // rather than showing an empty list and implying nobody is registered.
        setResults(await searchLocally(q));
        setOffline(true);
      }
      setSearching(false);
    },
    [searchLocally],
  );

  useEffect(() => {
    const t = setTimeout(() => void search(query), 180);
    return () => clearTimeout(t);
  }, [query, search]);

  function attach(f: Found) {
    onAttach({
      id: f.id,
      patientNo: f.patientNo,
      name: f.name,
      sex: f.sex,
      ageShort: f.ageShort,
      snapshot: pendingSnapshot.current ?? undefined,
    });
    pendingSnapshot.current = null;
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  /**
   * Register somebody from the counter.
   *
   * The id is minted here, before anything is sent, and it is this person's
   * identity from now on. If the send fails the registration waits in the
   * queue under that same id and the bill made for them carries it, so the
   * two can arrive in either order and still be one person.
   */
  async function registerAndAttach() {
    setBusy(true);
    const id = ulid();
    const draft = {
      id,
      name: form.name.trim(),
      sex: form.sex,
      ageValue: form.ageValue.trim() === "" ? null : Number(form.ageValue),
      ageUnit: (form.ageValue.trim() === "" ? null : form.ageUnit) as
        | "y"
        | "m"
        | "d"
        | null,
      phone: form.phone.trim(),
      address: "",
    };

    async function keepLocally(reason: string) {
      await enqueuePatient({
        ...draft,
        queuedAt: new Date().toISOString(),
        attempts: 0,
        lastError: reason,
      });
      const local: Found = {
        id,
        patientNo: null,
        name: draft.name,
        sex: draft.sex,
        phone: draft.phone,
        ageShort: draft.ageValue ? `${draft.ageValue} ${draft.ageUnit}` : "",
      };
      // The bill made for them carries these details, so it can create the
      // person itself if it reaches the server first.
      pendingSnapshot.current = {
        ageValue: draft.ageValue,
        ageUnit: draft.ageUnit,
        phone: draft.phone,
        address: draft.address,
      };
      await cachePatient({
        id,
        patientNo: null,
        name: draft.name,
        sex: draft.sex,
        phone: draft.phone,
        ageShort: local.ageShort,
      });
      attach(local);
      setRegistering(false);
      setForm({ name: "", sex: "f", ageValue: "", ageUnit: "y", phone: "" });
      toast.success(
        `${draft.name} registered as ${provisionalPatientLabel(id)} — the number comes when the connection is back.`,
      );
    }

    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await res.json().catch(() => null)) as {
        ok: boolean;
        patient?: Found;
        userMessage?: string;
      } | null;

      if (res.ok && body?.ok && body.patient) {
        attach(body.patient);
        await cachePatient({
          id: body.patient.id,
          patientNo: body.patient.patientNo,
          name: body.patient.name,
          sex: body.patient.sex,
          phone: body.patient.phone,
          ageShort: body.patient.ageShort,
        });
        toast.success(`${body.patient.name} registered`);
        setRegistering(false);
        setForm({ name: "", sex: "f", ageValue: "", ageUnit: "y", phone: "" });
        setBusy(false);
        return;
      }

      // A refusal the person can act on — a missing name, say — is theirs to
      // fix. Anything else is the server's problem, not the counter's, and the
      // registration waits rather than being lost.
      if (res.status === 400 || res.status === 403) {
        toast.error(body?.userMessage ?? "Please check the details.");
        setBusy(false);
        return;
      }
      await keepLocally(body?.userMessage ?? `Couldn't send (${res.status})`);
    } catch {
      await keepLocally("no connection");
    }
    setBusy(false);
  }

  return (
    <>
      <div
        className={cn(
          "mb-3 flex items-center gap-3 rounded-[10px] px-4 py-2.5",
          patient
            ? "bg-clinic-900 text-cream-50"
            : required
              ? "border border-dashed border-clinic-500 bg-clinic-75"
              : "border border-line bg-cream-50",
        )}
      >
        {patient ? (
          <>
            <span className="font-mono text-[13px] text-clinic-150">
              {patient.patientNo != null
                ? formatPatientNo(patient.patientNo)
                : "Not numbered yet"}
            </span>
            <span className="text-[15px] font-semibold">{patient.name}</span>
            <span className="text-[13px] text-clinic-150">
              {patient.ageShort} · {patient.sex.toUpperCase()}
            </span>
            <button
              onClick={() => setOpen(true)}
              className="ml-auto rounded-[6px] px-2 py-1 text-[13px] text-clinic-150 hover:bg-clinic-700"
            >
              Change
            </button>
            <button
              onClick={onClear}
              aria-label="Take the patient off this bill"
              className="rounded-[6px] p-1 text-clinic-150 hover:bg-clinic-700"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <span
              className={cn(
                "text-[14px]",
                required ? "font-medium text-clinic-700" : "text-sage-500",
              )}
            >
              {!required
                ? "No patient on this bill"
                : requiredFor === "dues"
                  ? "This bill is going on dues — say who owes it"
                  : "This bill has a service on it — say who it is for"}
            </span>
            <button
              onClick={() => setOpen(true)}
              className="ml-auto flex items-center gap-1.5 rounded-[8px] border border-line bg-cream-50 px-2.5 py-1.5 text-[13px] font-medium text-sage-700 hover:bg-cream-200"
            >
              <UserPlus className="h-4 w-4" />
              Attach patient
              <kbd className="ml-1 rounded-[4px] bg-sage-150 px-1 text-[11px]">F4</kbd>
            </button>
          </>
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={registering ? "Register a new patient" : "Who is this bill for?"}
      >
        {registering ? (
          <div className="flex flex-col gap-4">
            <Field label="Name" htmlFor="counter-patient-name">
              <Input
                id="counter-patient-name"
                value={form.name}
                autoFocus
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Sex" htmlFor="counter-patient-sex">
                <Select
                  id="counter-patient-sex"
                  value={form.sex}
                  onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value }))}
                >
                  <option value="f">Female</option>
                  <option value="m">Male</option>
                  <option value="o">Other</option>
                </Select>
              </Field>
              <Field label="Age" htmlFor="counter-patient-age">
                <Input
                  id="counter-patient-age"
                  numeric
                  value={form.ageValue}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ageValue: e.target.value }))
                  }
                />
              </Field>
              <Field label="Unit" htmlFor="counter-patient-age-unit">
                <Select
                  id="counter-patient-age-unit"
                  value={form.ageUnit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ageUnit: e.target.value as AgeUnit }))
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
            <Field label="Phone" htmlFor="counter-patient-phone">
              <Input
                id="counter-patient-phone"
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value }))
                }
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRegistering(false)}>
                Back to search
              </Button>
              <Button
                onClick={registerAndAttach}
                disabled={busy || !form.name.trim()}
              >
                {busy ? "Registering…" : "Register and attach"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-[8px] border border-line bg-cream-50 px-3">
              <Search className="h-4 w-4 text-sage-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" && results.length > 0) {
                    e.preventDefault();
                    setActiveIdx((i) => Math.min(results.length - 1, i + 1));
                  } else if (e.key === "ArrowUp" && results.length > 0) {
                    e.preventDefault();
                    setActiveIdx((i) => Math.max(0, i - 1));
                  } else if (e.key === "Enter" && results[activeIdx]) {
                    e.preventDefault();
                    attach(results[activeIdx]!);
                  }
                }}
                placeholder="Name, phone or patient number — ↑ ↓ and Enter"
                className="h-11 w-full bg-transparent text-[15px] outline-none placeholder:text-sage-300"
              />
              {searching && <Loader2 className="h-4 w-4 animate-spin text-sage-500" />}
            </div>

            {results.length > 0 && (
              <ul className="max-h-[320px] overflow-y-auto rounded-[8px] border border-line">
                {results.map((f, i) => (
                  <li key={f.id}>
                    <button
                      onClick={() => attach(f)}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={
                        "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-cream-200 " +
                        (i === activeIdx ? "bg-sage-75" : "")
                      }
                    >
                      <span>
                        <span className="text-[15px] font-medium text-sage-900">
                          {f.name}
                        </span>
                        <span className="ml-2 text-[13px] text-sage-500">
                          {f.ageShort} · {f.sex.toUpperCase()}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono text-[12px] text-clinic-700">
                          {f.patientNo != null ? formatPatientNo(f.patientNo) : "—"}
                        </span>
                        <span className="block font-mono text-[12px] text-sage-500">
                          {f.phone || ""}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {offline && (
              <p className="flex items-center gap-2 px-1 text-[13px] text-warn-600">
                <CloudOff className="h-4 w-4" />
                The connection is down, so this is searching only the people
                seen here recently. Someone new can still be registered.
              </p>
            )}

            {query.trim().length >= 2 && !searching && results.length === 0 && (
              <p className="px-1 text-[14px] text-sage-500">
                Nobody by that name yet.
              </p>
            )}

            <Button
              variant="secondary"
              onClick={() => {
                setForm((f) => ({ ...f, name: query.trim() }));
                setRegistering(true);
              }}
            >
              <UserPlus className="h-4 w-4" />
              Register someone new
            </Button>
          </div>
        )}
      </Dialog>
    </>
  );
}
