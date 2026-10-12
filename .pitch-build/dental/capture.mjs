/**
 * capture.mjs — photographs the dental demo clinic for "ClinicNP Dental.pdf".
 * Run against the demo database only (see README.md):
 *
 *   BASE=http://localhost:3100 node .pitch-build/dental/capture.mjs [name ...]
 *
 * Every shot is a real screen. Most are cut to the part worth showing, so a
 * shot in the document reads at print size.
 */
import { chromium } from "playwright";
import { createClient } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = join(process.cwd(), ".pitch-build", "dental", "shots");
const DPR = Number(process.env.DPR || 2);
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);

const c = createClient({ url: "file:tests/demo-dental.db" });
const one = async (sql) => (await c.execute(sql)).rows[0];
const anita = (await one("SELECT id FROM patients WHERE name LIKE 'Sample Anita%'")).id;
const aarav = (await one("SELECT id FROM patients WHERE name LIKE 'Sample Aarav%'")).id;
const gurung = (await one("SELECT id FROM doctors WHERE name = 'Dr. Sample Gurung'")).id;
const ceramicBill = (await one(
  `SELECT b.id FROM bills b JOIN bill_service_lines l ON l.bill_id = b.id
    WHERE l.service_id = 's_crown_ceramic' LIMIT 1`,
)).id;
const sunita = (await one("SELECT id FROM staff WHERE name LIKE 'Sample Sunita%'")).id;
const month = (await one("SELECT month_bs FROM salary_payments ORDER BY date_ad DESC LIMIT 1")).month_bs;
c.close();

const browser = await chromium.launch();

async function login(ctx, user, pass) {
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  await p.goto(`${BASE}/login`);
  await p.fill("#username", user);
  await p.fill("#password", pass);
  await p.click('button[type="submit"]');
  await p.waitForURL((u) => !u.pathname.startsWith("/login"));
  return p;
}

// Tall, so a long page is photographed whole: the app scrolls inside its own panel.
const desk = await browser.newContext({ viewport: { width: 1440, height: 2000 }, deviceScaleFactor: DPR });
const p = await login(desk, "admin", "admin123");

const want = (name) => only.length === 0 || only.includes(name);
async function go(path) {
  await p.goto(`${BASE}${path}`);
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(400);
}
async function shot(name, target = p.locator("main")) {
  await target.screenshot({ path: join(OUT, `${name}.png`) });
  console.log("shot", name);
}

if (want("dashboard")) { await go("/dashboard"); await shot("dashboard"); }
if (want("visits")) { await go("/visits"); await shot("visits"); }
if (want("patient")) { await go(`/patients/${anita}`); await shot("patient"); }

if (want("teeth")) {
  await go(`/patients/${anita}`);
  await p.getByRole("button", { name: /Tooth chart/ }).click();
  await p.getByRole("button", { name: /^36 ·/ }).click();
  await p.waitForTimeout(300);
  const section = p.locator("section", { has: p.getByRole("button", { name: /Tooth chart/ }) });
  await shot("teeth", section);
  await shot("teeth-svg", p.locator("svg[aria-label^='Tooth chart']"));
}
if (want("teeth-child")) {
  await go(`/patients/${aarav}`);
  await p.getByRole("button", { name: /Tooth chart/ }).click();
  await p.getByRole("button", { name: "Both", exact: true }).click();
  await p.waitForTimeout(300);
  await shot("teeth-child", p.locator("svg[aria-label^='Tooth chart']"));
}
if (want("history-row")) {
  await go(`/patients/${anita}`);
  await p.getByRole("button", { name: "Add row" }).click();
  await p.waitForTimeout(500);
  const form = p.locator("main");
  await form.locator("select").first().selectOption({ label: "Dr. Sample Gurung" });
  await form.getByPlaceholder(/RCT 36/).fill("Crown 36 cemented, occlusion checked. Review in 6 months.");
  await p.getByRole("button", { name: "Add a charge" }).click();
  await p.waitForTimeout(500);
  await form.locator("select", { has: p.locator("option", { hasText: "— Choose —" }) }).last()
    .selectOption({ label: "Consultation / Checkup" });
  await p.waitForTimeout(700);
  await shot("history-row");
}

if (want("billing")) {
  await go(`/billing?patient=${anita}`);
  await p.waitForTimeout(1500);
  const box = p.getByPlaceholder(/Search/);
  for (const code of ["con", "crz"]) {
    await box.fill(code);
    await box.press("Enter");
    await p.waitForTimeout(700);
  }
  for (const sel of await p.locator("select").all()) {
    const options = await sel.locator("option").allInnerTexts();
    if (options.includes("Dr. Sample Gurung")) await sel.selectOption({ label: "Dr. Sample Gurung" });
  }
  await p.setViewportSize({ width: 1440, height: 760 });
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(OUT, "billing.png") });
  await p.setViewportSize({ width: 1440, height: 2000 });
  console.log("shot billing");
}

if (want("bill")) { await go(`/bills/${ceramicBill}`); await shot("bill"); }
if (want("lab")) {
  await go("/lab/dispatch");
  await p.setViewportSize({ width: 1440, height: 560 });
  await p.screenshot({ path: join(OUT, "lab.png") });
  await p.setViewportSize({ width: 1440, height: 2000 });
  console.log("shot lab");
}
if (want("lab-statement")) { await go("/reports/lab-partners?partner=lab_2&preset=month"); await shot("lab-statement"); }
if (want("doctors")) { await go("/doctors"); await shot("doctors"); }
if (want("doctor-pay")) { await go(`/reports/doctors?preset=month&doctor=${gurung}`); await shot("doctor-pay"); }
if (want("payables")) { await go("/payables"); await shot("payables"); }
if (want("salaries")) {
  await go(`/salaries?month=${month}`);
  await p.getByRole("button", { name: /Sample Gita/ }).click();
  await p.waitForTimeout(300);
  await shot("salaries");
}
if (want("staff")) { await go(`/salaries/staff/${sunita}`); await shot("staff"); }
if (want("dues")) { await go("/dues"); await shot("dues"); }
if (want("financials")) { await go("/reports/financials?preset=month"); await shot("financials"); }
if (want("reports")) { await go("/reports"); await shot("reports"); }
if (want("services")) { await go("/settings/services"); await shot("services"); }
if (want("purchases")) { await go("/purchases"); await shot("purchases"); }
if (want("sales")) { await go("/reports/sales-register?preset=month"); await shot("sales"); }
if (want("login")) {
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
  const a = await anon.newPage();
  await a.goto(`${BASE}/login`);
  await a.waitForLoadState("networkidle");
  await a.screenshot({ path: join(OUT, "login.png") });
  console.log("shot login");
}

// the doctor's own screens, on a phone
if (want("doctor-phone")) {
  const phone = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  const d = await login(phone, "karki", "doctor123");
  await d.goto(`${BASE}/my`);
  await d.waitForLoadState("networkidle");
  await d.waitForTimeout(400);
  await d.screenshot({ path: join(OUT, "doctor-phone.png") });
  console.log("shot doctor-phone");
  await d.goto(`${BASE}/my/schedule`);
  await d.waitForLoadState("networkidle");
  await d.waitForTimeout(400);
  await d.screenshot({ path: join(OUT, "doctor-phone-schedule.png") });
  console.log("shot doctor-phone-schedule");
}

await browser.close();
