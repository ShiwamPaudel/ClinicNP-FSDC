"use client";

import { useMemo } from "react";
import { Minus, Plus } from "lucide-react";
import { lineBaseQty, type BillLine } from "@/lib/bill-calc";
import { formatPaisa } from "@/lib/money";
import { toMixedDisplay } from "@/lib/units";
import { asItemShape, packKindForUnit } from "@/lib/item-shape";
import { ShapeIcon, PackIcon } from "@/components/pos/unit-art";
import { cn } from "@/lib/cn";

const MAX_PACKS = 6; // packs (strips/boxes) drawn before we stop; stepper still works
const MAX_SINGLES = 20;

/**
 * The pictorial unit panel shown inline for the active bill line. Left rail =
 * the item's packaging (loose / strip / box / bottle) as art; tap one to add a
 * whole pack. Main tray = the base units drawn in the item's shape — tap to set
 * the exact quantity, with a part-used strip shown "cut". Sells in the base
 * unit at the base rate (the bill-line unit chip still handles bulk pricing).
 */
export function UnitPanel({
  line,
  todayIso,
  onSetQtyBase,
}: {
  line: BillLine | null;
  todayIso: string;
  onSetQtyBase: (baseQty: number) => void;
}) {
  const info = useMemo(() => {
    if (!line) return null;
    const item = line.item;
    const shape = asItemShape(item.shape);
    const units = [...item.units].sort((a, b) => a.level - b.level);
    const base = units[0]!;
    const pack = units[1];
    const packSize = pack?.factorToBase ?? 0;
    const available = item.batches
      .filter((b) => b.remainingBaseQty > 0 && b.expiryDateAd >= todayIso)
      .reduce((s, b) => s + b.remainingBaseQty, 0);
    return { item, shape, units, base, pack, packSize, available };
  }, [line, todayIso]);

  if (!line || !info) {
    return (
      <section className="mt-4 shrink-0 rounded-[10px] border border-dashed border-line bg-cream-50 p-6 text-center text-[13px] text-sage-400">
        Add or tap a medicine to see its units here.
      </section>
    );
  }

  const { item, shape, units, base, packSize, available } = info;
  const selected = lineBaseQty(line);
  const cap = Math.max(available, selected, 1);
  const clamp = (n: number) => Math.min(cap, Math.max(0, n));
  const amount = selected * base.sellingRatePaisa;

  const usePacks = packSize > 1;
  const drawnBase = usePacks
    ? Math.min(available, MAX_PACKS * packSize)
    : Math.min(available, MAX_SINGLES);
  const packsShown = usePacks ? Math.ceil(Math.max(drawnBase, 0) / packSize) : 0;
  const hiddenBeyond = available - drawnBase;
  const cols = usePacks ? Math.min(packSize, 10) : 8;

  function Cell({ idx }: { idx: number }) {
    const inStock = idx < available;
    const isSel = idx < selected;
    return (
      <button
        type="button"
        disabled={!inStock}
        onClick={() => onSetQtyBase(idx + 1)}
        aria-label={`${idx + 1} ${base.name}`}
        className={cn(
          "flex aspect-square w-full items-center justify-center rounded-[7px] transition-colors",
          !inStock && "bg-[#b9c0c4]/45", // empty foil well
          inStock && "bg-[#e9edee] shadow-[inset_0_1px_2px_rgba(22,36,27,0.12)] hover:bg-[#f3f6f6]",
          isSel && "ring-2 ring-sage-700",
        )}
      >
        {inStock && <ShapeIcon shape={shape} dim={!isSel} className="h-[78%] w-[78%]" />}
      </button>
    );
  }

  // left rail: one entry per unit level, largest first
  const rail = [...units].sort((a, b) => b.level - a.level);

  return (
    <section className="mt-4 shrink-0 rounded-[10px] border border-line bg-cream-50 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-sage-900">Unit</h2>
        <span className="truncate text-[12px] text-sage-500">{item.brandName}</span>
      </div>

      <div className="flex gap-4">
        {/* left rail — packaging, tap to add a whole pack */}
        <div className="flex w-[108px] shrink-0 flex-col gap-2">
          {rail.map((u) => {
            const kind = packKindForUnit(u.name, u.level, shape);
            return (
              <button
                key={u.level}
                type="button"
                onClick={() => onSetQtyBase(clamp(selected + u.factorToBase))}
                title={`Add 1 ${u.name}`}
                className="flex items-center gap-2 rounded-[9px] border border-line bg-cream-100 px-2 py-1.5 text-left hover:border-sage-500 hover:bg-cream-200"
              >
                <PackIcon kind={kind} shape={shape} className="h-8 w-8 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-sage-900">
                    {u.name}
                  </span>
                  <span className="block text-[10px] text-sage-500 tnum">
                    +{u.factorToBase}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* main tray */}
        <div className="min-w-0 flex-1">
          {available === 0 ? (
            <div className="rounded-[10px] border border-dashed border-line bg-cream-100 p-8 text-center text-[13px] text-sage-500">
              No sellable stock for this item.
            </div>
          ) : (
            <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
              {usePacks ? (
                Array.from({ length: packsShown }).map((_, s) => (
                  <div
                    key={s}
                    className="rounded-[12px] p-2"
                    style={{
                      background:
                        "linear-gradient(180deg,#d3d9dc 0%,#c3cacd 100%)",
                    }}
                  >
                    <div
                      className="grid gap-1.5"
                      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
                    >
                      {Array.from({ length: packSize }).map((_, c) => (
                        <Cell key={c} idx={s * packSize + c} />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div
                  className="grid gap-1.5 rounded-[12px] p-2"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`,
                    background: "linear-gradient(180deg,#d3d9dc,#c3cacd)",
                  }}
                >
                  {Array.from({ length: Math.max(drawnBase, 1) }).map((_, c) => (
                    <Cell key={c} idx={c} />
                  ))}
                </div>
              )}
              {hiddenBeyond > 0 && (
                <p className="px-1 text-[11px] text-sage-400">
                  + {toMixedDisplay(hiddenBeyond, units)} more in stock — use the
                  packs on the left or +.
                </p>
              )}
            </div>
          )}

          {/* readout + stepper */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold text-sage-900 tnum">
                {toMixedDisplay(selected, units) || `0 ${base.name}`}
              </div>
              <div className="text-[12px] text-sage-500 tnum">
                {selected} {base.name} · {formatPaisa(amount)}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onSetQtyBase(clamp(selected - 1))}
                aria-label="One less"
                className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-line bg-cream-50 text-sage-700 hover:bg-cream-200"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-[16px] font-semibold tnum">
                {selected}
              </span>
              <button
                type="button"
                onClick={() => onSetQtyBase(clamp(selected + 1))}
                aria-label="One more"
                className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-line bg-cream-50 text-sage-700 hover:bg-cream-200"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
