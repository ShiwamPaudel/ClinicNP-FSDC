"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  writeOffBatchAction,
  returnExpiredBatchAction,
} from "@/app/(app)/stock/actions";
import { strings } from "@/lib/strings";

export function ExpiredActions({
  batchId,
  hasSupplier,
}: {
  batchId: string;
  hasSupplier: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function writeOff() {
    setBusy(true);
    const res = await writeOffBatchAction(batchId, "Expired stock disposed");
    setBusy(false);
    if (res.ok) {
      toast.success("Written off");
      router.refresh();
    } else toast.error(res.userMessage ?? strings.somethingWentWrong);
  }

  async function returnToSupplier() {
    setBusy(true);
    const res = await returnExpiredBatchAction(batchId);
    setBusy(false);
    if (res.ok) {
      toast.success("Returned to supplier");
      router.refresh();
    } else toast.error(res.userMessage ?? strings.somethingWentWrong);
  }

  return (
    <div className="flex justify-end gap-2">
      {hasSupplier && (
        <Button variant="ghost" onClick={returnToSupplier} disabled={busy}>
          Return to supplier
        </Button>
      )}
      <Button variant="ghost" onClick={writeOff} disabled={busy}>
        Write off
      </Button>
    </div>
  );
}
