import { cn } from "@/lib/cn";

/** A single shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[6px] bg-sage-150/60",
        className,
      )}
    />
  );
}

/**
 * Full-page loading placeholder that mirrors the back-office frame (header +
 * padded content) so a tab switch swaps in an instant, structure-matched
 * skeleton instead of a blank or frozen screen.
 */
export function PageSkeleton() {
  return (
    <>
      <header className="flex h-14 items-center justify-between border-b border-line bg-cream-50 px-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </header>
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
        <div className="mb-4 flex justify-end gap-2">
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="overflow-hidden rounded-[10px] border border-line bg-cream-50">
          <div className="flex gap-4 border-b border-line px-4 py-3">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/6" />
            <Skeleton className="h-4 w-1/6" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b border-line/60 px-4 py-3.5">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
