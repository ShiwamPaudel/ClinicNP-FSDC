"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { saveItemAction } from "@/app/(app)/items/actions";
import { factorsFromRatios } from "@/lib/units";
import { toPaisa, paisaToRupees } from "@/lib/money";
import type { Item, Category } from "@/lib/repos/items";
import type { Supplier } from "@/lib/repos/suppliers";
import {
  ITEM_SHAPES,
  DEFAULT_ITEM_SHAPE,
  type ItemShape,
} from "@/lib/item-shape";
import { ShapeIcon, PackIcon } from "@/components/pos/unit-art";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/cn";

interface LevelRow {
  name: string;
  ratioToPrev: number; // how many of the previous (smaller) unit fit in this one; level 0 = 1
  rateRupees: string;
}

interface FormState {
  brandName: string;
  genericName: string;
  category: Category;
  manufacturer: string;
  minStockBaseQty: string;
  controlledFlag: boolean;
  preferredSupplierId: string;
  active: boolean;
  shape: ItemShape;
  defaultLevel: number;
  levels: LevelRow[]; // index 0 = base
}

function fromItem(item: Item): FormState {
  const sorted = [...item.units].sort((a, b) => a.level - b.level);
  const levels: LevelRow[] = sorted.map((u, i) => ({
    name: u.name,
    ratioToPrev:
      i === 0 ? 1 : u.factorToBase / sorted[i - 1]!.factorToBase,
    rateRupees: String(paisaToRupees(u.sellingRatePaisa)),
  }));
  const defaultLevel = sorted.find((u) => u.isDefaultSelling)?.level ?? 0;
  return {
    brandName: item.brandName,
    genericName: item.genericName,
    category: item.category,
    manufacturer: item.manufacturer,
    minStockBaseQty: String(item.minStockBaseQty),
    controlledFlag: item.controlledFlag,
    preferredSupplierId: item.preferredSupplierId ?? "",
    active: item.active,
    shape: item.shape,
    defaultLevel,
    levels,
  };
}

const BLANK: FormState = {
  brandName: "",
  genericName: "",
  category: "Medicine",
  manufacturer: "",
  minStockBaseQty: "0",
  controlledFlag: false,
  preferredSupplierId: "",
  active: true,
  shape: DEFAULT_ITEM_SHAPE,
  defaultLevel: 0,
  levels: [{ name: "Tablet", ratioToPrev: 1, rateRupees: "0" }],
};

export function ItemForm({
  item,
  suppliers,
}: {
  item?: Item;
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState<FormState>(item ? fromItem(item) : BLANK);
  const [saving, setSaving] = useState(false);
  // Show the optional fields expanded when editing an item that already uses them.
  const [showMore, setShowMore] = useState(!!item?.preferredSupplierId);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setF((s) => ({ ...s, [k]: v }));
  }

  function setLevel(i: number, patch: Partial<LevelRow>) {
    setF((s) => ({
      ...s,
      levels: s.levels.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    }));
  }

  function addLevel() {
    if (f.levels.length >= 3) return;
    setF((s) => ({
      ...s,
      levels: [...s.levels, { name: "", ratioToPrev: 1, rateRupees: "0" }],
    }));
  }

  function removeLevel(i: number) {
    if (i === 0 || f.levels.length <= 1) return;
    setF((s) => {
      const levels = s.levels.filter((_, idx) => idx !== i);
      return {
        ...s,
        levels,
        defaultLevel: Math.min(s.defaultLevel, levels.length - 1),
      };
    });
  }

  async function onSubmit() {
    setSaving(true);
    const ratios = f.levels.slice(1).map((l) => Number(l.ratioToPrev) || 1);
    const factors = factorsFromRatios(ratios); // [1, r1, r1*r2]
    const units = f.levels.map((l, i) => ({
      level: i,
      name: l.name.trim(),
      factorToBase: factors[i]!,
      sellingRatePaisa: toPaisa(Number(l.rateRupees) || 0),
      isDefaultSelling: i === f.defaultLevel,
    }));

    const res = await saveItemAction({
      id: item?.id,
      brandName: f.brandName.trim(),
      genericName: f.genericName.trim(),
      category: f.category,
      manufacturer: f.manufacturer.trim(),
      minStockBaseQty: Number(f.minStockBaseQty) || 0,
      controlledFlag: f.controlledFlag,
      preferredSupplierId: f.preferredSupplierId || null,
      active: f.active,
      shape: f.shape,
      units,
    });
    setSaving(false);
    if (res.ok) {
      toast.success(item ? strings.saved : "Item added");
      router.push("/items");
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  const baseName = f.levels[0]?.name || "base unit";

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[10px] border border-line bg-cream-50 p-6">
        <h2 className="mb-4 text-[16px] font-semibold text-sage-900">Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={f.brandName}
              onChange={(e) => set("brandName", e.target.value)}
            />
          </Field>
          <Field label="Generic name / composition">
            <Input
              value={f.genericName}
              onChange={(e) => set("genericName", e.target.value)}
            />
          </Field>
          <Field label="Category">
            <Select
              value={f.category}
              onChange={(e) => set("category", e.target.value as Category)}
            >
              <option value="Medicine">Medicine</option>
              <option value="Consumable">Consumable</option>
              <option value="Other">Other</option>
            </Select>
          </Field>
          <Field
            label={`Reorder level (in ${baseName})`}
            hint="Low-stock alert when total falls below this"
          >
            <Input
              numeric
              inputMode="numeric"
              value={f.minStockBaseQty}
              onChange={(e) =>
                set("minStockBaseQty", e.target.value.replace(/\D/g, ""))
              }
            />
          </Field>
        </div>

        {/* Visual form — powers the pictorial unit picker at the counter */}
        <div className="mt-5">
          <div className="mb-1 text-[13px] font-medium text-sage-900">
            Looks like
          </div>
          <p className="mb-2 text-[12px] text-sage-500">
            Pick the form the counter shows when selling this item.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
            {ITEM_SHAPES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => set("shape", s.key)}
                aria-pressed={f.shape === s.key}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-[10px] border p-2 transition-colors",
                  f.shape === s.key
                    ? "border-sage-700 bg-sage-75 ring-1 ring-sage-700"
                    : "border-line bg-cream-50 hover:bg-cream-200",
                )}
              >
                {s.key === "strip" ? (
                  <PackIcon kind="strip" shape="tablet" className="h-9 w-11" />
                ) : (
                  <ShapeIcon shape={s.key} className="h-9 w-9" />
                )}
                <span className="text-[11px] leading-tight text-sage-700">
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="mt-4 flex items-center gap-1 text-[13px] font-medium text-sage-600 hover:text-sage-900"
        >
          {showMore ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          More options
        </button>
        {showMore && (
          <div className="mt-3 flex flex-col gap-5">
            <Field label="Preferred supplier">
              <Select
                value={f.preferredSupplierId}
                onChange={(e) => set("preferredSupplierId", e.target.value)}
              >
                <option value="">— None —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input
              type="checkbox"
              checked={f.controlledFlag}
              onChange={(e) => set("controlledFlag", e.target.checked)}
            />
            Controlled / narcotic (requires patient name on the bill)
          </label>
          <label className="flex items-center gap-2 text-[14px] text-sage-900">
            <input
              type="checkbox"
              checked={f.active}
              onChange={(e) => set("active", e.target.checked)}
            />
            Active
          </label>
        </div>
      </section>

      {/* Unit hierarchy builder */}
      <section className="rounded-[10px] border border-line bg-cream-50 p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-sage-900">
            Units &amp; rates
          </h2>
          {f.levels.length < 3 && (
            <Button variant="secondary" onClick={addLevel}>
              <Plus className="h-4 w-4" />
              Add a bigger unit
            </Button>
          )}
        </div>
        <p className="mb-4 text-[13px] text-sage-500">
          The smallest unit is the base. Add bigger units and say how many of the
          smaller unit each one holds — e.g. 1 Strip = 10 Tablet, 1 Box = 6 Strip.
        </p>

        <div className="flex flex-col gap-3">
          {f.levels.map((l, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-3 rounded-[8px] border border-line bg-cream-100 p-3 sm:grid-cols-[1fr_1.4fr_1fr_auto_auto] sm:items-end"
            >
              <Field label={i === 0 ? "Base unit name" : `Level ${i} name`}>
                <Input
                  value={l.name}
                  placeholder={i === 0 ? "Tablet" : i === 1 ? "Strip" : "Box"}
                  onChange={(e) => setLevel(i, { name: e.target.value })}
                />
              </Field>
              <Field label={i === 0 ? "Conversion" : `1 ${l.name || "unit"} =`}>
                {i === 0 ? (
                  <div className="flex h-10 items-center text-[13px] text-sage-500">
                    smallest / base unit
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      numeric
                      inputMode="numeric"
                      className="w-20"
                      value={String(l.ratioToPrev)}
                      onChange={(e) =>
                        setLevel(i, {
                          ratioToPrev: Number(e.target.value.replace(/\D/g, "")) || 1,
                        })
                      }
                    />
                    <span className="text-[13px] text-sage-600">
                      {f.levels[i - 1]?.name || "smaller unit"}
                    </span>
                  </div>
                )}
              </Field>
              <Field label="Selling rate (रू)">
                <Input
                  numeric
                  inputMode="decimal"
                  value={l.rateRupees}
                  onChange={(e) => setLevel(i, { rateRupees: e.target.value })}
                />
              </Field>
              <Field label="Default">
                <label className="flex h-10 items-center gap-1.5 text-[13px]">
                  <input
                    type="radio"
                    name="defaultLevel"
                    checked={f.defaultLevel === i}
                    onChange={() => set("defaultLevel", i)}
                  />
                  Sell as
                </label>
              </Field>
              <div className="flex h-10 items-center">
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => removeLevel(i)}
                    aria-label="Remove unit"
                    className="rounded-[8px] p-2 text-danger-600 hover:bg-danger-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.push("/items")}>
          {strings.cancel}
        </Button>
        <Button onClick={onSubmit} disabled={saving}>
          {saving ? "…" : item ? strings.save : "Add item"}
        </Button>
      </div>
    </div>
  );
}
