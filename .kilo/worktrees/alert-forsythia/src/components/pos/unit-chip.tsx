"use client";

import type { PosUnit } from "@/lib/pos-types";
import { cn } from "@/lib/cn";

/** Segmented pill on each bill line. Active segment carries the magenta ring
 *  (a human choice). Tap or `U` cycles (Design.md §4). */
export function UnitChip({
  units,
  activeLevel,
  onSelect,
}: {
  units: PosUnit[];
  activeLevel: number;
  onSelect: (level: number) => void;
}) {
  const sorted = [...units].sort((a, b) => b.level - a.level);
  return (
    <div className="inline-flex h-7 items-center rounded-[999px] border border-line bg-cream-100 p-0.5">
      {sorted.map((u) => {
        const active = u.level === activeLevel;
        return (
          <button
            key={u.level}
            onClick={() => onSelect(u.level)}
            className={cn(
              "h-6 rounded-[999px] px-2.5 text-[12px] font-medium transition-colors",
              active
                ? "bg-sage-700 text-cream-50 ring-[1.5px] ring-magenta-600"
                : "text-sage-600 hover:bg-cream-200",
            )}
          >
            {u.name}
          </button>
        );
      })}
    </div>
  );
}
