import { describe, it, expect } from "vitest";
import {
  resolveFollowup,
  daysBetweenAd,
  doctorSharePaisa,
  describeShare,
  serviceLineAmountPaisa,
} from "@/lib/clinic-calc";

const consult = { ratePaisa: 50_000, followupDays: 7, followupRatePaisa: 0 };
const reduced = { ratePaisa: 50_000, followupDays: 15, followupRatePaisa: 20_000 };
const noRule = { ratePaisa: 50_000, followupDays: 0, followupRatePaisa: 0 };

describe("daysBetweenAd", () => {
  it("counts whole days", () => {
    expect(daysBetweenAd("2026-08-01", "2026-08-08")).toBe(7);
    expect(daysBetweenAd("2026-08-01", "2026-08-01")).toBe(0);
  });

  it("crosses a month and a year boundary", () => {
    expect(daysBetweenAd("2026-08-28", "2026-09-02")).toBe(5);
    expect(daysBetweenAd("2025-12-30", "2026-01-02")).toBe(3);
  });

  it("crosses a leap day", () => {
    expect(daysBetweenAd("2028-02-27", "2028-03-01")).toBe(3);
  });

  it("is negative when the dates are the wrong way round", () => {
    expect(daysBetweenAd("2026-08-08", "2026-08-01")).toBe(-7);
  });
});

describe("resolveFollowup — the boundaries", () => {
  it("charges the full rate when the service has no rule", () => {
    const r = resolveFollowup(noRule, "2026-08-05", "2026-08-04");
    expect(r.ratePaisa).toBe(50_000);
    expect(r.applied).toBe(false);
    expect(r.note).toBe("");
  });

  it("charges the full rate when there is no previous consultation", () => {
    const r = resolveFollowup(consult, "2026-08-05", null);
    expect(r.ratePaisa).toBe(50_000);
    expect(r.applied).toBe(false);
  });

  it("day 0 — same day — is inside the window", () => {
    const r = resolveFollowup(consult, "2026-08-01", "2026-08-01");
    expect(r.applied).toBe(true);
    expect(r.ratePaisa).toBe(0);
    expect(r.daysSince).toBe(0);
  });

  it("day N — the last day of the window — is inside it", () => {
    const r = resolveFollowup(consult, "2026-08-08", "2026-08-01");
    expect(r.daysSince).toBe(7);
    expect(r.applied).toBe(true);
    expect(r.ratePaisa).toBe(0);
  });

  it("day N+1 — one day past — is outside it", () => {
    const r = resolveFollowup(consult, "2026-08-09", "2026-08-01");
    expect(r.daysSince).toBe(8);
    expect(r.applied).toBe(false);
    expect(r.ratePaisa).toBe(50_000);
    expect(r.note).toBe("");
  });

  it("applies a reduced rate rather than free when one is configured", () => {
    const r = resolveFollowup(reduced, "2026-08-10", "2026-08-01");
    expect(r.applied).toBe(true);
    expect(r.ratePaisa).toBe(20_000);
    expect(r.note).toContain("reduced rate");
  });

  it("says 'no charge' in words when the follow-up is free", () => {
    const r = resolveFollowup(consult, "2026-08-03", "2026-08-01");
    expect(r.note).toBe("Follow-up within 7 days — no charge.");
  });

  it("ignores a previous consultation dated in the future", () => {
    const r = resolveFollowup(consult, "2026-08-01", "2026-08-05");
    expect(r.applied).toBe(false);
    expect(r.ratePaisa).toBe(50_000);
  });

  // The acceptance case from Phases.md, spelled out.
  it("4 days later inside a 7-day window is free; 9 days later is full rate", () => {
    expect(resolveFollowup(consult, "2026-08-05", "2026-08-01").ratePaisa).toBe(0);
    expect(resolveFollowup(consult, "2026-08-10", "2026-08-01").ratePaisa).toBe(50_000);
  });
});

describe("serviceLineAmountPaisa", () => {
  it("multiplies and subtracts the discount", () => {
    expect(
      serviceLineAmountPaisa({ qty: 2, ratePaisa: 30_000, discountPaisa: 5_000 }),
    ).toBe(55_000);
  });

  it("never goes negative", () => {
    expect(
      serviceLineAmountPaisa({ qty: 1, ratePaisa: 1_000, discountPaisa: 9_999 }),
    ).toBe(0);
  });
});

describe("doctorSharePaisa — every basis", () => {
  const amount = 50_000; // Rs 500.00

  it("none pays nothing, on any line", () => {
    expect(doctorSharePaisa({ basis: "none", value: 5_000 }, amount, 1, true)).toBe(0);
    expect(doctorSharePaisa({ basis: "none", value: 5_000 }, amount, 1, false)).toBe(0);
  });

  it("pct_consult pays on a consultation only", () => {
    const share = { basis: "pct_consult" as const, value: 4_000 }; // 40%
    expect(doctorSharePaisa(share, amount, 1, true)).toBe(20_000);
    expect(doctorSharePaisa(share, amount, 1, false)).toBe(0);
  });

  it("fixed_consult pays per consultation, multiplied by quantity", () => {
    const share = { basis: "fixed_consult" as const, value: 15_000 };
    expect(doctorSharePaisa(share, amount, 1, true)).toBe(15_000);
    expect(doctorSharePaisa(share, amount, 3, true)).toBe(45_000);
    expect(doctorSharePaisa(share, amount, 1, false)).toBe(0);
  });

  it("pct_services pays on any service line", () => {
    const share = { basis: "pct_services" as const, value: 1_500 }; // 15%
    expect(doctorSharePaisa(share, amount, 1, true)).toBe(7_500);
    expect(doctorSharePaisa(share, amount, 1, false)).toBe(7_500);
  });

  it("floors to whole paisa and keeps the remainder with the clinic", () => {
    // 333 paisa at 33.33% = 110.9889 paisa -> 110
    expect(doctorSharePaisa({ basis: "pct_services", value: 3_333 }, 333, 1, false)).toBe(110);
  });

  it("pays nothing on a free follow-up line", () => {
    expect(doctorSharePaisa({ basis: "pct_consult", value: 4_000 }, 0, 1, true)).toBe(0);
  });

  it("still pays a fixed amount on a free follow-up, because the doctor still saw them", () => {
    expect(doctorSharePaisa({ basis: "fixed_consult", value: 10_000 }, 0, 1, true)).toBe(10_000);
  });
});

describe("describeShare", () => {
  it("reads as a sentence a person would say", () => {
    expect(describeShare({ basis: "none", value: 0 })).toBe("No share");
    expect(describeShare({ basis: "pct_consult", value: 4_000 })).toBe("40% of consultations");
    expect(describeShare({ basis: "pct_services", value: 1_250 })).toBe("12.50% of all services");
    expect(describeShare({ basis: "fixed_consult", value: 15_000 })).toBe("Rs 150.00 per consultation");
  });
});
