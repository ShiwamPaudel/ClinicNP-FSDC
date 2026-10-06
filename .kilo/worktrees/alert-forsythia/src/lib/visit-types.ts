/**
 * visit-types.ts — the visit vocabulary, shared by the server and the browser.
 *
 * These live outside lib/repos because the repo layer is `server-only`, and the
 * counter and the visit screens need the same labels. Types and labels only —
 * no data access.
 */

export type VisitType = "new" | "followup" | "report_review";
export type VisitStatus = "waiting" | "seen" | "closed" | "cancelled";

export const VISIT_TYPE_LABEL: Record<VisitType, string> = {
  new: "New",
  followup: "Follow-up",
  report_review: "Review of report",
};

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  waiting: "Waiting",
  seen: "Seen",
  closed: "Closed",
  cancelled: "Cancelled",
};

/** The statuses the front desk can choose; cancelling has its own path. */
export const SELECTABLE_VISIT_STATUSES: Exclude<VisitStatus, "cancelled">[] = [
  "waiting",
  "seen",
  "closed",
];
