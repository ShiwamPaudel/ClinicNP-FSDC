import { formatPaisa } from "@/lib/money";
import type { PrintCompany } from "@/lib/print-types";

export interface StockOutNoteLine {
  name: string;
  batchNo: string;
  expiry: string;
  qty: number;
  unitName: string;
  costPaisa: number;
}

export interface StockOutNoteData {
  company: PrintCompany;
  noteLabel: string;
  reasonLabel: string;
  /** Set when stock was added back rather than taken off (count correction). */
  addedBack: boolean;
  supplierName: string | null;
  dateBsLong: string;
  note: string;
  lines: StockOutNoteLine[];
  totalPaisa: number;
  userName: string;
}

/**
 * Stock-out note (80 mm thermal; the A5 sheet uses the same markup through the
 * print stylesheet). Goes to the supplier or into the file, so it carries the
 * reason in words and a signature line.
 */
export function StockOutNote({ data }: { data: StockOutNoteData }) {
  const c = data.company;
  return (
    <div className="invoice-thermal">
      <div style={{ textAlign: "center" }}>
        <div className="shop-name">{c.name || "Pharmacy"}</div>
        {c.address && <div>{c.address}</div>}
        {c.phone && <div>Ph: {c.phone}</div>}
        <div style={{ fontWeight: 600 }}>PAN: {c.panNo || "—"}</div>
      </div>

      <div className="dashed" />
      <div style={{ fontWeight: 700, textAlign: "center" }}>
        {data.addedBack ? "STOCK ADDED BACK" : "STOCK OUT NOTE"}
      </div>
      <div>{data.noteLabel}</div>
      <div>{data.dateBsLong}</div>
      <div style={{ fontWeight: 600 }}>Reason: {data.reasonLabel}</div>
      {data.supplierName && <div>Supplier: {data.supplierName}</div>}
      <div className="dashed" />

      {data.lines.map((l, i) => (
        <div key={i} style={{ marginBottom: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{l.name}</span>
            <span>{formatPaisa(l.costPaisa, false)}</span>
          </div>
          <div style={{ fontSize: "9pt" }}>
            {l.batchNo} · exp {l.expiry} · {l.qty} {l.unitName}
          </div>
        </div>
      ))}

      <div className="dashed" />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
        <span>Value</span>
        <span>{formatPaisa(data.totalPaisa, false)}</span>
      </div>

      {data.note && (
        <>
          <div className="dashed" />
          <div style={{ fontSize: "9pt" }}>Note: {data.note}</div>
        </>
      )}

      <div className="dashed" />
      <div style={{ fontSize: "9pt" }}>Recorded by: {data.userName}</div>
      <div style={{ marginTop: 28 }}>Signature: ____________________</div>
    </div>
  );
}
