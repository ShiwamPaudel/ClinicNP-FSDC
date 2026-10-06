import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { requireModulePage } from "@/lib/modules";
import { listItems } from "@/lib/repos/items";
import { listRacks, shelfRows } from "@/lib/repos/racks";
import { itemStockMap } from "@/lib/repos/batches";
import { adToIso } from "@/lib/bs";
import { toMixedDisplay } from "@/lib/units";
import { formatPaisa } from "@/lib/money";
import { ReportFrame } from "@/components/app/report-frame";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The shelf list — the shop written down in the order you walk it.
 *
 * Two jobs. During setup it is the list of what still has no shelf, which is
 * the only honest measure of how far the mapping has got. Afterwards it is a
 * stock-take sheet: start at the rack by the door, work along, count what the
 * paper says should be there.
 */
export default async function ShelfListPage() {
  await requireAdmin();
  await requireModulePage("pharmacy");

  const todayIso = adToIso(new Date());
  const [rows, racks, items, stock] = await Promise.all([
    shelfRows(),
    listRacks(true),
    listItems(true),
    itemStockMap(todayIso),
  ]);

  const unitsByItem = new Map(items.map((i) => [i.id, i.units]));

  // shelfRows already comes back in walk order with the unshelved last, so
  // grouping is a single pass and the groups keep that order.
  interface Group {
    key: string;
    rackName: string | null;
    cells: { row: number; col: number; items: typeof rows }[];
  }
  const groups: Group[] = [];
  const unshelved: typeof rows = [];

  for (const r of rows) {
    if (r.rackId === null || r.row === null || r.col === null) {
      unshelved.push(r);
      continue;
    }
    let group = groups.at(-1);
    if (!group || group.key !== r.rackId) {
      group = { key: r.rackId, rackName: r.rackName, cells: [] };
      groups.push(group);
    }
    let cell = group.cells.at(-1);
    if (!cell || cell.row !== r.row || cell.col !== r.col) {
      cell = { row: r.row, col: r.col, items: [] };
      group.cells.push(cell);
    }
    cell.items.push(r);
  }

  const placed = rows.length - unshelved.length;

  return (
    <ReportFrame
      showFiscalYear={false}
      title="Shelf list"
      rangeLabel="As things stand"
      showRange={false}
      exportReport="shelf-list"
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card label="Racks, shelves and desks" value={String(racks.length)} />
        <Card label="On a shelf" value={String(placed)} />
        <Card
          label="Not on a shelf"
          value={String(unshelved.length)}
          tone={unshelved.length > 0 ? "warn" : "plain"}
        />
      </div>

      {racks.length === 0 ? (
        <EmptyState
          message="Nothing drawn yet. Draw the shop floor in Settings → Shop layout, then put medicines on it in Stock → Shelves."
        />
      ) : groups.length === 0 ? (
        <EmptyState message="The shop floor is drawn, but nothing has been put on it yet." />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 text-[15px] font-semibold text-sage-900">
                {g.rackName}
              </h2>
              <Table>
                <THead>
                  <TR>
                    <TH>Shelf</TH>
                    <TH>Item</TH>
                    <TH>Generic</TH>
                    <TH>In stock</TH>
                    <TH numeric>Value at cost</TH>
                  </TR>
                </THead>
                <tbody>
                  {g.cells.flatMap((c) =>
                    c.items.map((i, idx) => {
                      const s = stock.get(i.itemId);
                      return (
                        <TR key={i.itemId}>
                          <TD className="text-sage-600">
                            {idx === 0 ? `R${c.row}C${c.col}` : ""}
                          </TD>
                          <TD className="font-medium text-sage-900">
                            <Link
                              href={`/items/${i.itemId}`}
                              className="hover:underline"
                            >
                              {i.brandName}
                            </Link>
                          </TD>
                          <TD className="text-sage-500">
                            {i.genericName || "—"}
                          </TD>
                          <TD>
                            {toMixedDisplay(
                              s?.sellableBaseQty ?? 0,
                              unitsByItem.get(i.itemId) ?? [],
                            )}
                          </TD>
                          <TD numeric>
                            {formatPaisa(s?.costValuePaisa ?? 0, false)}
                          </TD>
                        </TR>
                      );
                    }),
                  )}
                </tbody>
              </Table>
            </section>
          ))}
        </div>
      )}

      {unshelved.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1 text-[15px] font-semibold text-sage-900">
            Not on a shelf yet
          </h2>
          <p className="mb-2 text-[13px] text-sage-500">
            The counter cannot point anyone at these. Open a shelf in{" "}
            <Link href="/stock/shelves" className="underline hover:text-sage-700">
              Stock → Shelves
            </Link>{" "}
            and put them on it.
          </p>
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Generic</TH>
                <TH>Written note</TH>
                <TH>In stock</TH>
              </TR>
            </THead>
            <tbody>
              {unshelved.map((i) => (
                <TR key={i.itemId}>
                  <TD className="font-medium text-sage-900">
                    <Link href={`/items/${i.itemId}/edit`} className="hover:underline">
                      {i.brandName}
                    </Link>
                  </TD>
                  <TD className="text-sage-500">{i.genericName || "—"}</TD>
                  <TD className="text-sage-600">{i.shelfNote || "—"}</TD>
                  <TD>
                    {toMixedDisplay(
                      stock.get(i.itemId)?.sellableBaseQty ?? 0,
                      unitsByItem.get(i.itemId) ?? [],
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </section>
      )}
    </ReportFrame>
  );
}

function Card({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "warn";
}) {
  return (
    <div className="rounded-[10px] border border-line bg-cream-50 p-4">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-sage-500">
        {label}
      </div>
      <div
        className={
          "mt-1 text-[22px] font-bold tnum " +
          (tone === "warn" ? "text-warn-600" : "text-sage-900")
        }
      >
        {value}
      </div>
    </div>
  );
}
