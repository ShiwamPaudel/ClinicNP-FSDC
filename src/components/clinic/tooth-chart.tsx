"use client";

/**
 * The tooth chart on a patient's card (C-037). Closed until it is wanted.
 * Tap one tooth or several, say what they are (caries, filled, crown…), on
 * which surfaces, and save; each tooth keeps a dated history, and its colour
 * is its latest mark. FDI numbering, drawn as the dentist faces the patient.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Smile, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import { useToast } from "@/components/ui/toast";
import { addToothRecordAction, undoToothRecordAction } from "@/app/(app)/patients/teeth-actions";
import {
  CONDITIONS,
  PERMANENT_LOWER,
  PERMANENT_UPPER,
  PRIMARY_LOWER,
  PRIMARY_UPPER,
  SURFACES,
  conditionLabel,
  currentTeeth,
  isPrimary,
  toothName,
  type ToothRecord,
} from "@/lib/teeth";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

const TONE: Record<string, string> = {
  ok: "bg-ok-100 border-ok-600 text-ok-600",
  danger: "bg-danger-100 border-danger-600 text-danger-600",
  info: "bg-info-100 border-info-600 text-info-600",
  magenta: "bg-magenta-100 border-magenta-600 text-magenta-700",
  warn: "bg-warn-100 border-warn-600 text-warn-600",
  clinic: "bg-clinic-150 border-clinic-700 text-clinic-900",
  sage: "bg-sage-150 border-sage-600 text-sage-700",
  gone: "border-dashed border-sage-300 bg-cream-200 text-sage-300",
};
const UNMARKED = "border-line bg-cream-50 text-sage-700";

function toneOf(condition: string | undefined): string {
  if (!condition) return UNMARKED;
  const tone = CONDITIONS.find((c) => c.key === condition)?.tone;
  return tone ? TONE[tone]! : UNMARKED;
}

type Set_ = "permanent" | "primary" | "both";

export function ToothChart({
  patientId,
  records,
  canEdit,
  todayBs,
}: {
  patientId: string;
  records: ToothRecord[];
  canEdit: boolean;
  todayBs: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const now = useMemo(() => currentTeeth(records), [records]);
  const marked = now.size;
  const hasPrimary = records.some((r) => isPrimary(r.tooth) && !r.voided);
  const hasPermanent = records.some((r) => !isPrimary(r.tooth) && !r.voided);

  const [open, setOpen] = useState(false);
  const [which, setWhich] = useState<Set_>(hasPrimary && !hasPermanent ? "primary" : hasPrimary ? "both" : "permanent");
  const [picked, setPicked] = useState<number[]>([]);
  const [condition, setCondition] = useState<string>("caries");
  const [surfaces, setSurfaces] = useState("");
  const [note, setNote] = useState("");
  const [dateBs, setDateBs] = useState(todayBs);
  const [busy, setBusy] = useState(false);

  const toggleTooth = (t: number) =>
    setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const toggleSurface = (s: string) =>
    setSurfaces((cur) => (cur.includes(s) ? cur.replace(s, "") : cur + s));

  async function save() {
    if (picked.length === 0) {
      toast.error("Tap the tooth first.");
      return;
    }
    setBusy(true);
    const res = await addToothRecordAction({ patientId, teeth: picked, condition, surfaces, note, dateBs });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
      return;
    }
    toast.success(picked.length === 1 ? `Tooth ${picked[0]} marked` : `${picked.length} teeth marked`);
    setPicked([]);
    setSurfaces("");
    setNote("");
    router.refresh();
  }

  async function undo(id: string) {
    const res = await undoToothRecordAction(id);
    if (!res.ok) {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
      return;
    }
    toast.success("Mark undone");
    router.refresh();
  }

  const single = picked.length === 1 ? picked[0]! : null;
  const history = single !== null ? records.filter((r) => r.tooth === single) : [];

  const Row = ({ teeth }: { teeth: number[] }) => {
    const half = teeth.length / 2;
    return (
      <div className="flex justify-center gap-1">
        {teeth.map((t, i) => {
          const cur = now.get(t);
          const sel = picked.includes(t);
          return (
            <button
              key={t}
              type="button"
              disabled={!canEdit && !cur}
              onClick={() => toggleTooth(t)}
              title={`${toothName(t)}${cur ? ` — ${conditionLabel(cur.condition)}${cur.surfaces ? ` (${cur.surfaces})` : ""}` : ""}`}
              aria-pressed={sel}
              className={cn(
                "flex h-12 w-9 shrink-0 flex-col items-center justify-between rounded-[7px] border-2 py-1 text-[11px] font-semibold tnum transition",
                toneOf(cur?.condition),
                sel && "ring-2 ring-sage-900 ring-offset-1",
                i === half - 1 && "mr-2",
              )}
            >
              <span>{t}</span>
              <span className="text-[9px] font-medium leading-none">{cur?.surfaces ?? ""}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 text-[15px] font-semibold text-sage-900"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Smile className="h-4 w-4 text-clinic-500" />
        Tooth chart
        <span className="text-[13px] font-normal text-sage-500">
          {marked === 0 ? "nothing marked" : `${marked} ${marked === 1 ? "tooth" : "teeth"} marked`}
        </span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-4 rounded-[10px] border-2 border-clinic-700/70 bg-cream-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Which teeth" className="inline-flex rounded-[8px] border border-line bg-cream-100 p-0.5">
              {(
                [
                  ["permanent", "Adult"],
                  ["primary", "Milk teeth"],
                  ["both", "Both"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={which === k}
                  onClick={() => setWhich(k)}
                  className={cn(
                    "rounded-[6px] px-3 py-1 text-[13px]",
                    which === k ? "bg-sage-700 text-cream-50" : "text-sage-600",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[12px] text-sage-500">Patient&apos;s right ← → patient&apos;s left</span>
          </div>

          {/* The chart scrolls inside itself on a phone; 16 teeth need ~640px. */}
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max flex-col gap-2">
              {which !== "primary" && <Row teeth={PERMANENT_UPPER} />}
              {which !== "permanent" && <Row teeth={PRIMARY_UPPER} />}
              <div className="mx-auto h-px w-full max-w-[640px] bg-sage-300" />
              {which !== "permanent" && <Row teeth={PRIMARY_LOWER} />}
              {which !== "primary" && <Row teeth={PERMANENT_LOWER} />}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {CONDITIONS.map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1.5 text-[12px] text-sage-700">
                <span className={cn("h-3 w-3 rounded-[3px] border-2", TONE[c.tone])} />
                {c.label}
              </span>
            ))}
          </div>

          {picked.length > 0 && (
            <div className="flex flex-col gap-3 rounded-[8px] border border-line bg-cream-100 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold text-sage-900">
                  {single !== null ? toothName(single) : `${picked.length} teeth: ${picked.join(", ")}`}
                </span>
                <button
                  type="button"
                  onClick={() => setPicked([])}
                  className="inline-flex items-center gap-1 text-[12px] text-sage-500 hover:text-sage-900"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              </div>

              {canEdit && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {CONDITIONS.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        aria-pressed={condition === c.key}
                        onClick={() => setCondition(c.key)}
                        className={cn(
                          "rounded-[7px] border-2 px-2.5 py-1 text-[12.5px] font-medium",
                          TONE[c.tone],
                          condition === c.key ? "ring-2 ring-sage-900 ring-offset-1" : "opacity-80",
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[13px] text-sage-700">Surfaces</span>
                    {SURFACES.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        title={s.label}
                        aria-pressed={surfaces.includes(s.key)}
                        onClick={() => toggleSurface(s.key)}
                        className={cn(
                          "h-8 w-8 rounded-[7px] border text-[13px] font-semibold",
                          surfaces.includes(s.key)
                            ? "border-sage-700 bg-sage-700 text-cream-50"
                            : "border-line bg-cream-50 text-sage-700",
                        )}
                      >
                        {s.key}
                      </button>
                    ))}
                    <span className="text-[12px] text-sage-500">none = the whole tooth</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                    <Field label="Note">
                      <Input value={note} placeholder="e.g. deep, near pulp" onChange={(e) => setNote(e.target.value)} />
                    </Field>
                    <Field label="Date">
                      <DatePickerBS value={dateBs} onChange={setDateBs} typable />
                    </Field>
                  </div>
                  <div>
                    <Button onClick={save} disabled={busy}>
                      {busy ? "…" : "Save mark"}
                    </Button>
                  </div>
                </>
              )}

              {single !== null && history.length > 0 && (
                <ul className="flex flex-col gap-1 border-t border-line pt-2 text-[13px]">
                  {history.map((r) => (
                    <li key={r.id} className={cn("flex flex-wrap items-center gap-2", r.voided && "text-sage-400 line-through")}>
                      <span className="tnum">{r.dateBs}</span>
                      <span className={cn("rounded-[5px] border px-1.5 text-[12px]", toneOf(r.condition))}>
                        {conditionLabel(r.condition)}
                        {r.surfaces ? ` · ${r.surfaces}` : ""}
                      </span>
                      {r.note && <span className="text-sage-600">{r.note}</span>}
                      {r.userName && <span className="text-[12px] text-sage-500">· {r.userName}</span>}
                      {canEdit && !r.voided && (
                        <button
                          type="button"
                          onClick={() => void undo(r.id)}
                          className="inline-flex items-center gap-1 text-[12px] text-clinic-700 hover:underline"
                        >
                          <Undo2 className="h-3 w-3" />
                          Undo
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {marked > 0 && (
            <div>
              <h4 className="mb-1.5 text-[13px] font-semibold text-sage-900">Marked teeth</h4>
              <ul className="grid gap-1 text-[13px] sm:grid-cols-2">
                {[...now.values()]
                  .sort((a, b) => a.tooth - b.tooth)
                  .map((r) => (
                    <li key={r.tooth}>
                      <button type="button" onClick={() => setPicked([r.tooth])} className="text-left hover:underline">
                        <span className="font-semibold tnum">{r.tooth}</span> {conditionLabel(r.condition)}
                        {r.surfaces ? ` (${r.surfaces})` : ""}
                        <span className="text-sage-500"> · {r.dateBs}{r.note ? ` · ${r.note}` : ""}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
