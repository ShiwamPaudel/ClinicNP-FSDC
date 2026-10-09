/**
 * GET /api/statement/[kind]?format=pdf|xlsx — a ledger as a file (C-036).
 *
 *   supplier  ?id=<supplier>                     Admin, with Supplies on
 *   lab       ?partner=<lab> + the report range  Admin, with the Clinic on
 *   dues      [?person=<key from the Dues list>] anyone who can see Dues
 *
 * The same people who can open the screen can download it, and nobody else:
 * a module that is off answers 404, as its pages do.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getModules, isModuleOn } from "@/lib/modules";
import { getCompany } from "@/lib/repos/company";
import { supplierStatement, labStatement, duesStatement } from "@/lib/repos/statements";
import { statementPdf } from "@/lib/export/statement-pdf";
import { statementXlsx } from "@/lib/export/statement-xlsx";
import { resolveRange } from "@/lib/date-range";
import { adFromIso, formatBS, toBS } from "@/lib/bs";
import { nepalDayIso, nepalTime } from "@/lib/clock";
import type { Statement } from "@/lib/statement";

export const runtime = "nodejs";

const notFound = () => NextResponse.json({ ok: false }, { status: 404 });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, userMessage: "Please sign in." }, { status: 401 });
  }
  const role = session.user.role;
  const { kind } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
  const modules = await getModules();

  const nowIso = new Date().toISOString();
  const todayAd = nepalDayIso(nowIso);
  const todayLong = formatBS(toBS(adFromIso(todayAd)), { form: "long", monthScript: "en" });
  const printedAt = `${todayLong}, ${nepalTime(nowIso)}`;

  const forbidden = () =>
    NextResponse.json(
      { ok: false, userMessage: "You don't have permission to do that." },
      { status: 403 },
    );

  let st: Statement | null = null;
  if (kind === "supplier") {
    if (!isModuleOn(modules, "supplies")) return notFound();
    if (role !== "admin") return forbidden();
    const id = url.searchParams.get("id");
    if (!id) return notFound();
    st = await supplierStatement(id, todayLong);
  } else if (kind === "lab") {
    if (!modules.clinic) return notFound();
    if (role !== "admin") return forbidden();
    const partner = url.searchParams.get("partner");
    if (!partner) return notFound();
    const range = resolveRange({
      preset: url.searchParams.get("preset") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      fy: url.searchParams.get("fy") ?? undefined,
    });
    st = await labStatement(partner, range);
  } else if (kind === "dues") {
    // The Dues screen is open to everyone but a doctor.
    if (role === "doctor") return forbidden();
    st = await duesStatement(todayAd, todayLong, url.searchParams.get("person") ?? undefined);
  } else {
    return notFound();
  }
  if (!st) return notFound();

  const company = await getCompany();
  const issuer = {
    name: company.name,
    address: company.address,
    phone: company.phone,
    panNo: company.panNo,
    vatRegistered: company.vatRegistered,
  };

  const body =
    format === "pdf"
      ? await statementPdf(st, issuer, printedAt)
      : await statementXlsx(st, issuer, printedAt);

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type":
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${st.fileName}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
