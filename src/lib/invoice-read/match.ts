/**
 * match.ts — put a name printed on a supplier's bill against the catalogue.
 *
 * Two things make this harder than comparing strings. Suppliers write their
 * own shorthand ("AMCAB 5MG 1X10" for what the shop calls "Amcab 5 mg
 * Tablet"), and OCR confuses a fixed set of letters with digits — O with 0, B
 * with 8, S with 5, I and L with 1. Both sides are therefore folded onto the
 * same alphabet before anything is compared, so "S0LAY" and "SOLAY" become the
 * same word rather than two that merely look alike.
 *
 * Nothing here decides anything on its own. A confident match fills the item
 * box for the person to glance at; anything less leaves the box empty with the
 * printed name beside it, because a wrong medicine on a purchase is a wrong
 * medicine in the stock, and that is worse than typing.
 */

export interface MatchCandidate {
  id: string;
  brandName: string;
  genericName: string;
}

export interface MatchResult {
  itemId: string;
  score: number;
  /** True when the match is good enough to fill the box without being asked. */
  confident: boolean;
}

/**
 * Fold a name onto one alphabet: upper case, letters OCR confuses with digits
 * replaced by those digits, and everything that is not a letter or digit
 * dropped. Applied to both sides, so it costs nothing to be aggressive.
 */
export function canonical(name: string): string {
  return name
    .toUpperCase()
    .replace(/[ODQ]/g, "0")
    .replace(/[IL|]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/Z/g, "2")
    .replace(/[^A-Z0-9]/g, "");
}

/** Words OCR picks up from the pack column that say nothing about the medicine. */
const NOISE = /\b(TAB|TABS|TABLET|CAP|CAPS|CAPSULE|INJ|SYP|SYRUP|CREAM|DROP|DROPS|EYE|OINT|GEL|SUSP|PCS|MG|ML|GM)\b/g;

function words(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(NOISE, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Dice coefficient over character pairs — forgiving of one wrong letter. */
function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const pairs = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const p = s.slice(i, i + 2);
      out.set(p, (out.get(p) ?? 0) + 1);
    }
    return out;
  };
  const pa = pairs(a);
  const pb = pairs(b);
  let shared = 0;
  for (const [p, n] of pa) shared += Math.min(n, pb.get(p) ?? 0);
  return (2 * shared) / (a.length - 1 + b.length - 1);
}

/** How well a printed name matches one catalogue item, from 0 to 1. */
export function scoreAgainst(printed: string, item: MatchCandidate): number {
  const p = canonical(printed);
  if (!p) return 0;
  const brand = canonical(item.brandName);
  const generic = canonical(item.genericName);
  if (!brand && !generic) return 0;

  if (p === brand) return 1;
  // The supplier prints more than the catalogue holds more often than less:
  // "AMCAB 5MG 1X10" against "AMCAB 5MG".
  if (brand && (p.startsWith(brand) || brand.startsWith(p))) {
    const shorter = Math.min(p.length, brand.length);
    const longer = Math.max(p.length, brand.length);
    // A prefix only counts when it is most of the name. "RAB" inside "RAB 20"
    // is not a match, it is a question; "AMCAB 5MG" inside "AMCAB 5MG 1X10" is.
    if (shorter >= 4 && shorter / longer >= 0.5) {
      return CONFIDENT_AT + (1 - CONFIDENT_AT) * (shorter / longer);
    }
  }

  let best = dice(p, brand);
  if (generic) best = Math.max(best, dice(p, generic) * 0.85);

  // The first word carries the brand; agreeing on it is worth something on its
  // own, and disagreeing on it should not be rescued by a long generic name.
  const pw = words(printed);
  const bw = words(item.brandName);
  if (pw.length && bw.length && canonical(pw[0]!) === canonical(bw[0]!)) {
    best = Math.max(best, 0.6 + 0.4 * dice(p, brand));
  }
  return Math.min(1, best);
}

/** Enough to fill the box without asking, and enough of a gap to the runner-up. */
const CONFIDENT_AT = 0.72;
const CLEAR_OF_RUNNER_UP = 0.06;

/**
 * The best catalogue item for a printed name, or null when nothing is close.
 *
 * The margin matters as much as the score: "RAB 20" and "RAB 40" score almost
 * the same against either, and filling in the wrong strength is exactly the
 * mistake this whole screen exists to avoid.
 */
export function matchItem(printed: string, items: MatchCandidate[]): MatchResult | null {
  if (!printed.trim() || items.length === 0) return null;
  let best: MatchCandidate | null = null;
  let bestScore = 0;
  let runnerUp = 0;
  for (const item of items) {
    const s = scoreAgainst(printed, item);
    if (s > bestScore) {
      runnerUp = bestScore;
      bestScore = s;
      best = item;
    } else if (s > runnerUp) {
      runnerUp = s;
    }
  }
  if (!best || bestScore < 0.45) return null;
  return {
    itemId: best.id,
    score: bestScore,
    confident: bestScore >= CONFIDENT_AT && bestScore - runnerUp >= CLEAR_OF_RUNNER_UP,
  };
}
