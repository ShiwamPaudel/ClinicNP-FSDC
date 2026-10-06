"use client";

/**
 * pricing-grid.tsx — putting prices on a catalogue that arrived without them.
 *
 * A shop's item list can be imported in a minute; its prices cannot, because
 * they are the shop's own and no file has them. So the catalogue lands
 * unpriced and this is where it stops being unpriced — one screen, every
 * medicine, every unit, one save.
 *
 * Built for somebody working down a distributor's price list with a pen in
 * the other hand: no dialogs, no per-row save, no page reload between items.
 * Only what was actually typed is sent, so leaving a row blank leaves it
 * exactly as it was rather than zeroing it.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Tag, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { setPricesAction } from "@/app/(app)/items/pricing-actions";
import { toPaisa, paisaToRupees } from "@/lib/money";
import { hasNoPrice } from "@/lib/units";

export interface PricingUnit {
  level: number;
  name: string;
  factorToBase: number;
  sellingRatePaisa: number;
  isDefaultSelling: boolean;
}

export interface PricingItem {
  id: string;
  brandName: string;
  genericName: string;
  category: string;
  units: PricingUnit[];
}

/** Rupees as typed, keyed `itemId:level`. Absent means untouched. */
type Draft = Record<string, string>;

const key = (itemId: string, level: number) => `${itemId}:${level}`;

export function PricingGrid({ items }: { items: PricingItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>({});
  const [query, setQuery] = useState("");
  const [onlyUnpriced, setOnlyUnpriced] = useState(true);
  const [busy, setBusy] = useState(false);

  const unpricedCount = useMemo(
    () => items.filter((i) => hasNoPrice(i.units)).length,
    [items],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (onlyUnpriced && !hasNoPrice(i.units)) return false;
      if (!q) return true;
      return (
        i.brandName.toLowerCase().includes(q) ||
        i.genericName.toLowerCase().includes(q)
      );
    });
  }, [items, query, onlyUnpriced]);

  /** Rows carrying at least one typed rate that differs from what is stored. */
  const changed = useMemo(() => {
    const out: { itemId: string; rates: { level: number; sellingRatePaisa: number }[] }[] = [];
    for (const item of items) {
      const rates: { level: number; sellingRatePaisa: number }[] = [];
      for (const u of item.units) {
        const typed = draft[key(item.id, u.level)];
        if (typed === undefined || typed.trim() === "") continue;
        const paisa = toPaisa(Number(typed));
        if (!Number.isFinite(paisa) || paisa < 0) continue;
        if (paisa === u.sellingRatePaisa) continue;
        rates.push({ level: u.level, sellingRatePaisa: paisa });
      }
      if (rates.length > 0) out.push({ itemId: item.id, rates });
    }
    return out;
  }, [items, draft]);

  /** Anything typed that is not a plain number of rupees. */
  const bad = useMemo(
    () =>
      Object.entries(draft).filter(
        ([, v]) => v.trim() !== "" && !/^\d+(\.\d{1,2})?$/.test(v.trim()),
      ).length,
    [draft],
  );

  async function save() {
    if (changed.length === 0) return;
    if (bad > 0) {
      toast.error("Some prices are not plain numbers of rupees.");
      return;
    }
    setBusy(true);
    const res = await setPricesAction({ items: changed });
    setBusy(false);

    if (res.ok) {
      toast.success(
        `Priced ${res.count} medicine${res.count === 1 ? "" : "s"}.`,
      );
      setDraft({});
      router.refresh();
    } else {
      toast.error(res.userMessage ?? "Something went wrong.");
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-line bg-cream-50 p-8 text-center">
        <Tag className="mx-auto mb-2 h-6 w-6 text-sage-500" />
        <p className="text-[15px] font-medium text-sage-900">No medicines yet</p>
        <p className="mx-auto mt-1 max-w-[460px] text-[13px] text-sage-500">
          Prices belong to medicines, so the medicines have to exist first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="rounded-[10px] border border-line bg-cream-50 p-4">
        <h2 className="text-[16px] font-semibold text-sage-900">
          What each medicine sells for
        </h2>
        <p className="mt-1 max-w-[760px] text-[13px] text-sage-500">
          {unpricedCount > 0 ? (
            <>
              <strong className="font-semibold text-warn-600">
                {unpricedCount} medicine{unpricedCount === 1 ? " has" : "s have"} no
                price yet
              </strong>
              . Type a price against each unit you sell by and save. Leaving a
              box empty leaves that price as it is. You can also price a
              medicine at the counter: the first time one is sold, it asks for
              a price and keeps what you type.
            </>
          ) : (
            <>
              Every medicine has a price. Change any of them here; a blank box
              leaves the price as it is.
            </>
          )}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sage-500" />
            <Input
              id="pricing-search"
              aria-label="Search medicines by name"
              className="pl-9"
              placeholder="Search by brand or generic name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-[13px] font-medium text-sage-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-sage-700"
              checked={onlyUnpriced}
              onChange={(e) => setOnlyUnpriced(e.target.checked)}
            />
            Only the ones with no price
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-cream-50 p-8 text-center">
          <Check className="mx-auto mb-2 h-6 w-6 text-ok-600" />
          <p className="text-[15px] font-medium text-sage-900">
            {onlyUnpriced && query === ""
              ? "Every medicine has a price."
              : "Nothing matches that."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-line">
          <ul className="divide-y divide-line">
            {visible.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 bg-cream-50 p-3 lg:flex-row lg:items-center"
              >
                <div className="min-w-0 lg:w-[38%]">
                  <div className="truncate text-[14px] font-medium text-sage-900">
                    {item.brandName}
                  </div>
                  {item.genericName && (
                    <div className="truncate text-[12px] text-sage-500">
                      {item.genericName}
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-wrap gap-3">
                  {item.units.map((u) => {
                    const k = key(item.id, u.level);
                    const typed = draft[k] ?? "";
                    const invalid =
                      typed.trim() !== "" && !/^\d+(\.\d{1,2})?$/.test(typed.trim());
                    return (
                      <div key={u.level} className="w-[150px]">
                        <label
                          htmlFor={`rate-${k}`}
                          className="mb-1 flex items-baseline gap-1 text-[12px] font-medium text-sage-700"
                        >
                          <span>{u.name}</span>
                          {u.factorToBase > 1 && (
                            <span className="text-[11px] font-normal text-sage-500">
                              ×{u.factorToBase}
                            </span>
                          )}
                          {u.isDefaultSelling && (
                            <span className="text-[11px] font-normal text-magenta-700">
                              default
                            </span>
                          )}
                        </label>
                        <Input
                          id={`rate-${k}`}
                          numeric
                          inputMode="decimal"
                          aria-label={`${item.brandName} price per ${u.name}`}
                          aria-invalid={invalid || undefined}
                          placeholder={
                            u.sellingRatePaisa > 0
                              ? String(paisaToRupees(u.sellingRatePaisa))
                              : "—"
                          }
                          value={typed}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, [k]: e.target.value }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 border-t border-line bg-cream-50/95 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3">
          <div className="text-[13px] text-sage-500">
            {changed.length === 0 ? (
              "Nothing typed yet."
            ) : (
              <>
                <strong className="font-semibold text-sage-900">
                  {changed.length}
                </strong>{" "}
                medicine{changed.length === 1 ? "" : "s"} ready to save
                {bad > 0 && (
                  <span className="ml-2 font-medium text-danger-600">
                    · {bad} price{bad === 1 ? "" : "s"} not a plain number
                  </span>
                )}
              </>
            )}
          </div>
          <Button onClick={save} disabled={busy || changed.length === 0}>
            {busy ? "…" : "Save prices"}
          </Button>
        </div>
      </div>
    </div>
  );
}
