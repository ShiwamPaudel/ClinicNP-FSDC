import { describe, it, expect } from "vitest";
import { formatDocNo, parseDocNo } from "@/lib/invoice-number";

describe("invoice-number", () => {
  it("formats sales invoice numbers with 6-digit zero padding", () => {
    expect(formatDocNo("SI", "2083/84", 123)).toBe("SI-2083/84-000123");
    expect(formatDocNo("SI", "2083/84", 1)).toBe("SI-2083/84-000001");
  });

  it("formats sales-return and purchase numbers", () => {
    expect(formatDocNo("SR", "2083/84", 7)).toBe("SR-2083/84-000007");
    expect(formatDocNo("PI", "2083/84", 42)).toBe("PI-2083/84-000042");
  });

  it("round-trips through parse", () => {
    expect(parseDocNo("SI-2083/84-000123")).toEqual({
      kind: "SI",
      fiscalLabel: "2083/84",
      seq: 123,
    });
    expect(parseDocNo("not-a-number")).toBeNull();
  });
});
