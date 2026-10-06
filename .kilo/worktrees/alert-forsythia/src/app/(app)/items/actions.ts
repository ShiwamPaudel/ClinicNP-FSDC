"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { createItem, updateItem } from "@/lib/repos/items";
import { itemSchema } from "@/lib/validators";
import { validateHierarchy } from "@/lib/units";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
  id?: string;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[items action]", err);
  return fail("Something went wrong. Please try again.");
}

export async function saveItemAction(input: unknown): Promise<ActionResult> {
  try {
    await requireModule("pharmacy");
    await assertAdmin();
    const parsed = itemSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const data = parsed.data;

    // Exactly one default selling unit.
    const defaults = data.units.filter((u) => u.isDefaultSelling);
    if (defaults.length !== 1) {
      return fail("Pick exactly one default selling unit.");
    }
    const hierarchyError = validateHierarchy(data.units);
    if (hierarchyError) return fail(hierarchyError);

    // Where a medicine is kept is NOT saved here. It belongs to the shop, not
    // to the product, and lives in `item_locations` — set from Stock → Shelves
    // (0013). Putting it back on this form would put it back on the item.
    if (data.id) {
      await updateItem(data.id, data);
      revalidatePath(`/items/${data.id}`);
      revalidatePath("/items");
      return { ok: true, id: data.id };
    }
    const id = await createItem(data);
    revalidatePath("/items");
    revalidatePath("/stock/shelves");
    return { ok: true, id };
  } catch (err) {
    return handle(err);
  }
}
