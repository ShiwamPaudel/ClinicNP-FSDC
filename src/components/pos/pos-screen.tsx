"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ulid } from "ulid";
import Link from "next/link";
import { ArrowLeft, HelpCircle, PauseCircle, PlayCircle } from "lucide-react";
import {
  useBillStore,
  linesFromHeld,
  serviceLinesFromHeld,
  type AttachedPatient,
} from "@/stores/bill-store";
import { counterTotals } from "@/lib/discount";
import {
  linePreview,
  lineAmountPaisa,
  serviceLineAmountPaisa,
  unitByLevel,
} from "@/lib/bill-calc";
import { change } from "@/lib/money";
import { batchesForPrint } from "@/lib/print-batches";
import type {
  PosItem,
  PosService,
  PosDoctor,
  PosLabPartner,
  PosRack,
  PosFloor,
  OutboxBill,
  HeldBill,
} from "@/lib/pos-types";
import type { PrintBatchLine, PrintBill, PrintLine } from "@/lib/print-types";
import {
  getCachedItems,
  getCachedServices,
  getCachedDoctors,
  getCachedLabPartners,
  getCachedRacks,
  getCachedFloor,
  syncCatalog,
  syncPatients,
  applyLocalAllocation,
  getCachedPatients,
} from "@/offline/catalog-cache";
import { enqueueBill, flushOutbox, startOutboxLoop } from "@/offline/outbox";
import { holdBill, listHeld, resumeHeld, MAX_HELD } from "@/offline/held";
import { SearchBox, type SearchBoxHandle } from "@/components/pos/search-box";
import { BillTable, type PosConfig } from "@/components/pos/bill-table";
import { PaymentPane, type PaymentPaneHandle } from "@/components/pos/payment-pane";
import { BatchPicker } from "@/components/pos/batch-picker";
import { ServiceLines } from "@/components/pos/service-lines";
import { PatientBar } from "@/components/pos/patient-bar";
import { UnitPanel } from "@/components/pos/unit-panel";
import { ShortcutSheet } from "@/components/pos/shortcut-sheet";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";
import { StatusChip } from "@/components/pos/status-chip";
import { StuckQueue } from "@/components/pos/stuck-queue";
import { InvoiceA4 } from "@/components/print/invoice-a4";
import { useToast } from "@/components/ui/toast";
import { strings, npLabels } from "@/lib/strings";

export function PosScreen({ config }: { config: PosConfig }) {
  const toast = useToast();
  const [items, setItems] = useState<PosItem[]>([]);
  const [services, setServices] = useState<PosService[]>([]);
  const [doctors, setDoctors] = useState<PosDoctor[]>([]);
  const [partners, setPartners] = useState<PosLabPartner[]>([]);
  const [racks, setRacks] = useState<PosRack[]>([]);
  const [floor, setFloor] = useState<PosFloor | null>(null);
  // bumped when `P` is pressed, so the patient bar knows to open itself
  const [patientOpenSignal, setPatientOpenSignal] = useState(0);
  const [held, setHeld] = useState<HeldBill[]>([]);
  const [batchLineId, setBatchLineId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showHeld, setShowHeld] = useState(false);
  // F2 on a bill with something on it: hold it, clear it, or carry on.
  const [confirmNew, setConfirmNew] = useState(false);
  // The patient search is open: the F-keys wait until it closes.
  const [patientOpen, setPatientOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printBill, setPrintBill] = useState<PrintBill | null>(null);
  const [stamp, setStamp] = useState(false);
  const [lang, setLang] = useState<"en" | "np">("en");

  const searchRef = useRef<SearchBoxHandle>(null);
  /** True from the moment a save starts until it is done. Read by the keys. */
  const savingRef = useRef(false);
  const paymentRef = useRef<PaymentPaneHandle>(null);

  const store = useBillStore();

  const refreshItems = useCallback(async () => {
    setItems(await getCachedItems());
    setServices(await getCachedServices());
    setDoctors(await getCachedDoctors());
    setPartners(await getCachedLabPartners());
    setRacks(await getCachedRacks());
    setFloor(await getCachedFloor());
  }, []);

  const refreshHeld = useCallback(async () => {
    setHeld(await listHeld());
  }, []);

  // initial load: pull catalog, start the outbox retry loop, restore label pref
  useEffect(() => {
    (async () => {
      await syncCatalog();
      // The recent-patients slice, so the patient bar can find somebody with
      // the connection down. Failing is fine — the counter keeps what it has.
      await syncPatients();
      await refreshItems();
      await refreshHeld();
    })();
    const saved = localStorage.getItem("pos-lang");
    if (saved === "np" || saved === "en") setLang(saved);
    const stop = startOutboxLoop();
    return stop;
  }, [refreshItems, refreshHeld]);

  // re-sync the catalog when the tab regains focus (catch stock changes)
  useEffect(() => {
    const onFocus = () => void (async () => {
      if (await syncCatalog()) await refreshItems();
      await syncPatients();
    })();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshItems]);

  function toggleLang() {
    setLang((l) => {
      const next = l === "en" ? "np" : "en";
      localStorage.setItem("pos-lang", next);
      return next;
    });
  }

  const addItem = useCallback((item: PosItem) => {
    useBillStore.getState().addItem(item);
  }, []);

  /**
   * Adding a service also asks the server what it should cost for this
   * patient: only the server knows when they last saw this doctor. The line
   * goes on the bill immediately at the full rate and is corrected a moment
   * later, so a slow answer never blocks the counter.
   *
   * If the call fails — the connection is down — the full rate stands and the
   * line says so, rather than the counter guessing at a discount.
   */
  const addService = useCallback(async (service: PosService) => {
    useBillStore.getState().addService(service);
    // Read the state again: the line we just added does not exist in the
    // snapshot taken before the call.
    const after = useBillStore.getState();
    const line = after.serviceLines.at(-1);
    const patient = after.patient;
    if (!line || !patient) return;
    if (!service.isConsultation || service.followupDays <= 0) return;

    try {
      const params = new URLSearchParams({
        serviceId: service.id,
        patientId: patient.id,
        dateAd: config.todayIso,
      });
      if (line.doctorId) params.set("doctorId", line.doctorId);
      const res = await fetch(`/api/followup?${params}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as {
        ok: boolean;
        applied: boolean;
        ratePaisa: number;
        note: string;
      };
      if (!body.ok || !body.applied) return;
      useBillStore.getState().applyFollowup(line.lineId, {
        ratePaisa: body.ratePaisa,
        applied: true,
        note: body.note,
      });
    } catch {
      // Offline: the full rate stands. The server records what was actually
      // charged rather than silently rewriting the printed total.
    }
  }, [config.todayIso]);

  const doSave = useCallback(async () => {
    // F9 or Enter pressed twice while the first save is still going would
    // queue the same bill twice — the button is disabled, the keys are not.
    if (savingRef.current) return;
    const s = useBillStore.getState();
    if (s.lines.length === 0 && s.serviceLines.length === 0) return;

    // A service belongs to somebody. A medicine-only bill may stay anonymous.
    if (s.serviceLines.length > 0 && !s.patient) {
      toast.error("Say who this bill is for — it has a service on it.");
      setPatientOpenSignal((n) => n + 1);
      return;
    }

    // The same figures the payment panel is showing, discount worked out the
    // same way — rupees as typed, or a percentage of the bill as it is now.
    const totals = counterTotals(
      s.lines,
      s.serviceLines,
      {
        mode: s.billDiscountMode,
        amountPaisa: s.billDiscountPaisa,
        percent: s.billDiscountPercent,
      },
      {
        vatRegistered: config.vatRegistered,
        vatInclusive: config.vatInclusive,
        roundingOn: config.roundingOn,
      },
    );

    // Money owed has to be owed by somebody who can be found again. With
    // patients switched on that is a registered patient, exactly as for a
    // service; without them, the name typed on the bill.
    const onDues = s.paymentMethod === "credit";
    if (onDues) {
      if (config.clinicOn && !s.patient) {
        toast.error("Say who owes this bill — attach the patient.");
        setPatientOpenSignal((n) => n + 1);
        return;
      }
      if (!config.clinicOn && s.patientName.trim() === "") {
        toast.error("Enter the name of whoever owes this bill.");
        return;
      }
      if (totals.totalPaisa > 0 && s.paidNowPaisa >= totals.totalPaisa) {
        toast.error("That pays the whole bill. Choose Cash or QR instead.");
        return;
      }
    }
    const paidNowPaisa = onDues
      ? Math.min(s.paidNowPaisa, totals.totalPaisa)
      : totals.totalPaisa;
    const duePaisa = onDues ? totals.totalPaisa - paidNowPaisa : 0;
    // A service that needs a doctor, or goes to an outside laboratory, cannot
    // be saved half-answered.
    const svcById = new Map(services.map((x) => [x.id, x]));
    for (const line of s.serviceLines) {
      const svc = svcById.get(line.serviceId);
      if (svc?.doctorRequired && !line.doctorId) {
        toast.error(`Choose the doctor for ${line.name}.`);
        return;
      }
      if (svc?.outsourced && !line.labPartnerId) {
        toast.error(`Choose which laboratory ${line.name} goes to.`);
        return;
      }
    }

    // A medicine the shop has never priced can go on a bill, and what is typed
    // becomes its price (D-105). What it cannot do is go on at nothing: a Rs 0
    // line is a real bill with a real hole in it, and it would set the price
    // to zero for good.
    const unpriced = s.lines.filter((l) => l.ratePaisa <= 0);
    if (unpriced.length > 0) {
      const names = Array.from(
        new Set(unpriced.map((l) => l.item.brandName)),
      ).join(", ");
      toast.error(
        unpriced.length === 1
          ? `Enter the price for ${names}. It has never been sold before, so this price becomes its price.`
          : `Enter a price for: ${names}.`,
      );
      return;
    }

    const hasControlled = s.lines.some((l) => l.item.controlledFlag);
    if (hasControlled && s.patientName.trim() === "") {
      toast.error("Enter the patient name for the prescription item.");
      return;
    }
    // Hard block: never sell more than the on-hand, non-expired stock.
    const short = s.lines.filter(
      (l) => linePreview(l, config.todayIso).shortfallBaseQty > 0,
    );
    if (short.length > 0) {
      const names = Array.from(
        new Set(short.map((l) => l.item.brandName)),
      ).join(", ");
      toast.error(
        `Not enough stock to sell: ${names}. Lower the quantity or add stock first.`,
      );
      return;
    }
    // Batch number and expiry are mandatory on a medicine bill (D-141). The
    // stock check above means every line draws on batches; this makes sure
    // each of them prints with both, rather than a bill going out with "—".
    const printedBatches = new Map<string, PrintBatchLine[]>();
    const unprintable: string[] = [];
    for (const line of s.lines) {
      const batches = batchesForPrint(
        linePreview(line, config.todayIso).allocations,
        line.item.batches,
      );
      if (batches) printedBatches.set(line.lineId, batches);
      else unprintable.push(line.item.brandName);
    }
    if (unprintable.length > 0) {
      const names = Array.from(new Set(unprintable)).join(", ");
      toast.error(
        `Batch number or expiry missing for ${names}. Reload the page, or check its batch under Stock.`,
      );
      return;
    }
    setSaving(true);
    savingRef.current = true;
    try {
      const id = ulid();
      const nowIso = new Date().toISOString();

      // Build outbox payload + print lines from the shared FEFO preview.
      const outboxLines: OutboxBill["lines"] = [];
      const printLines: PrintLine[] = [];
      for (const line of s.lines) {
        const preview = linePreview(line, config.todayIso);
        outboxLines.push({
          id: line.lineId,
          itemId: line.item.id,
          unitLevel: line.unitLevel,
          qty: line.qty,
          ratePaisa: line.ratePaisa,
          rateOverridden: line.rateOverridden,
          discountPaisa: line.discountPaisa,
          overrideBatchId: line.overrideBatchId,
        });
        const unit = unitByLevel(line.item, line.unitLevel);
        printLines.push({
          name: line.item.brandName,
          genericName: line.item.genericName,
          controlled: line.item.controlledFlag,
          qty: line.qty,
          unitName: unit?.name ?? "",
          ratePaisa: line.ratePaisa,
          discountPaisa: line.discountPaisa,
          amountPaisa: lineAmountPaisa(line),
          rateOverridden: line.rateOverridden,
          batches: printedBatches.get(line.lineId)!,
        });
        // optimistic local stock decrement
        await applyLocalAllocation(line.item.id, preview.allocations);
      }

      const outbox: OutboxBill = {
        id,
        dateBs: config.todayBsText,
        dateAd: config.todayIso,
        patientName: s.patientName,
        paymentMethod: s.paymentMethod,
        tenderedPaisa: s.tenderedPaisa,
        // Always sent on a bill on dues, 0 included: its presence is how the
        // server knows this counter asked who owes it (see ingestBill).
        paidNowPaisa: onDues ? paidNowPaisa : undefined,
        paidNowMethod: onDues ? s.paidNowMethod : undefined,
        // Always rupees on the way out: a percentage is resolved here, against
        // the bill the patient was shown.
        billDiscountPaisa: totals.billDiscountPaisa,
        lines: outboxLines,
        serviceLines: s.serviceLines.map((l) => ({
          id: l.lineId,
          serviceId: l.serviceId,
          qty: l.qty,
          ratePaisa: l.ratePaisa,
          rateOverridden: l.rateOverridden,
          discountPaisa: l.discountPaisa,
          doctorId: l.doctorId,
          labPartnerId: l.labPartnerId,
          followupApplied: l.followupApplied,
        })),
        patientId: s.patient?.id,
        // Carried only when this person may not have reached the server yet, so
        // the bill can bring them with it (Architecture §2.1 Path B).
        patient: s.patient?.snapshot
          ? {
              id: s.patient.id,
              name: s.patient.name,
              sex: s.patient.sex,
              ageValue: s.patient.snapshot.ageValue,
              ageUnit: s.patient.snapshot.ageUnit,
              ageAsOfAd: config.todayIso,
              phone: s.patient.snapshot.phone,
              address: s.patient.snapshot.address,
            }
          : undefined,
        visitId: s.visitId ?? undefined,
        clientCreatedAt: nowIso,
        attempts: 0,
      };
      await enqueueBill(outbox);

      // provisional slip number until the server assigns the final invoice number
      setPrintBill({
        company: config.company,
        invoiceLabel: `Slip ${id.slice(-6).toUpperCase()}`,
        provisional: true,
        dateBsLong: config.todayBsLong,
        timeStr: new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        patientName: s.patientName,
        patient: s.patient
          ? {
              patientNo: s.patient.patientNo,
              name: s.patient.name,
              ageSex: `${s.patient.ageShort} · ${s.patient.sex.toUpperCase()}`,
            }
          : null,
        serviceLines: s.serviceLines.map((l) => ({
          name: l.name,
          doctorName:
            doctors.find((d) => d.id === l.doctorId)?.name ?? "",
          qty: l.qty,
          ratePaisa: l.ratePaisa,
          discountPaisa: l.discountPaisa,
          amountPaisa: serviceLineAmountPaisa(l),
          rateOverridden: l.rateOverridden,
          followupNote: l.followupNote,
        })),
        lines: printLines,
        subtotalPaisa: totals.subtotalPaisa,
        billDiscountPaisa: totals.billDiscountPaisa,
        vatPaisa: totals.vatPaisa,
        taxablePaisa: totals.taxablePaisa,
        vatInclusive: config.vatRegistered && config.vatInclusive,
        totalPaisa: totals.totalPaisa,
        paymentMethod: s.paymentMethod,
        tenderedPaisa: s.tenderedPaisa,
        changePaisa: change(s.tenderedPaisa, totals.totalPaisa),
        paidNowPaisa: onDues ? paidNowPaisa : undefined,
        paidNowMethod: onDues && paidNowPaisa > 0 ? s.paidNowMethod : undefined,
        duePaisa: onDues ? duePaisa : undefined,
        userName: config.userName,
      });

      // print on the next frame, then reset for the next customer
      requestAnimationFrame(() => {
        window.print();
      });

      setStamp(true);
      setTimeout(() => setStamp(false), 1000);

      store.reset();
      await refreshItems();
      searchRef.current?.focus();

      // try to sync right away (no-op when offline; retries in the loop)
      void flushOutbox();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [config, store, toast, refreshItems, services, doctors]);

  /** The bill on the counter, shaped to be parked in the held tray. */
  const heldFromCurrent = useCallback((): HeldBill | null => {
    const s = useBillStore.getState();
    if (s.lines.length === 0 && s.serviceLines.length === 0) return null;
    return {
      id: ulid(),
      heldAt: new Date().toISOString(),
      patientName: s.patientName,
      patientId: s.patient?.id,
      // Carried only when this person may not have reached the server yet, so
      // the bill can bring them with it (Architecture §2.1 Path B).
      patient: s.patient?.snapshot
        ? {
            id: s.patient.id,
            name: s.patient.name,
            sex: s.patient.sex,
            ageValue: s.patient.snapshot.ageValue,
            ageUnit: s.patient.snapshot.ageUnit,
            ageAsOfAd: config.todayIso,
            phone: s.patient.snapshot.phone,
            address: s.patient.snapshot.address,
          }
        : undefined,
      attachedPatient: s.patient
        ? {
            id: s.patient.id,
            patientNo: s.patient.patientNo,
            name: s.patient.name,
            sex: s.patient.sex,
            ageShort: s.patient.ageShort,
          }
        : undefined,
      visitId: s.visitId ?? undefined,
      serviceLines: s.serviceLines.map((l) => ({
        serviceId: l.serviceId,
        qty: l.qty,
        ratePaisa: l.ratePaisa,
        rateOverridden: l.rateOverridden,
        discountPaisa: l.discountPaisa,
        doctorId: l.doctorId,
        labPartnerId: l.labPartnerId,
        followupApplied: l.followupApplied,
        followupNote: l.followupNote,
      })),
      lines: s.lines.map((l) => ({
        itemId: l.item.id,
        unitLevel: l.unitLevel,
        qty: l.qty,
        ratePaisa: l.ratePaisa,
        rateOverridden: l.rateOverridden,
        discountPaisa: l.discountPaisa,
        overrideBatchId: l.overrideBatchId,
      })),
    };
  }, [config.todayIso]);

  const doHold = useCallback(async (): Promise<boolean> => {
    const bill = heldFromCurrent();
    if (!bill) return false;
    const ok = await holdBill(bill);
    if (!ok) {
      toast.error(`You can hold up to ${MAX_HELD} bills.`);
      return false;
    }
    store.reset();
    await refreshHeld();
    toast.success("Bill held — F8 brings it back");
    searchRef.current?.focus();
    return true;
  }, [store, toast, refreshHeld, heldFromCurrent]);

  /**
   * Bring a held bill back: its medicines, its services and its patient.
   *
   * It used to bring back the medicines only, and since resuming takes the
   * bill out of the tray, a held clinic bill lost its services and patient for
   * good. And a bill already on the counter was written over; now it is held
   * in its place, so resuming never throws anything away.
   */
  const doResume = useCallback(
    async (heldId: string) => {
      const current = heldFromCurrent();
      const bill = await resumeHeld(heldId);
      if (!bill) return;
      // Taking one out first is what leaves room for the one going in.
      if (current) await holdBill(current);

      const lines = linesFromHeld(bill.lines, items);
      const serviceLines = serviceLinesFromHeld(bill.serviceLines ?? [], services);

      let patient: AttachedPatient | null = null;
      if (bill.attachedPatient) {
        patient = { ...bill.attachedPatient };
      } else if (bill.patientId) {
        // Held before the bill kept the whole patient: find them again.
        const cached = (await getCachedPatients()).find((p) => p.id === bill.patientId);
        if (cached) {
          patient = {
            id: cached.id,
            patientNo: cached.patientNo,
            name: cached.name,
            sex: cached.sex,
            ageShort: cached.ageShort,
          };
        } else if (bill.patient) {
          patient = {
            id: bill.patient.id,
            patientNo: null,
            name: bill.patient.name,
            sex: bill.patient.sex,
            ageShort:
              bill.patient.ageValue != null
                ? `${bill.patient.ageValue} ${bill.patient.ageUnit ?? ""}`.trim()
                : "",
          };
        }
      }
      // A patient who may not have reached the server yet still travels with
      // the bill, so it can bring them along when it is saved.
      if (patient && bill.patient && bill.patient.id === patient.id) {
        patient.snapshot = {
          ageValue: bill.patient.ageValue,
          ageUnit: bill.patient.ageUnit,
          phone: bill.patient.phone,
          address: bill.patient.address,
        };
      }

      useBillStore.getState().loadHeld({
        lines,
        serviceLines,
        patient,
        visitId: bill.visitId ?? null,
        patientName: bill.patientName,
      });
      await refreshHeld();
      setShowHeld(false);

      const dropped =
        bill.lines.length - lines.length + (bill.serviceLines?.length ?? 0) - serviceLines.length;
      if (dropped > 0) {
        toast.error(
          `${dropped} line${dropped === 1 ? " is" : "s are"} no longer in the list and could not be brought back.`,
        );
      }
      if (bill.patientId && !patient) {
        toast.error("Attach the patient again — press F4.");
      }
      if (current) toast.success("The bill you were on is held — F8 to switch back.");
      if (lines.length === 0) searchRef.current?.focus();
    },
    [items, services, refreshHeld, heldFromCurrent, toast],
  );

  /** F2: a fresh bill. One with something on it asks first. */
  const startNewBill = useCallback(() => {
    const s = useBillStore.getState();
    if (s.lines.length === 0 && s.serviceLines.length === 0) {
      store.reset();
      searchRef.current?.focus();
      return;
    }
    setConfirmNew(true);
  }, [store]);

  // Whether a dialog or tray is open. The F-keys stand down while one is, so
  // F9 cannot save a bill from behind the batch picker.
  const modalOpen =
    showShortcuts || showHeld || batchLineId !== null || confirmNew || patientOpen;

  // When a dialog or the tray closes, the cursor goes back to the search box
  // — unless something on the bill has already taken it, as a resumed line's
  // quantity does. Without this it was left on nothing, where only the mouse
  // could find it again.
  const wasModal = useRef(false);
  useEffect(() => {
    if (wasModal.current && !modalOpen) {
      requestAnimationFrame(() => {
        const el = document.activeElement;
        if (!el || el === document.body) searchRef.current?.focus();
      });
    }
    wasModal.current = modalOpen;
  }, [modalOpen]);

  // global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT";
      if (modalOpen) return;

      if (e.key === "F1" || (e.key === "?" && !typing)) {
        e.preventDefault();
        setShowShortcuts(true);
      } else if (e.key === "F2") {
        e.preventDefault();
        startNewBill();
      } else if (e.key === "F4" || ((e.key === "p" || e.key === "P") && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        setPatientOpenSignal((n) => n + 1);
      } else if (e.key === "F7") {
        e.preventDefault();
        void doHold();
      } else if (e.key === "F8") {
        e.preventDefault();
        void refreshHeld();
        setShowHeld(true);
      } else if (e.key === "F9") {
        e.preventDefault();
        void doSave();
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && ["1", "2", "3"].includes(e.key)) {
        // Alt+1/2/3: Cash, QR, Dues — the same order as the buttons.
        e.preventDefault();
        const method = (["cash", "qr", "credit"] as const)[Number(e.key) - 1]!;
        useBillStore.getState().setPaymentMethod(method);
        requestAnimationFrame(() => paymentRef.current?.focusTendered());
      } else if (e.key === "Escape") {
        // Back to the search box from anywhere on the bill.
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doHold, doSave, startNewBill, refreshHeld, modalOpen]);

  const batchLine = batchLineId
    ? store.lines.find((l) => l.lineId === batchLineId)
    : null;
  // The active line drives the inline unit panel (last line if none focused).
  const activeLine =
    store.lines.find((l) => l.lineId === store.activeLineId) ??
    store.lines[store.lines.length - 1] ??
    null;

  return (
    <div className="flex h-screen flex-col bg-cream-100">
      {/* top bar */}
      <div className="flex items-center justify-between gap-4 border-b border-line bg-cream-50 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-[8px] border border-line bg-cream-50 px-2.5 py-1.5 text-[13px] font-medium text-sage-700 hover:bg-cream-200"
            title="Back to the app"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to app
          </Link>
          <Wordmark name={config.appName} className="text-[15px]" />
          <span className="hidden text-[14px] font-semibold text-sage-900 sm:inline">
            · New bill
          </span>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip />
          <StuckQueue isAdmin={config.isAdmin} />
          <button
            onClick={toggleLang}
            className="rounded-[8px] border border-line px-2 py-1 text-[12px] font-medium text-sage-700 hover:bg-cream-200"
            title="Switch labels"
          >
            {lang === "en" ? "नेप" : "EN"}
          </button>
          <button
            onClick={() => setShowHeld(true)}
            className="flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[13px] text-sage-700 hover:bg-cream-200"
          >
            <PauseCircle className="h-4 w-4" />
            Held {held.length > 0 && `(${held.length})`}
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            aria-label="Keyboard shortcuts"
            className="rounded-[8px] p-1.5 text-sage-500 hover:bg-cream-200"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* three zones */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
          <SearchBox
            ref={searchRef}
            items={items}
            services={services}
            racks={racks}
            floor={floor}
            rackDisplay={config.rackDisplay}
            todayIso={config.todayIso}
            onPick={addItem}
            onPickService={(svc) => void addService(svc)}
            onEmptyEnter={() => paymentRef.current?.focusTendered()}
          />
          {(services.length > 0 || config.clinicOn) && (
            <div className="mt-4">
              <PatientBar
                patient={store.patient}
                required={
                  store.serviceLines.length > 0 ||
                  (store.paymentMethod === "credit" && config.clinicOn)
                }
                requiredFor={
                  store.serviceLines.length > 0 ? "service" : "dues"
                }
                onAttach={(p) => store.setPatient(p)}
                onClear={() => {
                  store.setPatient(null);
                  store.setVisitId(null);
                }}
                openSignal={patientOpenSignal}
                onOpenChange={setPatientOpen}
              />
            </div>
          )}
          <div className="mt-4 flex min-h-[160px] flex-col rounded-[10px] border border-line bg-cream-50 p-4">
            <ServiceLines
              doctors={doctors}
              partners={partners}
              services={services}
              canEditRate={config.canEditRate}
            />
            <BillTable
              config={config}
              onOpenBatch={(id) => setBatchLineId(id)}
              onBackToSearch={() => searchRef.current?.focus()}
            />
          </div>
          <UnitPanel
            line={activeLine}
            todayIso={config.todayIso}
            onSetQtyBase={(baseQty) => {
              if (!activeLine) return;
              store.setUnit(activeLine.lineId, 0);
              store.setQty(activeLine.lineId, baseQty);
              store.setActiveLine(activeLine.lineId);
            }}
          />
        </div>

        <div className="w-full shrink-0 lg:w-[340px]">
          <PaymentPane ref={paymentRef} config={config} saving={saving} lang={lang} onSave={doSave} />
        </div>
      </div>

      {/* dialogs */}
      <BatchPicker
        open={batchLineId !== null}
        onClose={() => setBatchLineId(null)}
        item={batchLine?.item ?? null}
        todayIso={config.todayIso}
        selectedBatchId={batchLine?.overrideBatchId}
        onChoose={(bid) =>
          batchLineId && store.setOverrideBatch(batchLineId, bid)
        }
      />
      <ShortcutSheet open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <Dialog
        open={confirmNew}
        onClose={() => setConfirmNew(false)}
        title="Start a new bill?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmNew(false)}>
              Keep this bill
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmNew(false);
                store.reset();
                searchRef.current?.focus();
              }}
            >
              Clear it
            </Button>
            <Button
              autoFocus
              onClick={() => {
                setConfirmNew(false);
                void doHold();
              }}
            >
              Hold it &amp; start new
            </Button>
          </>
        }
      >
        <p className="text-[14px] text-sage-700">
          This bill has something on it. Hold it to come back to it with F8,
          or clear it. Enter holds it; Esc keeps working on it.
        </p>
      </Dialog>
      <HeldTray
        open={showHeld}
        onClose={() => setShowHeld(false)}
        held={held}
        onResume={doResume}
      />

      {/* save stamp — the one moment that animates (Design §3) */}
      {stamp && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
          <div className="rounded-[999px] border-2 border-magenta-600 bg-magenta-100/90 px-6 py-3 text-[20px] font-bold text-magenta-700 motion-safe:animate-[stamp_250ms_ease-out]">
            ✓ {strings.billSaved} · <span className="deva">{npLabels.billSaved}</span>
          </div>
          <style>{`@keyframes stamp{from{opacity:0;transform:scale(1.3)}to{opacity:1;transform:scale(1)}}`}</style>
        </div>
      )}

      {/* print area (hidden on screen) */}
      <div className="print-area">
        {printBill && <InvoiceA4 bill={printBill} />}
      </div>
    </div>
  );
}

function HeldTray({
  open,
  onClose,
  held,
  onResume,
}: {
  open: boolean;
  onClose: () => void;
  held: HeldBill[];
  onResume: (id: string) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  // Opened from the keyboard (F8), so it is used from the keyboard: the first
  // bill takes focus, the arrows move, Enter or its number brings one back,
  // and Esc or F8 again closes the tray.
  useEffect(() => {
    if (!open) return;
    // Only when it opens: the screen behind re-renders often, and this must
    // not pull focus back to the first bill each time it does.
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLButtonElement>("button")?.focus(),
    );
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const buttons = () =>
      Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "F8") {
        e.preventDefault();
        onClose();
        return;
      }
      const all = buttons();
      const at = all.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = e.key === "ArrowDown" ? Math.min(all.length - 1, at + 1) : Math.max(0, at - 1);
        all[next]?.focus();
      } else if (/^[1-9]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const pick = held[Number(e.key) - 1];
        if (pick) {
          e.preventDefault();
          onResume(pick.id);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, held, onClose, onResume]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-sage-950/30"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-label="Held bills"
        onMouseDown={(e) => e.stopPropagation()}
        className="mt-14 mr-4 w-80 rounded-[10px] border border-line bg-cream-50 p-4 shadow-[0_1px_2px_rgb(22_36_27_/_6%),0_4px_12px_rgb(22_36_27_/_5%)]"
      >
        <h2 className="mb-2 text-[15px] font-semibold text-sage-900">
          Held bills
        </h2>
        {held.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-sage-500">
            No held bills.
          </p>
        ) : (
          <ul ref={listRef} className="flex flex-col gap-2">
            {held.map((h, i) => (
              <li key={h.id}>
                <button
                  onClick={() => onResume(h.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-[8px] border border-line bg-cream-50 px-3 py-2.5 text-left hover:bg-cream-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-700"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {i < 9 && (
                      <kbd className="rounded-[4px] border border-line bg-cream-100 px-1.5 text-[11px] font-semibold text-sage-700">
                        {i + 1}
                      </kbd>
                    )}
                    <span className="truncate text-[14px] text-sage-900">
                      {h.patientName ||
                        h.attachedPatient?.name ||
                        heldSummary(h)}
                    </span>
                  </span>
                  <PlayCircle className="h-4 w-4 shrink-0 text-sage-600" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] text-sage-500">
          ↑ ↓ and Enter, or the number · Esc to close
        </p>
      </div>
    </div>
  );
}

/** "3 items, 1 service" — what a held bill without a name is shown as. */
function heldSummary(h: HeldBill): string {
  const items = h.lines.length;
  const svcs = h.serviceLines?.length ?? 0;
  const parts: string[] = [];
  if (items > 0) parts.push(`${items} item${items === 1 ? "" : "s"}`);
  if (svcs > 0) parts.push(`${svcs} service${svcs === 1 ? "" : "s"}`);
  return parts.join(", ") || "Empty bill";
}
