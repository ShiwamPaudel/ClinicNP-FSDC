/**
 * The sign-in screen.
 *
 * It is the only screen in the product that advertises anything, which makes
 * it the only screen that can lie. A pharmacy-only install must not be told
 * about patients and laboratory samples: those pages return 404 for it (D-030),
 * and the first thing a new user would learn is that the software describes
 * itself wrongly.
 *
 * The support numbers are pinned too. They are the numbers somebody rings when
 * they cannot get in, so a typo in them is only ever discovered by the person
 * least able to report it.
 */
import { describe, it, expect } from "vitest";
import { featuresFor } from "@/components/auth/brand-panel";
import { VENDOR_NAME, SUPPORT_PHONES } from "@/lib/vendor";
import { appNameFor, CLINIC_APP_NAME, PHARMACY_APP_NAME } from "@/lib/app-name";

const BOTH = { pharmacy: true, clinic: true };
const PHARMACY_ONLY = { pharmacy: true, clinic: false };
const CLINIC_ONLY = { pharmacy: false, clinic: true };

/** Everything the panel would say, as one lowercase blob. */
function saidBy(modules: { pharmacy: boolean; clinic: boolean }): string {
  return featuresFor(modules)
    .map((f) => `${f.title} ${f.body}`)
    .join(" ")
    .toLowerCase();
}

describe("what the sign-in screen claims", () => {
  it("offers between four and five things, never a wall of them", () => {
    for (const m of [BOTH, PHARMACY_ONLY, CLINIC_ONLY]) {
      expect(featuresFor(m).length).toBeGreaterThanOrEqual(4);
      expect(featuresFor(m).length).toBeLessThanOrEqual(5);
    }
  });

  it("does not promise patients or samples to a pharmacy-only shop", () => {
    const said = saidBy(PHARMACY_ONLY);
    expect(said).not.toContain("patient");
    expect(said).not.toContain("visit");
    expect(said).not.toContain("sample");
    expect(said).not.toContain("doctor");
  });

  it("does not promise batches and expiry to a clinic with no pharmacy", () => {
    const said = saidBy(CLINIC_ONLY);
    expect(said).not.toContain("batch");
    expect(said).not.toContain("expiry");
  });

  it("names both halves when both are switched on", () => {
    const said = saidBy(BOTH);
    expect(said).toContain("patient");
    expect(said).toContain("batch");
    expect(said).toContain("sample");
  });

  it("always finds room to say it keeps working offline", () => {
    // Five is the cap and a clinic with a pharmacy fills four of them, so the
    // ordering has to earn the last place rather than fall off the end of it.
    // Billing through a power cut is the claim nothing else here makes.
    for (const m of [BOTH, PHARMACY_ONLY, CLINIC_ONLY]) {
      expect(saidBy(m)).toContain("offline");
    }
  });

  it("mentions Nepali dates whenever there is a place left for it", () => {
    expect(saidBy(PHARMACY_ONLY)).toContain("bikram sambat");
    expect(saidBy(CLINIC_ONLY)).toContain("bikram sambat");
  });

  it("gives every entry an icon and its own words", () => {
    const list = featuresFor(BOTH);
    for (const f of list) {
      expect(f.icon).toBeTruthy();
      expect(f.title.length).toBeGreaterThan(3);
      expect(f.body.length).toBeGreaterThan(20);
    }
    expect(new Set(list.map((f) => f.title)).size).toBe(list.length);
  });

  it("shows the artwork only for the install the artwork is named after", () => {
    // The logo file spells "ClinicNP". A pharmacy-only install is not called
    // that, so the panel falls back to the wordmark set in type.
    expect(appNameFor(BOTH)).toBe(CLINIC_APP_NAME);
    expect(appNameFor(CLINIC_ONLY)).toBe(CLINIC_APP_NAME);
    expect(appNameFor(PHARMACY_ONLY)).toBe(PHARMACY_APP_NAME);
  });
});

describe("who to ring", () => {
  it("carries both support numbers, exactly as given", () => {
    expect(SUPPORT_PHONES).toEqual(["+977 984 3468715", "+977 9863 777171"]);
  });

  it("names the company that made it", () => {
    expect(VENDOR_NAME).toBe("Infobytes Nepal Pvt. Ltd.");
  });
});
