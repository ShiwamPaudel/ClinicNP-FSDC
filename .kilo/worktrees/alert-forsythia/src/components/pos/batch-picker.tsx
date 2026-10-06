"use client";

import { Dialog } from "@/components/ui/dialog";
import type { PosItem } from "@/lib/pos-types";
import { adFromIso, toBS, formatBS } from "@/lib/bs";
import { cn } from "@/lib/cn";

/**
 * Batch selector for a line (`B`). Shows the FEFO-preferred batch and lets the
 * cashier override — overrides are logged on the bill (PRD 4.2.2).
 */
export function BatchPicker({
  open,
  onClose,
  item,
  todayIso,
  selectedBatchId,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  item: PosItem | null;
  todayIso: string;
  selectedBatchId?: string;
  onChoose: (batchId: string | undefined) => void;
}) {
  if (!item) return null;

  const live = item.batches
    .filter((b) => b.remainingBaseQty > 0 && b.expiryDateAd >= todayIso)
    .sort((a, b) => (a.expiryDateAd < b.expiryDateAd ? -1 : 1));

  return (
    <Dialog open={open} onClose={onClose} title={`Choose batch — ${item.brandName}`}>
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-sage-500">
          The nearest-expiry batch is picked automatically. Choose another only
          if you need to.
        </p>
        <button
          onClick={() => {
            onChoose(undefined);
            onClose();
          }}
          className={cn(
            "flex items-center justify-between rounded-[8px] border px-3 py-2.5 text-left",
            !selectedBatchId
              ? "border-sage-700 bg-sage-150"
              : "border-line hover:bg-cream-200",
          )}
        >
          <span className="text-[14px] font-medium text-sage-900">
            Automatic (nearest expiry first)
          </span>
        </button>
        {live.map((b, i) => (
          <button
            key={b.id}
            onClick={() => {
              onChoose(b.id);
              onClose();
            }}
            className={cn(
              "flex items-center justify-between rounded-[8px] border px-3 py-2.5 text-left",
              selectedBatchId === b.id
                ? "border-magenta-600 bg-magenta-100"
                : "border-line hover:bg-cream-200",
            )}
          >
            <span className="font-mono text-[14px] text-sage-900">
              {b.batchNo}
              {i === 0 && (
                <span className="ml-2 text-[11px] text-sage-500">nearest</span>
              )}
            </span>
            <span className="text-[13px] text-sage-500">
              Exp {formatBS(toBS(adFromIso(b.expiryDateAd)))}
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
