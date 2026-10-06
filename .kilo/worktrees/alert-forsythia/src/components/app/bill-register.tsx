"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPaisa } from "@/lib/money";
import { formatDocNo } from "@/lib/invoice-number";
import type { BillListRow } from "@/lib/repos/bills";
import { ReceiptText } from "lucide-react";

function label(b: BillListRow): string {
  return b.invoiceNo != null
    ? formatDocNo("SI", b.fiscalLabel, b.invoiceNo)
    : "Pending";
}

const METHOD: Record<string, string> = { cash: "Cash", qr: "QR", credit: "Dues" };

const KIND_LABEL: Record<string, string> = {
  pharmacy: "Medicine",
  clinic: "Service",
  mixed: "Both",
};

const KIND_TONE: Record<string, "ok" | "info" | "neutral"> = {
  pharmacy: "ok",
  clinic: "info",
  mixed: "neutral",
};

export function BillRegister({
  rows,
  readOnly = false,
  showKind = false,
}: {
  rows: BillListRow[];
  /** A closed year is readable and printable, never changeable (D-029). */
  readOnly?: boolean;
  /** With both modules on, what a bill is for is worth a column. */
  showKind?: boolean;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((b) => {
      if (kind !== "all" && b.kind !== kind) return false;
      if (!query) return true;
      return (
        label(b).toLowerCase().includes(query) ||
        b.dateBs.includes(query) ||
        b.patientName.toLowerCase().includes(query) ||
        b.registeredName.toLowerCase().includes(query) ||
        (b.patientNo != null && String(b.patientNo).includes(query)) ||
        String(b.totalPaisa / 100).includes(query)
      );
    });
  }, [rows, q, kind]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="max-w-sm flex-1">
          <Input
            placeholder="Search invoice no., date, patient, number, amount…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {showKind && (
          <div className="flex gap-1">
            {(
              [
                ["all", "All"],
                ["pharmacy", "Medicine"],
                ["clinic", "Service"],
                ["mixed", "Both"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                onClick={() => setKind(value)}
                className={
                  kind === value
                    ? "rounded-[8px] bg-sage-700 px-3 py-2 text-[13px] font-medium text-cream-50"
                    : "rounded-[8px] border border-line px-3 py-2 text-[13px] text-sage-700 hover:bg-cream-200"
                }
              >
                {text}
              </button>
            ))}
          </div>
        )}
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={ReceiptText} message="No bills match. Try a different search." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Invoice</TH>
              <TH>Date</TH>
              <TH>Patient</TH>
              {showKind && <TH>For</TH>}
              <TH>Payment</TH>
              <TH numeric>Total</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <tbody>
            {filtered.map((b) => (
              <TR key={b.id}>
                <TD>
                  <Link
                    href={`/bills/${b.id}`}
                    className="font-mono text-sage-900 hover:text-sage-600"
                  >
                    {label(b)}
                  </Link>
                </TD>
                <TD>{b.dateBs}</TD>
                <TD>
                  {b.registeredName || b.patientName ? (
                    <span className="flex flex-col">
                      <span>{b.registeredName || b.patientName}</span>
                      {b.patientNo != null && (
                        <span className="font-mono text-[12px] text-clinic-700">
                          P-{String(b.patientNo).padStart(6, "0")}
                        </span>
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </TD>
                {showKind && (
                  <TD>
                    <Badge tone={KIND_TONE[b.kind] ?? "neutral"}>
                      {KIND_LABEL[b.kind] ?? b.kind}
                    </Badge>
                  </TD>
                )}
                <TD>{METHOD[b.paymentMethod] ?? b.paymentMethod}</TD>
                <TD numeric>{formatPaisa(b.totalPaisa)}</TD>
                <TD>
                  {b.status === "cancelled" ? (
                    <Badge tone="danger">Cancelled</Badge>
                  ) : b.balancePaisa > 0 ? (
                    <Badge tone="warn">
                      Owes {formatPaisa(b.balancePaisa, false)}
                    </Badge>
                  ) : b.paymentMethod === "credit" ? (
                    <Badge tone="ok">Dues cleared</Badge>
                  ) : (
                    <Badge tone="ok">Saved</Badge>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
