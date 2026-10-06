import type { PrintCompany } from "@/lib/print-types";

export interface OpdSlipData {
  company: PrintCompany;
  patientLabel: string;
  patientName: string;
  ageSex: string;
  visitLabel: string;
  dateBsLong: string;
  doctorName: string;
  department: string;
  complaint: string;
}

/**
 * The OPD slip — the piece of paper the patient carries to the doctor's room.
 *
 * Most of the page is deliberately blank. Below the rule there is nothing but
 * space for the doctor's handwriting, and Design.md §6 is explicit: resist
 * every urge to fill it.
 */
export function OpdSlip({ data }: { data: OpdSlipData }) {
  const c = data.company;
  return (
    <div className="invoice-thermal opd-slip">
      <div style={{ textAlign: "center" }}>
        <div className="shop-name">{c.name || "Clinic"}</div>
        {c.address && <div>{c.address}</div>}
        {c.phone && <div>Ph: {c.phone}</div>}
      </div>

      <div className="dashed" />
      <div style={{ fontWeight: 700, textAlign: "center" }}>OPD SLIP</div>
      <div className="dashed" />

      <div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>{data.patientLabel}</span>
          <span>{data.dateBsLong}</span>
        </div>
        <div style={{ fontWeight: 700, fontSize: "12pt" }}>{data.patientName}</div>
        <div>{data.ageSex}</div>
        {data.visitLabel && <div>Visit: {data.visitLabel}</div>}
        {data.doctorName && <div>Doctor: {data.doctorName}</div>}
        {data.department && <div>Department: {data.department}</div>}
        {data.complaint && (
          <div style={{ marginTop: 4 }}>Complaint: {data.complaint}</div>
        )}
      </div>

      {/* Everything below this rule belongs to the doctor's pen. */}
      <div
        style={{
          borderTop: "1px solid #000",
          marginTop: 8,
          minHeight: "115mm",
        }}
      />
    </div>
  );
}
