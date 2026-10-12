import { describe, it, expect } from "vitest";
import { shareOut } from "@/lib/takings";

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe("shareOut — a bill's total over its lines", () => {
  it("leaves the lines alone when they already make the total", () => {
    expect(shareOut(300_000, [50_000, 250_000])).toEqual([50_000, 250_000]);
  });

  it("takes a bill discount off in proportion, to the paisa", () => {
    // Rs 500 off Rs 3,000: 1/6 of it on the consultation, 5/6 on the filling
    const out = shareOut(250_000, [50_000, 250_000]);
    expect(out).toEqual([41_667, 208_333]);
    expect(sum(out)).toBe(250_000);
  });

  it("puts VAT and rounding on in proportion", () => {
    const out = shareOut(113_000, [70_000, 30_000]);
    expect(sum(out)).toBe(113_000);
    expect(out).toEqual([79_100, 33_900]);
  });

  it("gives the odd paisa to the largest remainders, and always adds up", () => {
    const out = shareOut(99_999, [33_333, 33_333, 33_334, 1]);
    expect(sum(out)).toBe(99_999);
    for (let total = 0; total < 1_000; total += 37) {
      expect(sum(shareOut(total, [7, 11, 13, 0, 17]))).toBe(total);
    }
  });

  it("copes with a discount of the whole bill and with zero-rated lines", () => {
    expect(shareOut(0, [50_000, 25_000])).toEqual([0, 0]);
    expect(shareOut(500, [0, 0])).toEqual([500, 0]);
    expect(shareOut(0, [])).toEqual([]);
  });

  it("stays exact past 2^53 in the intermediate product", () => {
    const out = shareOut(1, [9_000_000_000, 9_000_000_000]);
    expect(sum(out)).toBe(1);
  });
});
