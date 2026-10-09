import { FileDown, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * "PDF" and "Excel" for a ledger (C-036). Plain links to the statement route,
 * so the browser saves the file under the name the server gives it.
 *
 * `href` is the route with its own query, without `format`.
 */
export function StatementDownload({
  href,
  size = "md",
  className,
}: {
  href: string;
  size?: "md" | "sm";
  className?: string;
}) {
  const join = href.includes("?") ? "&" : "?";
  const btn =
    size === "sm"
      ? "inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-line bg-cream-50 px-2.5 text-[12.5px] font-medium text-sage-900 hover:bg-cream-200"
      : "inline-flex h-10 items-center gap-2 rounded-[8px] border border-line bg-cream-50 px-4 text-[14px] font-medium text-sage-900 hover:bg-cream-200";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span className={cn("inline-flex flex-wrap gap-2", className)}>
      <a href={`${href}${join}format=pdf`} className={btn} download>
        <FileDown className={icon} />
        PDF
      </a>
      <a href={`${href}${join}format=xlsx`} className={btn} download>
        <FileSpreadsheet className={icon} />
        Excel
      </a>
    </span>
  );
}
