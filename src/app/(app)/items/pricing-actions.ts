"use server";

/**
 * pricing-actions.ts — putting prices on an imported catalogue.
 *
 * Deliberately the narrowest write in the pharmacy: rates, by item and unit
 * level, and nothing else. It cannot rename a medicine, change a pack size,
 * move a shelf or touch stock, however it is called — which is what makes a
 * bulk screen safe to hand to somebody working down a distributor's price
 * list at speed.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { getItem, setUnitRates } from "@/lib/repos/items";
import { recordAudit } from "@/lib/repos/audit";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
  count?: number;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

const pricingSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        rates: z
          .array(
            z.object({
              level: z.number().int().min(0).max(2),
              sellingRatePaisa: z.number().int().min(0),
            }),
          )
          .min(1),
      }),
    )
    .min(1, "Nothing to save"),
});

export async function setPricesAction(input: unknown): Promise<ActionResult> {
  try {
    await requireModule("pharmacy");
    const user = await assertAdmin();

    const parsed = pricingSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the prices.");
    }

    // Resolve everything before writing anything. Half a price list applied is
    // worse than none of it: you cannot tell by looking which rows landed.
    const resolved: {
      itemId: string;
      brandName: string;
      rates: { level: number; sellingRatePaisa: number }[];
    }[] = [];

    for (const row of parsed.data.items) {
      const item = await getItem(row.itemId);
      if (!item) return fail("One of those medicines no longer exists.");

      for (const r of row.rates) {
        if (!item.units.some((u) => u.level === r.level)) {
          return fail(`${item.brandName} has no unit at that level.`);
        }
      }

      // A larger pack costing less than a smaller one is nearly always a typo,
      // and it is the typo that quietly loses money on every sale afterwards.
      const priced = item.units
        .map((u) => ({
          factor: u.factorToBase,
          paisa:
            row.rates.find((r) => r.level === u.level)?.sellingRatePaisa ??
            u.sellingRatePaisa,
        }))
        .filter((u) => u.paisa > 0)
        .sort((a, b) => a.factor - b.factor);

      for (let i = 1; i < priced.length; i++) {
        if (priced[i]!.paisa <= priced[i - 1]!.paisa) {
          return fail(
            `${item.brandName}: the bigger pack cannot cost the same or less than the smaller one.`,
          );
        }
      }

      resolved.push({
        itemId: item.id,
        brandName: item.brandName,
        rates: row.rates,
      });
    }

    for (const r of resolved) {
      await setUnitRates(r.itemId, r.rates);
    }

    await recordAudit(user.id, "items.pricing", {
      items: resolved.length,
      names: resolved.slice(0, 20).map((r) => r.brandName),
    });

    revalidatePath("/items");
    revalidatePath("/items/pricing");
    return { ok: true, count: resolved.length };
  } catch (err) {
    if (err instanceof ModuleDisabledError) return fail(err.userMessage);
    if (err instanceof NotAuthorizedError) return fail(err.userMessage);
    console.error("[items pricing]", err);
    return fail("Something went wrong. Please try again.");
  }
}
