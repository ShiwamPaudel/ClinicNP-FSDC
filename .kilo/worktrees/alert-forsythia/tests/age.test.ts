import { describe, it, expect } from "vitest";
import {
  displayAge,
  enteredAgeLabel,
  isSaneAge,
  type AgeEntry,
} from "@/lib/age";

const entered = (
  value: number,
  unit: "y" | "m" | "d",
  asOfAd: string,
): AgeEntry => ({ value, unit, asOfAd, dobAd: null });

const born = (dobAd: string): AgeEntry => ({
  value: null,
  unit: null,
  asOfAd: null,
  dobAd,
});

describe("displayAge — date of birth is exact and always current", () => {
  it("computes whole years", () => {
    const a = displayAge(born("1992-08-29"), "2026-08-29");
    expect(a.years).toBe(34);
    expect(a.short).toBe("34 Y");
    expect(a.long).toBe("34 years");
    expect(a.exact).toBe(true);
  });

  it("does not round a birthday up before it arrives", () => {
    const a = displayAge(born("1992-08-30"), "2026-08-29");
    expect(a.years).toBe(33);
  });

  it("turns the year over on the birthday itself", () => {
    expect(displayAge(born("1992-08-29"), "2026-08-28").years).toBe(33);
    expect(displayAge(born("1992-08-29"), "2026-08-29").years).toBe(34);
  });

  it("shows months for an infant", () => {
    const a = displayAge(born("2026-05-29"), "2026-08-29");
    expect(a.short).toBe("3 M");
    expect(a.years).toBe(0);
  });

  it("shows days for a newborn", () => {
    const a = displayAge(born("2026-08-17"), "2026-08-29");
    expect(a.short).toBe("12 D");
    expect(a.long).toBe("12 days");
  });

  it("says singular where it should", () => {
    expect(displayAge(born("2025-08-29"), "2026-08-29").long).toBe("1 year");
    expect(displayAge(born("2026-07-29"), "2026-08-29").long).toBe("1 month");
    expect(displayAge(born("2026-08-28"), "2026-08-29").long).toBe("1 day");
  });
});

describe("displayAge — a stored age is rolled forward, never shown stale", () => {
  it("the acceptance case: 3 months a year ago reads as about 1 year 3 months", () => {
    const a = displayAge(entered(3, "m", "2025-08-29"), "2026-08-29");
    expect(a.short).toBe("1 Y 3 M");
    expect(a.exact).toBe(false);
    expect(a.asOfAd).toBe("2025-08-29");
  });

  it("keeps the age unchanged on the day it was taken", () => {
    const a = displayAge(entered(34, "y", "2026-08-29"), "2026-08-29");
    expect(a.short).toBe("34 Y");
    expect(a.years).toBe(34);
  });

  it("ages a year forward a year later", () => {
    const a = displayAge(entered(34, "y", "2025-08-29"), "2026-08-29");
    expect(a.years).toBe(35);
  });

  it("carries an entered age in days forward into months", () => {
    const a = displayAge(entered(10, "d", "2026-06-29"), "2026-08-29");
    expect(a.years).toBe(0);
    expect(a.short).toMatch(/^2 M/);
  });

  it("always exposes the as-on date so the display can be qualified", () => {
    const a = displayAge(entered(5, "y", "2024-01-15"), "2026-08-29");
    expect(a.asOfAd).toBe("2024-01-15");
    expect(a.exact).toBe(false);
  });

  it("handles a month-end boundary without inventing a month", () => {
    // 31 Jan + 1 month is not 31 Feb; the age must not jump early
    const a = displayAge(entered(0, "m", "2026-01-31"), "2026-02-28");
    expect(a.years).toBe(0);
    expect(a.short).toMatch(/D$|^0 M/);
  });

  it("crosses a leap day without drifting", () => {
    const a = displayAge(entered(1, "y", "2024-02-29"), "2028-02-29");
    expect(a.years).toBe(5);
  });
});

describe("displayAge — nothing recorded", () => {
  it("says so plainly instead of guessing", () => {
    const a = displayAge(
      { value: null, unit: null, asOfAd: null, dobAd: null },
      "2026-08-29",
    );
    expect(a.short).toBe("—");
    expect(a.long).toBe("Not recorded");
    expect(a.exact).toBe(false);
  });

  it("needs the as-on date before it will roll an age forward", () => {
    const a = displayAge(
      { value: 30, unit: "y", asOfAd: null, dobAd: null },
      "2026-08-29",
    );
    expect(a.short).toBe("—");
  });
});

describe("enteredAgeLabel", () => {
  it("echoes the age as it was typed", () => {
    expect(enteredAgeLabel(entered(3, "m", "2026-01-01"))).toBe("3 months");
    expect(enteredAgeLabel(entered(1, "y", "2026-01-01"))).toBe("1 year");
    expect(enteredAgeLabel(born("1992-01-01"))).toBe("");
  });
});

describe("isSaneAge — a typo guard, not a clinical judgement", () => {
  it("accepts ordinary ages", () => {
    expect(isSaneAge(34, "y")).toBe(true);
    expect(isSaneAge(0, "d")).toBe(true);
    expect(isSaneAge(11, "m")).toBe(true);
  });

  it("rejects impossible input", () => {
    expect(isSaneAge(-1, "y")).toBe(false);
    expect(isSaneAge(200, "y")).toBe(false);
    expect(isSaneAge(1.5, "y")).toBe(false);
    expect(isSaneAge(Number.NaN, "y")).toBe(false);
  });
});
