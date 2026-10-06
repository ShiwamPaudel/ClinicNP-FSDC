"use server";

/**
 * actions.ts — the four clicks that move a sample along.
 *
 * Anybody who can bill can work the laboratory queue. Collecting a sample and
 * handing a report back are counter jobs, not administration, and a queue only
 * an Admin can advance is a queue that stops when the Admin goes to lunch.
 *
 * Every transition names the stage it believed the line was in. Two people
 * working the same queue on two machines is the normal case in a clinic, and
 * the check is what stops the second click stamping a step already taken.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBillingUser, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import {
  advanceLabLine,
  revertLabLine,
  setLabNote,
  STAGE_LABEL,
  type LabStage,
} from "@/lib/repos/lab";
import { recordAudit } from "@/lib/repos/audit";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
}

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[lab action]", err);
  return fail("Something went wrong. Please try again.");
}

/** Every lab screen shows a count, so they all refresh together. */
function revalidateLab(): void {
  for (const p of [
    "/lab",
    "/lab/dispatch",
    "/lab/awaiting",
    "/lab/reports",
    "/lab/done",
    "/dashboard",
  ]) {
    revalidatePath(p);
  }
}

const advanceSchema = z.object({
  lineId: z.string().min(1),
  from: z.enum(["to_collect", "to_dispatch", "awaiting_report", "report_in"]),
});

export async function advanceLabAction(input: unknown): Promise<ActionResult> {
  try {
    await requireModule("clinic");
    const user = await requireBillingUser();

    const parsed = advanceSchema.safeParse(input);
    if (!parsed.success) return fail("Please try that again.");
    const { lineId, from } = parsed.data;

    const res = await advanceLabLine(lineId, from);
    if (!res.ok) return fail(res.reason ?? "That could not be recorded.");

    await recordAudit(user.id, "lab.advance", { lineId, from });
    revalidateLab();
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

const revertSchema = z.object({
  lineId: z.string().min(1),
  from: z.enum(["to_dispatch", "awaiting_report", "report_in", "done"]),
});

export async function revertLabAction(input: unknown): Promise<ActionResult> {
  try {
    await requireModule("clinic");
    const user = await requireBillingUser();

    const parsed = revertSchema.safeParse(input);
    if (!parsed.success) return fail("Please try that again.");
    const { lineId, from } = parsed.data;

    const res = await revertLabLine(lineId, from);
    if (!res.ok) return fail(res.reason ?? "That could not be undone.");

    await recordAudit(user.id, "lab.revert", {
      lineId,
      from: STAGE_LABEL[from as LabStage],
    });
    revalidateLab();
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

const noteSchema = z.object({
  lineId: z.string().min(1),
  note: z.string().max(300),
});

export async function setLabNoteAction(input: unknown): Promise<ActionResult> {
  try {
    await requireModule("clinic");
    const user = await requireBillingUser();

    const parsed = noteSchema.safeParse(input);
    if (!parsed.success) return fail("That note is too long.");

    await setLabNote(parsed.data.lineId, parsed.data.note);
    await recordAudit(user.id, "lab.note", { lineId: parsed.data.lineId });
    revalidateLab();
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
