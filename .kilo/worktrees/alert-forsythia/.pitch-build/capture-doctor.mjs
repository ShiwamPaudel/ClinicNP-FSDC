/**
 * capture-doctor.mjs — the doctor's own screens, photographed on a phone.
 *
 * The doctor portal is a separate tree gated to the `doctor` role, so it can
 * only be seen from a doctor's own login — photographing it as the owner just
 * bounces to /dashboard. This makes that login on the demo database, then
 * shoots it at phone size, which is the shape it was built for. TEMPORARY.
 *
 * Run: node .pitch-build/capture-doctor.mjs
 */
import { chromium } from "playwright";
import { createClient } from "@libsql/client";
import { randomBytes, scryptSync } from "node:crypto";
import { ulid } from "ulid";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE || "http://localhost:3100";
const OUT = join(process.cwd(), ".pitch-build", "shots-doctor");
mkdirSync(OUT, { recursive: true });

function hash(secret) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(secret, salt, 64).toString("hex")}`;
}

// --- a login for Dr. Sample Karki, who has bookings today ----------------
const c = createClient({ url: "file:tests/demo-pitch.db" });
const existing = await c.execute({
  sql: "SELECT id FROM users WHERE username = 'karki'",
  args: [],
});
let userId = existing.rows[0]?.id;
if (!userId) {
  userId = ulid();
  await c.execute({
    sql: `INSERT INTO users (id,name,username,password_hash,pin_hash,role,
            can_edit_rate,active,created_at)
          VALUES (?,?,?,?,NULL,'doctor',0,1,?)`,
    args: [userId, "Dr. Sample Karki", "karki", hash("doctor123"),
      new Date().toISOString()],
  });
  console.log("created doctor login: karki / doctor123");
}
// The owner's own login was linked to a doctor earlier for testing; undo that
// so the back office is photographed as an owner, not bounced to /my.
await c.execute("UPDATE doctors SET user_id = NULL WHERE id = 'sample_doc_1'");
await c.execute({
  sql: "UPDATE doctors SET user_id = ? WHERE id = 'sample_doc_3'",
  args: [userId],
});
c.close();

const browser = await chromium.launch();
// The shape the portal was built for: one column, thumb height.
const ctx = await browser.newContext({
  viewport: { width: 412, height: 900 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("#username", "karki");
await page.fill("#password", "doctor123");
await Promise.all([
  page.waitForURL("**/my/**", { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);
console.log("signed in as the doctor →", page.url());

for (const [slug, path, wait] of [
  ["doctor-schedule", "/my/schedule", 1200],
  ["doctor-profile", "/my/profile", 1000],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 40000 });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: join(OUT, `${slug}.png`) });
  console.log("captured", slug);
}

await browser.close();
console.log("done →", OUT);
