"use client";

import { Download } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Downloads a report as .xlsx from /api/export/[report], carrying the range. */
export function ExportButton({ report }: { report: string }) {
  const params = useSearchParams();
  const qs = params.toString();
  const href = `/api/export/${report}${qs ? `?${qs}` : ""}`;
  return (
    <a href={href}>
      <Button variant="secondary">
        <Download className="h-4 w-4" />
        Export to Excel
      </Button>
    </a>
  );
}
