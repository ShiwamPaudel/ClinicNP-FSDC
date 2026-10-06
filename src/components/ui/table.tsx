import { cn } from "@/lib/cn";

export function Table({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-cream-50">
      <table className={cn("w-full border-collapse text-[14px]", className)}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-sage-75 text-[13px] font-semibold text-sage-900">
      {children}
    </thead>
  );
}

export function TR({
  children,
  className,
  selected,
}: {
  children: React.ReactNode;
  className?: string;
  selected?: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-b border-line last:border-0 hover:bg-cream-200",
        selected && "bg-sage-150",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TH({
  children,
  numeric,
  className,
}: {
  children?: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-left font-semibold",
        numeric && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  numeric,
  className,
}: {
  children?: React.ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2 align-middle",
        numeric && "text-right tnum",
        className,
      )}
    >
      {children}
    </td>
  );
}
