/**
 * The room, as arithmetic.
 *
 * These are the two functions everything on the floor plan is drawn from — the
 * footprint a piece occupies and whether two pieces stand in the same place —
 * so a mistake here is a rack drawn through a wall on every screen at once.
 * The rotation case is the one worth the tests: a quarter-turned rack that
 * still reports its unturned width looks right until the day somebody trusts
 * the plan and finds the aisle is 40cm narrower than it said.
 */
import { describe, it, expect } from "vitest";
import {
  footprint,
  overlaps,
  asFurnitureKind,
  asRotation,
  FURNITURE_KINDS,
  FURNITURE_HOLDS_STOCK,
  FURNITURE_DEFAULT_SIZE,
  FURNITURE_LABEL,
} from "@/lib/furniture";

const at = (
  xCm: number,
  yCm: number,
  widthCm: number,
  depthCm: number,
  rotation = 0,
) => ({ xCm, yCm, widthCm, depthCm, rotation });

describe("which way round a thing is standing", () => {
  it("leaves an unturned piece as it was measured", () => {
    expect(footprint({ widthCm: 100, depthCm: 45, rotation: 0 })).toEqual({
      w: 100,
      h: 45,
    });
  });

  it("swaps width and depth on a quarter turn", () => {
    expect(footprint({ widthCm: 100, depthCm: 45, rotation: 90 })).toEqual({
      w: 45,
      h: 100,
    });
    expect(footprint({ widthCm: 100, depthCm: 45, rotation: 270 })).toEqual({
      w: 45,
      h: 100,
    });
  });

  it("leaves a half turn the same shape, because a rectangle is symmetric", () => {
    // 180 changes which side you stand at, not how much floor it covers. The
    // plan draws that as a front edge; the arithmetic must not invent a
    // difference that is not there.
    expect(footprint({ widthCm: 100, depthCm: 45, rotation: 180 })).toEqual({
      w: 100,
      h: 45,
    });
  });

  it("reads a rotation it does not recognise as square-on", () => {
    expect(asRotation(45)).toBe(0);
    expect(asRotation("90")).toBe(90);
    expect(asRotation(null)).toBe(0);
  });
});

describe("two things in the same place", () => {
  it("sees an overlap", () => {
    expect(overlaps(at(0, 0, 100, 45), at(50, 20, 100, 45))).toBe(true);
  });

  it("does not count touching edges as an overlap", () => {
    // Two racks pushed together against a wall is the normal arrangement, not
    // a mistake to warn about.
    expect(overlaps(at(0, 0, 100, 45), at(100, 0, 100, 45))).toBe(false);
    expect(overlaps(at(0, 0, 100, 45), at(0, 45, 100, 45))).toBe(false);
  });

  it("sees things clear of each other", () => {
    expect(overlaps(at(0, 0, 100, 45), at(200, 200, 100, 45))).toBe(false);
  });

  it("uses the turned footprint, not the measured one", () => {
    // A rack across the room, and a long narrow shelf. Standing along the
    // wall the shelf is nowhere near it; laid across the aisle the same shelf
    // reaches right into it. Reading width_cm directly would miss that, and
    // the plan would show an aisle that is not there.
    const rack = at(200, 0, 100, 45);
    const shelf = at(50, 20, 10, 300);
    expect(overlaps(rack, shelf)).toBe(false);
    expect(overlaps(rack, { ...shelf, rotation: 90 })).toBe(true);
  });
});

describe("what a shop keeps things on", () => {
  it("reads an unknown kind as a rack rather than throwing", () => {
    // A row written by a newer version must still draw as something.
    expect(asFurnitureKind("hovercraft")).toBe("rack");
    expect(asFurnitureKind(undefined)).toBe("rack");
    expect(asFurnitureKind("fridge")).toBe("fridge");
  });

  it("gives every kind a label, a default size and a stock answer", () => {
    for (const k of FURNITURE_KINDS) {
      expect(FURNITURE_LABEL[k]).toBeTruthy();
      expect(FURNITURE_DEFAULT_SIZE[k].widthCm).toBeGreaterThan(0);
      expect(FURNITURE_DEFAULT_SIZE[k].depthCm).toBeGreaterThan(0);
      expect(typeof FURNITURE_HOLDS_STOCK[k]).toBe("boolean");
    }
  });

  it("keeps medicines off the things that are only landmarks", () => {
    // Asking somebody which row of a door a medicine is on is asking a
    // question with no answer.
    expect(FURNITURE_HOLDS_STOCK.door).toBe(false);
    expect(FURNITURE_HOLDS_STOCK.desk).toBe(false);
    expect(FURNITURE_HOLDS_STOCK.rack).toBe(true);
    expect(FURNITURE_HOLDS_STOCK.fridge).toBe(true);
  });
});
