"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import {
  saveCompany,
  getCompany,
  setModuleFlags,
  type ModuleFlags,
} from "@/lib/repos/company";
import { recordAudit } from "@/lib/repos/audit";
import {
  closeYearAndOpenNext,
  getOpenFiscalYear,
  ClosedFiscalYearError,
} from "@/lib/repos/fiscal";
import { exportAll, backupTakenSince } from "@/lib/repos/backup";
import { backupStorage, keepBackup, keepsBackups } from "@/lib/backups";
import { downloadName } from "@/lib/backup-keys";
import {
  getModules,
  isLastModuleOn,
  LAST_MODULE_MESSAGE,
} from "@/lib/modules";
import {
  createUser,
  updateUser,
  usernameExists,
} from "@/lib/repos/users";
import {
  companySchema,
  newUserSchema,
  updateUserSchema,
} from "@/lib/validators";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
}

const OK: ActionResult = { ok: true };

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

/** Map any thrown error to a safe, plain-language result (Rules §3). */
function handle(err: unknown): ActionResult {
  if (err instanceof ClosedFiscalYearError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  console.error("[settings action]", err);
  return fail("Something went wrong. Please try again.");
}

export async function saveCompanyAction(
  input: unknown,
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const parsed = companySchema.safeParse(input);
    if (!parsed.success) return fail("Please check the details and try again.");
    await saveCompany(parsed.data);
    // The whole app, not just this page: the app layout hands the calendar
    // setting to every date box.
    revalidatePath("/", "layout");
    return OK;
  } catch (err) {
    return handle(err);
  }
}


export async function createUserAction(input: unknown): Promise<ActionResult> {
  try {
    await assertAdmin();
    const parsed = newUserSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    if (await usernameExists(parsed.data.username)) {
      return fail("That username is already taken.");
    }
    await createUser({
      name: parsed.data.name,
      username: parsed.data.username,
      password: parsed.data.password,
      pin: parsed.data.pin || undefined,
      role: parsed.data.role,
      canEditRate: parsed.data.canEditRate,
    });
    revalidatePath("/settings/users");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

export async function updateUserAction(input: unknown): Promise<ActionResult> {
  try {
    await assertAdmin();
    const parsed = updateUserSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const { id, ...rest } = parsed.data;
    await updateUser(id, {
      name: rest.name,
      role: rest.role,
      canEditRate: rest.canEditRate,
      active: rest.active,
      password: rest.password || undefined,
      pin: rest.pin || undefined,
    });
    revalidatePath("/settings/users");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

/**
 * Turn a module on or off. Admin only, audit-logged, and it refuses to switch
 * off the last one (PRD §3.1). Turning a module off never deletes anything.
 */
export async function setModulesAction(
  next: ModuleFlags,
): Promise<ActionResult> {
  try {
    const user = await assertAdmin();
    if (isLastModuleOn(next)) return fail(LAST_MODULE_MESSAGE);

    const before = await getModules();
    if (before.pharmacy === next.pharmacy && before.clinic === next.clinic) {
      return OK;
    }

    await setModuleFlags(next);
    await recordAudit(user.id, "modules.changed", { before, after: next });

    // The name, the nav and every guarded route all follow the flags.
    revalidatePath("/", "layout");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

export interface CloseYearActionResult extends ActionResult {
  closedLabel?: string;
  openedLabel?: string;
  /** the kept copy's file name; empty when the admin's own download is the backup */
  backupName?: string;
}

/** Without private storage, a backup downloaded this long ago still counts. */
const DOWNLOADED_BACKUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Close the open year and start the next one. Admin only.
 *
 * `unsentBills` is counted by the browser that runs the wizard, because the
 * queue of bills waiting to be sent lives on the device, not on the server.
 * Order matters: refuse while anything is still waiting, make sure there is a
 * backup, then move the year. Cannot be undone from the interface (PRD §4A.1).
 */
export async function closeYearAction(
  unsentBills: number,
): Promise<CloseYearActionResult> {
  try {
    const user = await assertAdmin();

    if (unsentBills > 0) {
      const word = unsentBills === 1 ? "bill is" : "bills are";
      return fail(
        `${unsentBills} ${word} still waiting to be sent. Let them finish, then close the year.`,
      );
    }

    const open = await getOpenFiscalYear();
    if (!open) return fail("There's no open year to close.");

    // A point to return to, before anything moves (D-138). With private
    // storage the copy is kept there and the year does not close without it.
    // Without it nothing can be kept on the server, so the admin's own
    // download from the last day is the backup, and one is required.
    let backupName = "";
    if (keepsBackups(await backupStorage())) {
      try {
        const kept = await keepBackup(await exportAll(), "year-end");
        backupName = downloadName(kept.createdAt, "year-end");
      } catch (err) {
        console.error("[close year] the backup could not be kept", err);
        return fail(
          "The backup could not be saved, so the year was not closed. Please try again.",
        );
      }
    } else {
      const since = new Date(Date.now() - DOWNLOADED_BACKUP_WINDOW_MS).toISOString();
      if (!(await backupTakenSince(since))) {
        return fail(
          "Download a backup first with “Download a backup”, then close the year. Automatic backups are not set up, so that file is the way back.",
        );
      }
    }

    const { closedLabel, openedLabel } = await closeYearAndOpenNext(user.id);

    revalidatePath("/", "layout");
    return { ok: true, closedLabel, openedLabel, backupName };
  } catch (err) {
    return handle(err);
  }
}
