import Link from "next/link";
import { Smartphone, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DoctorCardDoctor {
  id: string;
  name: string;
  qualification: string;
  specialty: string;
  hasLogin: boolean;
}

/** One doctor on the board: who they are, and how full the chosen day is. */
export function DoctorCard({
  doctor,
  dateBs,
  booked,
  total,
}: {
  doctor: DoctorCardDoctor;
  dateBs: string;
  booked: number;
  total: number;
}) {
  const cancelledOrDone = total - booked;

  return (
    <Link
      href={`/doctors/${doctor.id}?on=${dateBs}`}
      className={cn(
        "flex h-full items-center gap-4 rounded-[10px] border border-line bg-cream-50 p-4",
        "transition-colors hover:bg-clinic-75",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[16px] font-semibold text-sage-900">
            {doctor.name}
          </span>
          {doctor.hasLogin && (
            <Smartphone
              className="h-3.5 w-3.5 shrink-0 text-clinic-500"
              aria-label="Sees their own list on their phone"
            />
          )}
        </div>
        <div className="truncate text-[13px] text-sage-500">
          {[doctor.specialty, doctor.qualification].filter(Boolean).join(" · ") ||
            "—"}
        </div>
        <div className="pt-2 text-[13px] text-sage-600">
          {booked === 0 ? (
            <span className="text-sage-300">Nobody booked</span>
          ) : (
            <span className="font-medium text-clinic-700">
              {booked} {booked === 1 ? "person" : "people"} booked
            </span>
          )}
          {cancelledOrDone > 0 && (
            <span className="text-sage-500"> · {cancelledOrDone} closed off</span>
          )}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-sage-300" />
    </Link>
  );
}
