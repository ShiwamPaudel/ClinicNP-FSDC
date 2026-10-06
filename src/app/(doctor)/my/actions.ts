"use server";

/**
 * actions.ts — what a doctor may change about themselves.
 *
 * Narrow on purpose. Their name, their letters, what they are called, their
 * council number, how to reach them, and whether they want to be told. What
 * they earn is not here: that is between them and the owner and it lives in
 * Settings, where it is audit-logged.
 */
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { getDoctorByUserId, updateDoctorProfile } from "@/lib/repos/doctors";
import { recordAudit } from "@/lib/repos/audit";
import { doctorProfileSchema } from "@/lib/validators";

export interface ProfileResult {
  ok: boolean;
  userMessage?: string;
}

function fail(userMessage: string): ProfileResult {
  return { ok: false, userMessage };
}

export async function saveMyProfileAction(input: unknown): Promise<ProfileResult> {
  try {
    await requireModule("clinic");
    const session = await auth();
    if (!session?.user || session.user.role !== "doctor") {
      throw new NotAuthorizedError();
    }

    const doctor = await getDoctorByUserId(session.user.id);
    if (!doctor) {
      return fail(
        "Your sign-in isn't attached to a doctor yet. Ask the clinic to attach it.",
      );
    }

    const parsed = doctorProfileSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const data = parsed.data;

    await updateDoctorProfile(doctor.id, {
      name: data.name.trim(),
      qualification: data.qualification.trim(),
      specialty: data.specialty.trim(),
      nmcNo: data.nmcNo.trim(),
      phone: data.phone.trim(),
      email: data.email.trim(),
      notifyPush: data.notifyPush,
      notifyEmail: data.notifyEmail,
    });

    await recordAudit(session.user.id, "doctor.profile_updated", {
      entity: "doctor",
      entityId: doctor.id,
      detail: data.name.trim(),
    });

    revalidatePath("/my/profile");
    revalidatePath("/settings/doctors");
    return { ok: true };
  } catch (err) {
    if (err instanceof ModuleDisabledError) return fail(err.userMessage);
    if (err instanceof NotAuthorizedError) return fail(err.userMessage);
    console.error("[doctor profile]", err);
    return fail("Something went wrong. Please try again.");
  }
}
