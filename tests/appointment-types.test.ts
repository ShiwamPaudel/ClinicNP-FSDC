/**
 * appointment-types — the clock arithmetic behind a booked consultation.
 *
 * The one that matters is `overlaps`. Get it wrong in one direction and the
 * clinic double-books a doctor; get it wrong in the other and it refuses to
 * book two patients back to back, which is how a clinic actually runs.
 */
import { describe, it, expect } from "vitest";
import {
  formatTime,
  minutesOf,
  hhmmOf,
  isValidTime,
  overlaps,
  describeDuration,
  slotChoices,
} from "@/lib/appointment-types";

describe("formatTime", () => {
  it("reads a wall clock, not a 24-hour one", () => {
    expect(formatTime("14:30")).toBe("2:30 PM");
    expect(formatTime("09:05")).toBe("9:05 AM");
  });

  it("gets both ends of the day right", () => {
    expect(formatTime("00:00")).toBe("12:00 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("23:59")).toBe("11:59 PM");
    expect(formatTime("12:30")).toBe("12:30 PM");
  });

  it("hands back nonsense unchanged rather than inventing a time", () => {
    expect(formatTime("")).toBe("");
    expect(formatTime("half two")).toBe("half two");
  });
});

describe("minutesOf / hhmmOf", () => {
  it("round-trips", () => {
    for (const t of ["00:00", "07:15", "13:05", "23:45"]) {
      expect(hhmmOf(minutesOf(t))).toBe(t);
    }
  });

  it("says -1 rather than 0 for something that is not a time", () => {
    expect(minutesOf("nope")).toBe(-1);
  });
});

describe("isValidTime", () => {
  it("accepts a padded 24-hour time and nothing else", () => {
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("12:60")).toBe(false);
    expect(isValidTime("9:30")).toBe(false);
    expect(isValidTime("")).toBe(false);
  });
});

describe("overlaps", () => {
  const at = (timeHhmm: string, durationMin: number) => ({ timeHhmm, durationMin });

  it("is false for two consecutive patients", () => {
    // 2:00 for fifteen minutes, then 2:15. That is a clinic running well.
    expect(overlaps(at("14:00", 15), at("14:15", 15))).toBe(false);
    expect(overlaps(at("14:15", 15), at("14:00", 15))).toBe(false);
  });

  it("is true when one runs into the next", () => {
    expect(overlaps(at("14:00", 20), at("14:15", 15))).toBe(true);
    expect(overlaps(at("14:15", 15), at("14:00", 20))).toBe(true);
  });

  it("is true for the same time", () => {
    expect(overlaps(at("10:00", 15), at("10:00", 15))).toBe(true);
  });

  it("is true when one sits entirely inside another", () => {
    expect(overlaps(at("10:00", 60), at("10:20", 10))).toBe(true);
  });

  it("is false for two different parts of the day", () => {
    expect(overlaps(at("09:00", 30), at("16:00", 30))).toBe(false);
  });

  it("refuses to guess when a time is not a time", () => {
    expect(overlaps(at("nope", 15), at("10:00", 15))).toBe(false);
  });
});

describe("describeDuration", () => {
  it("says it in words a person would use", () => {
    expect(describeDuration(15)).toBe("15 minutes");
    expect(describeDuration(60)).toBe("1 hour");
    expect(describeDuration(90)).toBe("1 hour 30 minutes");
    expect(describeDuration(120)).toBe("2 hours");
  });
});

describe("slotChoices", () => {
  it("runs from seven in the morning to nine at night, every quarter hour", () => {
    const slots = slotChoices();
    expect(slots[0]).toBe("07:00");
    expect(slots[slots.length - 1]).toBe("21:00");
    expect(slots).toContain("13:45");
    expect(new Set(slots).size).toBe(slots.length);
  });
});
