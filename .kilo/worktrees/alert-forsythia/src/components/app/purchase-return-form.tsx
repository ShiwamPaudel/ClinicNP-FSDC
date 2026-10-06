"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { createPurchaseReturnAction } from "@/app/(app)/purchases/actions";
import { formatPaisa } from "@/lib/money";
import { bsToDbText, today, adFromIso, toBS, formatBS } from "@/lib/bs";
import { toMixedDisplay, type UnitDef } from "@/lib/units";
import type { Supplier } from "@/lib/repos/suppliers";
import { strings } from "@/lib/strings";
import { RotateCcw } from "lucide-react";

export interface ReturnBatch {
  id: string;
  itemId: string;
  brandName: string;
  batchNo: string;
  expiryDateAd: string;
  supplierId: string | null;
  remainingBaseQty: number;
  costPaisaPerBase: number;
  baseUnitName: string;
  units: UnitDef[];
}

export function PurchaseReturnForm({
  suppliers,
  batches,
}: {
  suppliers: Supplier[];
  batches: ReturnBatch[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [supplierId, setSupplierId] = useState("");
  const [dateBs, setDateBs] = useState(bsToDbText(today()));
  const [reason, setReason] = useState("near expiry");
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => batches.filter((b) => !supplierId || b.supplierId === supplierId),
    [batches, supplierId],
  );

  async function submit() {
    const lines = visible
      .map((b) => {
        const qty = Number(qtys[b.id]) || 0;
        return { b, qty };
      })
      .filter(({ b, qty }) => qty > 0 && qty <= b.remainingBaseQty)
      .map(({ b, qty }) => ({
        batchId: b.id,
        itemId: b.itemId,
        baseQty: qty,
        costPaisa: qty * b.costPaisaPerBase,
      }));

    if (lines.length === 0) {
      toast.error("Enter a quantity to return for at least one batch.");
      return;
    }
    if (!supplierId) {
      toast.error("Choose a supplier.");
      return;
    }
    setBusy(true);
    const res = await createPurchaseReturnAction({
      supplierId,
      dateBs,
      reason,
      lines,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("Purchase return saved");
      router.push("/purchases");
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-[10px] border border-line bg-cream-50 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— Choose —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <DatePickerBS value={dateBs} onChange={setDateBs} />
          </Field>
          <Field label="Reason">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="near expiry">Near expiry</option>
              <option value="damaged">Damaged</option>
              <option value="recall">Recall</option>
            </Select>
          </Field>
        </div>
      </section>

      {!supplierId ? (
        <EmptyState icon={RotateCcw} message="Choose a supplier to see returnable batches." />
      ) : visible.length === 0 ? (
        <EmptyState icon={RotateCcw} message="No stock from this supplier to return." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH>Batch</TH>
              <TH>Expiry</TH>
              <TH>In stock</TH>
              <TH numeric>Return ({visible[0]?.baseUnitName})</TH>
            </TR>
          </THead>
          <tbody>
            {visible.map((b) => (
              <TR key={b.id}>
                <TD className="font-medium text-sage-900">{b.brandName}</TD>
                <TD className="font-mono">{b.batchNo}</TD>
                <TD>
                  {formatBS(toBS(adFromIso(b.expiryDateAd)), {
                    form: "long",
                    monthScript: "en",
                  })}
                </TD>
                <TD>{toMixedDisplay(b.remainingBaseQty, b.units)}</TD>
                <TD numeric>
                  <Input
                    numeric
                    inputMode="numeric"
                    className="w-24"
                    value={qtys[b.id] ?? ""}
                    placeholder="0"
                    onChange={(e) =>
                      setQtys((q) => ({
                        ...q,
                        [b.id]: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                  />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.push("/purchases")}>
          {strings.cancel}
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? "…" : "Save return"}
        </Button>
      </div>
    </div>
  );
}
