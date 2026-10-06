import { listAudit } from "@/lib/repos/audit";
import { adFromIso, toBS, formatBS } from "@/lib/bs";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Every action, in the words the owner would use. An action with no entry here
 * still shows — as its own name — so a new one is visible immediately rather
 * than silently missing; it just reads worse until it is added.
 */
const ACTION_LABEL: Record<string, string> = {
  // money and stock
  bill_cancelled: "Bill cancelled",
  rate_override: "Rate edited",
  "dues.received": "Dues paid back",
  "dues.voided": "Dues payment undone",
  "stock_out.recorded": "Stock taken out",
  purchase_edit: "Purchase changed",
  "supplier.payment": "Supplier paid",
  "supplier.payment_voided": "Supplier payment undone",
  restore: "Everything restored from a backup",
  "trading.cleared": "Test purchases and bills cleared",
  "fiscal_year.closed": "Year closed",

  // people
  "patient.created": "Patient registered",
  "patient.edited": "Patient details changed",
  "patient.merged": "Two patient records joined",
  "patient.deactivated": "Patient switched off",
  "visit.cancelled": "Visit cancelled",
  "file.deleted": "File deleted",

  // the clinic catalog
  "service.created": "Service added",
  "service.updated": "Service changed",
  "service.rate_changed": "Service price changed",
  "service_group.created": "Service group added",
  "service_group.updated": "Service group changed",
  "service_group.deleted": "Service group removed",
  "doctor.created": "Doctor added",
  "doctor.updated": "Doctor details changed",
  "doctor.share_changed": "Doctor's share changed",
  "lab_partner.created": "Laboratory added",
  "lab_partner.updated": "Laboratory details changed",
  "lab_partner.payment": "Laboratory paid",
  "lab_partner.payment_voided": "Laboratory payment undone",

  // the shape of the product
  "modules.changed": "Modules switched on or off",
};

export default async function AuditPage() {
  const entries = await listAudit();
  return (
    <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
      {entries.length === 0 ? (
        <EmptyState message="Nothing here yet. Sensitive actions will be listed here." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Who</TH>
              <TH>Action</TH>
              <TH>Detail</TH>
            </TR>
          </THead>
          <tbody>
            {entries.map((e) => (
              <TR key={e.id}>
                <TD>
                  {formatBS(toBS(adFromIso(e.at.slice(0, 10))), {
                    form: "long",
                    monthScript: "en",
                  })}
                </TD>
                <TD className="font-medium text-sage-900">{e.userName}</TD>
                <TD>{ACTION_LABEL[e.action] ?? e.action}</TD>
                <TD className="font-mono text-[12px] text-sage-500">{e.detail}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </main>
  );
}
