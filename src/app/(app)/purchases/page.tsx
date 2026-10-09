import Link from "next/link";
import { Plus, ShoppingCart, RotateCcw } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { requireModulePage, getModules } from "@/lib/modules";
import { buysForUse } from "@/lib/supplies";
import { listPurchases } from "@/lib/repos/purchases";
import { formatPaisa } from "@/lib/money";
import { PageShell } from "@/components/app/page-shell";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function PurchasesPage() {
  await requireAdmin();
  await requireModulePage("supplies");
  const [purchases, modules] = await Promise.all([listPurchases(), getModules()]);

  return (
    <PageShell
      title="Purchases"
      actions={
        <div className="flex gap-2">
          <Link href="/purchases/returns">
            <Button variant="secondary">
              <RotateCcw className="h-4 w-4" />
              Purchase return
            </Button>
          </Link>
          <Link href="/purchases/new">
            <Button>
              <Plus className="h-4 w-4" />
              New purchase
            </Button>
          </Link>
        </div>
      }
    >
      {purchases.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          message={
            buysForUse(modules)
              ? "No purchases yet. Record what you buy from a supplier."
              : "No purchases yet. Record stock coming in from a supplier."
          }
          action={
            <Link href="/purchases/new">
              <Button>New purchase</Button>
            </Link>
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Purchase no.</TH>
              <TH>Supplier</TH>
              <TH>Their invoice</TH>
              <TH>Date</TH>
              <TH numeric>Total</TH>
            </TR>
          </THead>
          <tbody>
            {purchases.map((p) => (
              <TR key={p.id}>
                <TD className="font-mono">
                  <Link
                    href={`/purchases/${p.id}`}
                    className="text-sage-900 underline-offset-2 hover:underline"
                  >
                    {p.purchaseNo ?? "View"}
                  </Link>
                </TD>
                <TD className="font-medium text-sage-900">{p.supplierName}</TD>
                <TD>{p.supplierInvoiceNo || "—"}</TD>
                <TD>{p.dateBs}</TD>
                <TD numeric>{formatPaisa(p.totalPaisa)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </PageShell>
  );
}
