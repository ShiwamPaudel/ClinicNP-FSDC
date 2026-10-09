import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { doctorPayouts } from "@/lib/repos/clinic-reports";
import {
  doctorBalances,
  doctorPaidBetween,
  doctorPayStatement,
} from "@/lib/repos/doctor-pay";
import { resolveRange } from "@/lib/date-range";
import { formatPaisa } from "@/lib/money";
import { payableMethodLabel } from "@/lib/payables";
import { ReportFrame } from "@/components/app/report-frame";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PayPartyButton } from "@/components/app/payables-view";
import { StatementDownload } from "@/components/app/statement-download";
import { cn } from "@/lib/cn";

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "neutral" }> = {
  paid: { label: "Paid", tone: "ok" },
  part: { label: "Part paid", tone: "warn" },
  unpaid: { label: "Unpaid", tone: "neutral" },
};

/**
 * Doctor payouts — what each doctor earned in the dates chosen, what they
 * were paid in them, and what is owed now; and, for one doctor, every share
 * with whether it has been paid and every payout with the bills it covered
 * (C-037). A payout clears the oldest unpaid shares first.
 */
export default async function DoctorPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    fy?: string;
    doctor?: string;
  }>;
}) {
  await requireAdmin();
  await requireModulePage("clinic");

  const sp = await searchParams;
  const range = resolveRange(sp);
  const [rows, paid, balances, statement] = await Promise.all([
    doctorPayouts(range),
    doctorPaidBetween(range.fromIso, range.toIso),
    doctorBalances(),
    sp.doctor ? doctorPayStatement(sp.doctor) : Promise.resolve(null),
  ]);
  const owedNow = new Map(balances.map((b) => [b.id, b.owedPaisa]));
  const total = rows.reduce((s, r) => s + r.sharePaisa, 0);
  const totalPaid = rows.reduce((s, r) => s + (paid.get(r.doctorId) ?? 0), 0);

  const qs = (doctor?: string) => {
    const p = new URLSearchParams();
    if (sp.preset) p.set("preset", sp.preset);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    if (sp.fy) p.set("fy", sp.fy);
    if (doctor) p.set("doctor", doctor);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <ReportFrame
      fy={sp.fy}
      title="Doctor payouts"
      rangeLabel={range.label}
      preset={range.preset}
      exportReport="doctor-payouts"
    >
      {rows.length === 0 ? (
        <EmptyState message="No doctor was named on a bill in this period." />
      ) : (
        <div className="rounded-[10px] border border-line bg-cream-50">
          <Table>
            <THead>
              <TR>
                <TH>Doctor</TH>
                <TH>Worked out as</TH>
                <TH className="text-right">Consultations</TH>
                <TH className="text-right">Other services</TH>
                <TH className="text-right">Billed</TH>
                <TH className="text-right">Earned</TH>
                <TH className="text-right">Paid</TH>
                <TH className="text-right">Owed now</TH>
                <TH> </TH>
              </TR>
            </THead>
            <tbody>
              {rows.map((r) => {
                const owed = owedNow.get(r.doctorId) ?? 0;
                return (
                  <TR key={r.doctorId}>
                    <TD className="font-medium text-sage-900">{r.name}</TD>
                    <TD className="text-sage-500">{r.basisSummary || "—"}</TD>
                    <TD className="text-right tnum">{r.consultations}</TD>
                    <TD className="text-right tnum">{r.otherServices}</TD>
                    <TD className="text-right tnum">{formatPaisa(r.billedPaisa)}</TD>
                    <TD className="text-right tnum font-medium">{formatPaisa(r.sharePaisa)}</TD>
                    <TD className="text-right tnum">{formatPaisa(paid.get(r.doctorId) ?? 0)}</TD>
                    <TD
                      className={cn(
                        "text-right tnum font-medium",
                        owed > 0 ? "text-danger-600" : "text-sage-500",
                      )}
                    >
                      {owed < 0 ? `${formatPaisa(-owed)} ahead` : formatPaisa(owed)}
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/reports/doctors${qs(r.doctorId)}`}
                        className="text-[13px] text-clinic-700 hover:underline"
                      >
                        Statement
                      </Link>
                    </TD>
                  </TR>
                );
              })}
              <TR>
                <TD className="font-semibold text-sage-900">Total</TD>
                <TD />
                <TD />
                <TD />
                <TD />
                <TD className="text-right tnum font-semibold">{formatPaisa(total)}</TD>
                <TD className="text-right tnum font-semibold">{formatPaisa(totalPaid)}</TD>
                <TD />
                <TD />
              </TR>
            </tbody>
          </Table>
        </div>
      )}
      <p className="mt-3 text-[12px] text-sage-500">
        Earned and Paid cover the dates above; Owed now is everything to date.
        Each share is fixed when the bill is made. Changing a doctor&apos;s
        terms later doesn&apos;t change past bills.
      </p>

      {statement && (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[17px] font-semibold text-sage-900">{statement.name}</h2>
              <StatementDownload size="sm" href={`/api/statement/doctor?id=${statement.doctorId}`} />
            </div>
            <PayPartyButton
              party={{
                kind: "doctor",
                id: statement.doctorId,
                name: statement.name,
                active: true,
                owedPaisa: statement.owedPaisa,
              }}
            />
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Tile label="Earned to date" value={statement.earnedPaisa} />
            <Tile label="Paid to date" value={statement.paidPaisa} />
            <Tile
              label={statement.owedPaisa < 0 ? "Paid ahead" : "Owed now"}
              value={Math.abs(statement.owedPaisa)}
              strong
            />
          </div>

          <h3 className="mb-2 text-[14px] font-semibold text-sage-900">Shares earned</h3>
          {statement.shares.length === 0 ? (
            <EmptyState message="No share earned yet." />
          ) : (
            <div className="mb-6 rounded-[10px] border border-line bg-cream-50">
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Bill</TH>
                    <TH>Patient</TH>
                    <TH>Service</TH>
                    <TH className="text-right">Billed</TH>
                    <TH className="text-right">Share</TH>
                    <TH className="text-right">Paid</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <tbody>
                  {statement.shares.map((l) => (
                    <TR key={l.lineId}>
                      <TD className="whitespace-nowrap tnum">{l.dateBs}</TD>
                      <TD>
                        <Link href={`/bills/${l.billId}`} className="font-mono text-[13px] text-clinic-700 hover:underline">
                          {l.billLabel}
                        </Link>
                      </TD>
                      <TD>{l.patientName || "—"}</TD>
                      <TD>
                        {l.service}
                        {l.qty > 1 ? ` × ${l.qty}` : ""}
                      </TD>
                      <TD className="text-right tnum">{formatPaisa(l.billedPaisa, false)}</TD>
                      <TD className="text-right tnum font-medium">{formatPaisa(l.earnedPaisa, false)}</TD>
                      <TD className="text-right tnum">{formatPaisa(l.paidPaisa, false)}</TD>
                      <TD>
                        <Badge tone={STATUS[l.status]!.tone}>{STATUS[l.status]!.label}</Badge>
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          )}

          <h3 className="mb-2 text-[14px] font-semibold text-sage-900">Payouts</h3>
          {statement.payouts.length === 0 ? (
            <EmptyState message="Nothing paid to this doctor yet." />
          ) : (
            <div className="rounded-[10px] border border-line bg-cream-50">
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH className="text-right">Amount</TH>
                    <TH>How</TH>
                    <TH>Covered</TH>
                    <TH>By</TH>
                  </TR>
                </THead>
                <tbody>
                  {statement.payouts.map((p) => (
                    <TR key={p.id} className={p.voided ? "text-sage-500" : undefined}>
                      <TD className="whitespace-nowrap tnum">{p.dateBs}</TD>
                      <TD className={cn("text-right tnum", p.voided ? "line-through" : "font-semibold")}>
                        {formatPaisa(p.amountPaisa, false)}
                      </TD>
                      <TD>{payableMethodLabel(p.method)}</TD>
                      <TD className="text-[13px]">
                        {p.voided ? (
                          <>Undone{p.voidReason ? ` — ${p.voidReason}` : ""}</>
                        ) : (
                          <>
                            {p.covers.map((c) => `${c.billLabel} (${formatPaisa(c.amountPaisa, false)})`).join(", ") || "—"}
                            {p.aheadPaisa > 0 && (
                              <span className="block text-warn-600">
                                {formatPaisa(p.aheadPaisa)} paid ahead
                              </span>
                            )}
                            {p.note && <span className="block text-sage-500">{p.note}</span>}
                          </>
                        )}
                      </TD>
                      <TD>{p.userName || "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-[12px] text-sage-500">
            A payout clears the oldest unpaid shares first. Undo a payout typed
            wrong from Payables.
          </p>
        </section>
      )}
    </ReportFrame>
  );
}

function Tile({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-[10px] border border-line bg-cream-50 p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">{label}</div>
      <div className={cn("mt-1 tnum text-sage-900", strong ? "text-[22px] font-bold" : "text-[18px] font-semibold")}>
        {formatPaisa(value)}
      </div>
    </div>
  );
}
