import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** right-align + tabular figures, for money/qty */
  numeric?: boolean;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, numeric, invalid, ...rest }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-[8px] border bg-cream-50 px-3 text-[14px] text-sage-950",
        "placeholder:text-sage-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-700",
        numeric && "text-right tnum",
        invalid ? "border-danger-600" : "border-line",
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = "Input";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-sage-900">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-danger-600">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-sage-500">{hint}</p>
      ) : null}
    </div>
  );
}
