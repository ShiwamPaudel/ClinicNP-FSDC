import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...rest }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded-[8px] border bg-cream-50 px-3 text-[14px] text-sage-950",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-700",
        invalid ? "border-danger-600" : "border-line",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
