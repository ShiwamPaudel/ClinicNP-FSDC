import { describe, it, expect } from "vitest";
import {
  toBase,
  toMixed,
  toMixedDisplay,
  validateHierarchy,
  factorsFromRatios,
  type UnitDef,
} from "@/lib/units";

// 1 Box = 6 Strips, 1 Strip = 10 Tablets  => factors 1 / 10 / 60
const ABC: UnitDef[] = [
  { level: 0, name: "Tablet", factorToBase: 1 },
  { level: 1, name: "Strip", factorToBase: 10 },
  { level: 2, name: "Box", factorToBase: 60 },
];

describe("units — toBase", () => {
  it("converts each level to base units", () => {
    expect(toBase(1, 0, ABC)).toBe(1);
    expect(toBase(1, 1, ABC)).toBe(10);
    expect(toBase(2, 2, ABC)).toBe(120); // 2 boxes
    expect(toBase(3, 1, ABC)).toBe(30);
  });
});

describe("units — toMixed / display", () => {
  it("2 boxes shows as '2 Box'", () => {
    expect(toMixedDisplay(120, ABC)).toBe("2 Box");
  });

  it("decomposes largest-first and omits zero parts", () => {
    // 4 Box + 3 Strip + 6 Tab = 240 + 30 + 6 = 276
    expect(toMixedDisplay(276, ABC)).toBe("4 Box + 3 Strip + 6 Tablet");
  });

  it("an opened strip: 7 tablets left shows just tablets", () => {
    expect(toMixedDisplay(7, ABC)).toBe("7 Tablet");
  });

  it("63 base = 1 Box + 3 Tablet (no strip)", () => {
    expect(toMixedDisplay(63, ABC)).toBe("1 Box + 3 Tablet");
  });

  it("zero shows base unit with 0", () => {
    expect(toMixedDisplay(0, ABC)).toBe("0 Tablet");
    expect(toMixed(0, ABC)).toEqual([{ level: 0, name: "Tablet", count: 0 }]);
  });

  it("two-level item (Strip/Tablet only)", () => {
    const two: UnitDef[] = [
      { level: 0, name: "Piece", factorToBase: 1 },
      { level: 1, name: "Card", factorToBase: 4 },
    ];
    expect(toMixedDisplay(9, two)).toBe("2 Card + 1 Piece");
  });
});

describe("units — factorsFromRatios", () => {
  it("builds absolute factors from per-step ratios", () => {
    expect(factorsFromRatios([10, 6])).toEqual([1, 10, 60]);
    expect(factorsFromRatios([])).toEqual([1]);
  });
});

describe("units — validateHierarchy", () => {
  it("accepts a valid hierarchy", () => {
    expect(validateHierarchy(ABC)).toBeNull();
  });
  it("rejects base factor != 1", () => {
    expect(
      validateHierarchy([{ level: 0, name: "Tab", factorToBase: 2 }]),
    ).toMatch(/base unit/i);
  });
  it("rejects non-increasing factors", () => {
    expect(
      validateHierarchy([
        { level: 0, name: "Tab", factorToBase: 1 },
        { level: 1, name: "Strip", factorToBase: 1 },
      ]),
    ).toMatch(/more base units/i);
  });
  it("rejects non-multiple factors", () => {
    expect(
      validateHierarchy([
        { level: 0, name: "Tab", factorToBase: 1 },
        { level: 1, name: "Strip", factorToBase: 7 },
        { level: 2, name: "Box", factorToBase: 10 },
      ]),
    ).toMatch(/whole multiple/i);
  });
  it("rejects level gaps", () => {
    expect(
      validateHierarchy([
        { level: 0, name: "Tab", factorToBase: 1 },
        { level: 2, name: "Box", factorToBase: 60 },
      ]),
    ).toMatch(/no gaps/i);
  });
});
