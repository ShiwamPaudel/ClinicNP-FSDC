"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Triggers the browser print dialog for the current page. */
export function PrintButton({ label = "Print list" }: { label?: string }) {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      {label}
    </Button>
  );
}
