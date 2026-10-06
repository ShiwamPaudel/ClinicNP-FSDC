import { requireBackOfficeUser, canBill } from "@/lib/session";
import { listDuePeople, listDueReceipts } from "@/lib/repos/dues";
import { adToIso } from "@/lib/bs";
import { personKey } from "@/lib/dues";
import { PageShell } from "@/components/app/page-shell";
import { DuesList } from "@/components/app/dues-list";
import { strings } from "@/lib/strings";

/**
 * Dues — who owes money for medicine or services, and what has come back.
 *
 * Not behind either module: a bill on dues can be for medicine, a service or
 * both, so it belongs with Bills rather than to the pharmacy or the clinic.
 */
export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const user = await requireBackOfficeUser();
  const { patient } = await searchParams;
  const [people, receipts] = await Promise.all([
    listDuePeople(adToIso(new Date())),
    listDueReceipts(),
  ]);

  // Arriving from a patient card opens that patient's bills. Only an id is in
  // the address, never a name (Rules §6).
  const openKey =
    typeof patient === "string" && patient.length > 0
      ? personKey({ id: "", patientId: patient, name: "" })
      : undefined;

  return (
    <PageShell title={strings.dues}>
      <DuesList
        people={people}
        receipts={receipts}
        canReceive={canBill(user.role)}
        isAdmin={user.role === "admin"}
        openKey={openKey}
      />
    </PageShell>
  );
}
