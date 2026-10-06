import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/auth";
import { resolveRange } from "@/lib/date-range";
import {
  salesRegister,
  purchaseRegister,
  profitByItem,
  movingItems,
} from "@/lib/repos/reports";
import {
  listStockOuts,
  stockOutTotalsByReason,
  STOCK_OUT_REASONS,
} from "@/lib/repos/adjustments";
import {
  serviceRevenue,
  doctorPayouts,
  partnerSummary,
  partnerStatement,
  patientVisitRegister,
  diagnosticsUtilisation,
} from "@/lib/repos/clinic-reports";
import { shelfRows } from "@/lib/repos/racks";
import { itemStockMap } from "@/lib/repos/batches";
import { toMixedDisplay } from "@/lib/units";
import { listItems } from "@/lib/repos/items";
import { getModules } from "@/lib/modules";
import { formatDocNo } from "@/lib/invoice-number";
import { adToIso } from "@/lib/bs";

/** Reports that only exist when the Pharmacy module is on. */
const PHARMACY_REPORTS = new Set(["shelf-list"]);

/** Reports that only exist when the Clinic module is on. */
const CLINIC_REPORTS = new Set([
  "service-revenue",
  "doctor-payouts",
  "lab-partners",
  "visit-register",
  "utilisation",
]);

/** Money as a plain 2-decimal number for spreadsheet cells. */
function rupees(paisa: number): number {
  return Math.round(paisa) / 100;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ report: string }> },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      { ok: false, userMessage: "You don't have permission to do that." },
      { status: 403 },
    );
  }

  const { report } = await params;
  const url = new URL(req.url);
  const range = resolveRange({
    preset: url.searchParams.get("preset") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    fy: url.searchParams.get("fy") ?? undefined,
  });

  // A module that is off has no reports to export, and its route says so the
  // same way its screens do.
  if (CLINIC_REPORTS.has(report)) {
    const modules = await getModules();
    if (!modules.clinic) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }
  }
  if (PHARMACY_REPORTS.has(report)) {
    const modules = await getModules();
    if (!modules.pharmacy) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "ClinicNP";
  const ws = wb.addWorksheet("Report");

  if (report === "sales-register") {
    const rows = await salesRegister(range.fromIso, range.toIso);
    ws.columns = [
      { header: "Invoice", key: "inv", width: 22 },
      { header: "Date (BS)", key: "date", width: 14 },
      { header: "Patient", key: "patient", width: 20 },
      { header: "Subtotal", key: "sub", width: 12 },
      { header: "Discount", key: "disc", width: 12 },
      { header: "VAT", key: "vat", width: 12 },
      { header: "Total", key: "total", width: 12 },
      { header: "Status", key: "status", width: 12 },
    ];
    for (const r of rows) {
      ws.addRow({
        inv: r.invoiceNo != null ? formatDocNo("SI", r.fiscalLabel, r.invoiceNo) : "",
        date: r.dateBs,
        patient: r.patientName,
        sub: rupees(r.subtotalPaisa),
        disc: rupees(r.discountPaisa),
        vat: rupees(r.vatPaisa),
        total: rupees(r.totalPaisa),
        status: r.status,
      });
    }
  } else if (report === "purchase-register") {
    const rows = await purchaseRegister(range.fromIso, range.toIso);
    ws.columns = [
      { header: "Purchase no.", key: "no", width: 20 },
      { header: "Supplier", key: "sup", width: 24 },
      { header: "Their invoice", key: "sinv", width: 16 },
      { header: "Date (BS)", key: "date", width: 14 },
      { header: "Subtotal", key: "sub", width: 12 },
      { header: "VAT", key: "vat", width: 12 },
      { header: "Total", key: "total", width: 12 },
    ];
    for (const r of rows) {
      ws.addRow({
        no: r.purchaseNo ?? "",
        sup: r.supplierName,
        sinv: r.supplierInvoiceNo,
        date: r.dateBs,
        sub: rupees(r.subtotalPaisa),
        vat: rupees(r.vatPaisa),
        total: rupees(r.totalPaisa),
      });
    }
  } else if (report === "profit") {
    const { rows } = await profitByItem(range.fromIso, range.toIso);
    ws.columns = [
      { header: "Item", key: "item", width: 28 },
      { header: "Qty sold", key: "qty", width: 12 },
      { header: "Revenue", key: "rev", width: 14 },
      { header: "Cost", key: "cost", width: 14 },
      { header: "Profit", key: "profit", width: 14 },
      { header: "Margin %", key: "margin", width: 10 },
    ];
    for (const r of rows) {
      ws.addRow({
        item: r.brandName,
        qty: r.qty,
        rev: rupees(r.revenuePaisa),
        cost: rupees(r.costPaisa),
        profit: rupees(r.profitPaisa),
        margin: r.marginPct,
      });
    }
  } else if (report === "moving") {
    const rows = await movingItems(range.fromIso, range.toIso, adToIso(new Date()));
    ws.columns = [
      { header: "Item", key: "item", width: 28 },
      { header: "Qty sold", key: "qty", width: 12 },
      { header: "Value sold", key: "value", width: 14 },
      { header: "Dead stock (90d)", key: "dead", width: 16 },
    ];
    for (const r of rows) {
      ws.addRow({
        item: r.brandName,
        qty: r.qtySold,
        value: rupees(r.valuePaisa),
        dead: r.deadStock ? "Yes" : "No",
      });
    }
  } else if (report === "stock-out") {
    const reasonLabel = Object.fromEntries(
      STOCK_OUT_REASONS.map((r) => [r.key, r.label]),
    ) as Record<string, string>;

    const rows = await listStockOuts(range.fromIso, range.toIso);
    ws.columns = [
      { header: "Number", key: "no", width: 22 },
      { header: "Date (BS)", key: "date", width: 14 },
      { header: "Reason", key: "reason", width: 22 },
      { header: "Direction", key: "dir", width: 14 },
      { header: "Supplier", key: "sup", width: 24 },
      { header: "Lines", key: "lines", width: 8 },
      { header: "Value", key: "value", width: 14 },
      { header: "Note", key: "note", width: 30 },
      { header: "Recorded by", key: "by", width: 18 },
    ];
    for (const r of rows) {
      ws.addRow({
        no:
          r.adjustmentNo != null
            ? `SO-${r.fiscalLabel}-${String(r.adjustmentNo).padStart(6, "0")}`
            : "",
        date: r.dateBs,
        reason: reasonLabel[r.reason] ?? r.reason,
        dir: r.direction === "in" ? "Added back" : "Taken out",
        sup: r.supplierName ?? "",
        lines: r.lineCount,
        value: rupees(r.totalCostPaisa),
        note: r.note,
        by: r.userName,
      });
    }

    // The number the owner actually wants: what was lost, and to what.
    const totals = await stockOutTotalsByReason(range.fromIso, range.toIso);
    const summary = wb.addWorksheet("By reason");
    summary.columns = [
      { header: "Reason", key: "reason", width: 24 },
      { header: "Entries", key: "entries", width: 10 },
      { header: "Base quantity", key: "qty", width: 14 },
      { header: "Value", key: "value", width: 14 },
    ];
    for (const t of totals) {
      summary.addRow({
        reason: reasonLabel[t.reason] ?? t.reason,
        entries: t.entries,
        qty: t.baseQty,
        value: rupees(t.costPaisa),
      });
    }
    summary.getRow(1).font = { bold: true };
  } else if (report === "service-revenue") {
    const rows = await serviceRevenue(range);
    ws.columns = [
      { header: "Service", key: "name", width: 32 },
      { header: "Group", key: "group", width: 20 },
      { header: "Times", key: "count", width: 10 },
      { header: "Billed", key: "gross", width: 14 },
      { header: "Refunded", key: "refunded", width: 14 },
      { header: "Kept", key: "net", width: 14 },
      { header: "Paid to a laboratory", key: "cost", width: 20 },
      { header: "Left over", key: "margin", width: 14 },
    ];
    for (const r of rows) {
      ws.addRow({
        name: r.name,
        group: r.groupName,
        count: r.count,
        gross: rupees(r.grossPaisa),
        refunded: rupees(r.refundedPaisa),
        net: rupees(r.netPaisa),
        cost: rupees(r.partnerCostPaisa),
        margin: rupees(r.marginPaisa),
      });
    }
  } else if (report === "doctor-payouts") {
    const rows = await doctorPayouts(range);
    ws.columns = [
      { header: "Doctor", key: "name", width: 28 },
      { header: "Worked out as", key: "basis", width: 34 },
      { header: "Consultations", key: "consults", width: 14 },
      { header: "Other services", key: "others", width: 14 },
      { header: "Billed", key: "billed", width: 14 },
      { header: "Owed to the doctor", key: "share", width: 18 },
    ];
    for (const r of rows) {
      ws.addRow({
        name: r.name,
        basis: r.basisSummary,
        consults: r.consultations,
        others: r.otherServices,
        billed: rupees(r.billedPaisa),
        share: rupees(r.sharePaisa),
      });
    }
  } else if (report === "lab-partners") {
    const rows = await partnerSummary(range);
    ws.columns = [
      { header: "Laboratory", key: "name", width: 30 },
      { header: "Tests sent", key: "tests", width: 14 },
      { header: "Billed to patients", key: "billed", width: 18 },
      { header: "Left over", key: "margin", width: 14 },
      { header: "Paid", key: "paid", width: 14 },
      { header: "Owed now", key: "balance", width: 14 },
    ];
    for (const r of rows) {
      ws.addRow({
        name: r.name,
        tests: rupees(r.testsPaisa),
        billed: rupees(r.billedPaisa),
        margin: rupees(r.marginPaisa),
        paid: rupees(r.paymentsPaisa),
        balance: rupees(r.balancePaisa),
      });
    }
    // One sheet per laboratory, so a statement can be sent to the partner on
    // its own without the others' figures attached.
    for (const r of rows) {
      const st = await partnerStatement(r.partnerId, range);
      if (!st || st.entries.length === 0) continue;
      const sheet = wb.addWorksheet(st.partnerName.slice(0, 28));
      sheet.columns = [
        { header: "Date (BS)", key: "date", width: 14 },
        { header: "What happened", key: "desc", width: 40 },
        { header: "Owed", key: "charge", width: 14 },
        { header: "Paid", key: "paid", width: 14 },
        { header: "Balance", key: "balance", width: 14 },
      ];
      sheet.addRow({
        date: "",
        desc: "Owed at the start",
        charge: "",
        paid: "",
        balance: rupees(st.openingPaisa),
      });
      for (const e of st.entries) {
        sheet.addRow({
          date: e.dateBs,
          desc: e.description,
          charge: e.chargePaisa > 0 ? rupees(e.chargePaisa) : "",
          paid: e.paymentPaisa > 0 ? rupees(e.paymentPaisa) : "",
          balance: rupees(e.runningPaisa),
        });
      }
      sheet.getColumn("date").numFmt = "@";
      sheet.getRow(1).font = { bold: true };
    }
  } else if (report === "visit-register") {
    const rows = await patientVisitRegister(range);
    ws.columns = [
      { header: "Date (BS)", key: "date", width: 14 },
      { header: "Visit", key: "visit", width: 22 },
      { header: "Patient no.", key: "pno", width: 14 },
      { header: "Patient", key: "patient", width: 26 },
      { header: "Sex", key: "sex", width: 8 },
      { header: "Type", key: "type", width: 14 },
      { header: "Department", key: "dept", width: 18 },
      { header: "Doctor", key: "doctor", width: 24 },
      { header: "Status", key: "status", width: 12 },
    ];
    for (const r of rows) {
      ws.addRow({
        date: r.dateBs,
        visit:
          r.visitNo != null
            ? `V-${r.fiscalLabel}-${String(r.visitNo).padStart(6, "0")}`
            : "",
        pno: r.patientNo != null ? `P-${String(r.patientNo).padStart(6, "0")}` : "",
        patient: r.patientName,
        sex: r.sex.toUpperCase(),
        type: r.type,
        dept: r.department,
        doctor: r.doctorName,
        status: r.status,
      });
    }
    ws.getColumn("date").numFmt = "@";
    ws.getColumn("pno").numFmt = "@";
  } else if (report === "utilisation") {
    const rows = await diagnosticsUtilisation(range);
    ws.columns = [
      { header: "Department", key: "group", width: 28 },
      { header: "Times", key: "count", width: 12 },
      { header: "Kept", key: "net", width: 16 },
    ];
    for (const r of rows) {
      ws.addRow({ group: r.groupName, count: r.count, net: rupees(r.netPaisa) });
    }
  } else if (report === "shelf-list") {
    // A stock-take sheet: the shop in the order it is walked, with the
    // unshelved at the end where they read as the work remaining.
    const [rows, items, stock] = await Promise.all([
      shelfRows(),
      listItems(true),
      itemStockMap(adToIso(new Date())),
    ]);
    const unitsByItem = new Map(items.map((i) => [i.id, i.units]));
    ws.columns = [
      { header: "Rack", key: "rack", width: 18 },
      { header: "Shelf", key: "cell", width: 10 },
      { header: "Item", key: "item", width: 30 },
      { header: "Generic", key: "generic", width: 28 },
      { header: "Written note", key: "note", width: 20 },
      { header: "In stock", key: "qty", width: 18 },
      { header: "Value at cost", key: "cost", width: 16 },
    ];
    for (const r of rows) {
      const s = stock.get(r.itemId);
      ws.addRow({
        rack: r.rackName ?? "Not on a shelf",
        cell: r.row !== null && r.col !== null ? `R${r.row}C${r.col}` : "",
        item: r.brandName,
        generic: r.genericName,
        note: r.shelfNote,
        qty: toMixedDisplay(
          s?.sellableBaseQty ?? 0,
          unitsByItem.get(r.itemId) ?? [],
        ),
        cost: rupees(s?.costValuePaisa ?? 0),
      });
    }
  } else {
    return NextResponse.json(
      { ok: false, userMessage: "Unknown report." },
      { status: 404 },
    );
  }

  ws.getRow(1).font = { bold: true };
  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${report}-${range.fiscalLabel ? range.fiscalLabel.replace("/", "-") + "-" : ""}${range.fromIso}_${range.toIso}.xlsx"`,
    },
  });
}
