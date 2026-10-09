import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listItems } from "@/lib/repos/items";
import {
  nearExpiryBatches,
  stockCounts,
} from "@/lib/repos/batches";
import { getCompany } from "@/lib/repos/company";
import { adToIso, adFromIso, toBS, formatBS } from "@/lib/bs";
import { toMixedDisplay } from "@/lib/units";
import { formatPaisa } from "@/lib/money";
import { StockTabs } from "@/components/app/stock-tabs";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckCircle2 } from "lucide-react";

function daysAheadIso(days: number): string {
  return adToIso(new Date(Date.now() + days * 86400000));
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = adFromIso(fromIso).getTime();
  const b = adFromIso(toIso).getTime();
  return Math.round((b - a) / 86400000);
}

function band(days: number): { tone: BadgeTone; label: string } {
  if (days <= 30) return { tone: "danger", label: `${days} d` };
  if (days <= 60) return { tone: "warn", label: `${days} d` };
  return { tone: "warn2", label: `${days} d` };
}

export default async function NearExpiryPage() {
  await requireUser();
  await requireModulePage("pharmacy");
  const todayIso = adToIso(new Date());
  const company = await getCompany();
  const windowIso = daysAheadIso(company.expiryAlertDays);

  const [items, batches, counts] = await Promise.all([
    listItems(true),
    nearExpiryBatches(todayIso, windowIso),
    stockCounts(todayIso, windowIso),
  ]);
  const unitsByItem = new Map(items.map((i) => [i.id, i.units]));

  const atRisk = batches.reduce(
    (sum, b) => sum + b.remainingBaseQty * b.costPaisaPerBase,
    0,
  );

  return (
    <>
      <StockTabs
        counts={{
          "/stock/low": counts.low,
          "/stock/near-expiry": counts.nearExpiry,
          "/stock/expired": counts.expired,
        }}
      />
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">
        <p className="mb-4 text-[13px] text-sage-500">
          Showing batches expiring within {company.expiryAlertDays} days.
          Value at risk (cost):{" "}
          <span className="font-semibold text-sage-700">{formatPaisa(atRisk)}</span>
        </p>
        {batches.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            message="Nothing is expiring soon. Your shelf is healthy."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Batch</TH>
                <TH>Expiry</TH>
                <TH>Remaining</TH>
                <TH>Expires in</TH>
              </TR>
            </THead>
            <tbody>
              {batches.map((b) => {
                const days = daysBetween(todayIso, b.expiryDateAd);
                const { tone, label } = band(days);
                const units = unitsByItem.get(b.itemId) ?? [];
                return (
                  <TR key={b.id}>
                    <TD className="font-medium text-sage-900">{b.brandName}</TD>
                    <TD className="font-mono">{b.batchNo}</TD>
                    <TD>
                      {formatBS(toBS(adFromIso(b.expiryDateAd)), {
                        form: "long",
                        monthScript: "en",
                      })}
                    </TD>
                    <TD>{toMixedDisplay(b.remainingBaseQty, units)}</TD>
                    <TD>
                      <Badge tone={tone}>{label}</Badge>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </main>
    </>
  );
}
