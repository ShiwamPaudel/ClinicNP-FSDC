"use client";

/**
 * shelf-plan.tsx — Stock → Shelves. What this shop keeps where.
 *
 * Location is stock, not product (0013), so this lives under Stock rather than
 * on the item form. It is also the fast way to do it: a shop opening with two
 * hundred medicines will not visit two hundred edit screens. Click a shelf,
 * type a name, it is placed — and the next name is already focused.
 *
 * The list underneath is the honest measure of how far the job has got, which
 * is why it is on the same screen and not a report you have to remember to
 * open.
 */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, X, Search, MapPin } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RackMap } from "@/components/app/rack-map";
import { setItemLocationAction } from "@/app/(app)/settings/rack-actions";
import { cellLabel } from "@/lib/rack-label";
import { FURNITURE_LABEL } from "@/lib/furniture";
import type { Rack, ShelfRow } from "@/lib/repos/racks";

interface SelectedCell {
  rackId: string;
  row: number;
  col: number;
}

export function ShelfPlan({
  racks,
  items,
  floor,
}: {
  racks: Rack[];
  items: ShelfRow[];
  floor?: { floorWidthCm: number; floorDepthCm: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);

  // Derived from the same list the shelf below shows, so the number drawn on a
  // cell and the medicines listed inside it can never disagree.
  const counts = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    for (const i of items) {
      if (!i.rackId || i.row === null || i.col === null) continue;
      const cells = (out[i.rackId] ??= {});
      const key = `${i.row}:${i.col}`;
      cells[key] = (cells[key] ?? 0) + 1;
    }
    return out;
  }, [items]);

  const unplaced = useMemo(() => items.filter((i) => !i.rackId), [items]);
  const rack = selected
    ? (racks.find((r) => r.id === selected.rackId) ?? null)
    : null;

  const here = useMemo(() => {
    if (!selected) return [];
    return items.filter(
      (i) =>
        i.rackId === selected.rackId &&
        i.row === selected.row &&
        i.col === selected.col,
    );
  }, [items, selected]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "" || !selected) return [];
    return items
      .filter(
        (i) =>
          !(
            i.rackId === selected.rackId &&
            i.row === selected.row &&
            i.col === selected.col
          ) &&
          (i.brandName.toLowerCase().includes(q) ||
            i.genericName.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [items, query, selected]);

  async function save(
    itemId: string,
    where: { rackId: string | null; row: number | null; col: number | null },
    note: string,
  ) {
    setBusy(itemId);
    const res = await setItemLocationAction({ itemId, ...where, note });
    setBusy(null);
    if (res.ok) {
      router.refresh();
      return true;
    }
    toast.error(res.userMessage ?? "Something went wrong.");
    return false;
  }

  async function place(item: ShelfRow) {
    if (!selected) return;
    // Placing on a shelf clears the written note: the note was the fallback
    // for not having one, and keeping both would leave two answers on screen.
    if (await save(item.itemId, selected, "")) {
      setQuery("");
      addRef.current?.focus();
    }
  }

  async function takeOff(item: ShelfRow) {
    await save(item.itemId, { rackId: null, row: null, col: null }, "");
  }

  if (racks.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-[10px] border border-dashed border-line bg-cream-50 p-8 text-center">
          <MapPin className="mx-auto mb-2 h-6 w-6 text-sage-500" />
          <p className="text-[15px] font-medium text-sage-900">
            No racks, shelves or desks drawn yet
          </p>
          <p className="mx-auto mt-1 max-w-[460px] text-[13px] text-sage-500">
            Draw the shop floor once and the counter can light up the shelf a
            medicine is on while somebody is looking for it.
          </p>
          <Link href="/settings/racks" className="mt-4 inline-block">
            <Button>Draw the shop floor</Button>
          </Link>
        </div>
        <UnplacedList
          items={unplaced}
          busy={busy}
          onNote={(item, note) =>
            save(item.itemId, { rackId: null, row: null, col: null }, note)
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-x-auto rounded-[10px] border border-line bg-cream-50 p-4">
        <RackMap
          racks={racks}
          floor={floor ?? null}
          counts={counts}
          highlight={selected}
          onCellClick={(rackId, row, col) =>
            setSelected((cur) =>
              cur && cur.rackId === rackId && cur.row === row && cur.col === col
                ? null
                : { rackId, row, col },
            )
          }
        />
        {!selected && (
          <p className="mt-3 text-[12px] text-sage-500">
            Click a shelf to see what is on it, or to put something there.
          </p>
        )}
      </div>

      {rack && selected && (
        <div className="rounded-[10px] border border-magenta-600 bg-cream-50 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-sage-900">
                {cellLabel(rack.name, selected.row, selected.col)}
              </h2>
              <p className="text-[13px] text-sage-500">
                {FURNITURE_LABEL[rack.kind]} ·{" "}
                {here.length === 0
                  ? "nothing here yet"
                  : `${here.length} item${here.length === 1 ? "" : "s"} here`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close the shelf"
              className="rounded-[8px] p-1.5 text-sage-500 hover:bg-cream-200 hover:text-sage-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {here.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5">
              {here.map((i) => (
                <li
                  key={i.itemId}
                  className="flex items-center gap-2 rounded-[8px] border border-line bg-cream-100 px-3 py-2"
                >
                  <Link
                    href={`/items/${i.itemId}`}
                    className="min-w-0 flex-1 truncate text-[14px] text-sage-900 hover:underline"
                  >
                    {i.brandName}
                    {i.genericName && (
                      <span className="text-sage-500"> · {i.genericName}</span>
                    )}
                  </Link>
                  <button
                    type="button"
                    disabled={busy === i.itemId}
                    onClick={() => void takeOff(i)}
                    className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] text-sage-500 hover:bg-cream-200 hover:text-danger-600 disabled:opacity-50"
                  >
                    take off
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="relative">
            <div className="flex items-center gap-2 rounded-[8px] border border-line bg-cream-50 px-3">
              <Search className="h-4 w-4 shrink-0 text-sage-500" />
              <Input
                ref={addRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Put something here — type a medicine name"
                aria-label={`Put an item on ${rack.name} row ${selected.row} column ${selected.col}`}
                className="border-0 px-0 focus-visible:ring-0"
              />
            </div>
            {matches.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-[8px] border border-line bg-cream-50 shadow-[0_1px_2px_rgb(22_36_27_/_6%),0_4px_12px_rgb(22_36_27_/_5%)]">
                {matches.map((i) => (
                  <li key={i.itemId}>
                    <button
                      type="button"
                      disabled={busy === i.itemId}
                      onClick={() => void place(i)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-cream-200 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0 text-sage-500" />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-sage-900">
                        {i.brandName}
                        {i.genericName && (
                          <span className="text-sage-500"> · {i.genericName}</span>
                        )}
                      </span>
                      {i.rackId && (
                        <span className="shrink-0 text-[11px] text-warn-600">
                          moving from {i.rackName} R{i.row}C{i.col}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <UnplacedList
        items={unplaced}
        busy={busy}
        onNote={(item, note) =>
          save(item.itemId, { rackId: null, row: null, col: null }, note)
        }
      />
    </div>
  );
}

/**
 * Everything with no shelf. During setup this is the to-do list; afterwards it
 * should be empty or hold only the things genuinely kept loose, which is what
 * the written note is for.
 */
function UnplacedList({
  items,
  busy,
  onNote,
}: {
  items: ShelfRow[];
  busy: string | null;
  onNote: (item: ShelfRow, note: string) => Promise<boolean>;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-[10px] border border-line bg-cream-50 p-4 text-[13px] text-sage-500">
        Everything has a place. Nothing left to put away.
      </p>
    );
  }
  return (
    <section>
      <h2 className="mb-1 text-[15px] font-semibold text-sage-900">
        Not on a shelf yet ({items.length})
      </h2>
      <p className="mb-2 text-[13px] text-sage-500">
        The counter cannot point anyone at these. Click a shelf above and add
        them, or write down where they are kept.
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((i) => (
          <NoteRow key={i.itemId} item={i} busy={busy === i.itemId} onNote={onNote} />
        ))}
      </ul>
    </section>
  );
}

function NoteRow({
  item,
  busy,
  onNote,
}: {
  item: ShelfRow;
  busy: boolean;
  onNote: (item: ShelfRow, note: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState(item.shelfNote);
  const dirty = note.trim() !== item.shelfNote.trim();
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-[8px] border border-line bg-cream-50 px-3 py-2">
      <Link
        href={`/items/${item.itemId}`}
        className="min-w-0 flex-1 truncate text-[14px] text-sage-900 hover:underline"
      >
        {item.brandName}
        {item.genericName && (
          <span className="text-sage-500"> · {item.genericName}</span>
        )}
      </Link>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="or write where it is kept"
        aria-label={`Where ${item.brandName} is kept`}
        className="h-9 w-full sm:w-[260px]"
      />
      {dirty && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void onNote(item, note)}
        >
          {busy ? "…" : "Save"}
        </Button>
      )}
    </li>
  );
}
