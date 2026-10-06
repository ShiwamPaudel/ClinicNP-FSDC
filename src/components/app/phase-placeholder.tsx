import { Hammer } from "lucide-react";
import { PageShell } from "@/components/app/page-shell";
import { EmptyState } from "@/components/ui/empty-state";

/** Temporary placeholder for screens delivered in a later build phase. */
export function PhasePlaceholder({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <PageShell title={title}>
      <EmptyState icon={Hammer} message={message} />
    </PageShell>
  );
}
