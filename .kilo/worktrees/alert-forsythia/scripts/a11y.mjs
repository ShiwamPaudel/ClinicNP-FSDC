/**
 * scripts/a11y.mjs — the accessibility faults that actually happen here.
 *
 * Not a score. A score tells you a number; these tell you which control on
 * which screen a person using a screen reader or a keyboard cannot operate.
 * Each check is something that has gone wrong in this codebase or would go
 * unnoticed if it did:
 *
 *   - a button whose only content is an icon, so it is announced as "button"
 *   - a form field whose label is not attached to it
 *   - an image with no alternative text
 *   - a heading level skipped, so the page outline lies
 *   - a control that cannot be reached by keyboard
 *   - text too small to read on the counter tablet
 *
 * Usage: start the app, then
 *   node scripts/a11y.mjs http://localhost:3000
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:3000";
const USER = process.env.A11Y_USER ?? "admin";
const PASS = process.env.A11Y_PASS ?? "admin123";

/** The screens somebody uses all day, plus the ones a patient's data is on. */
const SCREENS = [
  ["/billing", "the counter"],
  ["/dashboard", "the dashboard"],
  ["/patients", "patient search"],
  ["/patients/new", "registering a patient"],
  ["/visits/today", "today's visits"],
  ["/reports/day-close", "the day close"],
  ["/settings/services", "the service catalog"],
  ["/settings/racks", "the shop layout"],
  ["/stock/shelves", "the shelf plan"],
  ["/stock/opening", "opening stock"],
  ["/reports/shelf", "the shelf list"],
  ["/lab", "the laboratory queue"],
  ["/lab/reports", "reports waiting to be handed over"],
  ["/items/pricing", "setting prices"],
  ["/dues", "who owes money"],
];

const findings = [];

function note(screen, what) {
  findings.push(`${screen}: ${what}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

// The sign-in screen is checked before signing in, because it is the one
// screen everybody meets and the only one they meet before anyone has had a
// chance to show them how the software works.
await auditPage("the sign-in screen");

await page.fill("#username", USER);
await page.fill("#password", PASS);
await Promise.all([
  page.waitForURL("**/dashboard", { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);

/** Every check, against whatever page is currently open. */
async function auditPage(screen) {
  const problems = await page.evaluate(() => {
    const out = [];

    /** What a screen reader would announce for an element. */
    function accessibleName(el) {
      const aria = el.getAttribute("aria-label");
      if (aria && aria.trim()) return aria.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const t = document.getElementById(labelledBy)?.textContent ?? "";
        if (t.trim()) return t.trim();
      }
      const title = el.getAttribute("title");
      if (title && title.trim()) return title.trim();
      return (el.textContent ?? "").replace(/\s+/g, " ").trim();
    }

    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };

    // 1. buttons and links with nothing to announce
    for (const el of document.querySelectorAll("button, a[href]")) {
      if (!visible(el)) continue;
      if (accessibleName(el).length === 0) {
        out.push(
          `${el.tagName.toLowerCase()} with no name (${el.className || "no class"})`,
        );
      }
    }

    // 2. form fields with no label
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (!visible(el)) continue;
      if (el.type === "hidden") continue;
      const id = el.getAttribute("id");
      const labelled =
        (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
        el.closest("label") ||
        el.getAttribute("aria-label") ||
        el.getAttribute("aria-labelledby") ||
        el.getAttribute("placeholder");
      if (!labelled) {
        out.push(`${el.tagName.toLowerCase()} field with no label`);
      }
    }

    // 3. images with no alternative text
    for (const el of document.querySelectorAll("img")) {
      if (!visible(el)) continue;
      if (el.getAttribute("alt") === null) out.push(`image with no alt text`);
    }

    // 4. heading order
    const levels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .filter(visible)
      .map((h) => Number(h.tagName[1]));
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) {
        out.push(`heading jumps from h${levels[i - 1]} to h${levels[i]}`);
        break;
      }
    }

    // 5. text too small for the counter tablet
    for (const el of document.querySelectorAll("main *, aside *")) {
      if (el.children.length > 0) continue;
      if (!(el.textContent ?? "").trim()) continue;
      if (!visible(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size > 0 && size < 11) {
        out.push(`text at ${size}px: "${el.textContent.trim().slice(0, 24)}"`);
        break;
      }
    }

    return out;
  });

  for (const p of new Set(problems)) note(screen, p);

  // 6. the first thing Tab reaches must be real and visible
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const r = el.getBoundingClientRect();
    return { tag: el.tagName, visible: r.width > 0 && r.height > 0 };
  });
  if (!focused) note(screen, "nothing is reachable by keyboard");
  else if (!focused.visible) note(screen, "the first Tab lands on something invisible");
}

for (const [path, screen] of SCREENS) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await auditPage(screen);
}

await browser.close();

if (findings.length > 0) {
  console.error(`\nAccessibility check found ${findings.length} problem(s):\n`);
  for (const f of findings) console.error("  " + f);
  process.exit(1);
}
console.log(
  `\nAccessibility check clean across ${SCREENS.length + 1} screens.`,
);
