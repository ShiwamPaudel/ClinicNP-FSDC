"use server";

/**
 * rack-actions.ts — drawing the shop floor, and saying what is kept where.
 *
 * Admin-only and pharmacy-only: a clinic-only install has no shelves of
 * medicine to map, and its route returns 404 rather than an empty screen.
 *
 * Two screens use these. Settings → Shop layout draws the furniture; Stock →
 * Shelves puts medicines on it. That split is deliberate — the room is a
 * setting, what is in it is stock.
 */
import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { recordAudit } from "@/lib/repos/audit";
import {
  createRack,
  updateRack,
  deleteRack,
  getRack,
  rackItemCount,
  moveRacks,
  setItemLocation,
  BadCellError,
  RackPositionTakenError,
} from "@/lib/repos/racks";
import { setFloorSize } from "@/lib/repos/company";
import {
  rackSchema,
  itemLocationSchema,
  layoutMoveSchema,
  floorSizeSchema,
} from "@/lib/validators";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
  /** the id of a newly created piece, so the planner can select it */
  id?: string;
}

const OK: ActionResult = { ok: true };

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof BadCellError) return fail(err.userMessage);
  if (err instanceof RackPositionTakenError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  console.error("[rack action]", err);
  return fail("Something went wrong. Please try again.");
}

export async function saveRackAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    await requireModule("pharmacy");
    const parsed = rackSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    if (id) {
      await updateRack(id, parsed.data);
      await recordAudit(user.id, "rack.update", { id, name: parsed.data.name });
    } else {
      const newId = await createRack(parsed.data);
      await recordAudit(user.id, "rack.create", { id: newId, name: parsed.data.name });
      revalidatePath("/settings/racks");
      revalidatePath("/stock/shelves");
      return { ok: true, id: newId };
    }
    revalidatePath("/settings/racks");
    revalidatePath("/stock/shelves");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

export async function deleteRackAction(id: string): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    await requireModule("pharmacy");
    const rack = await getRack(id);
    if (!rack) return fail("That rack is already gone.");

    // Deleting is allowed even with items on it — they simply lose their
    // shelf — but the person should be told how many before they do it, and
    // the screen asks. This is the last line of defence, not the first.
    const n = await rackItemCount(id);
    await deleteRack(id);
    await recordAudit(user.id, "rack.delete", {
      id,
      name: rack.name,
      itemsLeftWithoutShelf: n,
    });
    revalidatePath("/settings/racks");
    revalidatePath("/stock/shelves");
    revalidatePath("/items");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

export async function setItemLocationAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    await requireModule("pharmacy");
    const parsed = itemLocationSchema.safeParse(input);
    if (!parsed.success) return fail("Please choose a shelf, or none at all.");
    const { itemId, rackId, row, col, note } = parsed.data;
    await setItemLocation(itemId, { rackId, row, col, note });
    await recordAudit(user.id, "item.shelf", {
      itemId,
      cell: rackId ? `R${row}C${col}` : null,
      note: note || null,
    });
    revalidatePath("/stock/shelves");
    revalidatePath("/settings/racks");
    revalidatePath(`/items/${itemId}`);
    return OK;
  } catch (err) {
    return handle(err);
  }
}

/**
 * Where everything now stands, after a drag, a resize or a turn.
 *
 * Geometry only. The planner sends this constantly — every drop, every handle
 * released — so it must be the narrowest write in the app: it cannot rename a
 * piece of furniture, change what kind it is, or alter the grid of shelves
 * inside it. Moving a rack across the room must never be able to strand a
 * medicine on a shelf number that stopped existing, and the way to be certain
 * is for the move to have no way of changing shelf numbers.
 *
 * Not audited per drag. A floor plan is moved dozens of times in one sitting
 * while somebody decides where things go, and an audit log full of "rack moved
 * 5cm" is an audit log nobody reads.
 */
export async function saveLayoutAction(input: unknown): Promise<ActionResult> {
  try {
    await assertAdmin();
    await requireModule("pharmacy");
    const parsed = layoutMoveSchema.safeParse(input);
    if (!parsed.success) return fail("That layout could not be saved.");

    await moveRacks(parsed.data.moves);
    revalidatePath("/settings/racks");
    revalidatePath("/stock/shelves");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

/** How big the room is. Its own action, so it is its own undo. */
export async function setFloorSizeAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    await requireModule("pharmacy");
    const parsed = floorSizeSchema.safeParse(input);
    if (!parsed.success) {
      return fail("A room has to be between 1 and 50 metres each way.");
    }
    await setFloorSize(parsed.data);
    await recordAudit(user.id, "floor.resize", parsed.data);
    revalidatePath("/settings/racks");
    revalidatePath("/stock/shelves");
    return OK;
  } catch (err) {
    return handle(err);
  }
}
