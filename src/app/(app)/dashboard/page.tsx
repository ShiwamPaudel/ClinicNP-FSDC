import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getCompany } from "@/lib/repos/company";
import {
  getActiveFiscalYear,
  bootstrapCurrentFiscalYear,
} from "@/lib/repos/fiscal";
import { dashboardMetrics, daySummary } from "@/lib/repos/reports";
import { takingsBetween, byGroup, topServicesOf, trendOf } from "@/lib/repos/takings";
import { doctorPayouts, patientsOn } from "@/lib/repos/clinic-reports";
import { appointmentsOn } from "@/lib/repos/appointments";
import { labCounts, labOverdueCount, STAGE_LABEL, type LabStage } from "@/lib/repos/lab";
import { financialSummary } from "@/lib/repos/financials";
import { doctorPayables, labPayables, supplierPayables } from "@/lib/repos/payables";
import { stockCounts } from "@/lib/repos/batches";
import { duesTotals } from "@/lib/repos/dues";
import { getModules } from "@/lib/modules";
import { nepalDayIso } from "@/lib/clock";
import { formatTime, isOpen } from "@/lib/appointment-types";
import {
  adToIso,
  adFromIso,
  bsMonthRange,
  fiscalYearOf,
  fiscalYearAdRange,
  formatBS,
  toBS,
  BS_MONTHS_EN,
} from "@/lib/bs";
import { formatPaisa } from "@/lib/money";
import { PageShell } from "@/components/app/page-shell";
import { SalesTrend } from "@/components/charts/sales-trend";
import { Badge } from "@/components/ui/badge";

/** Work sent to a laboratory this long ago without coming back is chased. */
const LAB_CHASE_DAYS = 7;

/** The lab worklist tab for each stage still in progress. */
const LAB_TABS: { stage: LabStage; href: string }[] = [
  { stage: "to_collect", href: "/lab" },
  { stage: "to_dispatch", href: "/lab/dispatch" },
  { stage: "awaiting_report", href: "/lab/awaiting" },
  { stage: "report_in", href: "/lab/reports" },
];

function shiftIso(iso: string, days: number): string {
  const d = adFromIso(iso);
  d.setDate(d.getDate() + days);
  return adToIso(d);
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

  // Nepal's today, wherever the server runs: before 5:45 in the morning the
  // server's own date is still yesterday.
  const todayIso = nepalDayIso(new Date().toISOString());
  const t = toBS(adFromIso(todayIso));
  const month = bsMonthRange(t.year, t.month);
  const monthFromIso = adToIso(month.startAd);
  const fyRange = fiscalYearAdRange(fiscalYearOf(t));

  // The same days of last month: its 1st to today's day number, or its end.
  const last = t.month === 1 ? { year: t.year - 1, month: 12 } : { year: t.year, month: t.month - 1 };
  const lastRange = bsMonthRange(last.year, last.month);
  const lastFromIso = adToIso(lastRange.startAd);
  const lastEndIso = adToIso(lastRange.endAd);
  const lastToCandidate = shiftIso(lastFromIso, t.day - 1);
  const lastToIso = lastToCandidate < lastEndIso ? lastToCandidate : lastEndIso;

  const trendFromIso = shiftIso(todayIso, -29);
  // One read of the takings covers both the 30 days and the BS month (which
  // can be 32 days long).
  const takingsFromIso = trendFromIso < monthFromIso ? trendFromIso : monthFromIso;
  const isOwner = user.role === "admin";
  const monthRange = { fromIso: monthFromIso, toIso: todayIso };

  // Only ask for what this install actually shows. A pharmacy-only shop never
  // queries the clinic tables at all, and only the owner's view reads the books.
  const [metrics, counts, takings, dues, day, clinic, owner] = await Promise.all([
    dashboardMetrics({
      todayIso,
      monthFromIso,
      monthToIso: todayIso,
      fyFromIso: adToIso(fyRange.startAd),
      fyToIso: adToIso(fyRange.endAd),
      lastMonthFromIso: lastFromIso,
      lastMonthToIso: lastToIso,
    }),
    modules.pharmacy
      ? stockCounts(todayIso, shiftIso(todayIso, company.expiryAlertDays))
      : Promise.resolve({ low: 0, nearExpiry: 0, expired: 0 }),
    takingsBetween(takingsFromIso, todayIso),
    duesTotals(),
    daySummary(todayIso),
    modules.clinic
      ? Promise.all([
          patientsOn(todayIso),
          appointmentsOn(todayIso),
          labCounts(),
          labOverdueCount(new Date(Date.now() - LAB_CHASE_DAYS * 86_400_000).toISOString()),
        ]).then(([patients, appointments, lab, labOverdue]) => ({
          patients,
          appointments,
          lab,
          labOverdue,
        }))
      : Promise.resolve(null),
    isOwner
      ? Promise.all([
          financialSummary({ ...monthRange, label: "" }),
          modules.clinic ? doctorPayouts(monthRange) : Promise.resolve([]),
          supplierPayables(),
          modules.clinic ? labPayables() : Promise.resolve([]),
          modules.clinic ? doctorPayables() : Promise.resolve([]),
        ]).then(([books, doctors, suppliers, labs, docs]) => {
          const owed = (rows: { owedPaisa: number }[]) =>
            rows.reduce((s, r) => s + Math.max(0, r.owedPaisa), 0);
          return {
            books,
            doctors,
            owe: { suppliers: owed(suppliers), labs: owed(labs), doctors: owed(docs) },
          };
        })
      : Promise.resolve(null),
  ]);

  const bothModules = modules.pharmacy && modules.clinic;

  // Every day of the 30 is on the chart, the quiet ones at zero, so a gap in
  // trade reads as a gap and not as a straight line between two busy days.
  const perDay = new Map(trendOf(takings.filter((r) => r.dateAd >= trendFromIso)).map((p) => [p.dateAd, p]));
  const trendData = Array.from({ length: 30 }, (_, i) => {
    const iso = shiftIso(trendFromIso, i);
    const p = perDay.get(iso);
    const bs = toBS(adFromIso(iso));
    const med = p?.medicinePaisa ?? 0;
    const svc = p?.servicePaisa ?? 0;
    return {
      label: `${bs.month}/${bs.day}`,
      value: bothModules ? med : med + svc,
      services: svc,
    };
  });
  const anyTrade = perDay.size > 0;

  // Where the money came from, by group, today and this month.
  const monthTakings = takings.filter((r) => r.dateAd >= monthFromIso);
  const monthGroups = byGroup(monthTakings);
  const monthServices = topServicesOf(monthTakings);
  const todayByGroup = new Map(
    byGroup(takings.filter((r) => r.dateAd === todayIso)).map((g) => [g.groupId ?? g.groupName, g]),
  );
  const topMonth = Math.max(1, ...monthGroups.map((g) => g.paisa));

  const lastName = BS_MONTHS_EN[last.month - 1];
  const change =
    metrics.lastMonthToDatePaisa > 0
      ? Math.round(
          ((metrics.monthSalesPaisa - metrics.lastMonthToDatePaisa) / metrics.lastMonthToDatePaisa) * 100,
        )
      : null;
  const averageBill =
    metrics.billCountMonth > 0 ? Math.round(metrics.monthSalesPaisa / metrics.billCountMonth) : 0;

  // How the day's bills were paid, and what went back: these add up to the
  // takings above them.
  const paidHow = [
    day.byMethod.cash > 0 && `cash ${formatPaisa(day.byMethod.cash)}`,
    day.byMethod.qr > 0 && `QR ${formatPaisa(day.byMethod.qr)}`,
    day.byMethod.credit > 0 && `on dues ${formatPaisa(day.byMethod.credit)}`,
    day.returnsPaisa > 0 && `refunded ${formatPaisa(day.returnsPaisa)}`,
  ].filter(Boolean);

  return (
    <PageShell title="Dashboard">
      <div className="flex flex-col gap-6">
        <p className="-mt-2 text-[13px] text-sage-500">
          Today is {formatBS(t, { form: "long" })}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            href="/reports/day-close"
            label="Today's takings"
            value={formatPaisa(metrics.todaySalesPaisa)}
            big
            foot={
              metrics.billCountToday === 0 && day.returnsPaisa === 0
                ? "No bills yet today"
                : `${metrics.billCountToday} ${metrics.billCountToday === 1 ? "bill" : "bills"}` +
                  (paidHow.length ? ` · ${paidHow.join(" · ")}` : "")
            }
          />
          <Stat
            label="This month"
            value={formatPaisa(metrics.monthSalesPaisa)}
            foot={
              <>
                {change === null ? (
                  <span>
                    {lastName} 1–{t.day}: nothing billed
                  </span>
                ) : (
                  <span className={change >= 0 ? "text-ok-600" : "text-danger-600"}>
                    {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% on {lastName} 1–{t.day}
                  </span>
                )}
                {averageBill > 0 && <span> · average bill {formatPaisa(averageBill)}</span>}
              </>
            }
          />
          <Stat
            label={`Fiscal year ${fy.bsLabel}`}
            value={formatPaisa(metrics.fySalesPaisa)}
            foot="Net of refunds"
          />
          <Stat
            href="/dues"
            label="Owed to you"
            value={formatPaisa(dues.owedPaisa)}
            tone={dues.owedPaisa > 0 ? "warn" : undefined}
            foot={
              dues.people === 0
                ? "Nobody owes anything"
                : `${dues.people} ${dues.people === 1 ? "person" : "people"} on dues`
            }
          />
        </div>

        {modules.pharmacy && (
          <div className="grid gap-3 sm:grid-cols-3">
            <AlertCard href="/stock/low" label="Low stock" count={counts.low} tone="warn" />
            <AlertCard href="/stock/near-expiry" label="Near expiry" count={counts.nearExpiry} tone="warn2" />
            <AlertCard href="/stock/expired" label="Expired" count={counts.expired} tone="danger" />
          </div>
        )}

        {clinic && (
          <div className="grid gap-3 lg:grid-cols-3">
            <Panel title="Patients today" href="/visits">
              <Big value={String(clinic.patients.seen)} />
              <p className="text-[13px] text-sage-600">
                {clinic.patients.seen === 0
                  ? "Nobody seen yet today."
                  : `${clinic.patients.firstVisit} on their first visit · ${clinic.patients.returning} returning`}
              </p>
            </Panel>

            <AppointmentsPanel rows={clinic.appointments} />

            <Panel title="Lab work" href="/lab">
              <Big
                value={String(
                  clinic.lab.to_collect + clinic.lab.to_dispatch + clinic.lab.awaiting_report + clinic.lab.report_in,
                )}
                note="in progress"
              />
              <ul className="flex flex-col gap-1 text-[13px]">
                {LAB_TABS.map(({ stage, href }) => (
                  <li key={stage}>
                    <Link
                      href={href}
                      className="flex items-center justify-between rounded-[6px] px-1 py-0.5 hover:bg-cream-200"
                    >
                      <span className="text-sage-700">{STAGE_LABEL[stage]}</span>
                      <span className="tnum font-medium text-sage-900">{clinic.lab[stage]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {clinic.labOverdue > 0 && (
                <Link href="/lab/awaiting" className="mt-2 block">
                  <Badge tone="warn">
                    {clinic.labOverdue} at the lab over {LAB_CHASE_DAYS} days
                  </Badge>
                </Link>
              )}
            </Panel>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="min-w-0 rounded-[10px] border border-line bg-cream-50 p-5">
            <h2 className="mb-3 flex flex-wrap items-baseline gap-3 text-[15px] font-semibold text-sage-900">
              <span>Takings — last 30 days</span>
              {bothModules && (
                <span className="flex items-center gap-3 text-[12px] font-normal text-sage-500">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-2 w-2 rounded-[2px] bg-sage-700" />
                    Medicines
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-2 w-2 rounded-[2px] bg-clinic-700" />
                    Services
                  </span>
                </span>
              )}
            </h2>
            {!anyTrade ? (
              <p className="py-12 text-center text-[14px] text-sage-400">
                Takings will appear here once you start billing.
              </p>
            ) : (
              <SalesTrend data={trendData} showServices={bothModules} />
            )}
          </div>

          <div className="flex flex-col gap-6">
            {modules.pharmacy && (
              <RankedList
                title="Top items this month"
                empty="Nothing sold yet this month."
                rows={metrics.topItems.map((it) => ({
                  name: it.brandName,
                  detail: `${it.qty} · ${formatPaisa(it.revenuePaisa)}`,
                }))}
              />
            )}
            {clinic && (
              <RankedList
                title="Top services this month"
                empty="Nothing billed yet this month."
                rows={monthServices.map((sv) => ({
                  name: sv.name,
                  detail: `${sv.count} · ${formatPaisa(sv.netPaisa)}`,
                }))}
              />
            )}
          </div>
        </div>

        <section className="min-w-0 rounded-[10px] border border-line bg-cream-50 p-5">
          <h2 className="mb-1 text-[15px] font-semibold text-sage-900">Where the money came from</h2>
          <p className="mb-4 text-[13px] text-sage-500">
            By group, net of discounts and refunds; the month’s column adds up to “This month” above.
          </p>
          {monthGroups.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-sage-400">Nothing billed yet this month.</p>
          ) : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12px] font-semibold uppercase tracking-wide text-sage-500">
                  <th className="pb-2 font-semibold">Group</th>
                  <th className="hidden pb-2 font-semibold sm:table-cell" aria-label="Share of the month" />
                  <th className="hidden pb-2 text-right font-semibold sm:table-cell">Today</th>
                  <th className="pb-2 text-right font-semibold">This month</th>
                </tr>
              </thead>
              <tbody>
                {monthGroups.map((g) => {
                  const today = todayByGroup.get(g.groupId ?? g.groupName);
                  return (
                    <tr key={g.groupId ?? g.groupName} className="border-t border-line">
                      <td className="py-2 pr-3 text-sage-900">
                        {g.groupName}
                        {g.count > 0 && <span className="ml-2 text-[12px] text-sage-400">×{g.count}</span>}
                      </td>
                      <td className="hidden w-[35%] py-2 pr-4 sm:table-cell">
                        <div className="h-2 rounded-full bg-cream-200">
                          <div
                            className="h-2 rounded-full bg-clinic-500"
                            style={{ width: `${Math.max(0, (g.paisa / topMonth) * 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="tnum hidden whitespace-nowrap py-2 pl-3 text-right text-sage-600 sm:table-cell">
                        {today && today.paisa !== 0 ? formatPaisa(today.paisa) : "—"}
                      </td>
                      <td className="tnum whitespace-nowrap py-2 pl-3 text-right font-medium text-sage-900">
                        {formatPaisa(g.paisa)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {owner && (
          <div className="grid gap-3 lg:grid-cols-3">
            <Panel title="This month's books" href="/reports/financials">
              <dl className="flex flex-col gap-1 text-[13px]">
                <Line label="Income" value={owner.books.incomePaisa} />
                {owner.books.doctorSharePaisa > 0 && (
                  <Line label="Doctors' share" value={owner.books.doctorSharePaisa} minus />
                )}
                {owner.books.labCostPaisa > 0 && <Line label="Lab costs" value={owner.books.labCostPaisa} minus />}
                {owner.books.suppliesPaisa !== 0 && <Line label="Supplies" value={owner.books.suppliesPaisa} minus />}
                {owner.books.salariesPaisa + owner.books.ssfEmployerPaisa > 0 && (
                  <Line
                    label="Salaries and SSF"
                    value={owner.books.salariesPaisa + owner.books.ssfEmployerPaisa}
                    minus
                  />
                )}
                <div className="mt-1 border-t border-line pt-2">
                  <Line
                    label={owner.books.leftOverPaisa >= 0 ? "Left over" : "Short by"}
                    value={Math.abs(owner.books.leftOverPaisa)}
                    strong
                    tone={owner.books.leftOverPaisa >= 0 ? "ok" : "danger"}
                  />
                </div>
              </dl>
              <p className="mt-2 text-[12px] text-sage-400">
                Income less VAT and refunds; the whole month&apos;s salaries are counted from its first day.
              </p>
            </Panel>

            {clinic && (
              <Panel title="Doctors this month" href="/reports/doctors">
                {owner.doctors.length === 0 ? (
                  <p className="text-[13px] text-sage-400">No doctor billed yet this month.</p>
                ) : (
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-left text-[12px] text-sage-500">
                        <th className="pb-1 font-medium">Doctor</th>
                        <th className="pb-1 text-right font-medium">Billed</th>
                        <th className="pb-1 text-right font-medium">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {owner.doctors.map((d) => (
                        <tr key={d.doctorId} className="border-t border-line">
                          <td className="py-1.5 pr-2 text-sage-900">{d.name || "—"}</td>
                          <td className="tnum whitespace-nowrap py-1.5 pl-2 text-right text-sage-600">
                            {formatPaisa(d.billedPaisa)}
                          </td>
                          <td className="tnum whitespace-nowrap py-1.5 pl-2 text-right font-medium text-sage-900">
                            {formatPaisa(d.sharePaisa)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
            )}

            <Panel title="You owe now" href="/payables">
              <dl className="flex flex-col gap-1 text-[13px]">
                {clinic && <Line label="Doctors" value={owner.owe.doctors} />}
                {clinic && <Line label="Laboratories" value={owner.owe.labs} />}
                <Line label="Suppliers" value={owner.owe.suppliers} />
                <div className="mt-1 border-t border-line pt-2">
                  <Line
                    label="Altogether"
                    value={owner.owe.doctors + owner.owe.labs + owner.owe.suppliers}
                    strong
                  />
                </div>
              </dl>
            </Panel>
          </div>
        )}

        <p className="text-[13px] text-sage-400">
          Signed in as {user.name}. Company: {company.name || "not set"}.
        </p>
      </div>
    </PageShell>
  );
}

function Stat({
  label,
  value,
  big,
  foot,
  href,
  tone,
}: {
  label: string;
  value: string;
  big?: boolean;
  foot?: React.ReactNode;
  href?: string;
  tone?: "warn";
}) {
  const body = (
    <>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">{label}</div>
      <div
        className={`mt-1 font-bold tnum ${tone === "warn" ? "text-warn-600" : "text-sage-900"} ${
          big ? "text-[28px]" : "text-[22px]"
        }`}
      >
        {value}
      </div>
      {foot && <div className="mt-1 text-[12px] text-sage-500">{foot}</div>}
    </>
  );
  const box = "block min-w-0 rounded-[10px] border border-line bg-cream-50 p-4";
  return href ? (
    <Link href={href} className={`${box} hover:bg-cream-200`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

function Panel({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-[10px] border border-line bg-cream-50 p-4">
      <h2 className="mb-2 flex items-baseline justify-between gap-2 text-[12px] font-semibold uppercase tracking-wide text-sage-500">
        <span>{title}</span>
        {href && (
          <Link href={href} className="text-[12px] font-medium normal-case tracking-normal text-clinic-700 hover:underline">
            Open
          </Link>
        )}
      </h2>
      {children}
    </section>
  );
}

function Big({ value, note }: { value: string; note?: string }) {
  return (
    <div className="mb-1 flex items-baseline gap-2">
      <span className="text-[28px] font-bold text-sage-900 tnum">{value}</span>
      {note && <span className="text-[13px] text-sage-500">{note}</span>}
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  minus,
  tone,
}: {
  label: string;
  value: number;
  strong?: boolean;
  /** a cost, taken off: shown as "− रू 1,000" */
  minus?: boolean;
  tone?: "ok" | "danger";
}) {
  const color = tone === "ok" ? "text-ok-600" : tone === "danger" ? "text-danger-600" : "text-sage-900";
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? "font-semibold text-sage-900" : "text-sage-600"}>{label}</dt>
      <dd className={`tnum whitespace-nowrap ${strong ? "font-bold" : ""} ${color}`}>
        {minus ? `− ${formatPaisa(value)}` : formatPaisa(value)}
      </dd>
    </div>
  );
}

function AppointmentsPanel({ rows }: { rows: Awaited<ReturnType<typeof appointmentsOn>> }) {
  const booked = rows.filter((a) => a.status !== "cancelled");
  const open = booked.filter((a) => isOpen(a.status));
  const seen = booked.filter((a) => a.status === "seen").length;
  const missed = booked.filter((a) => a.status === "missed").length;
  const summary = [
    `${open.length} still to come`,
    seen > 0 && `${seen} seen`,
    missed > 0 && `${missed} did not come`,
  ].filter(Boolean);
  return (
    <Panel title="Appointments today" href="/doctors">
      <Big value={String(booked.length)} note={booked.length === 1 ? "booking" : "bookings"} />
      {booked.length === 0 ? (
        <p className="text-[13px] text-sage-400">Nobody is booked for today.</p>
      ) : (
        <>
          <p className="mb-2 text-[13px] text-sage-600">{summary.join(" · ")}</p>
          <ul className="flex flex-col gap-1 text-[13px]">
            {open.slice(0, 4).map((a) => (
              <li key={a.id} className="flex min-w-0 items-baseline gap-2">
                <span className="tnum w-[64px] shrink-0 text-sage-500">{formatTime(a.timeHhmm)}</span>
                <Link href={`/patients/${a.patientId}`} className="min-w-0 truncate text-sage-900 hover:underline">
                  {a.patientName}
                </Link>
                <span className="ml-auto min-w-0 max-w-[45%] truncate text-right text-[12px] text-sage-500">
                  {a.doctorName}
                </span>
              </li>
            ))}
            {open.length > 4 && <li className="text-[12px] text-sage-400">and {open.length - 4} more</li>}
          </ul>
        </>
      )}
    </Panel>
  );
}

function RankedList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { name: string; detail: string }[];
}) {
  return (
    <div className="min-w-0 rounded-[10px] border border-line bg-cream-50 p-5">
      <h2 className="mb-3 text-[15px] font-semibold text-sage-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-sage-400">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 text-[14px]">
              <span className="text-sage-900">
                <span className="mr-2 text-sage-400">{i + 1}.</span>
                {r.name}
              </span>
              <span className="tnum shrink-0 text-sage-600">{r.detail}</span>
            </li>
          ))}
        </ol>
      )}
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
