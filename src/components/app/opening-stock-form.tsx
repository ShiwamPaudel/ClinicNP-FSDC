"use client";

/**
 * opening-stock-form.tsx — what was already on the shelf on day one.
 *
 * Until this existed, stock could only arrive through a purchase, so a shop
 * switching to ClinicNP had to invent a supplier and an invoice for medicines
 * it bought months ago from somebody it no longer owes (D-077). This records
 * the shelf as what it is: an opening balance, with its own reason in the
 * ledger so the item's history never claims it was bought today.
 *
 * Built for one sitting at a counter with a shelf in front of you: many rows,
 * one save, and the item box focused on the row you just added.
 */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import { useToast } from "@/components/ui/toast";
import { recordOpeningStockAction } from "@/app/(app)/stock/opening-actions";
import { toPaisa, formatPaisa } from "@/lib/money";
import { bsToDbText, today } from "@/lib/bs";
import type { Item } from "@/lib/repos/items";

interface LineState {
  itemId: string;
  unitLevel: number;
  batchNo: string;
  mfgDateBs: string;
  expiryDateBs: string;
  qty: string;
  costRupees: string;
}

function blankLine(): LineState {
  return {
    itemId: "",
    unitLevel: 0,
    batchNo: "",
    mfgDateBs: "",
    expiryDateBs: "",
    qty: "1",
    costRupees: "0",
  };
}

export function OpeningStockForm({ items }: { items: Item[] }) {
  const router = useRouter();
  const toast = useToast();
  const [dateBs, setDateBs] = useState(bsToDbText(today()));
  const [lines, setLines] = useState<LineState[]>([blankLine()]);
  const [busy, setBusy] = useState(false);
  const lastItemRef = useRef<HTMLSelectElement>(null);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  function setLine(i: number, patch: Partial<LineState>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function onItemChange(i: number, itemId: string) {
    const item = itemsById.get(itemId);
    // Default to the largest unit: a shelf is counted in boxes and strips far
    // more often than in loose tablets.
    const topLevel = item ? Math.max(...item.units.map((u) => u.level)) : 0;
    setLine(i, { itemId, unitLevel: topLevel });
  }

  function addLine() {
    setLines((ls) => [...ls, blankLine()]);
    // Focus the new row's item box on the next frame, so a long shelf is one
    // continuous piece of typing rather than a reach for the mouse each time.
    requestAnimationFrame(() => lastItemRef.current?.focus());
  }

  function removeLine(i: number) {
    setLines((ls) => (ls.length === 1 ? [blankLine()] : ls.filter((_, x) => x !== i)));
  }

  /** Cost value of everything typed so far, so a wrong zero is visible. */
  const totalCost = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const item = itemsById.get(l.itemId);
        if (!item) return sum;
        const unit = item.units.find((u) => u.level === l.unitLevel);
        const qty = Number(l.qty) || 0;
        return sum + qty * toPaisa(Number(l.costRupees) || 0);
      }, 0),
    [lines, itemsById],
  );

  const filled = lines.filter((l) => l.itemId !== "");

  async function submit() {
    if (filled.length === 0) {
      toast.error("Add at least one medicine.");
      return;
    }
    for (const [i, l] of filled.entries()) {
      const item = itemsById.get(l.itemId)!;
      if (!l.batchNo.trim()) {
        toast.error(`Line ${i + 1} (${item.brandName}): enter the batch number.`);
        return;
      }
      if (!l.expiryDateBs) {
        toast.error(`Line ${i + 1} (${item.brandName}): enter the expiry date.`);
        return;
      }
      if ((Number(l.qty) || 0) <= 0) {
        toast.error(`Line ${i + 1} (${item.brandName}): enter how many.`);
        return;
      }
    }

    setBusy(true);
    const res = await recordOpeningStockAction({
      dateBs,
      lines: filled.map((l) => ({
        itemId: l.itemId,
        unitLevel: l.unitLevel,
        batchNo: l.batchNo.trim(),
        mfgDateBs: l.mfgDateBs || "",
        expiryDateBs: l.expiryDateBs,
        qty: Number(l.qty) || 0,
        costPaisaPerUnit: toPaisa(Number(l.costRupees) || 0),
      })),
    });
    setBusy(false);

    if (res.ok) {
      toast.success(
        `Opening stock recorded for ${filled.length} item${filled.length === 1 ? "" : "s"}.`,
      );
      setLines([blankLine()]);
      router.refresh();
    } else {
      toast.error(res.userMessage ?? "Something went wrong.");
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-line bg-cream-50 p-8 text-center">
        <PackagePlus className="mx-auto mb-2 h-6 w-6 text-sage-500" />
        <p className="text-[15px] font-medium text-sage-900">No items yet</p>
        <p className="mx-auto mt-1 max-w-[460px] text-[13px] text-sage-500">
          Add your items first, under Items.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[10px] border border-line bg-cream-50 p-4">
        <h2 className="text-[16px] font-semibold text-sage-900">
          What is already on the shelf
        </h2>
        <p className="mt-1 max-w-[720px] text-[13px] text-sage-500">
          Enter stock you already have, once, when you start. It isn&apos;t a
          purchase — nothing is owed. Buy new stock through Purchases.
        </p>
        <div className="mt-3 max-w-[240px]">
          <Field label="Counted on" htmlFor="opening-date">
            <DatePickerBS id="opening-date" value={dateBs} onChange={setDateBs} />
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {lines.map((l, i) => {
          const item = itemsById.get(l.itemId);
          const isLast = i === lines.length - 1;
          return (
            <div
              key={i}
              className="grid grid-cols-1 gap-3 rounded-[10px] border border-line bg-cream-50 p-4 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] lg:items-end"
            >
              <Field label={`Medicine ${i + 1}`} htmlFor={`item-${i}`}>
                <Select
                  id={`item-${i}`}
                  ref={isLast ? lastItemRef : undefined}
                  value={l.itemId}
                  onChange={(e) => onItemChange(i, e.target.value)}
                >
                  <option value="">— Choose —</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.brandName}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Batch number" htmlFor={`batch-${i}`}>
                <Input
                  id={`batch-${i}`}
                  value={l.batchNo}
                  onChange={(e) => setLine(i, { batchNo: e.target.value })}
                  placeholder="e.g. AMX-2201"
                />
              </Field>

              <Field label="Manufactured" hint="optional" htmlFor={`mfg-${i}`}>
                <DatePickerBS
                  id={`mfg-${i}`}
                  value={l.mfgDateBs}
                  onChange={(v) => setLine(i, { mfgDateBs: v })}
                  clearable
                  typable
                />
              </Field>

              <Field label="Expires" htmlFor={`exp-${i}`}>
                <DatePickerBS
                  id={`exp-${i}`}
                  value={l.expiryDateBs}
                  onChange={(v) => setLine(i, { expiryDateBs: v })}
                  typable
                />
              </Field>

              <Field label="How many" htmlFor={`qty-${i}`}>
                <div className="flex gap-1.5">
                  <Input
                    id={`qty-${i}`}
                    numeric
                    inputMode="numeric"
                    className="w-20"
                    value={l.qty}
                    onChange={(e) =>
                      setLine(i, { qty: e.target.value.replace(/\D/g, "") })
                    }
                  />
                  <Select
                    value={String(l.unitLevel)}
                    onChange={(e) =>
                      setLine(i, { unitLevel: Number(e.target.value) })
                    }
                    disabled={!item}
                    aria-label={`Unit for medicine ${i + 1}`}
                  >
                    {(item?.units ?? []).map((u) => (
                      <option key={u.level} value={u.level}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </Field>

              <Field label="Cost each (रू)" hint="what you paid" htmlFor={`cost-${i}`}>
                <Input
                  id={`cost-${i}`}
                  numeric
                  inputMode="decimal"
                  value={l.costRupees}
                  onChange={(e) => setLine(i, { costRupees: e.target.value })}
                />
              </Field>

              <div className="flex h-10 items-center">
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  aria-label={`Remove line ${i + 1}`}
                  className="rounded-[8px] p-2 text-danger-600 hover:bg-danger-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={addLine}>
          <Plus className="h-4 w-4" />
          Add another medicine
        </Button>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
              Value at cost
            </div>
            <div className="text-[18px] font-bold text-sage-900 tnum">
              {formatPaisa(totalCost)}
            </div>
          </div>
          <Button onClick={submit} disabled={busy || filled.length === 0}>
            {busy ? "…" : `Record opening stock`}
          </Button>
        </div>
      </div>
    </div>
  );
}
