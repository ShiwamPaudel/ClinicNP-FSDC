import { describe, it, expect } from "vitest";
import {
  VAT_RATE,
  toPaisa,
  paisaToRupees,
  vatOf,
  lineAmount,
  percentDiscount,
  roundToRupee,
  change,
  formatPaisa,
} from "@/lib/money";

describe("money — paisa is integer, no float drift", () => {
  it("VAT_RATE is the single 13% constant", () => {
    expect(VAT_RATE).toBe(0.13);
  });

  it("toPaisa rounds to nearest paisa", () => {
    expect(toPaisa(12.34)).toBe(1234);
    expect(toPaisa(0.1)).toBe(10);
    expect(toPaisa(0.005)).toBe(1); // 0.5 paisa rounds up
    expect(paisaToRupees(1234)).toBe(12.34);
  });

  it("vatOf uses integer math (amount*13/100 rounded)", () => {
    expect(vatOf(10000)).toBe(1300); // rू100 -> rू13
    expect(vatOf(9999)).toBe(1300); // 1299.87 -> 1300
    expect(vatOf(0)).toBe(0);
    // classic float trap: 0.1 style — ensure no drift
    expect(vatOf(1150)).toBe(150); // 149.5 -> 150
  });

  it("lineAmount = qty*rate - discount, never negative", () => {
    expect(lineAmount(3, 500)).toBe(1500);
    expect(lineAmount(3, 500, 200)).toBe(1300);
    expect(lineAmount(1, 100, 999)).toBe(0);
  });

  it("percentDiscount is integer paisa", () => {
    expect(percentDiscount(10000, 10)).toBe(1000);
    expect(percentDiscount(9999, 10)).toBe(1000); // 999.9 -> 1000
  });

  it("roundToRupee snaps to nearest whole rupee", () => {
    expect(roundToRupee(1234)).toBe(1200);
    expect(roundToRupee(1250)).toBe(1300);
    expect(roundToRupee(1299)).toBe(1300);
  });

  it("change never goes negative", () => {
    expect(change(20000, 13450)).toBe(6550);
    expect(change(10000, 13450)).toBe(0);
  });

  it("formatPaisa renders रू with 2 decimals and grouping", () => {
    expect(formatPaisa(123450)).toBe("रू 1,234.50");
    expect(formatPaisa(0)).toBe("रू 0.00");
    expect(formatPaisa(5)).toBe("रू 0.05");
    expect(formatPaisa(-500)).toBe("रू -5.00");
    expect(formatPaisa(123450, false)).toBe("1,234.50");
  });
});
