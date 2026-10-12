/**
 * The drawn tooth chart (C-039): every tooth placed once, in its arch and on
 * its side, neighbours not overlapping, numbers clear of the teeth, and all of
 * it inside the drawing.
 */
import { describe, it, expect } from "vitest";
import { CHART, chartLayout, toothKind, type PlacedTooth } from "@/lib/teeth-layout";
import { PERMANENT_LOWER, PERMANENT_UPPER, PRIMARY_LOWER, PRIMARY_UPPER } from "@/lib/teeth";

const views = ["permanent", "primary", "both"] as const;

describe("which teeth are drawn", () => {
  it("adult, milk, or both — each tooth once", () => {
    const adult = [...PERMANENT_UPPER, ...PERMANENT_LOWER].sort();
    const milk = [...PRIMARY_UPPER, ...PRIMARY_LOWER].sort();
    expect(chartLayout("permanent").map((p) => p.tooth).sort()).toEqual(adult);
    expect(chartLayout("primary").map((p) => p.tooth).sort()).toEqual(milk);
    expect(chartLayout("both").map((p) => p.tooth).sort()).toEqual([...adult, ...milk].sort());
  });

  it("knows each tooth's kind", () => {
    expect(toothKind(11)).toBe("incisor");
    expect(toothKind(13)).toBe("canine");
    expect(toothKind(24)).toBe("premolar");
    expect(toothKind(36)).toBe("molar");
    expect(toothKind(54)).toBe("molar");
    expect(toothKind(83)).toBe("canine");
  });
});

describe("where they sit", () => {
  const at = (layout: PlacedTooth[], n: number) => layout.find((p) => p.tooth === n)!;

  it("the patient's right on the screen's left, upper teeth above lower", () => {
    const l = chartLayout("permanent");
    expect(at(l, 16).x).toBeLessThan(CHART.cx);
    expect(at(l, 26).x).toBeGreaterThan(CHART.cx);
    expect(at(l, 46).x).toBeLessThan(CHART.cx);
    expect(at(l, 36).x).toBeGreaterThan(CHART.cx);
    expect(at(l, 11).y).toBeLessThan(at(l, 41).y);
    // front teeth at the far ends, back teeth towards the middle
    expect(at(l, 11).y).toBeLessThan(at(l, 18).y);
    expect(at(l, 41).y).toBeGreaterThan(at(l, 48).y);
  });

  it("neighbours along an arch do not overlap", () => {
    for (const view of views) {
      const l = chartLayout(view);
      for (const p of l) {
        const next = l.find((q) => q.tooth === p.tooth + 1);
        if (!next || Math.floor(next.tooth / 10) !== Math.floor(p.tooth / 10)) continue;
        const apart = Math.hypot(next.x - p.x, next.y - p.y);
        expect(apart, `${view}: ${p.tooth}–${next.tooth}`).toBeGreaterThanOrEqual(((p.w + next.w) / 2) * 0.97);
      }
    }
  });

  it("numbers sit clear of their tooth, and everything is inside the drawing", () => {
    for (const view of views) {
      for (const p of chartLayout(view)) {
        expect(Math.hypot(p.labelX - p.x, p.labelY - p.y)).toBeGreaterThan(p.d / 2);
        const reach = Math.max(p.w, p.d) / 2;
        for (const [x, y] of [
          [p.x - reach, p.y - reach],
          [p.x + reach, p.y + reach],
          [p.labelX - 7, p.labelY - 7],
          [p.labelX + 7, p.labelY + 7],
        ] as const) {
          expect(x, `${view} ${p.tooth}`).toBeGreaterThanOrEqual(0);
          expect(x, `${view} ${p.tooth}`).toBeLessThanOrEqual(CHART.width);
          expect(y, `${view} ${p.tooth}`).toBeGreaterThanOrEqual(0);
          expect(y, `${view} ${p.tooth}`).toBeLessThanOrEqual(CHART.height);
        }
      }
    }
  });

  it("each tooth faces out of its arch", () => {
    // the tooth's own +y, after its turn and any mirror, points away from the arch centre
    for (const view of views) {
      for (const p of chartLayout(view)) {
        const rad = (p.angle * Math.PI) / 180;
        const s = p.flip ? -1 : 1;
        const yx = -Math.sin(rad) * s;
        const yy = Math.cos(rad) * s;
        const upper = Math.floor(p.tooth / 10) % 4 === 1 || Math.floor(p.tooth / 10) % 4 === 2;
        const cy = upper ? CHART.upperCy : CHART.lowerCy;
        expect(yx * (p.x - CHART.cx) + yy * (p.y - cy), `${view} ${p.tooth}`).toBeGreaterThan(0);
      }
    }
  });

  it("milk teeth inside the adult ones keep their numbers inside too", () => {
    const l = chartLayout("both");
    const milk = at(l, 51);
    const adult = at(l, 11);
    expect(milk.y).toBeGreaterThan(adult.y + adult.d);
    expect(milk.labelY).toBeGreaterThan(milk.y);
  });
});
