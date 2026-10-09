/**
 * Paying doctors their share (C-037): payouts clear the oldest unpaid shares
 * first, so every share reads Paid, Part paid or Unpaid and every payout knows
 * which bills it covered.
 */
import { describe, it, expect } from "vitest";
import { earnedAfterRefunds, tallyDoctorPay } from "@/lib/doctor-pay";

const shares = [
  { id: "a", earnedPaisa: 350_000 }, // a crown: 35% of Rs 10,000
  { id: "b", earnedPaisa: 50_000 },
  { id: "c", earnedPaisa: 100_000 },
];

describe("tallying payouts against shares", () => {
  it("nothing paid: every share unpaid, all of it owed", () => {
    const t = tallyDoctorPay(shares, []);
    expect([...t.lines.values()].map((l) => l.status)).toEqual(["unpaid", "unpaid", "unpaid"]);
    expect(t.owedPaisa).toBe(500_000);
  });

  it("clears the oldest first, and part-pays the one it stops in", () => {
    const t = tallyDoctorPay(shares, [{ id: "p1", amountPaisa: 375_000 }]);
    expect(t.lines.get("a")).toEqual({ paidPaisa: 350_000, status: "paid" });
    expect(t.lines.get("b")).toEqual({ paidPaisa: 25_000, status: "part" });
    expect(t.lines.get("c")!.status).toBe("unpaid");
    expect(t.payouts.get("p1")!.covers).toEqual([
      { lineId: "a", amountPaisa: 350_000 },
      { lineId: "b", amountPaisa: 25_000 },
    ]);
    expect(t.owedPaisa).toBe(125_000);
  });

  it("a second payout carries on where the first stopped", () => {
    const t = tallyDoctorPay(shares, [
      { id: "p1", amountPaisa: 375_000 },
      { id: "p2", amountPaisa: 125_000 },
    ]);
    expect(t.payouts.get("p2")!.covers).toEqual([
      { lineId: "b", amountPaisa: 25_000 },
      { lineId: "c", amountPaisa: 100_000 },
    ]);
    expect([...t.lines.values()].every((l) => l.status === "paid")).toBe(true);
    expect(t.owedPaisa).toBe(0);
  });

  it("more than is owed is kept as paid ahead", () => {
    const t = tallyDoctorPay(shares, [{ id: "p1", amountPaisa: 600_000 }]);
    expect(t.payouts.get("p1")!.aheadPaisa).toBe(100_000);
    expect(t.owedPaisa).toBe(-100_000);
  });

  it("a share of nothing is never on the list", () => {
    const t = tallyDoctorPay([{ id: "z", earnedPaisa: 0 }, ...shares], []);
    expect(t.lines.has("z")).toBe(false);
  });
});

describe("a share after a refund", () => {
  it("shrinks with what was given back, as the payouts report has it", () => {
    expect(earnedAfterRefunds(350_000, 1_000_000, 1_000_000)).toBe(350_000);
    expect(earnedAfterRefunds(350_000, 1_000_000, 500_000)).toBe(175_000);
    expect(earnedAfterRefunds(350_000, 1_000_000, 0)).toBe(0);
    expect(earnedAfterRefunds(100, 3, 1)).toBe(33);
  });
});
