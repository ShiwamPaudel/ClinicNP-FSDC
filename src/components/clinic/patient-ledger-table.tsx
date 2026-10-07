import Link from "next/link";
import { formatPaisa } from "@/lib/money";
import { nepalTime } from "@/lib/clock";
import type { LedgerRow } from "@/lib/patient-ledger";
import { cn } from "@/lib/cn";

/**
 * A patient's history laid out like the clinic's paper card: date, what was
 * done, what it cost, what was paid, and what is owed after it. Oldest first,
 * the way a card is filled in.
 */
export function PatientLedgerTable({ rows }: { rows: LedgerRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-[10px] border border-dashed border-line bg-cream-50 px-5 py-10 text-center text-[14px] text-sage-500">
        Nothing yet. Start a visit or make a bill to begin this history.
      </p>
    );
  }

  const charged = rows.reduce((s, r) => s + (r.feePaisa ?? 0), 0);
  const paid = rows.reduce((s, r) => s + (r.paymentPaisa ?? 0), 0);
  const owed = rows[rows.length - 1]!.balancePaisa;

  return (
    // Scrolls inside itself on a phone, so the page never does.
    <div className="overflow-x-auto rounded-[10px] border-2 border-clinic-700/70 bg-cream-50">
      <table className="w-full min-w-[640px] border-collapse text-[13.5px]">
        <thead>
          <tr className="bg-clinic-75 text-[13px] font-semibold text-clinic-900">
            <th className="w-[112px] border-b-2 border-r border-clinic-700/40 px-3 py-2 text-center">
              Date
            </th>
            <th className="border-b-2 border-r border-clinic-700/40 px-3 py-2 text-center">
              Treatment notes
            </th>
            <th className="w-[124px] border-b-2 border-r border-clinic-700/40 px-3 py-2 text-center">
              Service charge
            </th>
            <th className="w-[112px] border-b-2 border-r border-clinic-700/40 px-3 py-2 text-center">
              Payment
            </th>
            <th className="w-[124px] border-b-2 border-clinic-700/40 px-3 py-2 text-center">
              Due / Advance
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-clinic-700/25 align-top last:border-b-0">
              <td className="border-r border-clinic-700/25 px-3 py-2.5 tnum">
                <div className="text-sage-900">{r.dateBs}</div>
                {r.at && (
                  <div className="text-[12px] text-sage-500">{nepalTime(r.at)}</div>
                )}
              </td>
              <td className="border-r border-clinic-700/25 px-3 py-2.5">
                <div
                  className={cn(
                    "font-medium",
                    r.kind === "payment" ? "text-ok-600" : "text-sage-900",
                  )}
                >
                  {r.title}
                </div>
                {r.notes.map((n, i) => (
                  <div key={i} className="text-[12.5px] leading-snug text-sage-600">
                    {n}
                  </div>
                ))}
                <div className="mt-1 flex gap-3 text-[12px]">
                  {r.kind === "bill" && r.billId && (
                    <Link href={`/bills/${r.billId}`} className="text-clinic-700 hover:underline">
                      Bill
                    </Link>
                  )}
                  {r.visitId && (
                    <Link href={`/visits/${r.visitId}`} className="text-clinic-700 hover:underline">
                      Visit
                    </Link>
                  )}
                </div>
              </td>
              <td className="border-r border-clinic-700/25 px-3 py-2.5 text-right tnum">
                {r.feePaisa != null ? formatPaisa(r.feePaisa, false) : ""}
              </td>
              <td className="border-r border-clinic-700/25 px-3 py-2.5 text-right tnum">
                {r.paymentPaisa != null && r.paymentPaisa !== 0
                  ? formatPaisa(r.paymentPaisa, false)
                  : r.kind === "bill"
                    ? "—"
                    : ""}
              </td>
              <td className="px-3 py-2.5 text-right tnum">
                <Balance paisa={r.balancePaisa} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-clinic-700/40 bg-clinic-75/60 font-semibold text-clinic-900">
            <td className="px-3 py-2" />
            <td className="px-3 py-2 text-right">Total</td>
            <td className="px-3 py-2 text-right tnum">{formatPaisa(charged, false)}</td>
            <td className="px-3 py-2 text-right tnum">{formatPaisa(paid, false)}</td>
            <td className="px-3 py-2 text-right tnum">
              <Balance paisa={owed} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Balance({ paisa }: { paisa: number }) {
  if (paisa === 0) return <span className="text-sage-500">—</span>;
  if (paisa > 0) {
    return (
      <span className="font-semibold text-warn-600">
        {formatPaisa(paisa, false)} due
      </span>
    );
  }
  return (
    <span className="font-semibold text-ok-600">
      {formatPaisa(-paisa, false)} advance
    </span>
  );
}
