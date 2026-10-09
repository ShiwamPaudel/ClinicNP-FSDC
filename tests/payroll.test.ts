/**
 * A month's salary (C-037): SSF 11% from the staff member and 20% from the
 * clinic; 1% social security tax only for staff not on the fund; bonuses,
 * deductions and advances recovered; what is paid and what is left.
 */
import { describe, it, expect } from "vitest";
import { monthLabel, monthPay, rateFor, shiftMonth, isMonth } from "@/lib/payroll";

const rate = (salary: number, ssf = false, sst = true) => ({
  monthlySalaryPaisa: salary,
  ssfEnrolled: ssf,
  sstApplies: sst,
});

const none = { bonusesPaisa: [], deductionsPaisa: [], advanceRecoveredPaisa: 0, paidPaisa: 0 };

describe("one month's pay", () => {
  it("not on the fund: 1% tax on the gross", () => {
    const p = monthPay({ ...none, rate: rate(3_000_000), bonusesPaisa: [500_000] });
    expect(p.grossPaisa).toBe(3_500_000);
    expect(p.sstPaisa).toBe(35_000);
    expect(p.ssfStaffPaisa).toBe(0);
    expect(p.ssfEmployerPaisa).toBe(0);
    expect(p.netPaisa).toBe(3_465_000);
  });

  it("on the fund: 11% from the salary, 20% from the clinic, no 1% tax", () => {
    const p = monthPay({ ...none, rate: rate(3_000_000, true) });
    expect(p.ssfStaffPaisa).toBe(330_000);
    expect(p.ssfEmployerPaisa).toBe(600_000);
    expect(p.sstPaisa).toBe(0);
    expect(p.netPaisa).toBe(2_670_000);
  });

  it("the fund is worked out on the salary, not on a bonus", () => {
    const p = monthPay({ ...none, rate: rate(3_000_000, true), bonusesPaisa: [1_000_000] });
    expect(p.ssfStaffPaisa).toBe(330_000);
  });

  it("deductions, an advance recovered, and what is left after a part payment", () => {
    const p = monthPay({
      rate: rate(2_000_000, false, false),
      bonusesPaisa: [],
      deductionsPaisa: [100_000],
      advanceRecoveredPaisa: 500_000,
      paidPaisa: 1_000_000,
    });
    expect(p.netPaisa).toBe(1_400_000);
    expect(p.leftPaisa).toBe(400_000);
  });
});

describe("the rate a month is paid at", () => {
  const rates = [
    { fromMonthBs: "2083-04", monthlySalaryPaisa: 2_000_000, ssfEnrolled: false, sstApplies: true },
    { fromMonthBs: "2083-10", monthlySalaryPaisa: 2_500_000, ssfEnrolled: false, sstApplies: true },
  ];
  it("is the latest one that had started", () => {
    expect(rateFor(rates, "2083-03")).toBeNull();
    expect(rateFor(rates, "2083-04")!.monthlySalaryPaisa).toBe(2_000_000);
    expect(rateFor(rates, "2083-09")!.monthlySalaryPaisa).toBe(2_000_000);
    expect(rateFor(rates, "2083-10")!.monthlySalaryPaisa).toBe(2_500_000);
    expect(rateFor(rates, "2084-02")!.monthlySalaryPaisa).toBe(2_500_000);
  });
});

describe("months", () => {
  it("step across the year end and read in words", () => {
    expect(shiftMonth("2083-12", 1)).toBe("2084-01");
    expect(shiftMonth("2084-01", -1)).toBe("2083-12");
    expect(monthLabel("2083-06")).toBe("Ashwin 2083");
    expect(isMonth("2083-13")).toBe(false);
    expect(isMonth("2083-06")).toBe(true);
  });
});
