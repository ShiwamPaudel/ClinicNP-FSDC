/**
 * Suppliers, purchases, stock and what is owed for them are open with either
 * module (C-034). A dental clinic with no pharmacy still buys its materials on
 * credit and pays in parts; selling medicine at the counter stays the
 * pharmacy's alone.
 */
import { describe, it, expect } from "vitest";
import { isModuleOn } from "@/lib/modules";

const CLINIC_ONLY = { pharmacy: false, clinic: true };
const PHARMACY_ONLY = { pharmacy: true, clinic: false };
const BOTH = { pharmacy: true, clinic: true };

describe("supplies", () => {
  it("are open to a clinic with no pharmacy", () => {
    expect(isModuleOn(CLINIC_ONLY, "supplies")).toBe(true);
  });

  it("stay open to a pharmacy, and to both", () => {
    expect(isModuleOn(PHARMACY_ONLY, "supplies")).toBe(true);
    expect(isModuleOn(BOTH, "supplies")).toBe(true);
  });

  it("do not open the pharmacy itself to a clinic", () => {
    expect(isModuleOn(CLINIC_ONLY, "pharmacy")).toBe(false);
    expect(isModuleOn(PHARMACY_ONLY, "clinic")).toBe(false);
  });
});
