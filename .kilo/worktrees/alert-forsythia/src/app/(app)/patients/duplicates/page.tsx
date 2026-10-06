import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { possibleDuplicatePairs } from "@/lib/repos/patients";
import { formatPatientNo, provisionalPatientLabel } from "@/lib/patient-no";
import { PageShell } from "@/components/app/page-shell";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Possible duplicate patients" };

/**
 * Records that look like the same person.
 *
 * Two devices registering the same patient while both were offline is the case
 * this is for. Nothing is joined automatically: a household often shares one
 * phone, and two people really can have the same name. This lists what looks
 * alike and leaves the decision to a person.
 */
export default async function DuplicatesPage() {
  await requireAdmin();
  await requireModulePage("clinic");

  const pairs = await possibleDuplicatePairs();

  return (
    <PageShell title="Possible duplicate patients">
      <div className="flex flex-col gap-4">
        <p className="max-w-[720px] text-[14px] text-sage-500">
          These records share a name or a phone number. That does not make them
          the same person — households share phones, and names repeat — so
          nothing has been joined. Open a pair to compare them, and join them
          only if they really are one person.
        </p>

        {pairs.length === 0 ? (
          <EmptyState message="Nothing looks like a duplicate." />
        ) : (
          <div className="rounded-[10px] border border-line bg-cream-50">
            <Table>
              <THead>
                <TR>
                  <TH>One record</TH>
                  <TH>The other</TH>
                  <TH>What matches</TH>
                  <TH> </TH>
                </TR>
              </THead>
              <tbody>
                {pairs.map((d) => (
                  <TR key={`${d.aId}-${d.bId}`}>
                    <TD>
                      <Side
                        id={d.aId}
                        no={d.aNo}
                        name={d.aName}
                        phone={d.aPhone}
                        visits={d.aVisits}
                      />
                    </TD>
                    <TD>
                      <Side
                        id={d.bId}
                        no={d.bNo}
                        name={d.bName}
                        phone={d.bPhone}
                        visits={d.bVisits}
                      />
                    </TD>
                    <TD>
                      <Badge
                        tone={d.reason.includes("and") ? "warn" : "neutral"}
                      >
                        {d.reason}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/patients/merge?keep=${d.aId}&merge=${d.bId}`}
                        className="text-[13px] text-clinic-700 hover:underline"
                      >
                        Compare and join
                      </Link>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function Side({
  id,
  no,
  name,
  phone,
  visits,
}: {
  id: string;
  no: number | null;
  name: string;
  phone: string;
  visits: number;
}) {
  return (
    <Link href={`/patients/${id}`} className="flex flex-col hover:underline">
      <span className="font-medium text-sage-900">{name}</span>
      <span className="font-mono text-[12px] text-clinic-700">
        {no != null ? formatPatientNo(no) : provisionalPatientLabel(id)}
      </span>
      <span className="text-[12px] text-sage-500">
        {phone || "No phone"} · {visits} visit{visits === 1 ? "" : "s"}
      </span>
    </Link>
  );
}
