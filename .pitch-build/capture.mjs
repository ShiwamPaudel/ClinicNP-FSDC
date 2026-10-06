/**
 * capture.mjs — photographs every tab of ClinicNP with BOTH modules on, from
 * the throwaway demo database, for the product document. TEMPORARY.
 *
 * Run:  BASE=http://localhost:3100 node .pitch-build/capture.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = join(process.cwd(), ".pitch-build", "shots");
mkdirSync(OUT, { recursive: true });

// --- ids the detail pages need, straight from the demo database -----------
const c = createClient({ url: "file:tests/demo-pitch.db" });
const pid = (await c.execute(
  "SELECT id FROM patients WHERE patient_no=1",
)).rows[0].id;
const vid = (await c.execute(
  "SELECT id FROM visits ORDER BY visit_no LIMIT 1",
)).rows[0].id;
const bid = (await c.execute(
  "SELECT id FROM bills WHERE kind='mixed' ORDER BY invoice_no LIMIT 1",
)).rows[0].id;
const labPartner = "sample_lab_1";
c.close();

const SHOTS = [
  ["dashboard", "/dashboard", 1600],
  ["billing-empty", "/billing", 1200],

  // clinic
  ["today", "/visits/today", 700],
  ["patients", "/patients", 700],
  ["patient-card", `/patients/${pid}`, 900],
  ["patient-new", "/patients/new", 700],
  ["patient-duplicates", "/patients/duplicates", 700],
  ["visits", "/visits", 700],
  ["visit-detail", `/visits/${vid}`, 800],
  ["doctors-appointments", "/doctors", 800],

  // laboratory
  ["lab", "/lab", 800],
  ["lab-dispatch", "/lab/dispatch", 800],
  ["lab-awaiting", "/lab/awaiting", 800],
  ["lab-done", "/lab/done", 800],
  ["lab-reports", "/lab/reports", 800],

  // pharmacy
  ["stock", "/stock", 700],
  ["stock-low", "/stock/low", 600],
  ["stock-near-expiry", "/stock/near-expiry", 600],
  ["stock-expired", "/stock/expired", 600],
  ["stock-out", "/stock/out", 600],
  ["stock-out-new", "/stock/out/new", 900],
  ["stock-shelves", "/stock/shelves", 1000],
  ["stock-opening", "/stock/opening", 700],
  ["items", "/items", 700],
  ["items-new", "/items/new", 800],
  ["items-pricing", "/items/pricing", 700],
  ["purchases", "/purchases", 600],
  ["purchases-new", "/purchases/new", 800],
  ["purchases-returns", "/purchases/returns", 600],
  ["suppliers", "/suppliers", 600],

  // money
  ["bills", "/bills", 700],
  ["bill-detail", `/bills/${bid}`, 800],
  ["bills-credit", "/bills/credit", 700],

  // reports
  ["reports", "/reports", 700],
  ["report-day-close", "/reports/day-close", 900],
  ["report-service-revenue", "/reports/service-revenue", 900],
  ["report-doctors", "/reports/doctors", 900],
  ["report-lab-partners", `/reports/lab-partners?partner=${labPartner}`, 900],
  ["report-visits", "/reports/visits", 900],
  ["report-new-patients", "/reports/new-patients", 900],
  ["report-utilisation", "/reports/utilisation", 900],
  ["report-sales-register", "/reports/sales-register", 900],
  ["report-profit", "/reports/profit", 900],
  ["report-valuation", "/reports/valuation", 900],
  ["report-vat", "/reports/vat", 900],
  ["report-expiry", "/reports/expiry", 900],
  ["report-moving", "/reports/moving", 900],
  ["report-purchase-register", "/reports/purchase-register", 900],
  ["report-shelf", "/reports/shelf", 900],

  // settings
  ["settings-company", "/settings/company", 700],
  ["settings-services", "/settings/services", 800],
  ["settings-doctors", "/settings/doctors", 700],
  ["settings-lab-partners", "/settings/lab-partners", 700],
  ["settings-modules", "/settings/modules", 600],
  ["settings-fiscal-years", "/settings/fiscal-years", 600],
  ["settings-users", "/settings/users", 600],
  ["settings-racks", "/settings/racks", 900],
  ["settings-backup", "/settings/backup", 600],
  ["settings-audit", "/settings/audit", 600],

  // the doctor's own screens
  ["doctor-my", "/my", 900],
  ["doctor-schedule", "/my/schedule", 900],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: "reduce",
});
const page = await ctx.newPage();
const failures = [];

// login screen first, while signed out
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: join(OUT, "login.png") });
console.log("✓ login");

await page.fill("#username", "admin");
await page.fill("#password", "admin123");
await Promise.all([
  page.waitForURL("**/dashboard", { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);
console.log("✓ signed in");

for (const [slug, path, wait] of SHOTS) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 40000 });
    await page.waitForTimeout(wait);
    // a 404 means the route moved; record it rather than shipping a blank page
    const is404 = await page.locator("text=We couldn't find that page").count();
    if (is404) throw new Error("404 — route not found");
    await page.screenshot({ path: join(OUT, `${slug}.png`) });
    console.log("✓", slug);
  } catch (err) {
    failures.push([slug, err.message]);
    console.error("✗", slug, "—", err.message);
  }
}

// --- the counter, driven the way a person drives it ----------------------
async function counter(slug, steps) {
  try {
    await page.goto(`${BASE}/billing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(3000); // the catalogue has to reach the local cache
    await steps();
    await page.screenshot({ path: join(OUT, `${slug}.png`) });
    console.log("✓", slug);
  } catch (err) {
    failures.push([slug, err.message]);
    console.error("✗", slug, "—", err.message);
  }
}

const search = () => page.locator('input[aria-label*="Search" i]').first();

await counter("billing-unit-picker", async () => {
  await search().fill("Sample Paracetamol");
  await page.waitForTimeout(900);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
});

await counter("billing-service-search", async () => {
  await search().fill("sample");
  await page.waitForTimeout(1200);
});

await counter("billing-mixed", async () => {
  await search().fill("Sample OPD");
  await page.waitForTimeout(900);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1400);
  await page.keyboard.press("Escape");
  await search().fill("Sample Paracetamol");
  await page.waitForTimeout(900);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1400);
});

await browser.close();
console.log(`\ndone → ${OUT}`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const [s, m] of failures) console.log(`  ${s}: ${m}`);
}
