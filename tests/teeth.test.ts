/**
 * The tooth chart (C-037): FDI numbering, and each tooth's state being its
 * latest mark that has not been undone.
 */
import { describe, it, expect } from "vitest";
import { cleanSurfaces, currentTeeth, isTooth, toothName, type ToothRecord } from "@/lib/teeth";

const rec = (over: Partial<ToothRecord>): ToothRecord => ({
  id: "r",
  tooth: 36,
  condition: "caries",
  surfaces: "",
  note: "",
  dateBs: "2083-06-20",
  dateAd: "2026-10-06",
  createdAt: "2026-10-06T05:00:00.000Z",
  userName: "",
  voided: false,
  ...over,
});

describe("FDI numbering", () => {
  it("knows the 32 permanent and 20 milk teeth, and nothing else", () => {
    expect(isTooth(11)).toBe(true);
    expect(isTooth(48)).toBe(true);
    expect(isTooth(85)).toBe(true);
    expect(isTooth(19)).toBe(false);
    expect(isTooth(56)).toBe(false);
    expect(isTooth(90)).toBe(false);
  });

  it("names a tooth", () => {
    expect(toothName(36)).toBe("36 · lower left first molar");
    expect(toothName(54)).toBe("54 · upper right first molar (milk)");
  });

  it("keeps surfaces in one order, without repeats", () => {
    expect(cleanSurfaces("dom")).toBe("MOD");
    expect(cleanSurfaces("LLxB")).toBe("BL");
  });
});

describe("a tooth's state", () => {
  it("is its latest mark", () => {
    const now = currentTeeth([
      rec({ id: "1", condition: "caries" }),
      rec({ id: "2", condition: "filled", dateAd: "2026-10-09", dateBs: "2083-06-23" }),
    ]);
    expect(now.get(36)!.condition).toBe("filled");
  });

  it("ignores a mark that was undone", () => {
    const now = currentTeeth([
      rec({ id: "1", condition: "caries" }),
      rec({ id: "2", condition: "missing", dateAd: "2026-10-09", voided: true }),
    ]);
    expect(now.get(36)!.condition).toBe("caries");
  });

  it("on the same day, the one typed last wins", () => {
    const now = currentTeeth([
      rec({ id: "1", condition: "caries", createdAt: "2026-10-06T05:00:00.000Z" }),
      rec({ id: "2", condition: "rct", createdAt: "2026-10-06T06:00:00.000Z" }),
    ]);
    expect(now.get(36)!.condition).toBe("rct");
  });
});
