"use client";

import type { RackDisplay } from "@/lib/repos/company";
import { useEffect, useRef, useState } from "react";
import { Trash2, Layers, AlertTriangle } from "lucide-react";
import { useBillStore } from "@/stores/bill-store";
import {
  lineAmountPaisa,
  lineBaseQty,
  linePreview,
  unitByLevel,
  type BillLine,
} from "@/lib/bill-calc";
import { toPaisa, paisaToRupees, formatPaisa } from "@/lib/money";
import { toMixedDisplay } from "@/lib/units";
import { UnitChip } from "@/components/pos/unit-chip";
import type { PrintCompany } from "@/lib/print-types";
import { cn } from "@/lib/cn";

export interface PosConfig {
  appName: string;
  vatRegistered: boolean;
  /** rates already include VAT, rather than VAT being added on top */
  vatInclusive: boolean;
  roundingOn: boolean;
  /** whether the counter says where a medicine is kept, and how loudly */
  rackDisplay: RackDisplay;
  minRateIsCost: boolean;
  /** patients exist: a bill on dues is attached to one, like a service */
  clinicOn: boolean;
  canEditRate: boolean;
  /** only an Admin may take something out of the queue unsent */
  isAdmin: boolean;
  userName: string;
  todayIso: string;
  todayBsLong: string;
  todayBsText: string;
  company: PrintCompany;
}

export function BillTable({
  config,
  onOpenBatch,
  onBackToSearch,
}: {
  config: PosConfig;
  onOpenBatch: (lineId: string) => void;
  /** Enter on a line, or removing it, goes back to the search box. */
  onBackToSearch?: () => void;
}) {
  const lines = useBillStore((s) => s.lines);
  const serviceLines = useBillStore((s) => s.serviceLines);

  // The prompt belongs to an empty bill, not an empty medicine block: a bill
  // that already has a consultation on it is not empty.
  if (lines.length === 0) {
    if (serviceLines.length > 0) return null;
    return (
      <div className="flex flex-1 items-center justify-center text-center">
        <p className="max-w-xs text-[15px] text-sage-400">
          Search above and press Enter to start the bill.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[15px]">
        <thead>
          <tr className="border-b border-line text-[12px] font-semibold uppercase tracking-wide text-sage-500">
            <th className="py-2 text-left">Item</th>
            <th className="text-left">Unit</th>
            <th className="w-20 text-right">Qty</th>
            <th className="w-28 text-right">Rate</th>
            <th className="w-24 text-right">Disc.</th>
            <th className="w-28 text-right">Amount</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <BillLineRow
              key={line.lineId}
              line={line}
              config={config}
              onOpenBatch={onOpenBatch}
              onBackToSearch={onBackToSearch}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BillLineRow({
  line,
  config,
  onOpenBatch,
  onBackToSearch,
}: {
  line: BillLine;
  config: PosConfig;
  onOpenBatch: (lineId: string) => void;
  onBackToSearch?: () => void;
}) {
  const {
    setQty,
    setRate,
    setLineDiscount,
    cycleUnit,
    setUnit,
    removeLine,
    setActiveLine,
    activeLineId,
  } = useBillStore();

  const qtyRef = useRef<HTMLInputElement>(null);
  const [rateStr, setRateStr] = useState(String(paisaToRupees(line.ratePaisa)));
  const [discStr, setDiscStr] = useState(
    line.discountPaisa ? String(paisaToRupees(line.discountPaisa)) : "",
  );

  // keep the local rate text in sync when the unit (and thus rate) changes
  useEffect(() => {
    setRateStr(String(paisaToRupees(line.ratePaisa)));
  }, [line.ratePaisa]);

  // focus qty when this line becomes active (just added / resumed)
  useEffect(() => {
    if (activeLineId === line.lineId) qtyRef.current?.focus();
  }, [activeLineId, line.lineId]);

  const preview = linePreview(line, config.todayIso);
  const unit = unitByLevel(line.item, line.unitLevel);
  const needed = lineBaseQty(line);
  const insufficient = preview.shortfallBaseQty > 0;

  // below-cost warning: compare rate to the cost of the allocated stock
  const firstAlloc = preview.allocations[0];
  const allocBatch = firstAlloc
    ? line.item.batches.find((b) => b.id === firstAlloc.batchId)
    : undefined;
  const costForUnit = allocBatch
    ? allocBatch.costPaisaPerBase * (unit?.factorToBase ?? 1)
    : 0;
  const belowCost =
    config.minRateIsCost && costForUnit > 0 && line.ratePaisa < costForUnit;

  // A unit the shop has never priced. What is typed here becomes the price,
  // once, when the bill is saved — so the box is open even to somebody who is
  // not allowed to edit rates. Supplying a price that does not exist is not
  // the same act as overriding one that does, and blocking it would mean the
  // counter cannot sell the medicine at all until an Admin is free.
  const unpriced = (unit?.sellingRatePaisa ?? 0) === 0;
  const needsPrice = unpriced && line.ratePaisa <= 0;

  /**
   * The keys on a line, the same in its quantity, rate and discount boxes —
   * they are all numbers, so no letter here is ever wanted as typing.
   * U unit · B batch · Del remove · Enter back to the search for the next one.
   */
  function lineKeys(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "u" || e.key === "U") {
      e.preventDefault();
      cycleUnit(line.lineId);
    } else if (e.key === "b" || e.key === "B") {
      e.preventDefault();
      onOpenBatch(line.lineId);
    } else if (e.key === "Delete") {
      e.preventDefault();
      removeLine(line.lineId);
      onBackToSearch?.();
    } else if (e.key === "Enter") {
      e.preventDefault();
      onBackToSearch?.();
    }
  }

  return (
    <tr
      className={cn(
        "border-b border-line align-top",
        line.overrideBatchId && "border-l-2 border-l-magenta-600",
      )}
      onFocus={() => setActiveLine(line.lineId)}
    >
      <td className="py-2 pr-2">
        <div className="font-medium text-sage-900">
          {line.item.brandName}
          {line.item.controlledFlag && (
            <span className="ml-2 rounded-[4px] bg-info-100 px-1 text-[11px] text-info-600">
              Rx
            </span>
          )}
        </div>
        {line.item.genericName && (
          <div className="text-[12px] text-sage-500">{line.item.genericName}</div>
        )}
        {insufficient && (
          <div className="mt-0.5 flex items-center gap-1 text-[12px] text-danger-600">
            <AlertTriangle className="h-3 w-3" />
            Only {toMixedDisplay(preview.availableBaseQty, line.item.units)} in stock
          </div>
        )}
        {belowCost && (
          <div className="mt-0.5 text-[12px] text-warn-600">
            This price is below what you paid for the item.
          </div>
        )}
      </td>
      <td className="pr-2">
        <UnitChip
          units={line.item.units}
          activeLevel={line.unitLevel}
          onSelect={(level) => setUnit(line.lineId, level)}
        />
      </td>
      <td className="pr-2 text-right">
        <input
          ref={qtyRef}
          inputMode="numeric"
          value={line.qty}
          onChange={(e) =>
            setQty(line.lineId, Number(e.target.value.replace(/\D/g, "")) || 1)
          }
          onKeyDown={lineKeys}
          className="h-9 w-16 rounded-[8px] border border-line bg-cream-50 px-2 text-right text-[15px] tnum focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-700"
          aria-label="Quantity"
        />
      </td>
      <td className="pr-2 text-right">
        <div className="relative">
          <input
            inputMode="decimal"
            value={unpriced && line.ratePaisa <= 0 ? "" : rateStr}
            placeholder={unpriced ? "price" : undefined}
            disabled={!config.canEditRate && !unpriced}
            onChange={(e) => {
              setRateStr(e.target.value);
              setRate(line.lineId, toPaisa(Number(e.target.value) || 0));
            }}
            onKeyDown={lineKeys}
            className={cn(
              "h-9 w-24 rounded-[8px] border bg-cream-50 px-2 pr-4 text-right text-[15px] tnum focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-700 disabled:opacity-60",
              needsPrice
                ? "border-warn-600 placeholder:text-warn-600"
                : "border-line",
            )}
            aria-label={unpriced ? "Price this medicine" : "Rate"}
            aria-invalid={needsPrice || undefined}
          />
          {line.rateOverridden && !unpriced && (
            <span
              title="Rate edited for this bill"
              className="absolute right-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-magenta-600"
            />
          )}
        </div>
      </td>
      <td className="pr-2 text-right">
        <input
          inputMode="decimal"
          value={discStr}
          placeholder="0"
          onChange={(e) => {
            setDiscStr(e.target.value);
            setLineDiscount(line.lineId, toPaisa(Number(e.target.value) || 0));
          }}
          onKeyDown={lineKeys}
          className="h-9 w-20 rounded-[8px] border border-line bg-cream-50 px-2 text-right text-[15px] tnum focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-700"
          aria-label="Line discount"
        />
      </td>
      <td className="pr-2 text-right font-medium tnum text-sage-900">
        {formatPaisa(lineAmountPaisa(line), false)}
      </td>
      <td className="text-right">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onOpenBatch(line.lineId)}
            title="Choose batch (B)"
            className={cn(
              "rounded-[6px] p-1.5 hover:bg-cream-200",
              line.overrideBatchId ? "text-magenta-600" : "text-sage-500",
            )}
          >
            <Layers className="h-4 w-4" />
          </button>
          <button
            onClick={() => removeLine(line.lineId)}
            title="Remove line (Del)"
            className="rounded-[6px] p-1.5 text-danger-600 hover:bg-danger-100"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {needed > 0 && preview.allocations.length > 1 && (
          <div className="mt-0.5 text-[11px] text-sage-400">2 batches</div>
        )}
      </td>
    </tr>
  );
}
