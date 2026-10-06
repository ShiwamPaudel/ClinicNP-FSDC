"use server";

/**
 * catalog-actions.ts — Settings → Services, Doctors and Lab partners.
 *
 * Every one of these is Admin-only and clinic-only: a pharmacy install has no
 * doctors to configure, and its routes return 404 rather than an empty screen.
 */
import { revalidatePath } from "next/cache";
import { assertAdmin, NotAuthorizedError } from "@/lib/session";
import { requireModule, ModuleDisabledError } from "@/lib/modules";
import { recordAudit } from "@/lib/repos/audit";
import {
  createService,
  updateService,
  createServiceGroup,
  updateServiceGroup,
  deleteServiceGroup,
  groupHasServices,
  getService,
  type ServiceInput,
} from "@/lib/repos/services";
import {
  createDoctor,
  updateDoctor,
  getDoctor,
  userIdTaken,
  type DoctorInput,
} from "@/lib/repos/doctors";
import { getUserById } from "@/lib/repos/users";
import {
  createLabPartner,
  updateLabPartner,
  getLabPartner,
  type LabPartnerInput,
} from "@/lib/repos/lab-partners";
import {
  serviceSchema,
  serviceGroupSchema,
  doctorSchema,
  labPartnerSchema,
  labPartnerPaymentSchema,
} from "@/lib/validators";
import { recordPartnerPayment } from "@/lib/repos/clinic-reports";
import {
  getFiscalYearByLabel,
  assertYearOpen,
  ClosedFiscalYearError,
} from "@/lib/repos/fiscal";
import { bsFromDbText, toAD, adToIso, fiscalYearOf } from "@/lib/bs";

export interface ActionResult {
  ok: boolean;
  userMessage?: string;
  id?: string;
}

const OK: ActionResult = { ok: true };

function fail(userMessage: string): ActionResult {
  return { ok: false, userMessage };
}

function handle(err: unknown): ActionResult {
  if (err instanceof ModuleDisabledError) return fail(err.userMessage);
  if (err instanceof NotAuthorizedError) return fail(err.userMessage);
  if (err instanceof ClosedFiscalYearError) return fail(err.userMessage);
  console.error("[catalog action]", err);
  return fail("Something went wrong. Please try again.");
}

async function guard() {
  await requireModule("clinic");
  return assertAdmin();
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export async function saveServiceAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await guard();
    const parsed = serviceSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
    }
    const data = parsed.data;

    // A service sent to an outside lab needs somewhere to send it.
    if (data.outsourced && !data.defaultLabPartnerId) {
      return fail("Choose the laboratory this test is sent to.");
    }
    // A reduced follow-up rate with no window would never apply.
    if (data.followupRatePaisa > 0 && data.followupDays === 0) {
      return fail("Set how many days the follow-up rate lasts, or clear the rate.");
    }

    const payload: ServiceInput = {
      name: data.name,
      code: data.code,
      groupId: data.groupId,
      ratePaisa: data.ratePaisa,
      doctorRequired: data.doctorRequired,
      defaultDoctorId: data.defaultDoctorId || null,
      outsourced: data.outsourced,
      defaultLabPartnerId: data.defaultLabPartnerId || null,
      partnerCostPaisa: data.partnerCostPaisa,
      sampleType: data.sampleType,
      followupDays: data.followupDays,
      followupRatePaisa: data.followupRatePaisa,
      vatApplicable: data.vatApplicable,
      active: data.active,
    };

    if (id) {
      const before = await getService(id);
      if (!before) return fail("That service is no longer there.");
      await updateService(id, payload);
      // A price change is worth a line in the log: it is the number that ends
      // up on every future bill.
      if (before.ratePaisa !== payload.ratePaisa) {
        await recordAudit(user.id, "service.rate_changed", { entity: "service", entityId: id, detail: `${before.name}: ${before.ratePaisa} → ${payload.ratePaisa} paisa` });
      } else {
        await recordAudit(user.id, "service.updated", { entity: "service", entityId: id, detail: payload.name });
      }
    } else {
      const newId = await createService(payload);
      await recordAudit(user.id, "service.created", { entity: "service", entityId: newId, detail: payload.name });
      revalidatePath("/settings/services");
      return { ok: true, id: newId };
    }

    revalidatePath("/settings/services");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

export async function saveServiceGroupAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await guard();
    const parsed = serviceGroupSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
    }
    const data = parsed.data;

    if (id) {
      await updateServiceGroup(id, data);
      await recordAudit(user.id, "service_group.updated", { entity: "service_group", entityId: id, detail: data.name });
    } else {
      const newId = await createServiceGroup(data);
      await recordAudit(user.id, "service_group.created", { entity: "service_group", entityId: newId, detail: data.name });
    }
    revalidatePath("/settings/services");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

/**
 * A group is only ever really deleted while it is empty. Once anything has
 * been filed under it, deactivating is the honest move — old bills still
 * belong to it.
 */
export async function removeServiceGroupAction(id: string): Promise<ActionResult> {
  try {
    const user = await guard();
    if (await groupHasServices(id)) {
      return fail(
        "This group still has services in it. Move them first, or switch the group off instead.",
      );
    }
    await deleteServiceGroup(id);
    await recordAudit(user.id, "service_group.deleted", { entity: "service_group", entityId: id, detail: "" });
    revalidatePath("/settings/services");
    return OK;
  } catch (err) {
    return handle(err);
  }
}

// ---------------------------------------------------------------------------
// Doctors
// ---------------------------------------------------------------------------

export async function saveDoctorAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await guard();
    const parsed = doctorSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
    }
    const data = parsed.data;

    if (data.shareBasis !== "none" && data.shareValue <= 0) {
      return fail("Enter what the doctor's share is, or set the share to none.");
    }
    if (
      (data.shareBasis === "pct_consult" || data.shareBasis === "pct_services") &&
      data.shareValue > 10_000
    ) {
      return fail("A share cannot be more than 100%.");
    }

    // A sign-in belongs to one doctor. Attaching one that is already spoken
    // for would show two doctors the same list, so it is refused.
    const userId = data.userId.trim() || null;
    if (userId) {
      const login = await getUserById(userId);
      if (!login || login.role !== "doctor") {
        return fail("That sign-in can't be used for a doctor. Make one with the Doctor role under Users.");
      }
      if (await userIdTaken(userId, id)) {
        return fail("That sign-in already belongs to another doctor.");
      }
    }

    const payload: DoctorInput = {
      name: data.name,
      qualification: data.qualification,
      specialty: data.specialty,
      nmcNo: data.nmcNo,
      phone: data.phone,
      email: data.email,
      userId,
      notifyPush: data.notifyPush,
      notifyEmail: data.notifyEmail,
      shareBasis: data.shareBasis,
      shareValue: data.shareBasis === "none" ? 0 : data.shareValue,
      active: data.active,
    };

    if (id) {
      const before = await getDoctor(id);
      if (!before) return fail("That doctor is no longer there.");
      await updateDoctor(id, payload);
      await recordAudit(user.id, before.shareBasis !== payload.shareBasis ||
          before.shareValue !== payload.shareValue
            ? "doctor.share_changed"
            : "doctor.updated", { entity: "doctor", entityId: id, detail: payload.name });
      revalidatePath("/settings/doctors");
      return OK;
    }

    const newId = await createDoctor(payload);
    await recordAudit(user.id, "doctor.created", { entity: "doctor", entityId: newId, detail: payload.name });
    revalidatePath("/settings/doctors");
    return { ok: true, id: newId };
  } catch (err) {
    return handle(err);
  }
}

// ---------------------------------------------------------------------------
// Lab partners
// ---------------------------------------------------------------------------

export async function saveLabPartnerAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult> {
  try {
    const user = await guard();
    const parsed = labPartnerSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
    }
    const payload: LabPartnerInput = parsed.data;

    if (id) {
      const before = await getLabPartner(id);
      if (!before) return fail("That laboratory is no longer there.");
      await updateLabPartner(id, payload);
      await recordAudit(user.id, "lab_partner.updated", { entity: "lab_partner", entityId: id, detail: payload.name });
      revalidatePath("/settings/lab-partners");
      return OK;
    }

    const newId = await createLabPartner(payload);
    await recordAudit(user.id, "lab_partner.created", { entity: "lab_partner", entityId: newId, detail: payload.name });
    revalidatePath("/settings/lab-partners");
    return { ok: true, id: newId };
  } catch (err) {
    return handle(err);
  }
}

// ---------------------------------------------------------------------------
// Laboratory payments
// ---------------------------------------------------------------------------

export async function recordPartnerPaymentAction(input: {
  partnerId: string;
  dateBs: string;
  amountPaisa: number;
  method: string;
  note: string;
}): Promise<ActionResult> {
  try {
    const user = await guard();

    const parsed = labPartnerPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Please check the details.");
    }
    const data = parsed.data;

    const partner = await getLabPartner(data.partnerId);
    if (!partner) return fail("That laboratory is no longer there.");

    // A payment is dated, and a dated thing belongs to a fiscal year. Booking
    // money into a year that has been closed would change figures the owner
    // has already signed off, so it is refused (D-029).
    const bs = bsFromDbText(data.dateBs);
    const dateAd = adToIso(toAD(bs));
    const year = await getFiscalYearByLabel(fiscalYearOf(bs).label);
    if (year) await assertYearOpen(year.id);

    const id = await recordPartnerPayment({
      partnerId: data.partnerId,
      dateAd,
      dateBs: data.dateBs,
      amountPaisa: data.amountPaisa,
      method: data.method,
      note: data.note,
      userId: user.id,
    });

    await recordAudit(user.id, "lab_partner.payment", {
      entity: "lab_partner",
      entityId: data.partnerId,
      detail: `${partner.name}: ${data.amountPaisa} paisa by ${data.method}`,
      paymentId: id,
    });

    revalidatePath("/reports/lab-partners");
    revalidatePath("/payables");
    return OK;
  } catch (err) {
    return handle(err);
  }
}
