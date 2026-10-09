/**
 * A clinic with no pharmacy uses what it buys and sells none of it (C-035): a
 * purchase line has no batch, expiry or selling price, and nothing is counted.
 */
import { describe, it, expect } from "vitest";
import { buysForUse, hasExpiry, NO_EXPIRY_AD } from "@/lib/supplies";
import { adToIso } from "@/lib/bs";

describe("what a purchase is for", () => {
  it("is the clinic's own use when the pharmacy is off", () => {
    expect(buysForUse({ pharmacy: false })).toBe(true);
  });

  it("is stock for sale whenever the pharmacy is on", () => {
    expect(buysForUse({ pharmacy: true })).toBe(false);
  });
});

describe("the expiry stored on a line bought for use", () => {
  it("is never shown", () => {
    expect(hasExpiry(NO_EXPIRY_AD)).toBe(false);
    expect(hasExpiry("")).toBe(false);
    expect(hasExpiry(null)).toBe(false);
    expect(hasExpiry("2085-06-30")).toBe(true);
  });

  it("sorts after any real expiry, so it never reaches an expiry warning", () => {
    const farFuture = adToIso(new Date(2200, 0, 1));
    expect(NO_EXPIRY_AD > farFuture).toBe(true);
    expect(NO_EXPIRY_AD).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
