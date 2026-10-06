import { formatPaisa } from "@/lib/money";
import type { PrintCompany } from "@/lib/print-types";

export interface ReturnNoteData {
  company: PrintCompany;
  returnLabel: string;
  againstInvoice: string;
  dateBsLong: string;
  lines: { name: string; qty: number; unitName: string; amountPaisa: number }[];
  totalPaisa: number;
  /**
   * Set when the original bill belongs to a fiscal year that has since been
   * closed, so the note says which bill this refund is against and that it was
   * recorded in the year that is open now.
   */
  intoOpenYearNote?: string;
  /** on a bill still on dues: what came off the debt, and what was handed back */
  againstDuePaisa?: number;
  handBackPaisa?: number;
}

/** Sales-return note (thermal-style). */
export function ReturnNote({ data }: { data: ReturnNoteData }) {
  const c = data.company;
  return (
    <div className="invoice-thermal">
      <div style={{ textAlign: "center" }}>
        <div className="shop-name">{c.name || "Pharmacy"}</div>
        {c.address && <div>{c.address}</div>}
        <div style={{ fontWeight: 600 }}>PAN: {c.panNo || "—"}</div>
      </div>
      <div className="dashed" />
      <div style={{ fontWeight: 700, textAlign: "center" }}>REFUND</div>
      <div>{data.returnLabel}</div>
      <div>Against: {data.againstInvoice}</div>
      <div>{data.dateBsLong}</div>
      {data.intoOpenYearNote && (
        <div style={{ fontSize: 9 }}>{data.intoOpenYearNote}</div>
      )}
      <div className="dashed" />
      {data.lines.map((l, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            {l.name} ({l.qty}
            {l.unitName ? ` ${l.unitName}` : ""})
          </span>
          <span>{formatPaisa(l.amountPaisa, false)}</span>
        </div>
      ))}
      <div className="dashed" />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
        <span>Refund</span>
        <span>{formatPaisa(data.totalPaisa, false)}</span>
      </div>
      {(data.againstDuePaisa ?? 0) > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Off dues</span>
            <span>{formatPaisa(data.againstDuePaisa ?? 0, false)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Handed back</span>
            <span>{formatPaisa(data.handBackPaisa ?? 0, false)}</span>
          </div>
        </>
      )}
    </div>
  );
}
