/**
 * The date box's two faces (D-137). Whatever calendar a person picks from,
 * the box must emit the BS text for exactly the day they touched — a pick one
 * day off would put a wrong expiry on a batch without anybody noticing.
 */
import { describe, it, expect } from "vitest";
import {
  canStep,
  clampView,
  formatInCalendar,
  maskTypedDate,
  monthGrid,
  numericInCalendar,
  parseBsValue,
  parseTypedDate,
  calendarOfTypedYear,
  BS_TYPED_YEAR_FROM,
  stepView,
  supportedAdRange,
  switchCalendar,
  viewContaining,
  type MonthView,
} from "@/lib/calendar-view";
import { adToIso, bsDayOfWeek, bsFromDbText, bsMonthRange, toAD } from "@/lib/bs";

describe("picking from the English grid", () => {
  it("emits the BS text of the very day touched, for every day from 2020 to the end of the range", () => {
    const { lastAd } = supportedAdRange();
    let checked = 0;
    for (let view: MonthView = { calendar: "ad", year: 2020, month: 1 }; ; ) {
      for (const d of monthGrid(view).days) {
        if (d.disabled) continue;
        const back = toAD(bsFromDbText(d.bsText));
        expect(adToIso(back)).toBe(
          `${view.year}-${String(view.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`,
        );
        checked++;
      }
      if (!canStep(view, 1)) break;
      view = stepView(view, 1);
    }
    // 2020-01-01 through the last supported day, with nothing skipped.
    const expected =
      Math.round((lastAd.getTime() - new Date(2020, 0, 1).getTime()) / 86_400_000) + 1;
    expect(checked).toBe(expected);
  });

  it("puts each day under its own weekday", () => {
    const g = monthGrid({ calendar: "ad", year: 2026, month: 9 });
    expect(g.leadingBlanks).toBe(new Date(2026, 8, 1).getDay());
    for (const d of g.days) {
      expect(d.weekday).toBe(new Date(2026, 8, d.day).getDay());
    }
    expect(g.days).toHaveLength(30);
  });

  it("names the Nepali months the English month runs across", () => {
    // 1 September 2026 is 16 Bhadra 2083; 30 September is 14 Ashwin.
    expect(monthGrid({ calendar: "ad", year: 2026, month: 9 }).subtitle).toBe(
      "Bhadra – Ashwin 2083",
    );
    // April crosses the Nepali new year.
    expect(monthGrid({ calendar: "ad", year: 2026, month: 4 }).subtitle).toBe(
      "Chaitra 2082 – Baishakh 2083",
    );
  });
});

describe("the Nepali grid", () => {
  it("is laid out as it always was", () => {
    const g = monthGrid({ calendar: "bs", year: 2083, month: 6 });
    const { endBs, startAd } = bsMonthRange(2083, 6);
    expect(g.days).toHaveLength(endBs.day);
    expect(g.leadingBlanks).toBe(bsDayOfWeek({ year: 2083, month: 6, day: 1 }));
    expect(g.title).toBe("आश्विन 2083");
    expect(g.subtitle).toBe(`Ashwin · ${adToIso(startAd)}`);
    expect(g.days[5]!.bsText).toBe("2083-06-06");
  });
});

describe("switching calendars inside the box", () => {
  it("lands on the month holding the chosen date", () => {
    // 6 Ashwin 2083 is 22 September 2026.
    const bsView: MonthView = { calendar: "bs", year: 2083, month: 6 };
    expect(switchCalendar(bsView, "2083-06-06")).toEqual({
      calendar: "ad",
      year: 2026,
      month: 9,
    });
    const adView: MonthView = { calendar: "ad", year: 2026, month: 9 };
    expect(switchCalendar(adView, "2083-06-06")).toEqual({
      calendar: "bs",
      year: 2083,
      month: 6,
    });
  });

  it("with nothing chosen, keeps the place you were looking at", () => {
    // Ashwin 2083 begins on 17 September 2026.
    expect(switchCalendar({ calendar: "bs", year: 2083, month: 6 }, "")).toEqual({
      calendar: "ad",
      year: 2026,
      month: 9,
    });
    // 1 September 2026 is in Bhadra.
    expect(switchCalendar({ calendar: "ad", year: 2026, month: 9 }, "")).toEqual({
      calendar: "bs",
      year: 2083,
      month: 5,
    });
  });

  it("opens either calendar on the chosen date's month", () => {
    expect(viewContaining("bs", "2083-06-06")).toEqual({
      calendar: "bs",
      year: 2083,
      month: 6,
    });
    expect(viewContaining("ad", "2083-06-06")).toEqual({
      calendar: "ad",
      year: 2026,
      month: 9,
    });
  });
});

describe("the edges of what the converter can do", () => {
  it("stops at the last month it can lay out instead of failing", () => {
    const lastBs = clampView({ calendar: "bs", year: 2095, month: 1 });
    expect(lastBs).toEqual({ calendar: "bs", year: 2090, month: 11 });
    expect(canStep(lastBs, 1)).toBe(false);
    expect(stepView(lastBs, 12)).toEqual(lastBs);
    expect(() => monthGrid(lastBs)).not.toThrow();

    const { lastAd } = supportedAdRange();
    const lastAdView = clampView({ calendar: "ad", year: 2040, month: 1 });
    expect(lastAdView).toEqual({
      calendar: "ad",
      year: lastAd.getFullYear(),
      month: lastAd.getMonth() + 1,
    });
    expect(canStep(lastAdView, 1)).toBe(false);
    const after = monthGrid(lastAdView).days.filter((d) => d.day > lastAd.getDate());
    expect(after.every((d) => d.disabled && d.bsText === "")).toBe(true);
  });

  it("offers no day before the first one it knows", () => {
    const { firstAd } = supportedAdRange();
    const first = clampView({ calendar: "ad", year: 1900, month: 1 });
    expect(canStep(first, -1)).toBe(false);
    for (const d of monthGrid(first).days) {
      expect(d.disabled).toBe(d.day < firstAd.getDate());
    }
  });

  it("reaches ten years ahead, well past any expiry date", () => {
    expect(supportedAdRange().lastAd.getFullYear()).toBeGreaterThanOrEqual(2034);
  });
});

describe("writing a date out", () => {
  it("in either calendar", () => {
    expect(formatInCalendar("2083-06-06", "bs")).toBe("6 Ashwin 2083");
    expect(formatInCalendar("2083-06-06", "ad")).toBe("22 Sep 2026");
  });

  it("ignores values that are not dates", () => {
    expect(parseBsValue("")).toBeNull();
    expect(parseBsValue(undefined)).toBeNull();
    expect(parseBsValue("tomorrow")).toBeNull();
    expect(parseBsValue("2099-01-01")).toBeNull();
    expect(formatInCalendar("", "ad")).toBe("");
  });
});

/**
 * Typing a date instead of picking one. The danger here is the opposite of a
 * misplaced click: a box that accepts almost-a-date and quietly commits the
 * wrong day. Everything that is not unambiguously a date must return null and
 * leave whatever was already saved alone.
 */
describe("parseTypedDate", () => {
  it("reads a BS date typed in the Nepali calendar", () => {
    expect(parseTypedDate("2083-06-09")).toBe("2083-06-09");
  });

  it("accepts the separators and the short forms people actually type", () => {
    expect(parseTypedDate("2083/06/09")).toBe("2083-06-09");
    expect(parseTypedDate("2083.06.09")).toBe("2083-06-09");
    expect(parseTypedDate("2083-6-9")).toBe("2083-06-09");
    expect(parseTypedDate("  2083-06-09  ")).toBe("2083-06-09");
  });

  it("converts a date typed in the English calendar", () => {
    // The same day, written both ways.
    const bs = parseTypedDate("2026-09-25");
    expect(bs).not.toBeNull();
    expect(formatInCalendar(bs!, "ad")).toBe("25 Sep 2026");
  });

  it("round-trips against numericInCalendar in both calendars", () => {
    for (const value of ["2083-01-01", "2083-06-09", "2083-12-30"]) {
      for (const cal of ["bs", "ad"] as const) {
        expect(parseTypedDate(numericInCalendar(value, cal))).toBe(value);
      }
    }
  });

  it("refuses a day that month does not have", () => {
    // 31 February is not a date, and JS Date would silently roll it to March.
    expect(parseTypedDate("2026-02-31")).toBeNull();
    expect(parseTypedDate("2026-04-31")).toBeNull();
  });

  it("refuses half-typed and malformed text", () => {
    for (const bad of [
      "",
      "2083",
      "2083-0",
      "2083-06",
      "2083-06-",
      "20836-09",
      "83-06-09",
      "2083-13-01",
      "2083-06-40",
      "2083-00-09",
      "2083-06-00",
      "next week",
      "2083-06-09extra",
    ]) {
      expect(parseTypedDate(bad), bad).toBeNull();
    }
  });

  it("reads the calendar from the year, whatever the shop is set to", () => {
    // off a medicine pack, in English
    const pack = parseTypedDate("2028-01-31");
    expect(pack).not.toBeNull();
    expect(formatInCalendar(pack!, "ad")).toBe("31 Jan 2028");
    // off a Nepali supplier's bill, the same week as today
    expect(parseTypedDate("2083-06-13")).toBe("2083-06-13");
    expect(formatInCalendar("2083-06-13", "ad")).toBe("29 Sep 2026");
    // the owner's example is an English year, and 30 February is no date —
    // before this it was saved as 12 June 1968 on a Nepali-set shop
    expect(parseTypedDate("2025-02-30")).toBeNull();
  });

  it("splits the years where no real date could fall on the wrong side", () => {
    expect(calendarOfTypedYear(2059)).toBe("ad");
    expect(calendarOfTypedYear(2060)).toBe("bs");
    expect(calendarOfTypedYear(BS_TYPED_YEAR_FROM)).toBe("bs");
    // today, in both calendars, is on the right side of the line
    expect(calendarOfTypedYear(2026)).toBe("ad");
    expect(calendarOfTypedYear(2083)).toBe("bs");
  });

  it("refuses a year outside the conversion table", () => {
    expect(parseTypedDate("2200-01-01")).toBeNull();
    expect(parseTypedDate("1800-01-01")).toBeNull();
  });

  it("numericInCalendar gives back plain digits, and nothing for a non-date", () => {
    expect(numericInCalendar("2083-06-09", "bs")).toBe("2083-06-09");
    expect(numericInCalendar("2083-06-09", "ad")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(numericInCalendar("", "bs")).toBe("");
    expect(numericInCalendar("not-a-date", "ad")).toBe("");
  });
});

/**
 * The dashes put in while typing. Each case is replayed one keystroke at a
 * time, the way the box actually receives it, because a mask that is right on
 * a pasted string can still trap somebody typing into it.
 */
describe("maskTypedDate", () => {
  /** Feed characters in one by one, as keystrokes arrive. */
  function type(keys: string): string {
    let box = "";
    for (const k of keys) box = maskTypedDate(box + k, box);
    return box;
  }
  /** Press backspace n times from what is in the box. */
  function backspace(start: string, n: number): string {
    let box = start;
    for (let i = 0; i < n; i++) box = maskTypedDate(box.slice(0, -1), box);
    return box;
  }

  it("puts the dashes in while digits are typed", () => {
    expect(type("2083")).toBe("2083-");
    expect(type("208306")).toBe("2083-06-");
    expect(type("20830609")).toBe("2083-06-09");
    // the owner's example, typed straight through
    expect(type("20250230")).toBe("2025-02-30");
  });

  it("formats a pasted run of digits in one go", () => {
    expect(maskTypedDate("20830609", "")).toBe("2083-06-09");
  });

  it("stops at a full date", () => {
    expect(type("2083060912")).toBe("2083-06-09");
  });

  it("accepts the separators people type out of habit", () => {
    expect(type("2083-06-09")).toBe("2083-06-09");
    expect(type("2083/06/09")).toBe("2083-06-09");
    expect(maskTypedDate("2083.06.09", "")).toBe("2083-06-09");
  });

  it("pads a one-digit month or day when a separator closes it", () => {
    expect(type("2083-6-")).toBe("2083-06-");
    expect(type("2083-6-9")).toBe("2083-06-9");
    // and the short form still parses to the right day
    expect(parseTypedDate(type("2083-6-9"))).toBe("2083-06-09");
  });

  it("lets backspace remove a dash instead of putting it back", () => {
    expect(backspace("2083-", 1)).toBe("2083");
    expect(backspace("2083-06-", 1)).toBe("2083-06");
    // A dash never costs a keystroke of its own: removing the day's last
    // digit takes the dash before it too, so two presses reach the month.
    expect(backspace("2083-06-09", 1)).toBe("2083-06-0");
    expect(backspace("2083-06-09", 2)).toBe("2083-06");
    expect(backspace("2083-06-09", 3)).toBe("2083-0");
    // and typing forward again from there puts the dash back
    expect(maskTypedDate("2083-061", "2083-06")).toBe("2083-06-1");
    expect(backspace("2083-06-09", 10)).toBe("");
  });

  it("ignores letters and anything that is not part of a date", () => {
    expect(maskTypedDate("20a83b0609", "")).toBe("2083-06-09");
    expect(maskTypedDate("abc", "")).toBe("");
  });

  it("only arranges characters — it does not decide what is a real date", () => {
    // 31 February is shaped like a date; parseTypedDate is what refuses it.
    expect(maskTypedDate("20260231", "")).toBe("2026-02-31");
    expect(parseTypedDate("2026-02-31")).toBeNull();
  });
});
