import { cn } from "@/lib/cn";

export type BadgeTone =
  | "ok"
  | "warn"
  | "warn2"
  | "danger"
  | "danger-solid"
  | "info"
  | "neutral";

const tones: Record<BadgeTone, string> = {
  ok: "bg-ok-100 text-ok-600",
  warn: "bg-warn-100 text-warn-600",
  warn2: "bg-warn2-100 text-warn2-600",
  danger: "bg-danger-100 text-danger-600",
  "danger-solid": "bg-danger-600 text-cream-50",
  info: "bg-info-100 text-info-600",
  neutral: "bg-sage-75 text-sage-700",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-[999px] px-2 text-[12px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
