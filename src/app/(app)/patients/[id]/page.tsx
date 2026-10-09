import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil, Stethoscope, Receipt, GitMerge } from "lucide-react";
import { requireUser, canBill } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { getPatient } from "@/lib/repos/patients";
import { attachmentsForPatient } from "@/lib/repos/attachments";
import { owedByPatient } from "@/lib/repos/dues";
import { patientLedger } from "@/lib/repos/patient-ledger";
import { formatPaisa } from "@/lib/money";
import { nepalDayIso } from "@/lib/clock";
import { adToIso, toBS, adFromIso, formatBS, bsToDbText } from "@/lib/bs";
import { getCompany } from "@/lib/repos/company";
import { listPosServices } from "@/lib/repos/services";
import { listDoctors } from "@/lib/repos/doctors";
import { listLabPartners } from "@/lib/repos/lab-partners";
import type { RowFormOptions } from "@/components/clinic/history-row-form";
import { PageShell } from "@/components/app/page-shell";
import { Button } from "@/components/ui/button";
import { PatientHeader } from "@/components/clinic/patient-card";
import { PatientHistory } from "@/components/clinic/patient-ledger-table";
import { AttachmentGrid } from "@/components/clinic/attachment-grid";

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

  const [ledger, attachments, owed] = await Promise.all([
    patientLedger(patient.id),
    attachmentsForPatient(patient.id),
    owedByPatient(patient.id),
  ]);

  const todayAd = adToIso(new Date());
  const sinceBs = formatBS(toBS(adFromIso(nepalDayIso(patient.createdAt))));
  const isAdmin = user.role === "admin";

  // Whoever works the counter adds rows to the history: the doctor's notes,
  // and the bill for what was done (C-036).
  let rowOptions: RowFormOptions | undefined;
  if (canBill(user.role)) {
    const [company, services, doctors, partners] = await Promise.all([
      getCompany(),
      listPosServices(),
      listDoctors(),
      listLabPartners(),
    ]);
    rowOptions = {
      services,
      doctors: doctors.map((d) => ({ id: d.id, name: d.name })),
      partners: partners.map((p) => ({ id: p.id, name: p.name })),
      billConfig: {
        vatRegistered: company.vatRegistered,
        vatInclusive: company.vatInclusive,
        roundingOn: company.roundingOn,
      },
      canEditRate: isAdmin || user.canEditRate,
      todayBs: bsToDbText(toBS(adFromIso(nepalDayIso(new Date().toISOString())))),
    };
  }

  return (
    <PageShell
      title={patient.name}
      actions={
        <div className="flex flex-wrap items-center gap-2">
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
          <PatientHistory rows={ledger} patientId={patient.id} rowOptions={rowOptions} />
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
