import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "magenta" | "destructive" | "ghost";
type Size = "md" | "pos";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shortcut hint rendered as a keycap chip on the right. */
  shortcut?: string;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-[8px] font-medium " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-50 select-none";

const variants: Record<Variant, string> = {
  // sage primary
  primary:
    "bg-sage-700 text-cream-50 hover:bg-sage-600 disabled:bg-sage-300",
  // cream + line border
  secondary:
    "bg-cream-50 text-sage-900 border border-line hover:bg-cream-200",
  // the one magenta CTA per screen — money starts moving here
  magenta:
    "bg-magenta-600 text-cream-50 hover:bg-magenta-700",
  destructive: "bg-danger-600 text-cream-50 hover:opacity-90",
  ghost: "bg-transparent text-sage-900 hover:bg-cream-200",
};

const sizes: Record<Size, string> = {
  md: "h-10 px-4 text-[14px]",
  pos: "h-11 px-5 text-[16px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", size = "md", shortcut, className, children, ...rest },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {children}
      {shortcut && (
        <kbd className="ml-1 rounded-[6px] bg-cream-50/90 px-1.5 py-0.5 text-[11px] font-semibold text-sage-950 tnum">
          {shortcut}
        </kbd>
      )}
    </button>
  ),
);
Button.displayName = "Button";
