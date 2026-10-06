import { requireUser } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listItems } from "@/lib/repos/items";
import { expiredBatches, stockCounts } from "@/lib/repos/batches";
import { getCompany } from "@/lib/repos/company";
import { adToIso, adFromIso, toBS, formatBS } from "@/lib/bs";
import { toMixedDisplay } from "@/lib/units";
import { formatPaisa } from "@/lib/money";
import { StockTabs } from "@/components/app/stock-tabs";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ExpiredActions } from "@/components/app/expired-actions";
import { CheckCircle2 } from "lucide-react";

function daysAheadIso(days: number): string {
  return adToIso(new Date(Date.now() + days * 86400000));
}

export default async function ExpiredStockPage() {
  const user = await requireUser();
  await requireModulePage("pharmacy");
  const isAdmin = user.role === "admin";
  const todayIso = adToIso(new Date());
  const company = await getCompany();

  const [items, batches, counts] = await Promise.all([
    listItems(true),
    expiredBatches(todayIso),
    stockCounts(todayIso, daysAheadIso(company.expiryAlertDays)),
  ]);
  const unitsByItem = new Map(items.map((i) => [i.id, i.units]));

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
        {batches.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            message="No expired stock. Nothing to write off or return."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Batch</TH>
                <TH>Expired on</TH>
                <TH>Remaining</TH>
                <TH numeric>Cost value</TH>
                {isAdmin && <TH />}
              </TR>
            </THead>
            <tbody>
              {batches.map((b) => {
                const units = unitsByItem.get(b.itemId) ?? [];
                return (
                  <TR key={b.id}>
                    <TD className="font-medium text-sage-900">{b.brandName}</TD>
                    <TD className="font-mono">{b.batchNo}</TD>
                    <TD>
                      <span className="mr-2">
                        {formatBS(toBS(adFromIso(b.expiryDateAd)), {
                          form: "long",
                          monthScript: "en",
                        })}
                      </span>
                      <Badge tone="danger-solid">Expired</Badge>
                    </TD>
                    <TD>{toMixedDisplay(b.remainingBaseQty, units)}</TD>
                    <TD numeric>
                      {formatPaisa(b.remainingBaseQty * b.costPaisaPerBase)}
                    </TD>
                    {isAdmin && (
                      <TD>
                        <ExpiredActions
                          batchId={b.id}
                          hasSupplier={b.supplierId != null}
                        />
                      </TD>
                    )}
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
