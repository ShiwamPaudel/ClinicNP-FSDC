"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { recordStockOutAction } from "@/app/(app)/stock/out/actions";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { formatPaisa } from "@/lib/money";
import { cn } from "@/lib/cn";
import type {
  ReasonSpec,
  StockOutReason,
} from "@/lib/repos/adjustments";

export interface FormUnit {
  level: number;
  name: string;
  factorToBase: number;
}
export interface FormItem {
  id: string;
  name: string;
  units: FormUnit[];
}
export interface FormBatch {
  id: string;
  itemId: string;
  itemName: string;
  batchNo: string;
  expiryDateAd: string;
  remainingBaseQty: number;
  costPaisaPerBase: number;
}

interface Line {
  key: string;
  itemId: string;
  batchId: string;
  unitLevel: number;
  qty: string;
}

let seq = 0;
const newLine = (): Line => ({
  key: `l${++seq}`,
  itemId: "",
  batchId: "",
  unitLevel: 0,
  qty: "",
});

export function StockOutForm({
  reasons,
  suppliers,
  items,
  batches,
  todayAd,
  todayBs,
}: {
  reasons: ReasonSpec[];
  suppliers: { id: string; name: string }[];
  items: FormItem[];
  batches: FormBatch[];
  todayAd: string;
  todayBs: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [reason, setReason] = useState<StockOutReason | null>(null);
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const spec = reasons.find((r) => r.key === reason) ?? null;

  const itemById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );
  const batchById = useMemo(
    () => new Map(batches.map((b) => [b.id, b])),
    [batches],
  );
  const batchesFor = (itemId: string) =>
    // FEFO order, expired batches included and clearly marked (PRD §4A.2)
    batches
      .filter((b) => b.itemId === itemId)
      .sort((a, b) => a.expiryDateAd.localeCompare(b.expiryDateAd));

  function baseQtyOf(line: Line): number {
    const item = itemById.get(line.itemId);
    const unit = item?.units.find((u) => u.level === line.unitLevel);
    const qty = Number(line.qty);
    if (!unit || !Number.isFinite(qty) || qty <= 0) return 0;
    return Math.round(qty * unit.factorToBase);
  }

  function lineCost(line: Line): number {
    const batch = batchById.get(line.batchId);
    if (!batch) return 0;
    return batch.costPaisaPerBase * baseQtyOf(line);
  }

  const totalCost = lines.reduce((s, l) => s + lineCost(l), 0);

  function update(key: string, patch: Partial<Line>) {
    setLines((ls) =>
      ls.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function pickReason(next: ReasonSpec) {
    setReason(next.key);
    if (!next.allowsIn) setDirection("out");
    if (!next.needsSupplier) setSupplierId("");
  }

  function problem(): string | null {
    if (!spec) return "Choose a reason first.";
    if (spec.needsSupplier && !supplierId) {
      return "Choose the supplier this goes back to.";
    }
    if (spec.needsNote && !note.trim()) {
      return "Add a short note saying what happened.";
    }
    const filled = lines.filter((l) => l.itemId && l.batchId);
    if (filled.length === 0) return "Add at least one medicine.";
    for (const l of filled) {
      const base = baseQtyOf(l);
      if (base <= 0) return "Every line needs a quantity.";
      const batch = batchById.get(l.batchId);
      if (direction === "out" && batch && base > batch.remainingBaseQty) {
        return `There isn't that much left in batch ${batch.batchNo}.`;
      }
    }
    return null;
  }

  function submit() {
    const issue = problem();
    if (issue) {
      toast.error(issue);
      return;
    }
    startTransition(async () => {
      const res = await recordStockOutAction({
        direction,
        reason: reason!,
        dateAd: todayAd,
        dateBs: todayBs,
        supplierId: supplierId || null,
        note,
        lines: lines
          .filter((l) => l.itemId && l.batchId)
          .map((l) => ({
            itemId: l.itemId,
            batchId: l.batchId,
            baseQty: baseQtyOf(l),
            unitLevelEntered: l.unitLevel,
            qtyEntered: Number(l.qty),
          })),
      });
      if (!res.ok) {
        toast.error(res.userMessage ?? "Something went wrong. Please try again.");
        return;
      }
      toast.success("Stock out recorded");
      router.push(`/stock/out/${res.id}`);
    });
  }

  const expired = (b: FormBatch) => b.expiryDateAd < todayAd;

  return (
    <div className="flex flex-col gap-6">
      {/* ---- reason tiles: the consequence text is what stops a wrong pick ---- */}
      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-sage-900">
          Why is this stock leaving?
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {reasons.map((r) => {
            const active = reason === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => pickReason(r)}
                aria-pressed={active}
                className={cn(
                  "rounded-[10px] border p-3 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-700 focus-visible:ring-offset-1",
                  active
                    ? "border-sage-700 bg-sage-75"
                    : "border-line bg-cream-50 hover:bg-cream-200",
                )}
              >
                <div className="text-[14px] font-semibold text-sage-900">
                  {r.label}
                </div>
                <div className="mt-0.5 text-[12px] leading-[1.4] text-sage-500">
                  {r.consequence}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {spec && (
        <>
          {/* ---- supplier / direction / note ---- */}
          <section className="flex flex-wrap gap-4">
            {spec.needsSupplier && (
              <label className="flex flex-col gap-1">
                <span className="text-[13px] font-medium text-sage-900">
                  Supplier
                </span>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="h-10 min-w-[240px] rounded-[8px] border border-line bg-cream-50 px-2.5 text-[14px] outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20"
                >
                  <option value="">Choose a supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {spec.allowsIn && (
              <label className="flex flex-col gap-1">
                <span className="text-[13px] font-medium text-sage-900">
                  Which way?
                </span>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "out" | "in")}
                  className="h-10 min-w-[220px] rounded-[8px] border border-line bg-cream-50 px-2.5 text-[14px] outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20"
                >
                  <option value="out">Take stock off the shelf</option>
                  <option value="in">Add stock back on</option>
                </select>
              </label>
            )}

            <label className="flex min-w-[280px] flex-1 flex-col gap-1">
              <span className="text-[13px] font-medium text-sage-900">
                Note{spec.needsNote ? "" : " (optional)"}
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  spec.needsNote
                    ? "What happened? e.g. recount after the shelf audit"
                    : "Anything worth remembering later"
                }
                className="h-10 rounded-[8px] border border-line bg-cream-50 px-3 text-[14px] outline-none focus:border-sage-700 focus:ring-2 focus:ring-sage-700/20"
              />
            </label>
          </section>

          {/* ---- lines ---- */}
          <section>
            <h2 className="mb-2 text-[15px] font-semibold text-sage-900">
              What is leaving?
            </h2>
            <div className="flex flex-col gap-2">
              {lines.map((line) => {
                const item = itemById.get(line.itemId);
                const avail = batchesFor(line.itemId);
                const batch = batchById.get(line.batchId);
                return (
                  <div
                    key={line.key}
                    className="flex flex-wrap items-end gap-2 rounded-[10px] border border-line bg-cream-50 p-3"
                  >
                    <label className="flex min-w-[220px] flex-1 flex-col gap-1">
                      <span className="text-[12px] text-sage-500">Medicine</span>
                      <select
                        value={line.itemId}
                        onChange={(e) =>
                          update(line.key, {
                            itemId: e.target.value,
                            batchId: "",
                            unitLevel: 0,
                          })
                        }
                        className="h-10 rounded-[8px] border border-line bg-cream-50 px-2.5 text-[14px] outline-none focus:border-sage-700"
                      >
                        <option value="">Choose…</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex min-w-[240px] flex-1 flex-col gap-1">
                      <span className="text-[12px] text-sage-500">
                        Batch — nearest expiry first
                      </span>
                      <select
                        value={line.batchId}
                        disabled={!line.itemId}
                        onChange={(e) =>
                          update(line.key, { batchId: e.target.value })
                        }
                        className="h-10 rounded-[8px] border border-line bg-cream-50 px-2.5 text-[14px] outline-none focus:border-sage-700 disabled:opacity-50"
                      >
                        <option value="">Choose…</option>
                        {avail.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.batchNo} · exp {b.expiryDateAd}
                            {expired(b) ? " · EXPIRED" : ""} ·{" "}
                            {b.remainingBaseQty} left
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex w-[110px] flex-col gap-1">
                      <span className="text-[12px] text-sage-500">Quantity</span>
                      <input
                        inputMode="numeric"
                        value={line.qty}
                        onChange={(e) =>
                          update(line.key, { qty: e.target.value })
                        }
                        className="h-10 rounded-[8px] border border-line bg-cream-50 px-3 text-right font-mono text-[14px] outline-none focus:border-sage-700"
                      />
                    </label>

                    <label className="flex w-[130px] flex-col gap-1">
                      <span className="text-[12px] text-sage-500">Unit</span>
                      <select
                        value={line.unitLevel}
                        disabled={!item}
                        onChange={(e) =>
                          update(line.key, { unitLevel: Number(e.target.value) })
                        }
                        className="h-10 rounded-[8px] border border-line bg-cream-50 px-2.5 text-[14px] outline-none focus:border-sage-700 disabled:opacity-50"
                      >
                        {(item?.units ?? [{ level: 0, name: "Unit", factorToBase: 1 }]).map(
                          (u) => (
                            <option key={u.level} value={u.level}>
                              {u.name}
                            </option>
                          ),
                        )}
                      </select>
                    </label>

                    <div className="flex w-[120px] flex-col gap-1">
                      <span className="text-[12px] text-sage-500">Value</span>
                      <span className="flex h-10 items-center justify-end font-mono text-[14px] text-sage-900">
                        {formatPaisa(lineCost(line))}
                      </span>
                    </div>

                    <button
                      type="button"
                      aria-label="Remove this line"
                      onClick={() =>
                        setLines((ls) =>
                          ls.length === 1
                            ? [newLine()]
                            : ls.filter((l) => l.key !== line.key),
                        )
                      }
                      className="mb-0.5 rounded-[8px] p-2 text-sage-500 hover:bg-cream-200 hover:text-danger-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    {batch && expired(batch) && (
                      <p className="flex w-full items-center gap-1.5 text-[12px] text-danger-600">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        This batch is past its expiry date.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <Button
              variant="secondary"
              className="mt-2"
              onClick={() => setLines((ls) => [...ls, newLine()])}
            >
              <Plus className="h-4 w-4" />
              Add another
            </Button>
          </section>

          {/* ---- total + save ---- */}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-cream-50 p-4">
            <div className="text-[14px] text-sage-500">
              Value of this entry
              <span className="ml-2 font-mono text-[18px] font-semibold text-sage-900">
                {formatPaisa(totalCost)}
              </span>
            </div>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Record stock out"}
            </Button>
          </section>
        </>
      )}
    </div>
  );
}
