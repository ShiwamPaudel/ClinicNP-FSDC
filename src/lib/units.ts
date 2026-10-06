/**
 * units.ts — pure unit-conversion math. Stock is stored ONLY in base units
 * (tablet/piece); this module is the single place Box/Strip/Tablet display is
 * derived (Rules.md §1.3). No DB, no side effects — fully unit-tested.
 *
 * Model: each item has 1–3 unit levels. level 0 is the base unit (factorToBase = 1).
 * Higher levels multiply down the hierarchy, e.g. 1 Box = 6 Strips, 1 Strip = 10 Tab:
 *   Tablet(level 0) factorToBase = 1
 *   Strip (level 1) factorToBase = 10
 *   Box   (level 2) factorToBase = 60
 */

export interface UnitDef {
  level: number; // 0 = base
  name: string; // "Box" | "Strip" | "Tablet" | ...
  factorToBase: number; // integer >= 1
}

export interface MixedPart {
  level: number;
  name: string;
  count: number;
}

/** Find a unit by level; throws if the item has no such level. */
export function unitAtLevel(units: UnitDef[], level: number): UnitDef {
  const u = units.find((x) => x.level === level);
  if (!u) throw new Error(`no unit at level ${level}`);
  return u;
}

/** The base unit (level 0). */
export function baseUnit(units: UnitDef[]): UnitDef {
  return unitAtLevel(units, 0);
}

/** Convert a quantity expressed in `unitLevel` to base units. */
export function toBase(qty: number, unitLevel: number, units: UnitDef[]): number {
  return qty * unitAtLevel(units, unitLevel).factorToBase;
}

/**
 * Decompose a base quantity into whole units, largest first.
 * 63 base with Box=60/Strip=10/Tab=1 -> [{Box,1},{Strip,0→omitted},{Tab,3}].
 * Only non-zero parts are returned, except when total is 0 (returns one base part = 0).
 */
export function toMixed(baseQty: number, units: UnitDef[]): MixedPart[] {
  const sorted = [...units].sort((a, b) => b.factorToBase - a.factorToBase);
  const base = baseUnit(units);
  if (baseQty <= 0) {
    return [{ level: base.level, name: base.name, count: 0 }];
  }
  let remaining = baseQty;
  const parts: MixedPart[] = [];
  for (const u of sorted) {
    const count = Math.floor(remaining / u.factorToBase);
    remaining -= count * u.factorToBase;
    if (count > 0) parts.push({ level: u.level, name: u.name, count });
  }
  return parts;
}

/** Human string: "4 Box + 3 Strip + 6 Tablet" (never shows raw base units to users). */
export function toMixedDisplay(baseQty: number, units: UnitDef[]): string {
  return toMixed(baseQty, units)
    .map((p) => `${p.count} ${p.name}`)
    .join(" + ");
}

/**
 * Validate a unit hierarchy built by the Admin.
 * Rules: levels unique & contiguous from 0; level 0 factor = 1; factors are
 * integers >= 1 and strictly increasing with level; every higher factor is an
 * exact multiple of the next-lower factor (so decomposition is always clean).
 */
export function validateHierarchy(units: UnitDef[]): string | null {
  if (units.length === 0) return "Add at least the base unit.";
  const sorted = [...units].sort((a, b) => a.level - b.level);
  for (let i = 0; i < sorted.length; i++) {
    const u = sorted[i]!;
    if (u.level !== i) return "Unit levels must start at 0 with no gaps.";
    if (!Number.isInteger(u.factorToBase) || u.factorToBase < 1) {
      return "Conversion factors must be whole numbers of 1 or more.";
    }
    if (!u.name.trim()) return "Every unit needs a name.";
    if (i === 0 && u.factorToBase !== 1) {
      return "The base unit must have a factor of 1.";
    }
    if (i > 0) {
      const prev = sorted[i - 1]!;
      if (u.factorToBase <= prev.factorToBase) {
        return "Each larger unit must convert to more base units than the smaller one.";
      }
      if (u.factorToBase % prev.factorToBase !== 0) {
        return "Each larger unit must be a whole multiple of the next smaller unit.";
      }
    }
  }
  return null;
}

/**
 * Build absolute factorToBase values from per-step ratios entered by the Admin.
 * ratios[i] = how many of level i fit in level i+1 (e.g. [10, 6] for Tab→Strip→Box).
 * Returns factors [1, 10, 60].
 */
export function factorsFromRatios(ratios: number[]): number[] {
  const factors = [1];
  for (const r of ratios) {
    factors.push(factors[factors.length - 1]! * r);
  }
  return factors;
}

/**
 * A shelf counted in the unit somebody actually counts in, converted to the
 * base unit everything is stored in.
 *
 * Its own function because it decides how much stock the software believes
 * exists, and a wrong factor here puts a hundred times too much on the shelf.
 * That is worth a test that does not need a web framework to run.
 *
 * Cost is rounded to whole paisa per base unit, so a Rs 10 strip of 3 becomes
 * 333 paisa a tablet and loses one paisa across the strip. That is the right
 * trade: money is integer paisa everywhere in this system (Rules §4), and a
 * fractional cost per tablet would have to be rounded somewhere regardless.
 */
export function openingLineToBase(
  qty: number,
  costPaisaPerUnit: number,
  factorToBase: number,
): { baseQty: number; costPaisaPerBase: number } {
  return {
    baseQty: qty * factorToBase,
    costPaisaPerBase: Math.round(costPaisaPerUnit / factorToBase),
  };
}

/**
 * True when nothing this thing is sold by has a price yet.
 *
 * An imported catalogue is unpriced until somebody prices it, and a zero rate
 * reaching a bill is a real bill with Rs 0 on it. Client-safe on purpose: the
 * counter has to be able to refuse one while offline.
 */
export function hasNoPrice(units: { sellingRatePaisa: number }[]): boolean {
  return units.length === 0 || units.every((u) => u.sellingRatePaisa === 0);
}
