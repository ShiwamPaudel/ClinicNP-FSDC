import type { LucideIcon } from "lucide-react";
import { PackageOpen } from "lucide-react";

/** Empty state: icon + one plain sentence + one action. Never "No records found". */
export function EmptyState({
  icon: Icon = PackageOpen,
  message,
  action,
}: {
  icon?: LucideIcon;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[10px] border border-dashed border-line bg-cream-50 px-6 py-16 text-center">
      <Icon className="h-10 w-10 text-sage-300" strokeWidth={1.5} />
      <p className="max-w-xs text-[14px] text-sage-600">{message}</p>
      {action}
    </div>
  );
}
