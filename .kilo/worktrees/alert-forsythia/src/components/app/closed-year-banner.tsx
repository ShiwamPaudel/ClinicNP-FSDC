import { Info } from "lucide-react";

/**
 * Shown whenever a closed year is being read. Not dismissible: leaving the year
 * is the way out (Design.md §5). It says "closed" in words, so colour is never
 * the only signal.
 */
export function ClosedYearBanner({ label }: { label: string }) {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-[10px] bg-info-100 px-4 py-3 text-[14px] leading-[1.45] text-info-600">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        You&apos;re looking at <span className="font-semibold">{label}</span>.
        This year is closed — you can read and print, but not change anything.
      </p>
    </div>
  );
}
