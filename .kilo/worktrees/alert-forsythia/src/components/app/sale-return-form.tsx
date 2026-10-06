"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { createSaleReturnAction } from "@/app/(app)/bills/actions";
import { ReturnNote, type ReturnNoteData } from "@/components/print/return-note";
import { formatPaisa } from "@/lib/money";
import { splitReturn } from "@/lib/dues";
import type { PrintCompany } from "@/lib/print-types";
import { strings } from "@/lib/strings";

export interface ReturnLineData {
  billLineId: string;
  itemId: string;
  name: string;
  unitName: string;
  factorToBase: number;
  soldQty: number;
  alreadyReturnedUnits: number;
  ratePaisa: number;
  lineAmountPaisa: number;
}

/**
 * A service being refunded. Called a refund on screen, never a return:
 * nothing comes back off a shelf, only money changes hands (PRD §4B.4).
 */
export interface RefundServiceLineData {
  billServiceLineId: string;
  name: string;
  doctorName: string;
  soldQty: number;
  alreadyRefundedQty: number;
  lineAmountPaisa: number;
}

export function SaleReturnForm({
  billId,
  invoiceLabel,
  company,
  dateBsLong,
  lines,
  serviceLines = [],
  yearClosedNote = "",
  owedPaisa = 0,
}: {
  billId: string;
  invoiceLabel: string;
  company: PrintCompany;
  dateBsLong: string;
  lines: ReturnLineData[];
  serviceLines?: RefundServiceLineData[];
  /** Set when the original bill sits in a year that has since been closed. */
  yearClosedNote?: string;
  /** what the patient still owes on this bill; a return comes off it first */
  owedPaisa?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [svcQtys, setSvcQtys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<ReturnNoteData | null>(null);

  const prepared = useMemo(() => {
    return lines
      .map((l) => {
        const max = l.soldQty - l.alreadyReturnedUnits;
        const q = Math.min(Number(qtys[l.billLineId]) || 0, max);
        const amount = l.soldQty > 0 ? Math.round((l.lineAmountPaisa * q) / l.soldQty) : 0;
        return { l, q, max, amount };
      })
      .filter((x) => x.q > 0);
  }, [lines, qtys]);

  const preparedServices = useMemo(() => {
    return serviceLines
      .map((l) => {
        const max = l.soldQty - l.alreadyRefundedQty;
        const q = Math.min(Number(svcQtys[l.billServiceLineId]) || 0, max);
        const amount =
          l.soldQty > 0 ? Math.round((l.lineAmountPaisa * q) / l.soldQty) : 0;
        return { l, q, max, amount };
      })
      .filter((x) => x.q > 0);
  }, [serviceLines, svcQtys]);

  const total =
    prepared.reduce((s, x) => s + x.amount, 0) +
    preparedServices.reduce((s, x) => s + x.amount, 0);

  async function submit() {
    if (prepared.length === 0 && preparedServices.length === 0) {
      toast.error("Choose what is being given back.");
      return;
    }
    setBusy(true);
    const res = await createSaleReturnAction({
      billId,
      lines: prepared.map((x) => ({
        billLineId: x.l.billLineId,
        itemId: x.l.itemId,
        returnBaseQty: x.q * x.l.factorToBase,
        amountPaisa: x.amount,
      })),
      serviceLines: preparedServices.map((x) => ({
        billServiceLineId: x.l.billServiceLineId,
        qty: x.q,
        amountPaisa: x.amount,
      })),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
      return;
    }
    // print the return note
    setNote({
      company,
      returnLabel: res.returnNo ? `SR-${res.returnNo}` : "Return",
      againstInvoice: invoiceLabel,
      dateBsLong,
      // Services first, then medicines, matching the invoice.
      lines: [
        ...preparedServices.map((x) => ({
          name: x.l.name,
          qty: x.q,
          unitName: "",
          amountPaisa: x.amount,
        })),
        ...prepared.map((x) => ({
          name: x.l.name,
          qty: x.q,
          unitName: x.l.unitName,
          amountPaisa: x.amount,
        })),
      ],
      totalPaisa: total,
      intoOpenYearNote: res.intoOpenYearNote ?? "",
      againstDuePaisa: res.againstDuePaisa ?? 0,
      handBackPaisa: res.handBackPaisa ?? total,
    });
    requestAnimationFrame(() => window.print());
    toast.success(
      preparedServices.length > 0 && prepared.length === 0
        ? "Refund saved"
        : "Return saved",
    );
    router.push(`/bills/${billId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {yearClosedNote && (
        <div className="rounded-[10px] bg-info-100 px-4 py-3 text-[14px] text-info-600">
          This bill is from {yearClosedNote}, which is closed. The money goes
          back today and is recorded in the year that is open now, with a
          reference to the original bill. The closed year is left exactly as it
          was.
        </div>
      )}

      {serviceLines.length > 0 && (
        <>
          <p className="text-[14px] text-sage-500">
            Refunding a service gives the money back. Nothing goes back into
            stock, because nothing came out of it.
          </p>
          <Table>
            <THead>
              <TR>
                <TH>Service</TH>
                <TH>Doctor</TH>
                <TH numeric>Billed</TH>
                <TH numeric>Can refund</TH>
                <TH numeric>Refund</TH>
              </TR>
            </THead>
            <tbody>
              {serviceLines.map((l) => {
                const max = l.soldQty - l.alreadyRefundedQty;
                return (
                  <TR key={l.billServiceLineId}>
                    <TD className="font-medium text-sage-900">{l.name}</TD>
                    <TD className="text-sage-500">{l.doctorName || "—"}</TD>
                    <TD numeric>{l.soldQty}</TD>
                    <TD numeric>{max}</TD>
                    <TD numeric>
                      <Input
                        numeric
                        inputMode="numeric"
                        className="w-20"
                        disabled={max <= 0}
                        value={svcQtys[l.billServiceLineId] ?? ""}
                        placeholder="0"
                        onChange={(e) => {
                          const v = Math.min(
                            Number(e.target.value.replace(/[^0-9]/g, "")) || 0,
                            max,
                          );
                          setSvcQtys((q) => ({
                            ...q,
                            [l.billServiceLineId]: String(v || ""),
                          }));
                        }}
                      />
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </>
      )}

      {lines.length > 0 && (
      <>
      <p className="text-[14px] text-sage-500">
        Choose how much of each line to return. Stock goes back to the batch it
        was sold from.
      </p>
      <Table>
        <THead>
          <TR>
            <TH>Item</TH>
            <TH numeric>Sold</TH>
            <TH numeric>Returnable</TH>
            <TH numeric>Return</TH>
          </TR>
        </THead>
        <tbody>
          {lines.map((l) => {
            const max = l.soldQty - l.alreadyReturnedUnits;
            return (
              <TR key={l.billLineId}>
                <TD className="font-medium text-sage-900">{l.name}</TD>
                <TD numeric>
                  {l.soldQty} {l.unitName}
                </TD>
                <TD numeric>{max}</TD>
                <TD numeric>
                  <Input
                    numeric
                    inputMode="numeric"
                    className="w-20"
                    disabled={max <= 0}
                    value={qtys[l.billLineId] ?? ""}
                    placeholder="0"
                    onChange={(e) => {
                      const v = Math.min(
                        Number(e.target.value.replace(/\D/g, "")) || 0,
                        max,
                      );
                      setQtys((q) => ({ ...q, [l.billLineId]: String(v || "") }));
                    }}
                  />
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>
      </>
      )}

      {owedPaisa > 0 && (
        <div className="rounded-[10px] bg-warn-100 px-4 py-3 text-[14px] text-warn-600">
          {formatPaisa(owedPaisa)} is still owed on this bill.
          {total > 0 &&
            (() => {
              const split = splitReturn(total, owedPaisa);
              return split.handBackPaisa > 0
                ? ` ${formatPaisa(split.againstDuePaisa)} of this comes off what they owe, and ${formatPaisa(split.handBackPaisa)} is handed back.`
                : ` This comes off what they owe — nothing is handed back.`;
            })()}
        </div>
      )}

      <div className="flex items-center justify-end gap-4">
        <span className="text-[14px] text-sage-600">
          Refund: <span className="font-semibold text-sage-900 tnum">{formatPaisa(total)}</span>
        </span>
        <Button variant="secondary" onClick={() => router.push(`/bills/${billId}`)}>
          {strings.cancel}
        </Button>
        <Button onClick={submit} disabled={busy || total === 0}>
          {busy
            ? "…"
            : serviceLines.length > 0 && lines.length === 0
              ? "Save refund & print"
              : "Save return & print"}
        </Button>
      </div>

      <div className="print-area">{note && <ReturnNote data={note} />}</div>
    </div>
  );
}
