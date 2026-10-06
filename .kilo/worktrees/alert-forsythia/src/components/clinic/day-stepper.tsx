"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import {
  adFromIso,
  adToIso,
  bsFromDbText,
  bsToDbText,
  toAD,
  toBS,
  today,
} from "@/lib/bs";

/**
 * Yesterday / a date / tomorrow.
 *
 * Stepping a day is done in AD and converted back, because BS months are not
 * all the same length and "day + 1" is not a thing you may do to a BS date by
 * hand (Rules §1.5).
 */
export function DayStepper({
  valueBs,
  basePath,
}: {
  valueBs: string;
  basePath: string;
}) {
  const router = useRouter();

  function go(bs: string) {
    router.push(`${basePath}?on=${bs}`);
  }

  function step(days: number) {
    const ad = toAD(bsFromDbText(valueBs));
    const moved = adFromIso(adToIso(ad));
    moved.setDate(moved.getDate() + days);
    go(bsToDbText(toBS(moved)));
  }

  const isToday = valueBs === bsToDbText(today());

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => step(-1)}
        aria-label="The day before"
        className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-line bg-cream-50 text-sage-700 hover:bg-cream-200"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="w-[220px]">
        <DatePickerBS value={valueBs} onChange={go} />
      </div>

      <button
        onClick={() => step(1)}
        aria-label="The day after"
        className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-line bg-cream-50 text-sage-700 hover:bg-cream-200"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {!isToday && (
        <button
          onClick={() => go(bsToDbText(today()))}
          className="h-10 rounded-[8px] border border-line bg-cream-50 px-3 text-[14px] text-sage-700 hover:bg-cream-200"
        >
          Today
        </button>
      )}
    </div>
  );
}
