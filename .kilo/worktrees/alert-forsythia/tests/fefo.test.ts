import { describe, it, expect } from "vitest";
import { allocate, type FefoBatch } from "@/lib/fefo";

const TODAY = "2026-07-14";

// b1 expires soonest, b2 later, b3 latest
const batches: FefoBatch[] = [
  { id: "b2", expiryDateAd: "2026-12-01", remainingBaseQty: 40 },
  { id: "b1", expiryDateAd: "2026-09-01", remainingBaseQty: 25 },
  { id: "b3", expiryDateAd: "2027-03-01", remainingBaseQty: 100 },
];

describe("fefo — nearest expiry first", () => {
  it("takes from the soonest-expiring batch first", () => {
    const r = allocate(10, batches, TODAY);
    expect(r.allocations).toEqual([{ batchId: "b1", baseQty: 10 }]);
    expect(r.shortfallBaseQty).toBe(0);
  });

  it("spills into the next batch when the first is exhausted", () => {
    // need 30: 25 from b1, 5 from b2
    const r = allocate(30, batches, TODAY);
    expect(r.allocations).toEqual([
      { batchId: "b1", baseQty: 25 },
      { batchId: "b2", baseQty: 5 },
    ]);
    expect(r.shortfallBaseQty).toBe(0);
  });

  it("reports a shortfall when stock is insufficient", () => {
    const r = allocate(1000, batches, TODAY);
    const total = r.allocations.reduce((s, a) => s + a.baseQty, 0);
    expect(total).toBe(165); // 25 + 40 + 100
    expect(r.shortfallBaseQty).toBe(835);
  });
});

describe("fefo — expired stock is unsellable (no bypass)", () => {
  it("excludes expired batches entirely", () => {
    const withExpired: FefoBatch[] = [
      { id: "old", expiryDateAd: "2026-01-01", remainingBaseQty: 50 }, // expired
      { id: "good", expiryDateAd: "2026-10-01", remainingBaseQty: 20 },
    ];
    const r = allocate(60, withExpired, TODAY);
    // only the 20 from the good batch can be used
    expect(r.allocations).toEqual([{ batchId: "good", baseQty: 20 }]);
    expect(r.shortfallBaseQty).toBe(40);
  });

  it("a batch expiring exactly today is still sellable", () => {
    const r = allocate(5, [{ id: "t", expiryDateAd: TODAY, remainingBaseQty: 10 }], TODAY);
    expect(r.allocations).toEqual([{ batchId: "t", baseQty: 5 }]);
  });
});

describe("fefo — manual override", () => {
  it("consumes the chosen batch first, then FEFO for the rest", () => {
    // override b3 (freshest); need 120 -> 100 from b3, then FEFO: 25 b1, ... wait needs 20 more
    const r = allocate(110, batches, TODAY, { overrideBatchId: "b3" });
    expect(r.allocations[0]).toEqual({ batchId: "b3", baseQty: 100 });
    // remaining 10 from the nearest-expiry batch b1
    expect(r.allocations[1]).toEqual({ batchId: "b1", baseQty: 10 });
    expect(r.shortfallBaseQty).toBe(0);
  });

  it("ignores an override that points to an expired/absent batch", () => {
    const r = allocate(10, batches, TODAY, { overrideBatchId: "nope" });
    expect(r.allocations).toEqual([{ batchId: "b1", baseQty: 10 }]);
  });
});
