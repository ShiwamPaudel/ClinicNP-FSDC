import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getCompany } from "@/lib/repos/company";
import {
  getActiveFiscalYear,
  bootstrapCurrentFiscalYear,
} from "@/lib/repos/fiscal";
import { dashboardMetrics, trendByKind } from "@/lib/repos/reports";
import { clinicToday, topServices } from "@/lib/repos/clinic-reports";
import { stockCounts } from "@/lib/repos/batches";
import { duesTotals } from "@/lib/repos/dues";
import { getModules } from "@/lib/modules";
import {
  today,
  toAD,
  adToIso,
  adFromIso,
  bsMonthRange,
  fiscalYearOf,
  fiscalYearAdRange,
  toBS,
} from "@/lib/bs";
import { formatPaisa } from "@/lib/money";
import { PageShell } from "@/components/app/page-shell";
import { SalesTrend } from "@/components/charts/sales-trend";
import { Badge } from "@/components/ui/badge";

function daysAheadIso(days: number): string {
  return adToIso(new Date(Date.now() + days * 86400000));
}

export default async function DashboardPage() {
  const user = await requireUser();
  // Independent reads run in one round-trip's worth of wall-clock time.
  const [company, activeFy, modules] = await Promise.all([
    getCompany(),
    getActiveFiscalYear(),
    getModules(),
  ]);
  const fy = activeFy ?? (await bootstrapCurrentFiscalYear());

  const t = today();
  const todayIso = adToIso(toAD(t));
  const month = bsMonthRange(t.year, t.month);
  const fyRange = fiscalYearAdRange(fiscalYearOf(t));

  const monthRange = {
    fromIso: adToIso(month.startAd),
    toIso: todayIso,
  };

  // Only ask for what this install actually shows. A pharmacy-only shop never
  // queries the clinic tables at all.
  const [metrics, counts, clinic, services, splitTrend, dues] = await Promise.all([
    dashboardMetrics({
      todayIso,
      monthFromIso: monthRange.fromIso,
      monthToIso: todayIso,
      fyFromIso: adToIso(fyRange.startAd),
      fyToIso: adToIso(fyRange.endAd),
      trendFromIso: daysAheadIso(-29),
    }),
    modules.pharmacy
      ? stockCounts(todayIso, daysAheadIso(company.expiryAlertDays))
      : Promise.resolve({ low: 0, nearExpiry: 0, expired: 0 }),
    modules.clinic ? clinicToday(todayIso) : Promise.resolve(null),
    modules.clinic ? topServices(monthRange) : Promise.resolve([]),
    trendByKind(daysAheadIso(-29), todayIso),
    duesTotals(),
  ]);

  const bothModules = modules.pharmacy && modules.clinic;

  // Both series come out of one query, each net of refunds, so the chart adds
  // up to the tiles above it.
  const trendData = splitTrend.map((p) => {
    const bs = toBS(adFromIso(p.dateAd));
    return {
      label: `${bs.month}/${bs.day}`,
      value: bothModules
        ? p.medicinePaisa
        : p.medicinePaisa + p.servicePaisa,
      services: p.servicePaisa,
    };
  });

  return (
    <PageShell title="Dashboard">
      <div className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Today's sales" value={formatPaisa(metrics.todaySalesPaisa)} big />
          <Stat label="This month" value={formatPaisa(metrics.monthSalesPaisa)} />
          <Stat label={`Fiscal year ${fy.bsLabel}`} value={formatPaisa(metrics.fySalesPaisa)} />
          <Stat label="Bills today" value={String(metrics.billCountToday)} />
        </div>

        {dues.owedPaisa > 0 && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Link
              href="/dues"
              className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-cream-50 p-4 hover:bg-cream-200"
            >
              <span className="text-[14px] font-medium text-sage-900">
                Owed to you
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[12px] text-sage-500">
                  {dues.people} {dues.people === 1 ? "person" : "people"}
                </span>
                <Badge tone="warn">{formatPaisa(dues.owedPaisa)}</Badge>
              </span>
            </Link>
          </div>
        )}

        {clinic && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {modules.pharmacy && (
                <Stat
                  label="From the shelf"
                  value={formatPaisa(clinic.medicinesPaisa)}
                />
              )}
              <Stat
                label="Consultations"
                value={formatPaisa(clinic.consultationPaisa)}
              />
              <Stat
                label="Diagnostics"
                value={formatPaisa(clinic.diagnosticsPaisa)}
              />
              <Stat
                label="Laboratory"
                value={formatPaisa(clinic.laboratoryPaisa)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Patients seen today" value={String(clinic.patientsSeen)} />
              <Stat
                label="Registered today"
                value={String(clinic.newRegistrations)}
              />
              <AlertCard
                href="/lab"
                label="Samples to collect"
                count={clinic.samplesToCollect}
                tone="warn"
              />
            </div>
          </>
        )}

        {modules.pharmacy && (
          <div className="grid gap-3 sm:grid-cols-3">
            <AlertCard href="/stock/low" label="Low stock" count={counts.low} tone="warn" />
            <AlertCard href="/stock/near-expiry" label="Near expiry" count={counts.nearExpiry} tone="warn2" />
            <AlertCard href="/stock/expired" label="Expired" count={counts.expired} tone="danger" />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-[10px] border border-line bg-cream-50 p-5">
            <h2 className="mb-3 flex flex-wrap items-baseline gap-3 text-[15px] font-semibold text-sage-900">
              <span>Sales — last 30 days</span>
              {bothModules && (
                <span className="flex items-center gap-3 text-[12px] font-normal text-sage-500">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-[2px] bg-sage-700"
                    />
                    Medicines
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-[2px] bg-clinic-700"
                    />
                    Services
                  </span>
                </span>
              )}
            </h2>
            {trendData.length === 0 ? (
              <p className="py-12 text-center text-[14px] text-sage-400">
                Sales will appear here once you start billing.
              </p>
            ) : (
              <SalesTrend data={trendData} showServices={bothModules} />
            )}
          </div>

          <div className="flex flex-col gap-6">
            {modules.pharmacy && (
              <div className="rounded-[10px] border border-line bg-cream-50 p-5">
                <h2 className="mb-3 text-[15px] font-semibold text-sage-900">
                  Top items this month
                </h2>
                {metrics.topItems.length === 0 ? (
                  <p className="py-8 text-center text-[14px] text-sage-400">
                    Nothing sold yet this month.
                  </p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {metrics.topItems.map((it, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between text-[14px]"
                      >
                        <span className="text-sage-900">
                          <span className="mr-2 text-sage-400">{i + 1}.</span>
                          {it.brandName}
                        </span>
                        <span className="tnum text-sage-600">
                          {it.qty} · {formatPaisa(it.revenuePaisa)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            {modules.clinic && (
              <div className="rounded-[10px] border border-line bg-cream-50 p-5">
                <h2 className="mb-3 text-[15px] font-semibold text-sage-900">
                  Top services this month
                </h2>
                {services.length === 0 ? (
                  <p className="py-8 text-center text-[14px] text-sage-400">
                    Nothing billed yet this month.
                  </p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {services.map((sv, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between text-[14px]"
                      >
                        <span className="text-sage-900">
                          <span className="mr-2 text-sage-400">{i + 1}.</span>
                          {sv.name}
                        </span>
                        <span className="tnum text-sage-600">
                          {sv.count} · {formatPaisa(sv.netPaisa)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-[13px] text-sage-400">
          Signed in as {user.name}. Company: {company.name || "not set"}.
        </p>
      </div>
    </PageShell>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-[10px] border border-line bg-cream-50 p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
        {label}
      </div>
      <div className={`mt-1 font-bold text-sage-900 tnum ${big ? "text-[28px]" : "text-[22px]"}`}>
        {value}
      </div>
    </div>
  );
}

function AlertCard({
  href,
  label,
  count,
  tone,
}: {
  href: string;
  label: string;
  count: number;
  tone: "warn" | "warn2" | "danger";
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-[10px] border border-line bg-cream-50 p-4 hover:bg-cream-200"
    >
      <span className="text-[14px] font-medium text-sage-900">{label}</span>
      <Badge tone={count > 0 ? tone : "neutral"}>{count}</Badge>
    </Link>
  );
}
