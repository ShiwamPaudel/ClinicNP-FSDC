import { Skeleton } from "@/components/app/skeleton";

// Minimal three-zone placeholder for the billing screen while it loads.
export default function Loading() {
  return (
    <div className="flex h-screen flex-col bg-cream-100">
      <div className="flex h-14 items-center justify-between border-b border-line bg-cream-50 px-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex-1 p-6">
          <Skeleton className="mb-4 h-11 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="w-[360px] border-l border-line p-6">
          <Skeleton className="mb-3 h-8 w-full" />
          <Skeleton className="mb-3 h-40 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </div>
  );
}
