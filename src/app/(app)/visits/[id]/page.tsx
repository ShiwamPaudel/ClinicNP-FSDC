import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { getVisitWithPatient } from "@/lib/repos/visits";
import { getCompany } from "@/lib/repos/company";
import { displayAge } from "@/lib/age";
import { patientLabel } from "@/lib/patient-no";
import { adToIso, bsFromDbText, formatBS } from "@/lib/bs";
import { PageShell } from "@/components/app/page-shell";
import { PrintButton } from "@/components/app/print-button";
import { VisitDetail } from "@/components/clinic/visit-detail";
import { OpdSlip } from "@/components/print/opd-slip";

const SEX_SHORT: Record<string, string> = { f: "F", m: "M", o: "—" };

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  await requireModulePage("clinic");

  const { id } = await params;
  const visit = await getVisitWithPatient(id);
  if (!visit) notFound();

  const company = await getCompany();

  const todayAd = adToIso(new Date());
  const age = displayAge(
    {
      value: visit.patientAgeValue,
      unit: (visit.patientAgeUnit as "y" | "m" | "d" | null) ?? null,
      asOfAd: visit.patientAgeAsOfAd,
      dobAd: visit.patientDobAd,
    },
    todayAd,
  );

  const label = patientLabel(visit.patientNo, visit.patientId);
  const visitLabel =
    visit.visitNo != null
      ? `V-${visit.fiscalLabel}-${String(visit.visitNo).padStart(6, "0")}`
      : "";

  const isAdmin = user.role === "admin";

  return (
    <PageShell
      title={visitLabel || "Visit"}
      actions={
        <div className="flex items-center gap-2">
          <Link
            href={`/patients/${visit.patientId}`}
            className="flex items-center gap-1.5 text-[13px] text-sage-500 hover:text-sage-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Patient card
          </Link>
          <PrintButton label="Print OPD slip" />
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="rounded-[10px] bg-clinic-900 px-5 py-3 text-cream-50">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-mono text-[13px] text-clinic-150">{label}</span>
            <Link
              href={`/patients/${visit.patientId}`}
              className="text-[17px] font-semibold hover:underline"
            >
              {visit.patientName}
            </Link>
            <span className="text-[14px] text-clinic-150">
              {age.short} · {SEX_SHORT[visit.patientSex] ?? "—"}
            </span>
            <span className="ml-auto font-mono text-[13px] text-clinic-150">
              {visit.dateBs}
            </span>
          </div>
        </div>

        <VisitDetail
          isAdmin={isAdmin}
          initial={{
            id: visit.id,
            patientId: visit.patientId,
            type: visit.type,
            status: visit.status,
            department: visit.department,
            complaint: visit.complaint,
            findings: visit.findings,
            advice: visit.advice,
            bp: visit.bp,
            pulse: visit.pulse != null ? String(visit.pulse) : "",
            tempC: visit.tempC != null ? String(visit.tempC) : "",
            weightKg: visit.weightKg != null ? String(visit.weightKg) : "",
            spo2: visit.spo2 != null ? String(visit.spo2) : "",
          }}
        />

      </div>

      <div className="print-area">
        <OpdSlip
          data={{
            company: {
              name: company.name,
              address: company.address,
              phone: company.phone,
              panNo: company.panNo,
              ddaNo: company.ddaNo,
              invoiceFooter: company.invoiceFooter,
              vatRegistered: company.vatRegistered,
              logoUrl: company.logoUrl,
            },
            patientLabel: label,
            patientName: visit.patientName,
            ageSex: `${age.short} / ${SEX_SHORT[visit.patientSex] ?? "—"}`,
            visitLabel,
            dateBsLong: formatBS(bsFromDbText(visit.dateBs), {
              form: "long",
              monthScript: "en",
            }),
            doctorName: "",
            department: visit.department,
            complaint: visit.complaint,
          }}
        />
      </div>
    </PageShell>
  );
}
