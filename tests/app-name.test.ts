import { describe, it, expect } from "vitest";
import {
  appNameFor,
  appDescriptionFor,
  CLINIC_APP_NAME,
  PHARMACY_APP_NAME,
} from "@/lib/app-name";

describe("appNameFor — the name is derived from the modules (D-025)", () => {
  it("is ClinicNP when the clinic module is on", () => {
    expect(appNameFor({ pharmacy: true, clinic: true })).toBe(CLINIC_APP_NAME);
  });

  it("is ClinicNP for a clinic-only install", () => {
    expect(appNameFor({ pharmacy: false, clinic: true })).toBe(CLINIC_APP_NAME);
  });

  it("is Faarma for a pharmacy-only install", () => {
    expect(appNameFor({ pharmacy: true, clinic: false })).toBe(PHARMACY_APP_NAME);
  });

  it("only ever returns one of the two sanctioned names", () => {
    // Stronger than grepping for the retired name: nothing else can come out.
    const allowed = [CLINIC_APP_NAME, PHARMACY_APP_NAME];
    for (const m of [
      { pharmacy: true, clinic: true },
      { pharmacy: true, clinic: false },
      { pharmacy: false, clinic: true },
      { pharmacy: false, clinic: false },
    ]) {
      expect(allowed).toContain(appNameFor(m));
    }
  });
});

describe("appDescriptionFor", () => {
  it("names both halves when both modules are on", () => {
    expect(appDescriptionFor({ pharmacy: true, clinic: true })).toMatch(/clinic/i);
    expect(appDescriptionFor({ pharmacy: true, clinic: true })).toMatch(/pharmacy/i);
  });

  it("uses plain language with no backend words", () => {
    const banned = /database|record|row|query|sync|api|cache|null/i;
    for (const m of [
      { pharmacy: true, clinic: true },
      { pharmacy: true, clinic: false },
      { pharmacy: false, clinic: true },
    ]) {
      expect(appDescriptionFor(m)).not.toMatch(banned);
    }
  });
});

describe("appSubtitleFor", () => {
  it("names only the halves that are switched on", async () => {
    const { appSubtitleFor } = await import("@/lib/app-name");
    expect(appSubtitleFor({ pharmacy: true, clinic: true })).toBe(
      "Clinic & Pharmacy Management",
    );
    expect(appSubtitleFor({ pharmacy: false, clinic: true })).toBe(
      "Clinic Management",
    );
    expect(appSubtitleFor({ pharmacy: true, clinic: false })).toBe(
      "Pharmacy Management",
    );
  });
});
