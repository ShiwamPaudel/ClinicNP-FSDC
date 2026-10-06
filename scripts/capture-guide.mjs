/**
 * capture-guide.mjs — logs into a running ClinicNP instance and screenshots every
 * tab/section into prod-docs/guide/screens/. Feeds the printable user guide.
 *
 * Usage:  BASE=http://localhost:3100 node scripts/capture-guide.mjs
 * Assumes the seeded demo login (admin / admin123).
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3100";
const USER = process.env.SEED_USER || "admin";
const PASS = process.env.SEED_PASS || "admin123";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "prod-docs", "guide", "screens");
mkdirSync(OUT, { recursive: true });

// Every screen the guide documents. `wait` gives slow renders (charts) room.
const SHOTS = [
  { slug: "02-dashboard", path: "/dashboard", wait: 1400 },
  { slug: "03-billing", path: "/billing", wait: 700 },
  { slug: "04-stock", path: "/stock" },
  { slug: "05-stock-low", path: "/stock/low" },
  { slug: "06-stock-near-expiry", path: "/stock/near-expiry" },
  { slug: "07-stock-expired", path: "/stock/expired" },
  { slug: "08-items", path: "/items" },
  { slug: "08b-items-new", path: "/items/new", wait: 600 },
  { slug: "09-purchases", path: "/purchases" },
  { slug: "10-purchases-new", path: "/purchases/new", wait: 500 },
  { slug: "11-purchases-returns", path: "/purchases/returns" },
  { slug: "12-suppliers", path: "/suppliers" },
  { slug: "13-bills", path: "/bills" },
  { slug: "14-reports", path: "/reports" },
  { slug: "15-reports-day-close", path: "/reports/day-close", wait: 500 },
  { slug: "16-reports-sales-register", path: "/reports/sales-register", wait: 500 },
  { slug: "17-reports-profit", path: "/reports/profit", wait: 500 },
  { slug: "18-reports-purchase-register", path: "/reports/purchase-register", wait: 500 },
  { slug: "19-reports-valuation", path: "/reports/valuation", wait: 500 },
  { slug: "20-reports-vat", path: "/reports/vat", wait: 500 },
  { slug: "21-reports-expiry", path: "/reports/expiry", wait: 500 },
  { slug: "22-reports-moving", path: "/reports/moving", wait: 500 },
  { slug: "23-settings-company", path: "/settings/company", wait: 400 },
  { slug: "24-settings-users", path: "/settings/users" },
  { slug: "26-settings-backup", path: "/settings/backup" },
  { slug: "27-settings-audit", path: "/settings/audit" },

  // --- the clinic (v2) ---
  { slug: "30-patients", path: "/patients", wait: 500 },
  { slug: "31-patients-new", path: "/patients/new", wait: 500 },
  { slug: "32-visits-today", path: "/visits/today", wait: 500 },
  { slug: "33-visits", path: "/visits", wait: 500 },
  { slug: "34-files-pending", path: "/files/pending", wait: 500 },
  { slug: "35-patients-duplicates", path: "/patients/duplicates", wait: 500 },
  { slug: "36-settings-services", path: "/settings/services", wait: 600 },
  { slug: "37-settings-doctors", path: "/settings/doctors", wait: 500 },
  { slug: "38-settings-lab-partners", path: "/settings/lab-partners", wait: 500 },
  { slug: "39-settings-modules", path: "/settings/modules", wait: 400 },
  { slug: "40-settings-fiscal-years", path: "/settings/fiscal-years", wait: 400 },
  { slug: "41-stock-out", path: "/stock/out", wait: 500 },
  { slug: "42-stock-out-new", path: "/stock/out/new", wait: 700 },
  { slug: "43-reports-service-revenue", path: "/reports/service-revenue", wait: 500 },
  { slug: "44-reports-doctors", path: "/reports/doctors", wait: 500 },
  { slug: "45-reports-lab-partners", path: "/reports/lab-partners", wait: 500 },
  { slug: "46-reports-visits", path: "/reports/visits", wait: 500 },
  { slug: "47-reports-new-patients", path: "/reports/new-patients", wait: 500 },
  { slug: "48-reports-utilisation", path: "/reports/utilisation", wait: 500 },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: "no-preference",
});
const page = await ctx.newPage();

// Capture the login screen first, while still signed out (an authenticated
// session redirects /login → /dashboard).
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, "01-login.png"), fullPage: false });
console.log("captured 01-login");

// Log in once; the session cookie carries across the whole run.
await page.fill("#username", USER);
await page.fill("#password", PASS);
await Promise.all([
  page.waitForURL("**/dashboard", { timeout: 20000 }),
  page.click('button[type="submit"]'),
]);
console.log("logged in");

for (const shot of SHOTS) {
  try {
    await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle", timeout: 30000 });
    // let fonts settle + any chart/entry animation finish
    await page.waitForTimeout(shot.wait ?? 250);
    await page.screenshot({ path: join(OUT, `${shot.slug}.png`), fullPage: false });
    console.log("captured", shot.slug);
  } catch (err) {
    console.error("FAILED", shot.slug, err.message);
  }
}

// --- shots that only exist once something has been done ---
//
// The visual unit picker and the patient bar are not routes: they appear when a
// line is on the bill and when somebody is attached to it. So the counter is
// driven the way a person would drive it, and then photographed.
async function captureInteraction(slug, steps) {
  try {
    await page.goto(`${BASE}/billing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500); // let the catalog reach the local cache
    await steps();
    await page.screenshot({ path: join(OUT, `${slug}.png`), fullPage: false });
    console.log("captured", slug);
  } catch (err) {
    console.error("FAILED", slug, err.message);
  }
}

await captureInteraction("03b-visual-picker", async () => {
  const search = page.locator('input[aria-label*="Search"]');
  await search.fill("Sample Paracetamol");
  await page.waitForTimeout(700);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
});

await captureInteraction("03c-patient-bar", async () => {
  const search = page.locator('input[aria-label*="Search"]');
  await search.fill("opd");
  await page.waitForTimeout(700);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
});

await browser.close();
console.log("done →", OUT);
