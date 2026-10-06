import type { PrintCompany } from "@/lib/print-types";

/**
 * lab-dispatch-slip.tsx — the piece of paper that travels with the sample.
 *
 * It names the laboratory, the patient and the tests, and leaves a blank line
 * for whoever collects the sample to sign. It prints only for services flagged
 * as going to an outside laboratory (PRD §4B.5).
 *
 * One slip per laboratory: two partners on one bill means two slips, because
 * each one goes in a different bag.
 */
export interface DispatchTest {
  name: string;
  qty: number;
}

export interface DispatchSlipData {
  company: PrintCompany;
  partnerName: string;
  invoiceLabel: string;
  dateBsLong: string;
  timeStr: string;
  patientNo: number | null;
  patientName: string;
  patientAgeSex: string;
  referringDoctor: string;
  tests: DispatchTest[];
}

export function LabDispatchSlip({ slip }: { slip: DispatchSlipData }) {
  const c = slip.company;
  return (
    <div className="invoice-thermal">
      <div style={{ textAlign: "center" }}>
        <div className="shop-name">{c.name || "Clinic"}</div>
        {c.address && <div>{c.address}</div>}
        {c.phone && <div>Ph: {c.phone}</div>}
      </div>

      <div className="dashed" />
      <div style={{ textAlign: "center", fontWeight: 700 }}>
        SAMPLE FOR TESTING
      </div>
      <div className="dashed" />

      <div>
        <div style={{ fontWeight: 700 }}>To: {slip.partnerName}</div>
        <div>Ref: {slip.invoiceLabel}</div>
        <div>
          {slip.dateBsLong} {slip.timeStr}
        </div>
      </div>

      <div className="dashed" />

      <div>
        <div>
          Patient:{" "}
          {slip.patientNo != null
            ? `P-${String(slip.patientNo).padStart(6, "0")} `
            : ""}
          {slip.patientName}
        </div>
        <div>{slip.patientAgeSex}</div>
        {slip.referringDoctor && <div>Referred by: {slip.referringDoctor}</div>}
      </div>

      <div className="dashed" />
      <div style={{ fontWeight: 700 }}>Tests requested</div>
      {slip.tests.map((t, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{t.name}</span>
          <span>{t.qty > 1 ? `× ${t.qty}` : ""}</span>
        </div>
      ))}

      <div className="dashed" />
      <div style={{ marginTop: 18 }}>Sample collected by: ______________________</div>
      <div style={{ marginTop: 12 }}>Time: ______________________</div>
      <div className="dashed" />
      <div style={{ textAlign: "center", fontSize: 9 }}>
        This slip is not a bill.
      </div>
    </div>
  );
}
