/**
 * date-range.ts — BS-aware date range presets for reports. Returns AD ISO
 * bounds (inclusive) plus a human label. All BS math flows through lib/bs.ts.
 */
import {
  today,
  toAD,
  adToIso,
  bsMonthRange,
  fiscalYearOf,
  fiscalYearAdRange,
  fiscalYearFromLabel,
  bsDayOfWeek,
  type BSDate,
} from "@/lib/bs";

export type PresetKey =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "fy";

export interface DateRange {
  fromIso: string;
  toIso: string;
  label: string;
  preset?: PresetKey;
  /** Set when the range came from an explicitly chosen fiscal year. */
  fiscalLabel?: string;
}

/** The AD bounds of a fiscal year, from its stored label ("2082/83"). */
export function rangeForFiscalYear(label: string): DateRange {
  const fy = fiscalYearFromLabel(label);
  const { startAd, endAd } = fiscalYearAdRange(fy);
  return {
    fromIso: adToIso(startAd),
    toIso: adToIso(endAd),
    label: `Fiscal year ${fy.label}`,
    fiscalLabel: fy.label,
  };
}

function isoOfBs(bs: BSDate): string {
  return adToIso(toAD(bs));
}

export function rangeForPreset(preset: PresetKey): DateRange {
  const t = today();
  const todayIso = isoOfBs(t);

  switch (preset) {
    case "today":
      return { fromIso: todayIso, toIso: todayIso, label: "Today", preset };
    case "yesterday": {
      const y = new Date(toAD(t));
      y.setDate(y.getDate() - 1);
      const iso = adToIso(y);
      return { fromIso: iso, toIso: iso, label: "Yesterday", preset };
    }
    case "week": {
      // Nepali week starts Sunday (dow 0)
      const dow = bsDayOfWeek(t);
      const start = new Date(toAD(t));
      start.setDate(start.getDate() - dow);
      return {
        fromIso: adToIso(start),
        toIso: todayIso,
        label: "This week",
        preset,
      };
    }
    case "month": {
      const { startAd } = bsMonthRange(t.year, t.month);
      return {
        fromIso: adToIso(startAd),
        toIso: todayIso,
        label: "This month",
        preset,
      };
    }
    case "fy": {
      const fy = fiscalYearOf(t);
      const { startAd, endAd } = fiscalYearAdRange(fy);
      return {
        fromIso: adToIso(startAd),
        toIso: adToIso(endAd),
        label: `Fiscal year ${fy.label}`,
        preset,
      };
    }
  }
}

/**
 * Resolve a range from URL search params (?fy=… , ?preset=… or ?from=&to=).
 * A chosen fiscal year wins over a preset, so switching the year selector
 * recomputes every report for that year — including a closed one.
 */
export function resolveRange(params: {
  preset?: string;
  from?: string;
  to?: string;
  fy?: string;
}): DateRange {
  if (params.from && params.to) {
    return {
      fromIso: params.from,
      toIso: params.to,
      label: "Custom range",
      fiscalLabel: params.fy,
    };
  }
  if (params.fy) {
    try {
      return rangeForFiscalYear(params.fy);
    } catch {
      // an unparseable year in the address falls through to the normal presets
    }
  }
  const preset = (params.preset as PresetKey) ?? "month";
  const valid: PresetKey[] = ["today", "yesterday", "week", "month", "fy"];
  return rangeForPreset(valid.includes(preset) ? preset : "month");
}
