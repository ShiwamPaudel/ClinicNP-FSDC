"use client";

/**
 * search-box.tsx — the one search box at the counter.
 *
 * With both modules on it searches medicines and services together, because
 * that is what the person at the desk is doing: a consultation and a strip of
 * paracetamol are one transaction (PRD §4B.4). Results carry a sage Medicine
 * tag or a navy Service tag, and F3 narrows to one kind when the queue is long.
 *
 * With one module on there is nothing to disambiguate, so the tags and the
 * scope hint disappear entirely rather than labelling the only thing there is.
 *
 * When the shop has drawn its racks, this is also where a medicine's shelf is
 * answered — written out beside the result, or drawn on the map next to it.
 * Search is the right moment for it: it is the one second between hearing a
 * name and walking to a shelf, and it is the moment somebody who started last
 * week needs the help.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search, FlaskConical, Send, Stethoscope, MapPin } from "lucide-react";
import { RackMap } from "@/components/app/rack-map";
import { cellLabel } from "@/lib/rack-label";
import type { PosItem, PosService, PosRack } from "@/lib/pos-types";
import type { RackDisplay } from "@/lib/repos/company";
import { defaultUnit } from "@/lib/bill-calc";
import { toMixedDisplay, hasNoPrice } from "@/lib/units";
import { formatPaisa } from "@/lib/money";
import { adFromIso, toBS, formatBS } from "@/lib/bs";
import { cn } from "@/lib/cn";

export interface SearchBoxHandle {
  focus: () => void;
}

export type SearchScope = "all" | "medicine" | "service";

type Result =
  | { kind: "medicine"; item: PosItem; score: number; sortKey: string }
  | { kind: "service"; service: PosService; score: number; sortKey: string };

interface Props {
  items: PosItem[];
  services: PosService[];
  /** The shop floor, from the offline catalog. Empty for most shops. */
  racks: PosRack[];
  /** The room they stand in. Absent in a catalog cached before 0017. */
  floor?: { floorWidthCm: number; floorDepthCm: number } | null;
  /** What the shop asked for: nothing, the shelf written out, or the map. */
  rackDisplay: RackDisplay;
  todayIso: string;
  onPick: (item: PosItem) => void;
  onPickService: (service: PosService) => void;
  /** Enter pressed on an empty box — jump to payment. */
  onEmptyEnter: () => void;
}

/**
 * Both kinds are ranked on the same scale so one list can be sorted honestly:
 * a name that starts with what was typed beats one that merely contains it,
 * whichever kind it is. A service's short code is treated as a name — typing
 * "usgap" is how a fast person reaches "USG — Abdomen and Pelvis".
 */
function rank(
  items: PosItem[],
  services: PosService[],
  q: string,
  scope: SearchScope,
): Result[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];

  const out: Result[] = [];

  if (scope !== "service") {
    for (const it of items) {
      const brand = it.brandName.toLowerCase();
      const generic = it.genericName.toLowerCase();
      let score = -1;
      if (brand.startsWith(query)) score = 0;
      else if (generic.startsWith(query)) score = 1;
      else if (brand.includes(query)) score = 2;
      else if (generic.includes(query)) score = 3;
      if (score >= 0) out.push({ kind: "medicine", item: it, score, sortKey: it.brandName });
    }
  }

  if (scope !== "medicine") {
    for (const s of services) {
      const name = s.name.toLowerCase();
      const code = s.code.toLowerCase();
      const group = s.groupName.toLowerCase();
      let score = -1;
      if (code && code.startsWith(query)) score = 0;
      else if (name.startsWith(query)) score = 0;
      else if (name.includes(query)) score = 2;
      else if (group.includes(query)) score = 3;
      if (score >= 0) out.push({ kind: "service", service: s, score, sortKey: s.name });
    }
  }

  return out
    .sort((a, b) => a.score - b.score || a.sortKey.localeCompare(b.sortKey))
    .slice(0, 8);
}

/**
 * Where a medicine is kept, in words. The drawn shelf wins; the free-text note
 * from before racks existed is the fallback, because a shop that typed
 * "behind the counter" for years should still see it here.
 */
function shelfOf(item: PosItem, racks: PosRack[]): string {
  if (item.cell) {
    const rack = racks.find((r) => r.id === item.cell!.rackId);
    if (rack) return cellLabel(rack.name, item.cell.row, item.cell.col);
  }
  return item.shelfNote.trim();
}

function availableBase(item: PosItem, todayIso: string): number {
  return item.batches
    .filter((b) => b.expiryDateAd >= todayIso)
    .reduce((s, b) => s + b.remainingBaseQty, 0);
}

function nearestExpiry(item: PosItem, todayIso: string): string | null {
  const live = item.batches
    .filter((b) => b.expiryDateAd >= todayIso && b.remainingBaseQty > 0)
    .sort((a, b) => (a.expiryDateAd < b.expiryDateAd ? -1 : 1));
  return live[0]?.expiryDateAd ?? null;
}

const SCOPE_ORDER: SearchScope[] = ["all", "medicine", "service"];
const SCOPE_LABEL: Record<SearchScope, string> = {
  all: "Everything",
  medicine: "Medicines only",
  service: "Services only",
};

export const SearchBox = forwardRef<SearchBoxHandle, Props>(
  (
    {
      items,
      services,
      racks,
      floor,
      rackDisplay,
      todayIso,
      onPick,
      onPickService,
      onEmptyEnter,
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [scope, setScope] = useState<SearchScope>("all");

    // Both kinds on the counter is what makes the scope switch worth having.
    const bothKinds = items.length > 0 && services.length > 0;
    const effectiveScope = bothKinds ? scope : "all";

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    // F3 narrows the search. Bound on the window so it works wherever the
    // person's hands are, exactly like the other counter shortcuts.
    useEffect(() => {
      if (!bothKinds) return;
      function onKey(e: KeyboardEvent) {
        if (e.key !== "F3") return;
        e.preventDefault();
        setScope((s) => SCOPE_ORDER[(SCOPE_ORDER.indexOf(s) + 1) % SCOPE_ORDER.length]!);
        setActive(0);
        inputRef.current?.focus();
      }
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [bothKinds]);

    const results = useMemo(
      () => rank(items, services, query, effectiveScope),
      [items, services, query, effectiveScope],
    );

    const activeResult = results[active] ?? null;
    const activeItem =
      activeResult?.kind === "medicine" ? activeResult.item : null;

    // The map is drawn for as long as the results are, not only when the
    // highlighted row happens to have a shelf: a panel that appears and
    // vanishes as you arrow down the list is harder to read than one that
    // stays put and says "not on a shelf".
    const showMap =
      rackDisplay === "visual" && racks.length > 0 && results.length > 0;
    const highlight =
      activeItem?.cell &&
      racks.some((r) => r.id === activeItem.cell!.rackId)
        ? activeItem.cell
        : null;

    function pick(r: Result) {
      if (r.kind === "medicine") onPick(r.item);
      else onPickService(r.service);
      setQuery("");
      setActive(0);
    }

    function onKeyDown(e: React.KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === "Escape") {
        // Clears what was typed and closes the list; the box keeps focus.
        if (query !== "") {
          e.preventDefault();
          setQuery("");
          setActive(0);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (query.trim() === "") {
          onEmptyEnter();
          return;
        }
        const r = results[active];
        if (r) pick(r);
      }
    }

    const placeholder = !bothKinds
      ? services.length > 0 && items.length === 0
        ? "Search service — type a name, then Enter"
        : "Search medicine — type a name, then Enter"
      : effectiveScope === "medicine"
        ? "Search medicines — F3 to widen"
        : effectiveScope === "service"
          ? "Search services — F3 to widen"
          : "Search medicine or service — type a name, then Enter";

    return (
      <div className="relative">
        <div className="flex items-center gap-2 rounded-[10px] border border-line bg-cream-50 px-4">
          <Search className="h-5 w-5 text-sage-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="h-14 w-full bg-transparent text-[16px] text-sage-950 placeholder:text-sage-300 focus:outline-none"
            autoFocus
            aria-label={placeholder}
          />
          {bothKinds && effectiveScope !== "all" && (
            <span className="shrink-0 rounded-[999px] bg-sage-150 px-2.5 py-1 text-[12px] text-sage-700">
              {SCOPE_LABEL[effectiveScope]}
            </span>
          )}
        </div>

        {results.length > 0 && (
          <div className="absolute z-30 mt-1 flex w-full flex-col overflow-hidden rounded-[10px] border border-line bg-cream-50 shadow-[0_1px_2px_rgb(22_36_27_/_6%),0_4px_12px_rgb(22_36_27_/_5%)] sm:flex-row">
            <ul className="max-h-[420px] min-w-0 flex-1 overflow-y-auto">
              {results.map((r, i) =>
                r.kind === "medicine" ? (
                  <MedicineRow
                    key={`m-${r.item.id}`}
                    item={r.item}
                    todayIso={todayIso}
                    showTag={bothKinds}
                    shelf={rackDisplay === "off" ? "" : shelfOf(r.item, racks)}
                    activeRow={i === active}
                    onHover={() => setActive(i)}
                    onClick={() => pick(r)}
                  />
                ) : (
                  <ServiceRow
                    key={`s-${r.service.id}`}
                    service={r.service}
                    showTag={bothKinds}
                    activeRow={i === active}
                    onHover={() => setActive(i)}
                    onClick={() => pick(r)}
                  />
                ),
              )}
            </ul>

            {showMap && (
              <div className="shrink-0 border-t border-line bg-cream-100 p-3 sm:w-[264px] sm:border-l sm:border-t-0">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-sage-500">
                  <MapPin className="h-3.5 w-3.5" />
                  Where it is kept
                </div>
                {highlight && activeItem ? (
                  <>
                    <div className="mb-2 text-[13px] font-semibold text-magenta-700">
                      {shelfOf(activeItem, racks)}
                    </div>
                    <div className="overflow-x-auto">
                      <RackMap
                        racks={racks}
                        floor={floor ?? null}
                        highlight={highlight}
                        compact
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] text-sage-500">
                    {activeItem
                      ? activeItem.shelfNote.trim() || "Not on a shelf yet."
                      : "Highlight a medicine to see its shelf."}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  },
);
SearchBox.displayName = "SearchBox";

function MedicineRow({
  item,
  todayIso,
  showTag,
  shelf,
  activeRow,
  onHover,
  onClick,
}: {
  item: PosItem;
  todayIso: string;
  showTag: boolean;
  /** Where it is kept, already resolved. Empty means say nothing. */
  shelf: string;
  activeRow: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const u = defaultUnit(item);
  const avail = availableBase(item, todayIso);
  const nearest = nearestExpiry(item, todayIso);
  const unpriced = hasNoPrice(item.units);
  return (
    <li>
      <button
        onMouseEnter={onHover}
        onClick={onClick}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left",
          activeRow ? "bg-sage-150" : "hover:bg-cream-200",
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {showTag && (
              <span className="shrink-0 rounded-[4px] bg-sage-150 px-1.5 text-[11px] font-medium text-sage-700">
                Medicine
              </span>
            )}
            <span className="truncate text-[15px] font-medium text-sage-900">
              {item.brandName}
            </span>
            {item.controlledFlag && (
              <span className="rounded-[4px] bg-info-100 px-1 text-[11px] text-info-600">
                Rx
              </span>
            )}
          </div>
          {item.genericName && (
            <div className="truncate text-[12px] text-sage-500">
              {item.genericName}
            </div>
          )}
          {shelf && (
            <div className="flex items-center gap-1 truncate text-[12px] font-medium text-magenta-700">
              <MapPin className="h-3 w-3 shrink-0" />
              {shelf}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right text-[12px]">
          {unpriced ? (
            /* Not a refusal any more: the first sale sets the price (D-105). */
            <div className="text-[13px] font-semibold text-warn-600">
              Set price
            </div>
          ) : (
            <div className="text-[14px] font-medium text-sage-900 tnum">
              {formatPaisa(u.sellingRatePaisa)} / {u.name}
            </div>
          )}
          <div className="text-sage-500">{toMixedDisplay(avail, item.units)}</div>
          {nearest && (
            <div className="text-sage-400">
              Exp {formatBS(toBS(adFromIso(nearest)))}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

function ServiceRow({
  service,
  showTag,
  activeRow,
  onHover,
  onClick,
}: {
  service: PosService;
  showTag: boolean;
  activeRow: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onMouseEnter={onHover}
        onClick={onClick}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left",
          activeRow ? "bg-clinic-75" : "hover:bg-cream-200",
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {showTag && (
              <span className="shrink-0 rounded-[4px] bg-clinic-150 px-1.5 text-[11px] font-medium text-clinic-700">
                Service
              </span>
            )}
            <span className="truncate text-[15px] font-medium text-sage-900">
              {service.name}
            </span>
          </div>
          <div className="flex items-center gap-2 truncate text-[12px] text-sage-500">
            <span>{service.groupName}</span>
            {service.doctorRequired && (
              <span className="inline-flex items-center gap-0.5" title="Needs a doctor">
                <Stethoscope className="h-3 w-3" />
              </span>
            )}
            {service.outsourced && (
              <span
                className="inline-flex items-center gap-0.5"
                title="Sent to an outside laboratory"
              >
                <Send className="h-3 w-3" />
              </span>
            )}
            {service.sampleType && (
              <span
                className="inline-flex items-center gap-0.5"
                title={`${service.sampleType} sample is collected for this`}
              >
                <FlaskConical className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right text-[12px]">
          <div className="text-[14px] font-medium text-sage-900 tnum">
            {formatPaisa(service.ratePaisa)}
          </div>
          {service.sampleRate && (
            <div className="text-warn-600">sample price</div>
          )}
          {service.followupDays > 0 && (
            <div className="text-sage-400">
              Follow-up {service.followupDays}d
            </div>
          )}
        </div>
      </button>
    </li>
  );
}
