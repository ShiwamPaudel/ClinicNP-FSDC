import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import {
  partnerSummary,
  partnerStatement,
} from "@/lib/repos/clinic-reports";
import { resolveRange } from "@/lib/date-range";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { PartnerPaymentForm } from "@/components/clinic/partner-payment-form";
import { resolveFiscalYear } from "@/components/app/fiscal-year-bar";
import { cn } from "@/lib/cn";

export default async function LabPartnersReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    fy?: string;
    partner?: string;
  }>;
}) {
  await requireAdmin();
  await requireModulePage("clinic");

  const sp = await searchParams;
  const range = resolveRange(sp);
  const year = await resolveFiscalYear(sp.fy);
  const summary = await partnerSummary(range);
  const statement = sp.partner
    ? await partnerStatement(sp.partner, range)
    : null;

  const qs = (partner?: string) => {
    const p = new URLSearchParams();
    if (sp.preset) p.set("preset", sp.preset);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    if (sp.fy) p.set("fy", sp.fy);
    if (partner) p.set("partner", partner);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <ReportFrame
      fy={sp.fy}
      title="Laboratory statements"
      rangeLabel={range.label}
      preset={range.preset}
      exportReport="lab-partners"
    >
      {summary.length === 0 ? (
        <EmptyState message="No outside laboratories are set up yet." />
      ) : (
        <>
          <div className="rounded-[10px] border border-line bg-cream-50">
            <Table>
              <THead>
                <TR>
                  <TH>Laboratory</TH>
                  <TH className="text-right">Tests sent</TH>
                  <TH className="text-right">Billed to patients</TH>
                  <TH className="text-right">Left over</TH>
                  <TH className="text-right">Paid</TH>
                  <TH className="text-right">Owed now</TH>
                  <TH> </TH>
                </TR>
              </THead>
              <tbody>
                {summary.map((r) => (
                  <TR key={r.partnerId}>
                    <TD className="font-medium text-sage-900">{r.name}</TD>
                    <TD className="text-right tnum">{formatPaisa(r.testsPaisa)}</TD>
                    <TD className="text-right tnum">{formatPaisa(r.billedPaisa)}</TD>
                    <TD className="text-right tnum">{formatPaisa(r.marginPaisa)}</TD>
                    <TD className="text-right tnum">
                      {formatPaisa(r.paymentsPaisa)}
                    </TD>
                    <TD
                      className={cn(
                        "text-right tnum font-medium",
                        r.balancePaisa > 0 && "text-danger-600",
                      )}
                    >
                      {formatPaisa(r.balancePaisa)}
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/reports/lab-partners${qs(r.partnerId)}`}
                        className="text-[13px] text-clinic-700 hover:underline"
                      >
                        Statement
                      </Link>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
          <p className="mt-3 text-[12px] text-sage-500">
            &ldquo;Owed now&rdquo; is everything ever sent minus everything ever
            paid, so it does not change with the dates above. The other columns
            cover the chosen period only.
          </p>
        </>
      )}

      {statement && (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold text-sage-900">
              {statement.partnerName}
            </h2>
            {/* A closed year is read and print only. Recording a payment
                against it would change figures the owner has signed off. */}
            {year.isClosed ? (
              <span className="text-[13px] text-sage-500">
                {year.label} is closed — this statement can be read and printed,
                not added to.
              </span>
            ) : (
              <PartnerPaymentForm
                partnerId={statement.partnerId}
                partnerName={statement.partnerName}
                owedPaisa={statement.closingPaisa}
              />
            )}
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Tile label="Owed at the start" value={statement.openingPaisa} />
            <Tile label="Tests sent" value={statement.testsPaisa} />
            <Tile label="Paid" value={statement.paymentsPaisa} />
            <Tile
              label="Owed at the end"
              value={statement.closingPaisa}
              strong
            />
          </div>

          {statement.entries.length === 0 ? (
            <EmptyState message="Nothing happened with this laboratory in this period." />
          ) : (
            <div className="rounded-[10px] border border-line bg-cream-50">
              <Table>
                <THead>
                  <TR>
                    <TH>Date (BS)</TH>
                    <TH>What happened</TH>
                    <TH className="text-right">Owed</TH>
                    <TH className="text-right">Paid</TH>
                    <TH className="text-right">Balance</TH>
                  </TR>
                </THead>
                <tbody>
                  {statement.entries.map((e, i) => (
                    <TR key={i}>
                      <TD className="font-mono text-[13px]">{e.dateBs}</TD>
                      <TD>{e.description}</TD>
                      <TD className="text-right tnum">
                        {e.chargePaisa > 0 ? formatPaisa(e.chargePaisa) : "—"}
                      </TD>
                      <TD className="text-right tnum">
                        {e.paymentPaisa > 0 ? formatPaisa(e.paymentPaisa) : "—"}
                      </TD>
                      <TD className="text-right tnum font-medium">
                        {formatPaisa(e.runningPaisa)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </section>
      )}
    </ReportFrame>
  );
}

function Tile({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-line bg-cream-50 p-4">
      <div className="text-[12px] text-sage-500">{label}</div>
      <div
        className={cn(
          "mt-1 tnum text-[20px]",
          strong ? "font-semibold text-sage-900" : "text-sage-700",
        )}
      >
        {formatPaisa(value)}
      </div>
    </div>
  );
}
