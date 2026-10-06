/**
 * The arithmetic of dues: what was paid at the counter, what is still owed,
 * how a payment clears several bills and how a return splits between the debt
 * and the drawer. Every screen that shows an amount owed gets it from here.
 */
import { describe, it, expect } from "vitest";
import {
  splitAtSale,
  balanceDue,
  splitReturn,
  allocateOldestFirst,
  groupByPerson,
  personKey,
  ageInDays,
  totalOwed,
  overpaymentError,
  type OwedBill,
} from "@/lib/dues";

describe("splitAtSale", () => {
  it("leaves a cash or QR bill owing nothing, whatever 'paid now' says", () => {
    expect(splitAtSale(50_000, "cash", 123, "qr")).toEqual({
      method: "cash",
      duePaisa: 0,
      paidNowMethod: null,
    });
    expect(splitAtSale(50_000, "qr", 0, "cash")).toEqual({
      method: "qr",
      duePaisa: 0,
      paidNowMethod: null,
    });
  });

  it("puts the whole total on dues when nothing is paid now", () => {
    expect(splitAtSale(50_000, "credit", 0, "cash")).toEqual({
      method: "credit",
      duePaisa: 50_000,
      paidNowMethod: null,
    });
  });

  it("owes the rest after a part payment, and remembers how the part was paid", () => {
    expect(splitAtSale(50_000, "credit", 20_000, "qr")).toEqual({
      method: "credit",
      duePaisa: 30_000,
      paidNowMethod: "qr",
    });
  });

  it("treats a bill paid in full after all as an ordinary paid bill", () => {
    expect(splitAtSale(50_000, "credit", 50_000, "qr")).toEqual({
      method: "qr",
      duePaisa: 0,
      paidNowMethod: null,
    });
    // more than the total (the counter's total was a little higher) is clamped
    expect(splitAtSale(50_000, "credit", 60_000, "cash").duePaisa).toBe(0);
  });

  it("never leaves a negative or fractional debt", () => {
    expect(splitAtSale(10_000, "credit", -500, "cash").duePaisa).toBe(10_000);
    expect(splitAtSale(10_000.7, "credit", 0.4, "cash").duePaisa).toBe(10_000);
  });

  it("stores a zero bill on dues as cash, owing nothing", () => {
    expect(splitAtSale(0, "credit", 0, "cash")).toEqual({
      method: "cash",
      duePaisa: 0,
      paidNowMethod: null,
    });
  });
});

describe("balanceDue", () => {
  const base = {
    method: "credit",
    status: "saved",
    settledInFull: false,
    duePaisa: 30_000,
    receivedPaisa: 0,
    returnedAgainstDuePaisa: 0,
  };

  it("is what was left owing, less payments and returns", () => {
    expect(balanceDue(base)).toBe(30_000);
    expect(balanceDue({ ...base, receivedPaisa: 10_000 })).toBe(20_000);
    expect(
      balanceDue({ ...base, receivedPaisa: 10_000, returnedAgainstDuePaisa: 5_000 }),
    ).toBe(15_000);
  });

  it("is never negative", () => {
    expect(balanceDue({ ...base, receivedPaisa: 40_000 })).toBe(0);
  });

  it("is zero for a paid bill, a cancelled bill, or one marked paid the old way", () => {
    expect(balanceDue({ ...base, method: "cash" })).toBe(0);
    expect(balanceDue({ ...base, status: "cancelled" })).toBe(0);
    expect(balanceDue({ ...base, settledInFull: true })).toBe(0);
  });
});

describe("splitReturn", () => {
  it("takes a return off the debt first", () => {
    expect(splitReturn(5_000, 20_000)).toEqual({
      againstDuePaisa: 5_000,
      handBackPaisa: 0,
    });
  });

  it("hands back only what is left after the debt is cleared", () => {
    expect(splitReturn(5_000, 2_000)).toEqual({
      againstDuePaisa: 2_000,
      handBackPaisa: 3_000,
    });
  });

  it("hands everything back when nothing is owed", () => {
    expect(splitReturn(5_000, 0)).toEqual({
      againstDuePaisa: 0,
      handBackPaisa: 5_000,
    });
  });
});

describe("allocateOldestFirst", () => {
  const bills = [
    { id: "old", balancePaisa: 10_000 },
    { id: "mid", balancePaisa: 5_000 },
    { id: "new", balancePaisa: 8_000 },
  ];

  it("clears the oldest bill before touching the next", () => {
    expect(allocateOldestFirst(12_000, bills)).toEqual([
      { billId: "old", amountPaisa: 10_000 },
      { billId: "mid", amountPaisa: 2_000 },
    ]);
  });

  it("clears everything with the full amount", () => {
    const plan = allocateOldestFirst(23_000, bills);
    expect(plan.map((p) => p.amountPaisa)).toEqual([10_000, 5_000, 8_000]);
    expect(totalOwed(bills)).toBe(23_000);
  });

  it("skips a bill that owes nothing", () => {
    expect(
      allocateOldestFirst(3_000, [
        { id: "paid", balancePaisa: 0 },
        { id: "owing", balancePaisa: 5_000 },
      ]),
    ).toEqual([{ billId: "owing", amountPaisa: 3_000 }]);
  });

  it("allocates nothing for nothing", () => {
    expect(allocateOldestFirst(0, bills)).toEqual([]);
  });
});

describe("grouping by person", () => {
  function bill(over: Partial<OwedBill>): OwedBill {
    return {
      id: "b",
      invoiceNo: 1,
      fiscalLabel: "2083/84",
      dateAd: "2026-09-01",
      dateBs: "2083-05-16",
      totalPaisa: 10_000,
      duePaisa: 10_000,
      receivedPaisa: 0,
      returnedAgainstDuePaisa: 0,
      balancePaisa: 10_000,
      patientId: null,
      patientNo: null,
      name: "",
      phone: "",
      ...over,
    };
  }

  it("keys a registered patient by id, a typed name by the name, a nameless bill by itself", () => {
    expect(personKey({ id: "b1", patientId: "P1", name: "Sita" })).toBe("p:P1");
    expect(personKey({ id: "b1", patientId: null, name: "  Ram   Bahadur " })).toBe(
      "n:ram bahadur",
    );
    expect(personKey({ id: "b1", patientId: null, name: "  " })).toBe("b:b1");
  });

  it("adds up one person's bills and lists them oldest first", () => {
    const people = groupByPerson(
      [
        bill({ id: "b2", invoiceNo: 9, dateAd: "2026-09-10", patientId: "P1", name: "Sita", balancePaisa: 4_000 }),
        bill({ id: "b1", invoiceNo: 3, dateAd: "2026-09-02", patientId: "P1", name: "Sita", balancePaisa: 6_000, phone: "9841000000" }),
        bill({ id: "b3", dateAd: "2026-09-05", name: "Hari", balancePaisa: 2_000 }),
      ],
      "2026-09-21",
    );
    expect(people).toHaveLength(2);
    const sita = people[0]!;
    expect(sita.owedPaisa).toBe(10_000);
    expect(sita.bills.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(sita.oldestDays).toBe(19);
    expect(sita.phone).toBe("9841000000");
    expect(people[1]!.name).toBe("Hari");
  });

  it("does not treat two nameless bills as one debtor", () => {
    const people = groupByPerson(
      [bill({ id: "x1" }), bill({ id: "x2" })],
      "2026-09-21",
    );
    expect(people).toHaveLength(2);
  });

  it("leaves out bills that owe nothing", () => {
    const people = groupByPerson(
      [bill({ id: "paid", balancePaisa: 0, name: "Gita" })],
      "2026-09-21",
    );
    expect(people).toEqual([]);
  });

  it("puts the biggest debt first", () => {
    const people = groupByPerson(
      [
        bill({ id: "a", name: "Small", balancePaisa: 1_000 }),
        bill({ id: "b", name: "Big", balancePaisa: 9_000 }),
      ],
      "2026-09-21",
    );
    expect(people.map((p) => p.name)).toEqual(["Big", "Small"]);
  });
});

describe("the small print", () => {
  it("counts whole days and never goes negative", () => {
    expect(ageInDays("2026-09-01", "2026-09-21")).toBe(20);
    expect(ageInDays("2026-09-21", "2026-09-01")).toBe(0);
  });

  it("says how much is owed when too much is offered", () => {
    expect(overpaymentError(150_000).userMessage).toBe(
      "That is more than is owed. They owe रू 1,500.00.",
    );
    expect(overpaymentError(0).userMessage).toBe(
      "Nothing is owed on this any more.",
    );
  });
});
