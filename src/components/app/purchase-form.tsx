"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePickerBS } from "@/components/ui/date-picker-bs";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { InvoicePhotoButton } from "@/components/app/invoice-photo";
import {
  createPurchaseAction,
  updatePurchaseAction,
} from "@/app/(app)/purchases/actions";
import { toPaisa, formatPaisa, vatOf } from "@/lib/money";
import { clampPercent, resolveBillDiscount, type DiscountMode } from "@/lib/discount";
import { bsToDbText, today, toAD, toBS } from "@/lib/bs";
import { PAYABLE_METHOD_LABEL } from "@/lib/payables";
import type { Draft } from "@/lib/invoice-read/draft";
import type { Item } from "@/lib/repos/items";
import type { Supplier } from "@/lib/repos/suppliers";
import { strings } from "@/lib/strings";

interface LineState {
  itemId: string;
  unitLevel: number;
  batchNo: string;
  expiryDateBs: string;
  qty: string;
  freeQty: string;
  costRupees: string;
  discountRupees: string;
  /**
   * The selling price for the unit on this line. Pre-filled with the item's
   * current price when the item or unit is chosen; saving a different figure
   * updates the item's price for that unit (0022). Blank = leave it alone.
   */
  sellRupees: string;
  /** Edit only: the saved line this row is. A new row has none. */
  lineId?: string;
  /**
   * Edit only: something other than this purchase has already moved stock in
   * its batch, so the item cannot be swapped and the line cannot be removed.
   */
  locked?: boolean;
  /**
   * Only set on lines that came off a photo: the medicine's name as the
   * supplier printed it, and whether the row's own arithmetic disagreed with
   * the printed amount. Both are shown beside the boxes and neither is saved.
   */
  printedName?: string;
  amountDisagrees?: boolean;
  /**
   * The expiry is still the one a new row starts with (four years from today)
   * and has not been changed to the pack's own. Said under the box until it is.
   */
  expiryIsDefault?: boolean;
}

/** How far ahead a new row's expiry starts: the owner's choice, edited to the pack's. */
const DEFAULT_EXPIRY_YEARS = 4;

/** Today plus four years, as the BS text a date box holds. */
function defaultExpiryBs(): string {
  const ad = toAD(today());
  ad.setFullYear(ad.getFullYear() + DEFAULT_EXPIRY_YEARS);
  return bsToDbText(toBS(ad));
}

function blankLine(): LineState {
  return {
    itemId: "",
    unitLevel: 0,
    batchNo: "",
    expiryDateBs: defaultExpiryBs(),
    expiryIsDefault: true,
    qty: "1",
    freeQty: "0",
    costRupees: "0",
    discountRupees: "0",
    sellRupees: "",
  };
}

/** A saved purchase, shaped for the form, when it is opened to be edited. */
export interface PurchaseFormInitial {
  purchaseId: string;
  purchaseNo: string | null;
  supplierId: string;
  supplierInvoiceNo: string;
  dateBs: string;
  applyVat: boolean;
  billDiscountRupees: string;
  roundingRupees: string;
  lines: Omit<LineState, "printedName" | "amountDisagrees">[];
}

/** An item's current price for one unit, as the rupees a box shows. */
function rateFor(item: Item | undefined, level: number): string {
  const paisa = item?.units.find((u) => u.level === level)?.sellingRatePaisa ?? 0;
  if (paisa <= 0) return "";
  const rupees = paisa / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

export function PurchaseForm({
  items,
  suppliers,
  initial,
  forUse = false,
}: {
  items: Item[];
  suppliers: Supplier[];
  /**
   * The clinic uses what it buys and sells none of it (no pharmacy). A line is
   * then the item, unit, quantity and cost: no batch, expiry, bonus or selling
   * price, and the server ignores them if sent (C-035).
   */
  forUse?: boolean;
  /**
   * A saved purchase to change. Absent = a new purchase, which behaves
   * exactly as it always has; present = the edit screen, which saves through
   * `updatePurchaseAction` after the admin re-types their password.
   */
  initial?: PurchaseFormInitial;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = initial !== undefined;
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [invoiceNo, setInvoiceNo] = useState(initial?.supplierInvoiceNo ?? "");
  const [dateBs, setDateBs] = useState(initial?.dateBs ?? bsToDbText(today()));
  const [applyVat, setApplyVat] = useState(initial?.applyVat ?? false);
  // Suppliers take their discount off the whole bill, after the lines: some
  // print a percentage ("10% Discount"), some an amount ("LESS DISCOUNT
  // 480.61"), and most then round the net total to whole rupees (D-143).
  const [billDiscountMode, setBillDiscountMode] = useState<DiscountMode>("amount");
  const [billDiscountRupees, setBillDiscountRupees] = useState(
    initial?.billDiscountRupees ?? "",
  );
  const [billDiscountPercent, setBillDiscountPercent] = useState("");
  const [roundingRupees, setRoundingRupees] = useState(initial?.roundingRupees ?? "");
  const [lines, setLines] = useState<LineState[]>(
    initial ? initial.lines.map((l) => ({ ...l })) : [blankLine()],
  );
  const [busy, setBusy] = useState(false);
  const [showBonus, setShowBonus] = useState(
    initial ? initial.lines.some((l) => Number(l.freeQty) > 0) : false,
  );
  // Edit only: the password prompt, and what it last said.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");
  // What a photo said the bill came to, kept only so the form can say whether
  // the two agree. It is never what gets saved — the lines are.
  const [billNetTotalPaisa, setBillNetTotalPaisa] = useState<number | null>(null);
  // New purchase only: what was handed over with it (0023). "On credit" —
  // nothing paid — is where it starts, which is what every purchase was
  // before this existed.
  const [payMode, setPayMode] = useState<PayMode>("credit");
  const [paidRupees, setPaidRupees] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

  function setLine(i: number, patch: Partial<LineState>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  /**
   * Put what was read off a photo into the boxes. Everything is replaced, not
   * merged: a half-typed purchase and a photo of a different bill have nothing
   * to do with each other, and quietly mixing the two would be the worst of
   * both. The supplier is left alone — a name on a bill is not a supplier
   * record, and picking the wrong one puts money on the wrong ledger.
   */
  function applyDraft(draft: Draft) {
    if (draft.invoiceNo) setInvoiceNo(draft.invoiceNo);
    if (draft.dateBs) setDateBs(draft.dateBs);
    setApplyVat(draft.applyVat);
    setBillDiscountMode("amount");
    setBillDiscountRupees(draft.billDiscountRupees);
    setBillDiscountPercent("");
    setRoundingRupees(draft.roundingRupees);
    setBillNetTotalPaisa(draft.netTotalPaisa);
    if (draft.lines.some((l) => Number(l.freeQty) > 0)) setShowBonus(true);
    setLines(
      draft.lines.map((l) => ({
        ...blankLine(),
        itemId: l.itemId,
        unitLevel: l.unitLevel,
        batchNo: l.batchNo,
        // What the bill printed, or empty when it printed none — never the
        // four-years-ahead default, which would pass for a date read off it.
        expiryDateBs: l.expiryDateBs,
        expiryIsDefault: false,
        qty: l.qty,
        freeQty: l.freeQty,
        costRupees: l.costRupees,
        sellRupees: rateFor(itemsById.get(l.itemId), l.unitLevel),
        printedName: l.printedName,
        amountDisagrees: l.amountDisagrees,
      })),
    );
  }

  function onItemChange(i: number, itemId: string) {
    const item = itemsById.get(itemId);
    // default to the largest unit (usual purchase unit)
    const topLevel = item
      ? Math.max(...item.units.map((u) => u.level))
      : 0;
    setLine(i, { itemId, unitLevel: topLevel, sellRupees: rateFor(item, topLevel) });
  }

  /** A price belongs to a unit, so a new unit brings its own price with it. */
  function onUnitChange(i: number, unitLevel: number) {
    const item = itemsById.get(lines[i]?.itemId ?? "");
    setLine(i, { unitLevel, sellRupees: rateFor(item, unitLevel) });
  }

  const totals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    for (const l of lines) {
      const qty = Number(l.qty) || 0;
      const cost = toPaisa(Number(l.costRupees) || 0);
      const disc = toPaisa(Number(l.discountRupees) || 0);
      subtotal += qty * cost;
      discount += disc;
    }
    const afterLines = Math.max(0, subtotal - discount);
    // The paper's order: lines, the discount on the whole bill, VAT on what is
    // left, then the rounding line.
    const billDiscount = Math.min(
      resolveBillDiscount(
        afterLines,
        billDiscountMode,
        toPaisa(Number(billDiscountRupees) || 0),
        Number(billDiscountPercent) || 0,
      ),
      afterLines,
    );
    const taxable = afterLines - billDiscount;
    const vat = applyVat ? vatOf(taxable) : 0;
    const rounding = toPaisa(Number(roundingRupees) || 0);
    return {
      subtotal,
      discount,
      billDiscount,
      taxable,
      vat,
      rounding,
      total: taxable + vat + rounding,
    };
  }, [
    lines,
    applyVat,
    billDiscountMode,
    billDiscountRupees,
    billDiscountPercent,
    roundingRupees,
  ]);

  /** What is being paid now, as the form reads it. */
  const paidNowPaisa =
    payMode === "full"
      ? Math.max(0, totals.total)
      : payMode === "part"
        ? toPaisa(Number(paidRupees) || 0)
        : 0;

  /** Lines a photo filled in but could not find a medicine for. */
  const unmatched = lines.filter((l) => l.printedName && !l.itemId).length;

  async function submit() {
    if (!supplierId) {
      toast.error("Choose a supplier.");
      return;
    }
    // Batch number and expiry date are required on every line — they drive
    // sell-oldest-first and the expiry warnings. The manufacture date is
    // optional: many packs and supplier bills do not print one.
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (!l.itemId) {
        toast.error(`Line ${i + 1}: choose an item.`);
        return;
      }
      if (forUse) continue;
      if (!l.batchNo.trim()) {
        toast.error(`Line ${i + 1}: enter the batch number.`);
        return;
      }
      if (!l.expiryDateBs) {
        toast.error(`Line ${i + 1}: enter the expiry date.`);
        return;
      }
      if (l.sellRupees.trim() !== "" && !(Number(l.sellRupees) >= 0)) {
        toast.error(`Line ${i + 1}: the selling price is not a number.`);
        return;
      }
    }
    if (billDiscountMode === "percent" && Number(billDiscountPercent) > 100) {
      toast.error("A discount cannot be more than 100%.");
      return;
    }
    // A change to a saved purchase is not saved until the admin types their
    // password; the prompt does the rest.
    if (editing) {
      setPassword("");
      setConfirmError("");
      setConfirmOpen(true);
      return;
    }
    if (payMode === "part") {
      if (!(Number(paidRupees) > 0)) {
        toast.error("Enter how much was paid, or choose On credit.");
        return;
      }
      if (paidNowPaisa > totals.total) {
        toast.error("The amount paid is more than the bill. Choose Paid in full, or check the amount.");
        return;
      }
    }
    setBusy(true);
    const res = await createPurchaseAction({
      ...payload(),
      payment: {
        mode: payMode,
        amountPaisa: payMode === "part" ? paidNowPaisa : 0,
        method: payMethod,
      },
    });
    setBusy(false);
    if (res.ok) {
      toast.success(`Purchase saved (${res.purchaseNo})`);
      router.push("/purchases");
      router.refresh();
    } else {
      toast.error(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  async function saveEdit() {
    if (!initial) return;
    if (!password) {
      setConfirmError("Enter your password.");
      return;
    }
    setBusy(true);
    const res = await updatePurchaseAction({
      ...payload(),
      purchaseId: initial.purchaseId,
      password,
    });
    setBusy(false);
    setPassword("");
    if (res.ok) {
      setConfirmOpen(false);
      toast.success(
        initial.purchaseNo ? `Purchase ${initial.purchaseNo} updated` : "Purchase updated",
      );
      router.push(`/purchases/${initial.purchaseId}`);
      router.refresh();
    } else {
      // Stays open: a wrong password or a stock refusal is read here, next to
      // the thing that caused it, and the form behind keeps every change.
      setConfirmError(res.userMessage ?? strings.somethingWentWrong);
    }
  }

  /** What is sent for a save, new or edited. */
  function payload() {
    return {
      supplierId,
      supplierInvoiceNo: invoiceNo,
      dateBs,
      applyVat,
      billDiscountPaisa: totals.billDiscount,
      roundingPaisa: totals.rounding,
      lines: lines.map((l) => ({
        lineId: l.lineId,
        itemId: l.itemId,
        batchNo: forUse ? "" : l.batchNo.trim(),
        // Not collected on this screen any more. The server still
        // accepts it and stores empty as NULL, so nothing behind
        // the form had to change.
        mfgDateBs: "",
        expiryDateBs: forUse ? "" : l.expiryDateBs,
        unitLevel: Number(l.unitLevel),
        qty: Number(l.qty) || 0,
        freeQty: forUse ? 0 : Number(l.freeQty) || 0,
        unitCostPaisa: toPaisa(Number(l.costRupees) || 0),
        discountPaisa: toPaisa(Number(l.discountRupees) || 0),
        sellingRatePaisa: forUse ? 0 : toPaisa(Number(l.sellRupees) || 0),
      })),
    };
  }

  return (
    <div className="flex flex-col gap-6">
      {/* A photo replaces every line, which is what a new purchase wants and
          exactly what an edit must not do. */}
      {!editing && (
        <section className="rounded-[10px] border border-line bg-cream-50 p-4">
          <InvoicePhotoButton items={items} onDraft={applyDraft} />
        </section>
      )}

      <section className="rounded-[10px] border border-line bg-cream-50 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— Choose —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Supplier invoice no.">
            <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
          </Field>
          <Field label="Date">
            {/* Typed or picked, like the expiry — the date is copied off the
                supplier's bill too. */}
            <DatePickerBS value={dateBs} onChange={setDateBs} typable />
          </Field>
        </div>
      </section>

      <section className="rounded-[10px] border border-line bg-cream-50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-sage-900">Items</h2>
          <div className="flex items-center gap-4">
            {/* Free goods only change the cost of stock for sale. */}
            {!forUse && (
              <label className="flex items-center gap-1.5 text-[13px] text-sage-600">
                <input
                  type="checkbox"
                  checked={showBonus}
                  onChange={(e) => setShowBonus(e.target.checked)}
                />
                Bonus (free) qty
              </label>
            )}
            {unmatched > 0 && (
              <button
                type="button"
                onClick={() => router.refresh()}
                className="flex items-center gap-1.5 text-[13px] text-sage-600 underline-offset-2 hover:text-sage-900 hover:underline"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reload the item list
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {lines.map((l, i) => {
            const item = itemsById.get(l.itemId);
            return (
              <div
                key={i}
                className="rounded-[8px] border border-line bg-cream-100 p-3"
              >
                {l.amountDisagrees && (
                  <p className="mb-2 flex items-center gap-1.5 text-[12px] text-danger-600">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                    Quantity times rate did not come to the amount printed on
                    this row. Check all three against the paper.
                  </p>
                )}
                {/* One row per medicine: item, unit, batch, expiry, quantity
                    and cost read left to right in the order they appear on the
                    supplier's bill, so the eye does not jump between two
                    blocks while checking a line against the paper. It stacks
                    below lg, where a single row would be unreadable. */}
                <div
                  className={
                    "grid gap-3 sm:grid-cols-2 sm:items-end " +
                    (forUse
                      ? "lg:grid-cols-[minmax(0,2.4fr)_1fr_0.7fr_1fr_1fr_auto]"
                      : showBonus
                        ? "lg:pb-4 lg:grid-cols-[minmax(0,1.7fr)_0.8fr_0.95fr_1.15fr_0.6fr_0.6fr_0.85fr_0.85fr_auto]"
                        : "lg:pb-4 lg:grid-cols-[minmax(0,1.9fr)_0.85fr_1fr_1.2fr_0.65fr_0.9fr_0.9fr_auto]")
                  }
                >
                  <Field label="Item">
                    <Select
                      value={l.itemId}
                      onChange={(e) => onItemChange(i, e.target.value)}
                      // Stock from this batch has moved, so it is this item
                      // for good; the server refuses the swap either way.
                      disabled={l.locked}
                      title={l.locked ? lockedNote(forUse, "item") : undefined}
                    >
                      <option value="">— Choose —</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.brandName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Unit">
                    <Select
                      value={String(l.unitLevel)}
                      onChange={(e) => onUnitChange(i, Number(e.target.value))}
                    >
                      {(item?.units ?? [])
                        .sort((a, b) => b.level - a.level)
                        .map((u) => (
                          <option key={u.level} value={u.level}>
                            {u.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  {!forUse && (
                    <Field label="Batch no. *">
                      <Input
                        value={l.batchNo}
                        onChange={(e) => setLine(i, { batchNo: e.target.value })}
                      />
                    </Field>
                  )}
                  {!forUse && (
                    <Field label="Expiry date *">
                      {/* Typed or picked: an expiry is read off the pack, and
                          stepping a month grid out to 2027 is slower than
                          typing it. */}
                      <div className="relative">
                        <DatePickerBS
                          value={l.expiryDateBs}
                          onChange={(v) => setLine(i, { expiryDateBs: v, expiryIsDefault: false })}
                          typable
                        />
                        {l.expiryIsDefault && (
                          <span className={UNDER_BOX + " font-medium text-warn-600"}>
                            4 years from today — change to the pack&apos;s
                          </span>
                        )}
                      </div>
                    </Field>
                  )}
                  <Field label="Qty">
                    <Input
                      numeric
                      inputMode="numeric"
                      value={l.qty}
                      onChange={(e) =>
                        setLine(i, { qty: e.target.value.replace(/\D/g, "") })
                      }
                    />
                  </Field>
                  {showBonus && !forUse && (
                    <Field label="Free">
                      <Input
                        numeric
                        inputMode="numeric"
                        value={l.freeQty}
                        onChange={(e) =>
                          setLine(i, { freeQty: e.target.value.replace(/\D/g, "") })
                        }
                      />
                    </Field>
                  )}
                  <Field label="Cost/unit (रू)">
                    <Input
                      numeric
                      inputMode="decimal"
                      value={l.costRupees}
                      onChange={(e) => setLine(i, { costRupees: e.target.value })}
                    />
                  </Field>
                  {forUse ? (
                    <Field label="Amount (रू)">
                      {/* What the line adds to the bill, to check against the
                          paper's amount column. */}
                      <div className="tnum flex h-10 items-center justify-end rounded-[8px] border border-line bg-cream-50 px-3 text-[14px] text-sage-900">
                        {formatPaisa(
                          Math.max(
                            0,
                            (Number(l.qty) || 0) * toPaisa(Number(l.costRupees) || 0) -
                              toPaisa(Number(l.discountRupees) || 0),
                          ),
                          false,
                        )}
                      </div>
                    </Field>
                  ) : (
                    <Field label="Sell price (रू)">
                      <div className="relative">
                        <Input
                          numeric
                          inputMode="decimal"
                          value={l.sellRupees}
                          // Blank on an old line means "not recorded"; the hint is
                          // the item's price today, which a blank leaves alone.
                          placeholder={rateFor(item, l.unitLevel) || "—"}
                          onChange={(e) => setLine(i, { sellRupees: e.target.value })}
                        />
                        <MarginNote line={l} sellIfBlank={rateFor(item, l.unitLevel)} />
                      </div>
                    </Field>
                  )}
                  <div className="flex h-10 items-center">
                    {l.locked ? (
                      <span
                        className="p-2 text-sage-400"
                        title={lockedNote(forUse, "line")}
                        aria-label="This line can't be removed"
                      >
                        <Lock className="h-4 w-4" />
                      </span>
                    ) : lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setLines((ls) => ls.filter((_, idx) => idx !== i))
                        }
                        aria-label="Remove line"
                        className="rounded-[8px] p-2 text-danger-600 hover:bg-danger-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {/* Selling below cost is almost always a slip of one digit.
                    It is said, not refused: a loss-leader is the shop's call. */}
                {!forUse &&
                  Number(l.sellRupees) > 0 &&
                  Number(l.costRupees) > 0 &&
                  Number(l.sellRupees) < Number(l.costRupees) && (
                    <p className="mt-2 flex items-center gap-1.5 text-[12px] text-danger-600">
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                      The selling price is below the cost of {l.costRupees} —
                      check it before saving.
                    </p>
                  )}
                {/* What the paper actually said, so the person can check the
                    guess — or find the medicine themselves when there was no
                    guess to make. Full width under the row rather than inside
                    the Item box, which would make one line taller than the
                    rest of them. */}
                {l.printedName && (
                  <p
                    className={
                      "mt-2 text-[12px] " +
                      (l.itemId ? "text-sage-500" : "font-medium text-danger-600")
                    }
                  >
                    {l.itemId ? (
                      <>On the bill: {l.printedName}</>
                    ) : (
                      <>
                        &ldquo;{l.printedName}&rdquo; is not in the list — choose it, or{" "}
                        <Link
                          href="/items/new"
                          target="_blank"
                          className="underline underline-offset-2"
                        >
                          add it
                        </Link>{" "}
                        and reload the list.
                      </>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Under the lines rather than up in the heading: the last box on a
            line is the cost, and the next thing to do after typing it is start
            another line. The button is where the hand already is. */}
        <div className="mt-3">
          <Button
            variant="secondary"
            onClick={() => setLines((l) => [...l, blankLine()])}
          >
            <Plus className="h-4 w-4" />
            Add line
          </Button>
        </div>
      </section>

      <section className="flex flex-col items-end gap-2 rounded-[10px] border border-line bg-cream-50 p-6">
        <label className="mb-1 flex items-center gap-2 self-start text-[14px] text-sage-900">
          <input
            type="checkbox"
            checked={applyVat}
            onChange={(e) => setApplyVat(e.target.checked)}
          />
          This purchase includes 13% VAT
        </label>
        {/* The supplier's own totals block, in their order, so the two can be
            read against each other line by line (D-143). */}
        <Row label="Subtotal" value={formatPaisa(totals.subtotal)} />
        {totals.discount > 0 && (
          <Row label="Line discounts" value={`- ${formatPaisa(totals.discount, false)}`} />
        )}

        <div className="flex w-full flex-col items-end gap-1.5 border-t border-line pt-3">
          <div className="mb-0.5 text-[12px] font-semibold uppercase tracking-wide text-sage-500">
            From the supplier&apos;s bill
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-sage-700">Discount on the bill</span>
            <div
              role="group"
              aria-label="Discount on the bill"
              className="inline-flex rounded-[8px] border border-line bg-cream-100 p-0.5"
            >
              <ModeChip
                active={billDiscountMode === "amount"}
                onClick={() => setBillDiscountMode("amount")}
                label="Discount in rupees"
              >
                रू
              </ModeChip>
              <ModeChip
                active={billDiscountMode === "percent"}
                onClick={() => setBillDiscountMode("percent")}
                label="Discount in percent"
              >
                %
              </ModeChip>
            </div>
            {billDiscountMode === "amount" ? (
              <Input
                numeric
                inputMode="decimal"
                className="w-28 text-right"
                aria-label="Discount on the bill, rupees"
                value={billDiscountRupees}
                onChange={(e) => setBillDiscountRupees(e.target.value)}
              />
            ) : (
              <Input
                numeric
                inputMode="decimal"
                className="w-28 text-right"
                aria-label="Discount on the bill, percent"
                value={billDiscountPercent}
                onChange={(e) => setBillDiscountPercent(e.target.value)}
              />
            )}
          </div>
          {billDiscountMode === "percent" && Number(billDiscountPercent) > 0 && (
            <p className="text-[12px] text-sage-500">
              {Number(billDiscountPercent) > 100
                ? "At most 100%."
                : `${clampPercent(Number(billDiscountPercent))}% of ${formatPaisa(
                    Math.max(0, totals.subtotal - totals.discount),
                  )} — ${formatPaisa(totals.billDiscount)}`}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-sage-700">Rounding</span>
            <Input
              numeric
              inputMode="decimal"
              className="w-28 text-right"
              aria-label="Rounding, rupees"
              placeholder="0.00"
              value={roundingRupees}
              onChange={(e) => setRoundingRupees(e.target.value)}
            />
          </div>
          <p className="max-w-[320px] text-right text-[12px] text-sage-500">
            Copy these from the paper. Rounding may be a minus figure.
          </p>
        </div>

        {totals.billDiscount > 0 && (
          <Row label="Taxable amount" value={formatPaisa(totals.taxable)} />
        )}
        {applyVat && <Row label="VAT (13%)" value={formatPaisa(totals.vat)} />}
        {totals.rounding !== 0 && (
          <Row label="Rounding" value={formatPaisa(totals.rounding)} />
        )}
        <div className="flex w-56 justify-between border-t border-line pt-2 text-[16px] font-semibold">
          <span>Net total</span>
          <span className="tnum">{formatPaisa(totals.total)}</span>
        </div>
        {/* The one check that catches a line the photo missed altogether: the
            bill's own net total against what the lines here come to. */}
        {billNetTotalPaisa !== null && (
          <p
            className={
              "max-w-[320px] text-right text-[12px] " +
              (billNetTotalPaisa === totals.total ? "text-sage-500" : "font-medium text-danger-600")
            }
          >
            {billNetTotalPaisa === totals.total ? (
              <>This matches the net total on the bill.</>
            ) : (
              <>
                The bill says {formatPaisa(billNetTotalPaisa)}. A line is
                missing or wrong — check it against the paper before saving.
              </>
            )}
          </p>
        )}
        {/* What was paid for it now. Only on a new purchase: once saved, a
            payment is its own record, paid or undone from Payables. */}
        {!editing && (
          <div className="flex w-full flex-col items-end gap-1.5 border-t border-line pt-3">
            <div className="mb-0.5 text-[12px] font-semibold uppercase tracking-wide text-sage-500">
              Payment
            </div>
            <div
              role="group"
              aria-label="Payment"
              className="inline-flex rounded-[8px] border border-line bg-cream-100 p-0.5"
            >
              <ModeChip
                active={payMode === "credit"}
                onClick={() => setPayMode("credit")}
                label="On credit"
              >
                On credit
              </ModeChip>
              <ModeChip
                active={payMode === "full"}
                onClick={() => setPayMode("full")}
                label="Paid in full"
              >
                Paid in full
              </ModeChip>
              <ModeChip
                active={payMode === "part"}
                onClick={() => setPayMode("part")}
                label="Part paid"
              >
                Part paid
              </ModeChip>
            </div>
            {payMode === "part" && (
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-[14px] text-sage-700">Paid now (रू)</span>
                <Input
                  numeric
                  inputMode="decimal"
                  className="w-28 text-right"
                  aria-label="Paid now, rupees"
                  value={paidRupees}
                  onChange={(e) => setPaidRupees(e.target.value)}
                />
              </div>
            )}
            {payMode !== "credit" && (
              <div className="flex items-center gap-2">
                <span className="text-[14px] text-sage-700">How</span>
                <Select
                  className="w-44"
                  aria-label="How it was paid"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PayMethod)}
                >
                  {PAY_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYABLE_METHOD_LABEL[m]}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <Row label="Paid now" value={formatPaisa(paidNowPaisa)} />
            <Row
              label="On credit"
              value={formatPaisa(Math.max(0, totals.total - paidNowPaisa))}
            />
            {payMode === "part" && paidNowPaisa > totals.total && (
              <p className="max-w-[320px] text-right text-[12px] font-medium text-danger-600">
                That is more than the bill. Choose Paid in full, or check the
                amount.
              </p>
            )}
            <p className="max-w-[320px] text-right text-[12px] text-sage-500">
              The unpaid part is added to what you owe them. Pay it later in
              Payables.
            </p>
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              router.push(editing ? `/purchases/${initial!.purchaseId}` : "/purchases")
            }
          >
            {strings.cancel}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "…" : editing ? "Save changes" : "Save purchase"}
          </Button>
        </div>
      </section>

      {editing && (
        <Dialog
          open={confirmOpen}
          onClose={() => {
            if (!busy) setConfirmOpen(false);
          }}
          title="Confirm the change"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
              >
                {strings.cancel}
              </Button>
              <Button onClick={saveEdit} disabled={busy}>
                {busy ? "…" : "Save changes"}
              </Button>
            </>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
            className="flex flex-col gap-3"
          >
            <p className="text-[13.5px] text-sage-700">
              {forUse
                ? "This changes a saved purchase. Enter your password to confirm."
                : "This changes a saved purchase and its stock. Enter your password to confirm."}
            </p>
            <Field label="Your password" htmlFor="confirm-password">
              <Input
                id="confirm-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setConfirmError("");
                }}
              />
            </Field>
            {confirmError && (
              <p className="flex items-start gap-1.5 text-[13px] text-danger-600">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {confirmError}
              </p>
            )}
          </form>
        </Dialog>
      )}
    </div>
  );
}

/**
 * Why a saved line is locked. Bought for use, the only thing that touches a
 * line after it is saved is a return to the supplier.
 */
function lockedNote(forUse: boolean, what: "item" | "line"): string {
  const why = forUse
    ? "Some of this line has been returned to the supplier"
    : "Stock from this line has been sold, returned or counted";
  return what === "item"
    ? `${why}, so its item can't be changed.`
    : `${why}, so it can't be removed.`;
}

/**
 * Where a note under a box sits: in the flow on a narrow screen, where the row
 * stacks; just under the box on a wide one, so a note on one box does not push
 * that box out of line with the rest of the row.
 */
const UNDER_BOX =
  "mt-1 block whitespace-nowrap text-[11.5px] leading-4 lg:absolute lg:left-0 lg:top-full lg:mt-0.5";

/**
 * The margin on a line, worked out as it is typed: what is left of the selling
 * price after the cost, as a share of the selling price. A blank selling price
 * leaves the item's price as it is, so that is the price the margin is on.
 *
 * Free goods and a line discount make each unit cheaper than the rate typed,
 * so when they are there the margin they give is shown beside it.
 */
function MarginNote({ line, sellIfBlank }: { line: LineState; sellIfBlank: string }) {
  const cost = Number(line.costRupees) || 0;
  const sell = Number(line.sellRupees.trim() === "" ? sellIfBlank : line.sellRupees) || 0;
  if (cost <= 0 || sell <= 0) return null;
  const pct = (unitCost: number) => ((sell - unitCost) / sell) * 100;
  const qty = Number(line.qty) || 0;
  const free = Number(line.freeQty) || 0;
  const discount = Number(line.discountRupees) || 0;
  const landed = qty > 0 ? Math.max(0, qty * cost - discount) / (qty + free) : cost;
  const plain = pct(cost);
  const withExtras = pct(landed);
  const extras =
    free > 0 && discount > 0 ? "free & discount" : free > 0 ? "free" : discount > 0 ? "discount" : "";
  const show = (n: number) => `${n.toFixed(1)}%`;
  return (
    <span
      className={
        UNDER_BOX + " " + (plain < 0 ? "font-medium text-danger-600" : "text-sage-600")
      }
    >
      Margin {show(plain)}
      {extras && Math.abs(withExtras - plain) >= 0.05 && (
        <span className="text-sage-500">
          {" "}· {show(withExtras)} with {extras}
        </span>
      )}
    </span>
  );
}

type PayMode = "credit" | "full" | "part";
const PAY_METHODS = ["cash", "bank", "cheque", "qr"] as const;
type PayMethod = (typeof PAY_METHODS)[number];

function ModeChip({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={
        "rounded-[6px] px-2 py-0.5 text-[13px] transition-colors " +
        (active ? "bg-sage-700 text-cream-50" : "text-sage-600 hover:text-sage-900")
      }
    >
      {children}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-56 justify-between text-[14px] text-sage-700">
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
