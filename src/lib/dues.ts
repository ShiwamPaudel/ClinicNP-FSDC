/**
 * dues.ts — what somebody still owes, worked out the same way everywhere.
 *
 * A bill on dues is a bill where the patient paid part of the total at the
 * counter, or none of it, and owes the rest. Every screen that says how much
 * is owed — the counter, the bill, the Dues list, the patient's card, the day
 * close — gets the figure from here, so no two of them can disagree.
 *
 * Pure and client-safe: no database, no server-only imports. The repo reads
 * the numbers; this decides what they mean.
 *
 * All money is integer paisa (Rules §1.2).
 */
import { formatPaisa } from "@/lib/money";

/** How a bill was paid for at the counter, as stored. 'credit' is "on dues". */
export type SaleMethod = "cash" | "qr" | "credit";

/** How money that did change hands was paid. */
export type MoneyMethod = "cash" | "qr";

export const MONEY_METHOD_LABEL: Record<MoneyMethod, string> = {
  cash: "Cash",
  qr: "QR / wallet",
};

/** Every word a screen uses for how a bill was paid. */
export const SALE_METHOD_LABEL: Record<SaleMethod, string> = {
  cash: "Cash",
  qr: "QR / wallet",
  credit: "Dues",
};

export function isMoneyMethod(v: unknown): v is MoneyMethod {
  return v === "cash" || v === "qr";
}

/**
 * Split a sale into what was paid at the counter and what was left owing.
 *
 * `paidNowPaisa` only means anything on a bill on dues; a cash or QR bill is
 * paid in full by definition. It is clamped to the total, so a counter whose
 * total was a little higher than the server's cannot leave a negative debt.
 *
 * A bill on dues where everything was paid after all is not on dues. It is
 * stored as an ordinary paid bill, in the way the money actually came in.
 */
export function splitAtSale(
  totalPaisa: number,
  method: SaleMethod,
  paidNowPaisa: number,
  paidNowMethod: MoneyMethod,
): {
  method: SaleMethod;
  duePaisa: number;
  /** only set on a bill that is really on dues and had something paid */
  paidNowMethod: MoneyMethod | null;
} {
  const total = Math.max(0, Math.trunc(totalPaisa));
  if (method !== "credit") {
    return { method, duePaisa: 0, paidNowMethod: null };
  }
  const paid = Math.min(total, Math.max(0, Math.trunc(paidNowPaisa)));
  const due = total - paid;
  if (due === 0) {
    // Nothing is left owing: an ordinary bill paid in whatever came in. A
    // zero-total bill with nothing paid is cash, as it always was.
    return {
      method: paid > 0 ? paidNowMethod : "cash",
      duePaisa: 0,
      paidNowMethod: null,
    };
  }
  return {
    method: "credit",
    duePaisa: due,
    paidNowMethod: paid > 0 ? paidNowMethod : null,
  };
}

/** Everything about one bill that decides what it still owes. */
export interface DueFacts {
  method: string;
  status: string;
  /** set only by the old "Mark paid" button: cleared in full, amount unrecorded */
  settledInFull: boolean;
  /** left owing at the sale */
  duePaisa: number;
  /** received since, voided payments excluded */
  receivedPaisa: number;
  /** taken off the debt by returns */
  returnedAgainstDuePaisa: number;
}

/** What a bill still owes today. Never negative. */
export function balanceDue(f: DueFacts): number {
  if (f.method !== "credit") return 0;
  if (f.status === "cancelled") return 0;
  if (f.settledInFull) return 0;
  return Math.max(0, f.duePaisa - f.receivedPaisa - f.returnedAgainstDuePaisa);
}

/**
 * How a return on a bill splits between the debt and the drawer.
 *
 * Whatever the patient still owes is taken off first: they are not handed
 * money for something they have not finished paying for. Only what is left
 * after the debt is cleared goes back to them in cash.
 */
export function splitReturn(
  returnPaisa: number,
  balanceBeforePaisa: number,
): { againstDuePaisa: number; handBackPaisa: number } {
  const ret = Math.max(0, returnPaisa);
  const againstDue = Math.min(ret, Math.max(0, balanceBeforePaisa));
  return { againstDuePaisa: againstDue, handBackPaisa: ret - againstDue };
}

/** A bill still owing, as the allocator needs it: oldest first. */
export interface OwingBill {
  id: string;
  balancePaisa: number;
}

/**
 * A payment the dues cannot take, with a sentence written for the screen
 * (Rules §1c: recognise your own errors by type).
 */
export class DuePaymentError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string) {
    super(userMessage);
    this.name = "DuePaymentError";
    this.userMessage = userMessage;
  }
}

/** More was offered than is owed. */
export function overpaymentError(owedPaisa: number): DuePaymentError {
  return new DuePaymentError(
    owedPaisa > 0
      ? `That is more than is owed. They owe ${formatPaisa(owedPaisa)}.`
      : "Nothing is owed on this any more.",
  );
}

/**
 * Spread one payment across a person's bills, oldest first.
 *
 * The oldest debt is cleared before the newest is touched, which is what a
 * counter does by hand and what keeps the "oldest" column honest. Bills the
 * payment does not reach are left out of the result.
 */
export function allocateOldestFirst(
  amountPaisa: number,
  bills: OwingBill[],
): { billId: string; amountPaisa: number }[] {
  let left = Math.max(0, Math.trunc(amountPaisa));
  const out: { billId: string; amountPaisa: number }[] = [];
  for (const b of bills) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, b.balancePaisa));
    if (take <= 0) continue;
    out.push({ billId: b.id, amountPaisa: take });
    left -= take;
  }
  return out;
}

export function totalOwed(bills: { balancePaisa: number }[]): number {
  return bills.reduce((s, b) => s + Math.max(0, b.balancePaisa), 0);
}

/** Whole days between a bill's date and today, never negative. */
export function ageInDays(dateAd: string, todayAd: string): number {
  const ms = Date.parse(`${todayAd}T00:00:00Z`) - Date.parse(`${dateAd}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.round(ms / 86_400_000));
}

// ---- grouping by person ----

/** A bill still owing, with who it belongs to. Client-safe. */
export interface OwedBill {
  id: string;
  invoiceNo: number | null;
  fiscalLabel: string;
  dateAd: string;
  dateBs: string;
  totalPaisa: number;
  /** left owing at the sale */
  duePaisa: number;
  receivedPaisa: number;
  returnedAgainstDuePaisa: number;
  balancePaisa: number;
  patientId: string | null;
  patientNo: number | null;
  /** the registered name, or what was typed on the bill */
  name: string;
  phone: string;
}

/** Everything one person owes. */
export interface DuePerson {
  /**
   * Stable across a page load. A registered patient is keyed by their id; a
   * name typed on a bill by the name itself, folded; a bill with no name at
   * all stands on its own, because two strangers are not one debtor.
   */
  key: string;
  patientId: string | null;
  patientNo: number | null;
  name: string;
  phone: string;
  owedPaisa: number;
  oldestDateAd: string;
  oldestDays: number;
  /** oldest first, which is the order a payment clears them in */
  bills: OwedBill[];
}

export function personKey(b: {
  id: string;
  patientId: string | null;
  name: string;
}): string {
  if (b.patientId) return `p:${b.patientId}`;
  const folded = b.name.trim().replace(/\s+/g, " ").toLowerCase();
  if (folded) return `n:${folded}`;
  return `b:${b.id}`;
}

/** Oldest first: by date, then by invoice number, then by id. */
export function compareOldestFirst(
  a: { dateAd: string; invoiceNo: number | null; id: string },
  b: { dateAd: string; invoiceNo: number | null; id: string },
): number {
  if (a.dateAd !== b.dateAd) return a.dateAd < b.dateAd ? -1 : 1;
  const ai = a.invoiceNo ?? Number.MAX_SAFE_INTEGER;
  const bi = b.invoiceNo ?? Number.MAX_SAFE_INTEGER;
  if (ai !== bi) return ai - bi;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Group owing bills by who owes them, largest debt first.
 *
 * Bills that owe nothing are dropped: the list is of people who owe money,
 * not of everybody who ever bought on dues.
 */
export function groupByPerson(bills: OwedBill[], todayAd: string): DuePerson[] {
  const byKey = new Map<string, DuePerson>();
  const sorted = [...bills]
    .filter((b) => b.balancePaisa > 0)
    .sort(compareOldestFirst);
  for (const b of sorted) {
    const key = personKey(b);
    let p = byKey.get(key);
    if (!p) {
      p = {
        key,
        patientId: b.patientId,
        patientNo: b.patientNo,
        name: b.name.trim(),
        phone: b.phone,
        owedPaisa: 0,
        oldestDateAd: b.dateAd,
        oldestDays: ageInDays(b.dateAd, todayAd),
        bills: [],
      };
      byKey.set(key, p);
    }
    p.owedPaisa += b.balancePaisa;
    p.bills.push(b);
    if (!p.phone && b.phone) p.phone = b.phone;
  }
  return [...byKey.values()].sort(
    (a, b) => b.owedPaisa - a.owedPaisa || a.oldestDateAd.localeCompare(b.oldestDateAd),
  );
}
