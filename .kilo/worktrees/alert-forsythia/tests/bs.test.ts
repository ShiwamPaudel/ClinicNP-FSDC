import { describe, it, expect } from "vitest";
import {
  toBS,
  toAD,
  adToIso,
  bsToDbText,
  bsFromDbText,
  formatBS,
  fiscalYearOf,
  fiscalYearAdRange,
  bsMonthRange,
  bsDayOfWeek,
  type BSDate,
  fiscalYearFromLabel,
  nextFiscalYear,
} from "@/lib/bs";

const SHRAWAN1_2083: BSDate = { year: 2083, month: 4, day: 1 };
const BAISHAKH1_2083: BSDate = { year: 2083, month: 1, day: 1 };
const ASHADH30_2083: BSDate = { year: 2083, month: 3, day: 30 };

describe("bs — AD/BS conversion (single import point)", () => {
  it("AD 2026-07-14 converts to Ashadh 30, 2083", () => {
    const bs = toBS(new Date(2026, 6, 14));
    expect(bs).toEqual(ASHADH30_2083);
  });

  it("Shrawan 1, 2083 converts to AD 2026-07-17", () => {
    expect(adToIso(toAD(SHRAWAN1_2083))).toBe("2026-07-17");
  });

  it("Baishakh 1, 2083 (Nepali new year) converts to AD 2026-04-14", () => {
    expect(adToIso(toAD(BAISHAKH1_2083))).toBe("2026-04-14");
  });

  it("roundtrips BS -> AD -> BS across fiscal-year edges", () => {
    const samples: BSDate[] = [
      BAISHAKH1_2083,
      SHRAWAN1_2083,
      { year: 2082, month: 3, day: 31 }, // an Ashadh end
      { year: 2083, month: 12, day: 30 }, // Chaitra end
    ];
    for (const bs of samples) {
      expect(toBS(toAD(bs))).toEqual(bs);
    }
  });
});

describe("bs — denormalized DB text", () => {
  it("bsToDbText is YYYY-MM-DD, 1-indexed zero-padded month", () => {
    expect(bsToDbText(SHRAWAN1_2083)).toBe("2083-04-01");
  });
  it("bsFromDbText parses back", () => {
    expect(bsFromDbText("2083-04-01")).toEqual(SHRAWAN1_2083);
  });
});

describe("bs — formatting", () => {
  it("short form defaults to English digits", () => {
    expect(formatBS(SHRAWAN1_2083)).toBe("2083-04-01");
  });
  it("long form with transliterated month", () => {
    expect(formatBS(SHRAWAN1_2083, { form: "long", monthScript: "en" })).toBe(
      "1 Shrawan 2083",
    );
  });
  it("Nepali numerals when lang=np", () => {
    expect(formatBS(SHRAWAN1_2083, { lang: "np" })).toBe("२०८३-०४-०१");
  });
});

describe("bs — fiscal year (Shrawan 1 -> Ashadh end)", () => {
  it("Shrawan onwards belongs to {year}/{year+1}", () => {
    expect(fiscalYearOf(SHRAWAN1_2083).label).toBe("2083/84");
  });
  it("Baishakh..Ashadh belongs to {year-1}/{year}", () => {
    expect(fiscalYearOf(ASHADH30_2083).label).toBe("2082/83");
    expect(fiscalYearOf(BAISHAKH1_2083).label).toBe("2082/83");
  });
  it("fiscal AD range starts Shrawan 1 and ends in Ashadh of end year", () => {
    const fy = fiscalYearOf(SHRAWAN1_2083);
    const { startAd, endAd } = fiscalYearAdRange(fy);
    expect(adToIso(startAd)).toBe("2026-07-17");
    const endBs = toBS(endAd);
    expect(endBs.year).toBe(2084);
    expect(endBs.month).toBe(3); // Ashadh
    // end is exactly one day before next fiscal year's Shrawan 1
    const nextShrawan = toAD({ year: 2084, month: 4, day: 1 });
    const dayAfterEnd = new Date(endAd);
    dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
    expect(adToIso(dayAfterEnd)).toBe(adToIso(nextShrawan));
  });
});

describe("bs — month range", () => {
  it("Ashadh 2083 spans day 1 to its true last day", () => {
    const { startAd, endBs } = bsMonthRange(2083, 3);
    expect(toBS(startAd)).toEqual({ year: 2083, month: 3, day: 1 });
    expect(endBs.year).toBe(2083);
    expect(endBs.month).toBe(3);
    expect(endBs.day).toBeGreaterThanOrEqual(31); // Ashadh 2083 has 32 days
  });
});

describe("bs — weekday", () => {
  it("returns 0..6 (Saturday = 6, the Nepali weekend)", () => {
    const dow = bsDayOfWeek(SHRAWAN1_2083);
    expect(dow).toBeGreaterThanOrEqual(0);
    expect(dow).toBeLessThanOrEqual(6);
  });
});

describe("fiscal year arithmetic", () => {
  it("rebuilds a fiscal year from its label", () => {
    const fy = fiscalYearFromLabel("2083/84");
    expect(fy.startYear).toBe(2083);
    expect(fy.endYear).toBe(2084);
    expect(fy.label).toBe("2083/84");
  });

  it("moves to the next fiscal year", () => {
    expect(nextFiscalYear(fiscalYearFromLabel("2083/84")).label).toBe("2084/85");
    expect(nextFiscalYear(fiscalYearFromLabel("2099/00")).label).toBe("2100/01");
  });

  it("round-trips label -> next -> label", () => {
    let fy = fiscalYearFromLabel("2080/81");
    for (let i = 0; i < 5; i++) fy = nextFiscalYear(fy);
    expect(fy.label).toBe("2085/86");
  });
});
