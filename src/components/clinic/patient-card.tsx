import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatPatientNo } from "@/lib/patient-no";
import { displayAge } from "@/lib/age";
import type { Patient } from "@/lib/repos/patients";

const SEX_LABEL: Record<string, string> = {
  f: "Female",
  m: "Male",
  o: "Other",
};

/**
 * The navy identity header. Navy marks who this is about — the one place the
 * clinic colour carries a person rather than a thing (Design.md §1).
 */
export function PatientHeader({
  patient,
  todayAd,
  sinceBs,
}: {
  patient: Patient;
  todayAd: string;
  sinceBs: string | null;
}) {
  const age = displayAge(
    {
      value: patient.ageValue,
      unit: patient.ageUnit,
      asOfAd: patient.ageAsOfAd,
      dobAd: patient.dobAd,
    },
    todayAd,
  );

  return (
    <div className="overflow-hidden rounded-[10px] border border-line">
      <div className="bg-clinic-900 px-5 py-4 text-cream-50">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-[14px] text-clinic-150">
            {patient.patientNo != null
              ? formatPatientNo(patient.patientNo)
              : "Not numbered yet"}
          </span>
          <span className="text-[18px] font-semibold">{patient.name}</span>
          <span
            className="text-[14px] text-clinic-150"
            title={
              age.exact
                ? "Worked out from the date of birth"
                : age.asOfAd
                  ? `Age recorded on ${age.asOfAd}`
                  : undefined
            }
          >
            {age.short} · {SEX_LABEL[patient.sex] ?? "—"}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-clinic-150">
          <span className="font-mono">{patient.phone || "No phone"}</span>
          <span>{patient.address || "No address"}</span>
          {sinceBs && <span className="ml-auto">Since {sinceBs}</span>}
        </div>
        {!age.exact && age.asOfAd && (
          <p className="mt-1 text-[11px] text-clinic-150/80">
            Age as recorded on {age.asOfAd}
          </p>
        )}
      </div>

      {patient.note && (
        <div className="flex items-start gap-2 bg-danger-100 px-5 py-2.5 text-[14px] text-danger-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">Allergy / note:</span> {patient.note}
          </span>
        </div>
      )}

      {patient.mergedIntoId && (
        <div className="bg-info-100 px-5 py-2.5 text-[13px] text-info-600">
          This record was merged into{" "}
          <Link
            href={`/patients/${patient.mergedIntoId}`}
            className="font-semibold underline"
          >
            another patient
          </Link>
          . Its number is retired and is never given to anyone else.
        </div>
      )}
    </div>
  );
}
