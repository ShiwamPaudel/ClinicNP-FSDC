import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil, Stethoscope, Receipt, GitMerge } from "lucide-react";
import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { getPatient } from "@/lib/repos/patients";
import { visitsForPatient } from "@/lib/repos/visits";
import { attachmentsForPatient } from "@/lib/repos/attachments";
import { listBillsForPatient } from "@/lib/repos/bills";
import { owedByPatient } from "@/lib/repos/dues";
import { formatPaisa } from "@/lib/money";
import { formatDocNo } from "@/lib/invoice-number";
import { adToIso, toBS, adFromIso, formatBS, today, bsToDbText } from "@/lib/bs";
import { PageShell } from "@/components/app/page-shell";
import { Button } from "@/components/ui/button";
import {
  PatientHeader,
  VisitTimeline,
} from "@/components/clinic/patient-card";
import { AttachmentGrid } from "@/components/clinic/attachment-grid";
import { StartVisitButton } from "@/components/clinic/start-visit-button";

export default async function PatientCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  await requireModulePage("clinic");

  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const [visits, attachments, bills, owed] = await Promise.all([
    visitsForPatient(patient.id),
    attachmentsForPatient(patient.id),
    listBillsForPatient(patient.id),
    owedByPatient(patient.id),
  ]);

  const todayAd = adToIso(new Date());
  const sinceBs = formatBS(toBS(adFromIso(patient.createdAt.slice(0, 10))));
  const isAdmin = user.role === "admin";

  return (
    <PageShell
      title={patient.name}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StartVisitButton
            patientId={patient.id}
            todayAd={todayAd}
            todayBs={bsToDbText(today())}
          />
          <Link href={`/billing?patient=${patient.id}`}>
            <Button variant="secondary">
              <Receipt className="h-4 w-4" />
              New bill
            </Button>
          </Link>
          <Link href={`/patients/${patient.id}/edit`}>
            <Button variant="secondary">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
          {isAdmin && (
            <Link href={`/patients/merge?keep=${patient.id}`}>
              <Button variant="secondary">
                <GitMerge className="h-4 w-4" />
                Merge
              </Button>
            </Link>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <PatientHeader patient={patient} todayAd={todayAd} sinceBs={sinceBs} />

        {owed.owedPaisa > 0 && (
          <Link
            href={`/dues?patient=${patient.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-warn-600/30 bg-warn-100 px-4 py-3 text-warn-600 hover:bg-warn-100/70"
          >
            <span className="text-[14px]">
              Owes{" "}
              <span className="font-semibold tnum">{formatPaisa(owed.owedPaisa)}</span>{" "}
              on {owed.billCount} {owed.billCount === 1 ? "bill" : "bills"}
            </span>
            <span className="text-[13px] font-medium">See dues →</span>
          </Link>
        )}

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-sage-900">
            <Stethoscope className="h-4 w-4 text-clinic-500" />
            History
          </h2>
          <VisitTimeline
            visits={visits}
            attachments={attachments}
            bills={bills.map((b) => ({
              id: b.id,
              invoiceLabel:
                b.invoiceNo != null
                  ? formatDocNo("SI", b.fiscalLabel, b.invoiceNo)
                  : "Pending",
              dateBs: b.dateBs,
              totalPaisa: b.totalPaisa,
              visitId: b.visitId,
            }))}
          />
        </section>

        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-sage-900">Files</h2>
          <AttachmentGrid
            patientId={patient.id}
            files={attachments.map((a) => ({
              id: a.id,
              title: a.title,
              fileName: a.fileName,
              mime: a.mime,
              sizeBytes: a.sizeBytes,
              kind: a.kind,
              createdAt: a.createdAt,
              uploaderName: a.uploaderName,
            }))}
            canDelete={isAdmin}
          />
        </section>
      </div>
    </PageShell>
  );
}
