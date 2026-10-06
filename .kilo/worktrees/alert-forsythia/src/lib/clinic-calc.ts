/**
 * clinic-calc.ts — the money rules that are specific to a service line.
 *
 * Pure, no imports from the server, no Date.now(). The browser runs it to
 * preview a line and the server runs it to decide what is actually charged.
 * The server always wins: if the two disagree by even one paisa the bill is
 * refused back to the outbox with the reason, rather than the printed total
 * quietly differing from what the person at the counter saw (Architecture §5.3).
 *
 * Everything is integer paisa. Nothing here reads the clock or the database.
 */
import { adFromIso, adToIso } from "@/lib/bs";

// ---------------------------------------------------------------------------
// The follow-up rule
// ---------------------------------------------------------------------------

/** The fields of a service the follow-up rule cares about. */
export interface FollowupServiceSpec {
  ratePaisa: number;
  /** Days of free or reduced follow-up. 0 means the service has no rule. */
  followupDays: number;
  /** What a follow-up costs inside the window. 0 means free. */
  followupRatePaisa: number;
}

export interface FollowupResult {
  ratePaisa: number;
  applied: boolean;
  /**
   * What the counter and the invoice say about it, in plain language.
   * Empty when the rule did not fire.
   */
  note: string;
  /** Days between the previous consultation and today, when there was one. */
  daysSince: number | null;
}

/**
 * Whole days between two AD dates, both ISO `YYYY-MM-DD`.
 *
 * Deliberately computed from the ISO date text via lib/bs, never from raw
 * local-time Date arithmetic: a clinic that bills at 9pm during a daylight
 * shift would otherwise see a follow-up window drift by a day.
 */
export function daysBetweenAd(fromIso: string, toIso: string): number {
  const a = adFromIso(fromIso);
  const b = adFromIso(toIso);
  const MS_PER_DAY = 86_400_000;
  // Both dates are constructed at local midnight by adFromIso, so the
  // difference is a whole number of days apart from DST, which rounding fixes.
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * Decide what a follow-up consultation costs.
 *
 * `lastConsultAd` is the AD date of this patient's most recent consultation
 * **with the same doctor** — the caller is responsible for that lookup, because
 * only the server can do it honestly.
 */
export function resolveFollowup(
  service: FollowupServiceSpec,
  todayAd: string,
  lastConsultAd: string | null,
): FollowupResult {
  const full: FollowupResult = {
    ratePaisa: service.ratePaisa,
    applied: false,
    note: "",
    daysSince: null,
  };

  if (service.followupDays <= 0) return full;
  if (!lastConsultAd) return full;

  const daysSince = daysBetweenAd(lastConsultAd, todayAd);
  // A consultation dated in the future is a data problem, not a follow-up.
  if (daysSince < 0) return full;
  if (daysSince > service.followupDays) return { ...full, daysSince };

  const rate = service.followupRatePaisa;
  return {
    ratePaisa: rate,
    applied: true,
    daysSince,
    note:
      rate === 0
        ? `Follow-up within ${service.followupDays} days — no charge.`
        : `Follow-up within ${service.followupDays} days — reduced rate.`,
  };
}

// ---------------------------------------------------------------------------
// Service line totals
// ---------------------------------------------------------------------------

/** A service line as the counter holds it, before the bill's own discount. */
export interface ServiceLineInput {
  qty: number;
  ratePaisa: number;
  discountPaisa: number;
}

/** Line amount (qty × rate − discount), never negative. Same shape as a medicine line. */
export function serviceLineAmountPaisa(line: ServiceLineInput): number {
  return Math.max(0, line.qty * line.ratePaisa - line.discountPaisa);
}

// ---------------------------------------------------------------------------
// The doctor's share
// ---------------------------------------------------------------------------

export type ShareBasis = "none" | "pct_consult" | "fixed_consult" | "pct_services";

export const SHARE_BASIS_LABEL: Record<ShareBasis, string> = {
  none: "No share",
  pct_consult: "Percentage of consultations",
  fixed_consult: "Fixed amount per consultation",
  pct_services: "Percentage of all services",
};

/** How a doctor is paid, as snapshotted onto the bill line at billing time. */
export interface DoctorShareSpec {
  basis: ShareBasis;
  /** Basis points (1% = 100) for the percentage bases; paisa for fixed_consult. */
  value: number;
}

/**
 * What the doctor earns from one service line.
 *
 * `isConsultation` is decided by the caller from the service's group, because
 * a clinic can rename and reorder its groups — the rule is "this group is a
 * consultation group", not "this group is called OPD Consultation".
 *
 * Rounding is floor-to-paisa; the remainder stays with the clinic, which the
 * payout report states once in its footer (Architecture §5.4).
 */
export function doctorSharePaisa(
  share: DoctorShareSpec,
  amountPaisa: number,
  qty: number,
  isConsultation: boolean,
): number {
  if (amountPaisa <= 0 && share.basis !== "fixed_consult") return 0;
  switch (share.basis) {
    case "none":
      return 0;
    case "pct_consult":
      if (!isConsultation) return 0;
      return Math.floor((amountPaisa * share.value) / 10_000);
    case "fixed_consult":
      if (!isConsultation) return 0;
      return Math.max(0, share.value * qty);
    case "pct_services":
      return Math.floor((amountPaisa * share.value) / 10_000);
    default:
      return 0;
  }
}

/** Human wording for a share, for the doctor form and the payout sheet. */
export function describeShare(share: DoctorShareSpec): string {
  switch (share.basis) {
    case "none":
      return "No share";
    case "pct_consult":
      return `${(share.value / 100).toFixed(share.value % 100 === 0 ? 0 : 2)}% of consultations`;
    case "fixed_consult":
      return `Rs ${(share.value / 100).toFixed(2)} per consultation`;
    case "pct_services":
      return `${(share.value / 100).toFixed(share.value % 100 === 0 ? 0 : 2)}% of all services`;
    default:
      return "No share";
  }
}

// ---------------------------------------------------------------------------
// Helpers shared by the counter and the ingest route
// ---------------------------------------------------------------------------

/** Today as an ISO AD date, for callers that only have a Date. */
export function isoOf(d: Date): string {
  return adToIso(d);
}
