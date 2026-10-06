/**
 * build-pdf.mjs — composes the ClinicNP Product Details Document and prints it
 * to a single A4 PDF in the project root. TEMPORARY tooling.
 *
 * Everything is embedded (logos, screenshots, icons) so the PDF is one
 * self-contained file that can be mailed to a prospect.
 *
 * Layout is packed rather than hand-placed: every block is measured in a real
 * browser at the exact content width, then filled onto pages in order. That is
 * what keeps a 20-page document from carrying six half-empty pages, and it
 * means adding a paragraph later cannot silently push content off the bottom
 * of a fixed-height page.
 *
 * Run:          node .pitch-build/build-pdf.mjs
 * With proofs:  PROOF=1 node .pitch-build/build-pdf.mjs
 */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { icon } from "./icons.mjs";

const ROOT = process.cwd();
// Cropped to their real content — see crop.mjs. A list screen photographed at
// 1440x900 is often half empty below the last row, and in a document that dead
// space costs a third of a page.
const SHOTS = join(ROOT, ".pitch-build", "cropped");

// ---------------------------------------------------------------------------
// assets
// ---------------------------------------------------------------------------
const b64 = (p) => readFileSync(p).toString("base64");
const LOGO_CLINICNP = `data:image/png;base64,${b64(join(ROOT, "public", "icons", "logo-main.png"))}`;
const LOGO_CLINICNP_WHITE = `data:image/png;base64,${b64(join(ROOT, "public", "icons", "logo-white.png"))}`;
const LOGO_IBN = `data:image/png;base64,${b64(join(ROOT, "InfobytesNepal - Logo [RAW].png"))}`;

const missing = [];
function shotSrc(name) {
  const p = join(SHOTS, `${name}.png`);
  if (!existsSync(p)) {
    missing.push(name);
    return "";
  }
  return `data:image/png;base64,${b64(p)}`;
}

// ---------------------------------------------------------------------------
// block helpers — each returns one atomic chunk of the flow
// ---------------------------------------------------------------------------
function head(kicker, title, ic) {
  return {
    keepWithNext: true,
    html: `<header class="ph">
      <div class="ph-ic">${icon(ic, { size: 22 })}</div>
      <div>
        <div class="kicker">${kicker}</div>
        <h2>${title}</h2>
      </div>
    </header>`,
  };
}

/**
 * A screenshot. Offered at several widths: the packer takes the widest one
 * that still fits the page it is filling, which is what stops a tall shot from
 * jumping to the next page and leaving a third of this one blank. Narrower
 * variants stay centred so the column still reads straight.
 */
const FIG_WIDTHS = [100, 94, 88, 82, 76];

function fig(name, caption) {
  const src = shotSrc(name);
  if (!src) return null;
  const body =
    `<div class="shot-frame"><div class="shot-bar"><i></i><i></i><i></i></div><img src="${src}"></div>` +
    (caption ? `<figcaption>${caption}</figcaption>` : "");
  return {
    variants: FIG_WIDTHS.map((w) => ({
      html: `<figure class="shot" style="width:${w}%;margin-inline:auto">${body}</figure>`,
    })),
  };
}

/**
 * Phone-shaped screenshots, side by side. The doctor portal is a separate tree
 * built for one hand on a phone, so photographing it at desktop width would
 * misrepresent it; these are shot at 412px and shown at phone proportions.
 */
function phoneFig(names, caption) {
  const srcs = names.map(shotSrc).filter(Boolean);
  if (!srcs.length) return null;
  const widths = [27, 24, 21];
  return {
    variants: widths.map((w) => ({
      html: `<figure class="shot phones">
        <div class="phones-row">
          ${srcs
            .map(
              (s) =>
                `<div class="phone" style="width:${w}%"><div class="phone-scr"><img src="${s}"></div></div>`,
            )
            .join("")}
        </div>
        ${caption ? `<figcaption>${caption}</figcaption>` : ""}
      </figure>`,
    })),
  };
}

function point(ic, label, copy) {
  return `<div class="pt">
    <div class="pt-ic">${icon(ic, { size: 19 })}</div>
    <div class="pt-tx"><b>${label}</b>${copy ? `<span>${copy}</span>` : ""}</div>
  </div>`;
}

/** A two-column band of icon points. */
function points(...items) {
  return { html: `<div class="pts-row">${items.join("")}</div>` };
}

function lead(html) {
  // Intro prose belongs with what it introduces, never alone at a page foot.
  return { keepWithNext: true, html: `<p class="lead">${html}</p>` };
}

function chip(ic, label) {
  return `<div class="chip">${icon(ic, { size: 16 })}<span>${label}</span></div>`;
}

function raw(html) {
  return { html };
}

// ---------------------------------------------------------------------------
// the document, as a flow of blocks
// ---------------------------------------------------------------------------
const flow = [];
const add = (...bs) => {
  for (const b of bs) if (b) flow.push(b);
};

// ---- Overview -------------------------------------------------------------
add(
  head("Overview", "One system, two halves, one counter", "layout-dashboard"),
  lead(`A clinic and a pharmacy have the same problem at the same desk: a queue
   of people, a paper register, and software written for a supermarket. ClinicNP
   is one system with two halves that share one counter, one invoice series, one
   patient and one set of books. Each half is switched on or off on its own, and
   switching one off never deletes anything.`),
  raw(`<div class="two-mod">
    <div class="mod mod-clinic">
      <div class="mod-h">${icon("stethoscope", { size: 20 })}<b>Clinic</b></div>
      <p>The patient exists here. Register once, keep every visit, bill the
      consultation, the ultrasound, the ECG and the lab test, and keep the
      report that comes back.</p>
      <div class="mod-list">
        ${chip("users", "Patient records")}
        ${chip("calendar-clock", "Visits &amp; today's list")}
        ${chip("flask-conical", "Samples &amp; reports")}
        ${chip("calendar-check", "Appointments")}
        ${chip("percent", "Doctor shares")}
        ${chip("paperclip", "Files against a visit")}
      </div>
    </div>
    <div class="mod mod-pharm">
      <div class="mod-h">${icon("pill", { size: 20 })}<b>Pharmacy</b></div>
      <p>Medicines sold by the tablet, strip or box. Batch and expiry decide
      whether stock is an asset or a write-off, oldest-expiry-first is the
      default, and expired stock cannot be sold at all.</p>
      <div class="mod-list">
        ${chip("boxes", "Stock by batch")}
        ${chip("triangle-alert", "Expiry warnings")}
        ${chip("shopping-cart", "Purchases")}
        ${chip("truck", "Suppliers &amp; ledgers")}
        ${chip("package-minus", "Stock out with a reason")}
        ${chip("map", "Shelf map")}
      </div>
    </div>
  </div>`),
  raw(`<div class="join">
    ${icon("arrow-down", { size: 16 })}
    <div><b>Both switched on</b> is the interesting case — one counter, one
    invoice that carries medicines and services together, one dashboard, one
    set of books.</div>
  </div>`),
  fig(
    "dashboard",
    "The dashboard with both halves on — the day's money split into medicines, consultation, diagnostics and laboratory, and the queues that need attention.",
  ),
);

// ---- Why ------------------------------------------------------------------
add(
  head("Why ClinicNP", "What makes it different", "badge-check"),
  raw(`<div class="usp-grid">
    <div class="usp"><div class="usp-ic">${icon("receipt", { size: 24 })}</div>
      <b>One bill for everything</b>
      <p>A consultation, an ultrasound, two lab tests and the prescription —
      one invoice, one number, one payment, one set of books.</p></div>

    <div class="usp"><div class="usp-ic">${icon("flask-conical", { size: 24 })}</div>
      <b>Samples followed to the report</b>
      <p>Collected, sent, back, handed over. Five worklists, each stamped with
      a time, so "has that one gone yet?" has an answer.</p></div>

    <div class="usp"><div class="usp-ic">${icon("wifi-off", { size: 24 })}</div>
      <b>The counter survives the internet</b>
      <p>Billing and patient registration carry on with zero connectivity for a
      full business day, then reconcile by themselves.</p></div>

    <div class="usp"><div class="usp-ic">${icon("keyboard", { size: 24 })}</div>
      <b>Built for a keyboard</b>
      <p>One search box finds a medicine or a service. Every counter action has
      a key, and <code>?</code> shows the whole sheet.</p></div>

    <div class="usp"><div class="usp-ic">${icon("calendar", { size: 24 })}</div>
      <b>Bikram Sambat, everywhere</b>
      <p>BS dates on every screen, register and report. The year runs Shrawan
      to Ashadh, and closed years stay readable forever.</p></div>

    <div class="usp"><div class="usp-ic">${icon("percent", { size: 24 })}</div>
      <b>Doctor shares worked out</b>
      <p>A percentage of the consultation, a fixed amount, or a share of listed
      services — calculated per line, totalled into a payout sheet.</p></div>

    <div class="usp"><div class="usp-ic">${icon("handshake", { size: 24 })}</div>
      <b>The outside lab, accounted for</b>
      <p>What you billed, what the partner charges, the margin between them,
      what you have paid and what is still owed.</p></div>

    <div class="usp"><div class="usp-ic">${icon("shield-check", { size: 24 })}</div>
      <b>Nothing is quietly lost</b>
      <p>Bills are never deleted, visits are cancelled with a reason, and every
      override, merge and deletion is signed and logged.</p></div>

    <div class="usp"><div class="usp-ic">${icon("search", { size: 24 })}</div>
      <b>Anybody found in seconds</b>
      <p>By name, phone or patient number — with their whole history and every
      attached report on one card.</p></div>
  </div>`),
  raw(`<div class="ticks">
    ${point("circle-check-big", "A bill leaves the counter in seconds", "medicines, services, or both — from the keyboard")}
    ${point("circle-check-big", "A patient from eighteen months ago is found on the first try", "with every visit, bill and file attached")}
    ${point("circle-check-big", "Last year's register prints unchanged", "after the year is closed, forever")}
  </div>`),
  fig(
    "login",
    "The front door. The clinic's own name sits above the login, and the product says on it exactly what it claims to do.",
  ),
);

// ---- The map --------------------------------------------------------------
add(
  head("The map", "Every tab, and what lives in it", "panels-top-left"),
  lead(`The sidebar groups itself by module. With both halves on it reads top to
   bottom the way the day runs: the counter first, the clinic, the pharmacy,
   then the money and the settings.`),
  raw(`<div class="map">
    <div class="map-grp">
      <div class="map-grp-h">${icon("circle-dot", { size: 14 })} Always on</div>
      <div class="map-items">
        ${point("layout-dashboard", "Dashboard", "the day's money, the queues, what needs attention")}
        ${point("receipt", "New bill", "the counter — medicines, services, or both")}
      </div>
    </div>

    <div class="map-grp clinic">
      <div class="map-grp-h">${icon("stethoscope", { size: 14 })} Clinic</div>
      <div class="map-items">
        ${point("calendar-clock", "Today", "everyone registered today, their doctor and their status")}
        ${point("users", "Patients", "one record per person, for life — with duplicate detection")}
        ${point("stethoscope", "Visits", "every encounter, its complaint, vitals, findings and advice")}
        ${point("calendar-check", "Doctors", "appointments, arrivals, and the doctor's own screen")}
        ${point("flask-conical", "Laboratory", "five worklists, from collection to handing the report over")}
      </div>
    </div>

    <div class="map-grp pharm">
      <div class="map-grp-h">${icon("pill", { size: 14 })} Pharmacy</div>
      <div class="map-items">
        ${point("boxes", "Stock", "current, low, near expiry, expired, stock out, opening, shelves")}
        ${point("package", "Items", "the medicine list, its units and its prices")}
        ${point("shopping-cart", "Purchases", "stock coming in, and going back to the supplier")}
        ${point("truck", "Suppliers", "who you buy from, and what you owe them")}
      </div>
    </div>

    <div class="map-grp">
      <div class="map-grp-h">${icon("circle-dot", { size: 14 })} Money &amp; control</div>
      <div class="map-items">
        ${point("receipt-text", "Bills", "every sale, reprint, cancel, refund and credit settlement")}
        ${point("chart-column", "Reports", "fifteen registers and reports, every one exportable to Excel")}
        ${point("settings", "Settings", "company, services, doctors, laboratories, users, years, backup")}
      </div>
    </div>
  </div>`),
);

// ---- The counter ----------------------------------------------------------
add(
  head("The counter", "One search box, one bill", "receipt"),
  points(
    point("search", "Type once, find anything", "medicines and services in the same box — each tagged, so a mixed bill reads clearly"),
    point("layers", "Sold by box, strip or tablet", "with its own rate at each level, and a picture of the quantity you picked"),
    point("user-plus", "A service needs a patient", "attach one or register them inline; a medicine-only bill can stay anonymous"),
    point("pause", "Hold and resume", "a bill can wait while the next person is served"),
  ),
  raw(`<div class="keys">
    <div class="keys-h">${icon("keyboard", { size: 17 })}<b>The whole counter, from the keyboard</b>
      <span>press <kbd>?</kbd> on the counter for this sheet</span></div>
    <div class="keys-g">
      ${[
        ["F2", "New bill"],
        ["Type + ⏎", "Find and add"],
        ["F3", "Medicines / services"],
        ["P", "Attach a patient"],
        ["↑ ↓", "Move through results"],
        ["U", "Switch unit"],
        ["B", "Choose a batch"],
        ["Tab", "Quantity → rate"],
        ["Del", "Remove the line"],
        ["F7", "Hold this bill"],
        ["F8", "Resume a held bill"],
        ["F9", "Save &amp; print"],
      ]
        .map(([k, l]) => `<div class="keyrow"><kbd>${k}</kbd><span>${l}</span></div>`)
        .join("")}
    </div>
  </div>`),
  fig(
    "billing-mixed",
    "A consultation and a prescription on one bill. Services sit in their own block with the doctor on the line; medicines carry the unit picker, the batch and the rate.",
  ),
  points(
    point("triangle-alert", "Expired stock cannot be sold", "no override, ever — and overselling is blocked outright"),
    point("arrow-down-up", "Oldest expiry leaves first", "chosen automatically, overridable per line when a batch must be picked by hand"),
    point("circle-dot", "An edited rate is marked", "the line shows it, and the change is signed and logged"),
    point("banknote", "Cash, QR or credit", "with tendered and change, and credit settled later from the bill register"),
  ),
  fig(
    "billing-service-search",
    "One search box, both halves of the catalogue. Services and medicines come back together, each tagged, and the sample a test needs is shown on the result.",
  ),
  fig(
    "billing-unit-picker",
    "The visual quantity picker draws the medicine in its real shape — a strip of ten, a bottle, a tube — so the person at the counter can see the quantity rather than trust a number.",
  ),
);

// ---- Patients -------------------------------------------------------------
add(
  head("Patients", "One person, one number, one history", "users"),
  points(
    point("hash", "A number for life", "P-000001 onwards — sequential, never reused, never reset at year end"),
    point("cake", "Age the way a clinic records it", "years, months or days, stamped with the date it was recorded, so it never shows a wrong age later"),
    point("triangle-alert", "Allergies in red", "a known allergy or a standing note is a red strip across the card"),
    point("copy", "Duplicates offered, not created", "a matching name and phone is caught on save; merging is the owner's call, and is logged"),
  ),
  fig(
    "patient-card",
    "The patient card — identity, the allergy strip, quick actions, the visit timeline, and the place reports are attached.",
  ),
  fig(
    "patients",
    "The patient list. Search by name, phone or patient number.",
  ),
  fig(
    "patient-new",
    "Registration, built to be finished in under twenty seconds: name, sex, age, phone and address, with guardian, blood group, a note and who referred them when they matter.",
  ),
  fig(
    "patient-duplicates",
    "Two records for one person. The system shows what it thinks matches and leaves the decision to the owner — merging moves every visit, bill and file onto the record that is kept.",
  ),
);

// ---- Visits ---------------------------------------------------------------
add(
  head("Visits", "The day, and what happened in it", "stethoscope"),
  points(
    point("calendar-clock", "Today's list is the front desk's home", "everyone registered today, their doctor and department, and whether they are waiting, seen or closed"),
    point("hash", "A number per year", "V-2083/84-000001, restarting with the fiscal year"),
    point("activity", "Vitals if you want them", "BP, pulse, temperature, weight and SpO₂ — all optional, no charting, no pressure"),
    point("pen-line", "Free text, on purpose", "complaint, findings and advice as prose; most doctors keep writing on paper, and the system does not punish that"),
  ),
  fig("today", "Today's list. Three waiting, three seen, and one keystroke to any of their cards."),
  fig(
    "visit-detail",
    "One visit: who, which doctor, the complaint, the vitals that were taken, and the findings and advice written against it.",
  ),
);

// ---- Laboratory -----------------------------------------------------------
add(
  head("Laboratory", "A sample followed all the way to the report", "flask-conical"),
  lead(`A test used to be billed and then vanish from view, which left the
   question a clinic asks twenty times a day — <i>has that one gone yet? is the
   report back?</i> — with no answer anywhere except somebody's memory. ClinicNP
   stamps each stage with a time, so the worklist says not only where a sample
   is, but when it got there and who had it last.`),
  raw(`<div class="pipeline">
    ${["syringe:To collect:billed, nothing drawn yet", "package:To send:collected, waiting to go out", "truck:Awaiting report:gone to the laboratory", "file-check:Report in:back, waiting for the patient", "circle-check-big:Given out:handed over — done"]
      .map((s, i) => {
        const [ic, l, sub] = s.split(":");
        return `<div class="stage">
          <div class="stage-n">${i + 1}</div>
          <div class="stage-ic">${icon(ic, { size: 20 })}</div>
          <div class="stage-l">${l}</div>
          <div class="stage-s">${sub}</div>
        </div>`;
      })
      .join("")}
  </div>`),
  points(
    point("droplet", "Grouped by what has to be collected", "blood, urine, stool, swab, sputum and the rest — one trip to the patient, not four"),
    point("clock", "Waiting days counted", "anything sitting too long turns red on its own"),
    point("message-square", "Why a sample is stuck, in words", "haemolysed and being redrawn, the patient never came back, the lab rejected it"),
    point("printer", "A dispatch slip goes with the sample", "patient, tests, referring doctor, partner laboratory, and a collection line"),
  ),
  fig(
    "lab",
    "The laboratory hub. Five tabs, each with its count — the state of every sample in the building, on one line.",
  ),
  fig(
    "lab-dispatch",
    "Ready to send. Collected samples grouped by patient, with the sample type, the partner laboratory, a note on the one that is stuck, and a single button that sends every test on a bill at once.",
  ),
  fig("lab-awaiting", "Out with the laboratory and not back yet — the list somebody chases."),
  fig("lab-reports", "Reports that have come back, and the ones still outstanding against a billed test."),
  raw(`<div class="scope">
    ${icon("info", { size: 17 })}
    <div><b>Said plainly, so there is no surprise later.</b> ClinicNP bills a
    test, follows the sample, and keeps the report that comes back against the
    patient's visit. It does not enter results, produce report cards, hold
    reference ranges, or talk to an analyser — that is a laboratory information
    system, and it is a different product. What ClinicNP runs is the counter
    around the laboratory: who was billed, what was collected, where it went,
    what came back, and who owes whom.</div>
  </div>`),
);

// ---- Laboratory money -----------------------------------------------------
add(
  head("Laboratory", "What the partner lab is owed", "handshake"),
  points(
    point("arrow-right-left", "Both sides of every test", "what the patient was billed, and what the partner laboratory charges for it"),
    point("trending-up", "The margin, stated plainly", "billed minus partner cost, per test and per period"),
    point("wallet", "Payments and a running balance", "each settlement recorded, with what is still owed today"),
    point("file-spreadsheet", "Per partner or consolidated", "on screen, printable, and exportable to Excel"),
  ),
  fig(
    "report-lab-partners",
    "The laboratory statement. Tests sent, billed to patients, the margin left over, what has been paid and what is owed now — then the ledger, line by line.",
  ),
);

// ---- Doctors --------------------------------------------------------------
add(
  head("Doctors", "Appointments, and what each doctor has earned", "calendar-check"),
  points(
    point("calendar-check", "Booked, arrived, seen", "an appointment becomes a visit in one keystroke when the person turns up"),
    point("bell", "The doctor is told", "a booking reaches their phone as an alert, and their email when that is switched on"),
    point("percent", "Four ways to share", "nothing, a percentage of the consultation, a fixed amount per consultation, or a percentage of listed services"),
    point("file-spreadsheet", "The payout sheet", "calculated per line as it is billed, totalled per doctor, exported for the month"),
  ),
  fig("doctors-appointments", "The appointment book — who is coming, when, and which of them has already arrived."),
  fig("report-doctors", "Doctor-wise revenue and the share each has earned, worked out from their own share basis."),
  raw(`<div class="callout">
    ${icon("smartphone", { size: 17 })}
    <div><b>The doctor's own screen.</b> A doctor is not a counter user. Given a
    login of their own they get their own small tree, built for one hand on a
    phone: the people booked with them today, each with a number that dials,
    and their own profile. The counter, the stock and the reports are not
    theirs to see, and the server enforces that rather than the menu.</div>
  </div>`),
  phoneFig(
    ["doctor-schedule", "doctor-profile"],
    "The doctor's two screens, at the size they are actually used: today's consultations with the patient's age, number and phone, and what the clinic holds about them.",
  ),
);

// ---- Pharmacy -------------------------------------------------------------
add(
  head("Pharmacy", "Stock that watches itself", "boxes"),
  points(
    point("boxes", "Batch and expiry, always", "stock is held per batch, and what is near expiry or already expired is a screen, not a memory"),
    point("triangle-alert", "Warned before it matters", "low stock, near expiry at thirty, sixty or ninety days, and expired held back from sale"),
    point("package-minus", "Stock out with a reason", "returned to supplier, expired, damaged, lost, used in the clinic, given as a sample, or a counted correction"),
    point("map", "Where it actually stands", "racks and shelves drawn as a floor plan, so a new hand can be sent to the right shelf"),
  ),
  fig(
    "stock-out",
    "The stock-out register — the number an owner actually wants: what did I lose this period, and to what?",
  ),
  fig("stock", "Current stock, by item and batch, with the expiry that decides whether it is an asset."),
  fig(
    "stock-shelves",
    "The shelf map. Racks, desks and shelves laid out as the room really is, with a medicine's place highlighted when you search for it.",
  ),
  fig("purchases", "Stock coming in against a supplier invoice, each line landing on its own batch with its own cost and expiry."),
);

// ---- Bills ----------------------------------------------------------------
add(
  head("Bills", "Every sale, and what happened to it", "receipt-text"),
  points(
    point("list", "The register", "every bill in the period, its patient, its payment method and its state"),
    point("printer", "Reprint whenever", "the same bill, from the same record, months later"),
    point("rotate-ccw", "Returns and refunds", "medicines go back to stock; a service refund adjusts the money and prints a note"),
    point("ban", "Cancelled, never deleted", "a cancelled bill stays visible to the owner, with who cancelled it and when"),
  ),
  fig(
    "bill-detail",
    "One bill in full — the service block, the medicine block with batch and expiry, the totals, and how it was paid.",
  ),
  fig("bills", "The bill register, with the fiscal-year selector and an export."),
);

// ---- Reports --------------------------------------------------------------
add(
  head("Reports", "The questions an owner actually asks", "chart-column"),
  lead(`Every report takes a BS date range with presets, a fiscal-year filter
   that reaches closed years, and an export to Excel. All of them are readable
   on a phone.`),
  raw(`<div class="rep-grid">
    <div class="rep-col">
      <div class="rep-h">${icon("stethoscope", { size: 15 })} Clinic</div>
      ${point("chart-pie", "Service revenue", "by group and by service — what did the ultrasound machine earn?")}
      ${point("percent", "Doctor payouts", "revenue and calculated share per doctor")}
      ${point("handshake", "Laboratory statements", "billed, partner cost, margin, paid, owed")}
      ${point("list", "Patient visit register", "the paper day-register, replaced")}
      ${point("user-plus", "New vs returning", "registrations, repeat visits, and who has not come back")}
      ${point("activity", "Diagnostics utilisation", "count per modality per BS month")}
      ${point("paperclip", "The report shelf", "billed tests whose report has not been filed yet")}
    </div>
    <div class="rep-col">
      <div class="rep-h">${icon("pill", { size: 15 })} Pharmacy &amp; money</div>
      ${point("sun", "Day close", "collection by method across both halves; expected cash in the drawer")}
      ${point("receipt-text", "Sales register", "every bill in the range, with its lines")}
      ${point("trending-up", "Profit by item", "sold against what it cost")}
      ${point("shopping-cart", "Purchase register", "what came in, from whom, at what cost")}
      ${point("boxes", "Stock valuation", "what is on the shelf, and what it is worth")}
      ${point("percent", "VAT summary", "when the company is registered for it")}
      ${point("triangle-alert", "Expiry &amp; moving items", "what is dying on the shelf, and what never moves")}
      ${point("package-minus", "Stock-out register", "value lost, grouped by reason")}
    </div>
  </div>`),
  fig("report-day-close", "Day close — the one report that gets read every evening."),
  fig(
    "report-service-revenue",
    "Service revenue, service by service: how many times, what was billed, what was refunded, what was kept, what went out to a laboratory, and what was left over.",
  ),
  fig(
    "report-utilisation",
    "Diagnostics utilisation — count per modality per BS month, so an owner can see whether a machine is paying for itself.",
  ),
  fig("report-visits", "The patient visit register — the clinic's daily register, in a form that prints."),
  fig("report-sales-register", "The sales register, line by line, for the accountant."),
);

// ---- Settings -------------------------------------------------------------
add(
  head("Settings", "Everything configured, nothing hard-coded", "settings"),
  points(
    point("list-checks", "Services are yours to define", "name, short code, group, rate, whether a doctor is required, whether it goes to an outside lab, what it costs you there, whether it keeps a file, and the follow-up rule"),
    point("toggle-left", "Modules are a real boundary", "a switched-off half has its screens, its menu and its server routes gone — not merely hidden"),
    point("calendar", "Fiscal years, closed properly", "one open year, a guided rollover that takes a backup first, and closed years that stay readable and print unchanged"),
    point("shield-check", "Signed and logged", "every override, cancel, merge, deletion and year close carries a name and a time"),
  ),
  fig(
    "settings-services",
    "The service catalogue — the rate, the doctor rule, the outside laboratory, the partner cost, the sample type, and whether a report is expected back.",
  ),
  fig("settings-lab-partners", "Outside laboratories, each with a PAN, contact and settlement terms — and a ledger of its own."),
  fig("settings-doctors", "Doctors: qualification as printed, specialty, NMC number, contact, and the share basis that drives the payout report."),
  fig("settings-modules", "The module switch. At least one half has to stay on, and turning one off never deletes its data."),
  fig("settings-fiscal-years", "Fiscal years, and the guided year-end rollover."),
);

// ---- Access ---------------------------------------------------------------
// Owner, Counter, Accountant, Doctor. 1 = yes, 0 = no, 2/3 = qualified yes.
const rolesRows = [
  ["Billing, holds, refunds and returns", 1, 1, 0, 0],
  ["Register a patient, start a visit, attach a file", 1, 1, 0, 0],
  ["Edit a rate on a bill", 1, 2, 0, 0],
  ["Move a sample through the laboratory stages", 1, 1, 0, 0],
  ["Edit or merge a patient", 1, 0, 0, 0],
  ["Delete a file", 1, 0, 0, 0],
  ["Purchases, suppliers, stock out", 1, 0, 0, 0],
  ["Items, services, doctors, laboratories", 1, 0, 0, 0],
  ["Cancel a bill", 1, 0, 0, 0],
  ["Financial reports", 1, 3, 1, 0],
  ["Company, users, modules, fiscal years, backup", 1, 0, 0, 0],
  ["Their own consultation list, on a phone", 0, 0, 0, 1],
];
const cell = (v) =>
  v === 1
    ? `<td class="yes">${icon("check", { size: 15 })}</td>`
    : v === 0
      ? `<td class="no">${icon("minus", { size: 15 })}</td>`
      : v === 2
        ? `<td class="part">${icon("check", { size: 15 })}<span>owner can switch off per user</span></td>`
        : `<td class="part">${icon("check", { size: 15 })}<span>day close only</span></td>`;

add(
  head("Access", "Four roles, checked on the server", "shield-check"),
  lead(`Roles are enforced on the server for every read and every write, not
   merely hidden in the menu — a role that may not see a screen may not reach
   its data either. Login is by username and password; a shared counter device
   can switch between staff on a four-digit PIN, and repeated wrong attempts
   lock the account out.`),
  raw(`<table class="roles">
    <thead><tr>
      <th></th>
      <th>${icon("crown", { size: 15 })}<span>Owner</span></th>
      <th>${icon("user", { size: 15 })}<span>Counter</span></th>
      <th>${icon("calculator", { size: 15 })}<span>Accountant</span></th>
      <th>${icon("stethoscope", { size: 15 })}<span>Doctor</span></th>
    </tr></thead>
    <tbody>
      ${rolesRows
        .map(([l, a, s, c, d]) => `<tr><th>${l}</th>${cell(a)}${cell(s)}${cell(c)}${cell(d)}</tr>`)
        .join("")}
    </tbody>
  </table>`),
  points(
    point("user-cog", "Owner", "the whole system, every fiscal year, and everything that changes money or people"),
    point("user", "Counter", "bills, patients, visits and samples — the day's work, and nothing that rewrites history"),
    point("calculator", "Accountant", "read-only: every report, every fiscal year, including closed ones"),
    point("stethoscope", "Doctor", "their own booked consultations and nothing else — a separate tree, not the back office made narrow"),
  ),
  fig("settings-users", "Users, their roles, whether they may edit a rate, and whether they hold a counter PIN."),
);

// ---- Practical ------------------------------------------------------------
add(
  head("The practical things", "Paper, power cuts and safekeeping", "printer"),
  raw(`<div class="prac">
    <div class="prac-b">
      <div class="prac-h">${icon("printer", { size: 19 })}<b>What prints</b></div>
      ${point("file-text", "The invoice, on A4", "from an ordinary office printer, under your own letterhead — marked TAX INVOICE when you are registered for VAT")}
      ${point("clipboard-list", "The OPD slip", "patient, visit number, doctor and complaint, with a large empty area for the doctor's handwriting — the paper the patient carries in")}
      ${point("flask-conical", "The lab dispatch slip", "tests, referring doctor, partner laboratory and a sample-collection line; goes with the sample")}
      ${point("rotate-ccw", "Refund and stock-out notes", "on an 80 mm roll, with a signature line")}
      <div class="prac-note">${icon("info", { size: 13 })} All of it through the browser. No drivers to install.</div>
    </div>

    <div class="prac-b">
      <div class="prac-h">${icon("wifi-off", { size: 19 })}<b>When the internet stops</b></div>
      ${point("receipt", "Bills still leave the counter", "held in an outbox and sent the moment the line comes back")}
      ${point("user-plus", "Patients can still be registered", "numbers are assigned without collision, even from two devices at once")}
      ${point("search", "Search still answers", "the catalogue and the patient list are cached on the machine")}
      ${point("smartphone", "Installs like an app", "on the counter machine, a tablet, or the owner's phone")}
    </div>

    <div class="prac-b">
      <div class="prac-h">${icon("shield-check", { size: 19 })}<b>Keeping it safe</b></div>
      ${point("database-backup", "Backup and restore", "on demand, and automatically before a year is closed")}
      ${point("lock", "Reports are private", "files are served only through an authenticated route — never a public link")}
      ${point("scroll-text", "An activity log", "overrides, cancels, merges, deletions, restores and year closes, each with a name and a time")}
      ${point("key-round", "Passwords and PINs hashed", "with a lockout after repeated wrong attempts")}
    </div>
  </div>`),
  fig("settings-audit", "The activity log."),
);

// ===========================================================================
// STYLES
// ===========================================================================
const css = `
:root{
  --navy:#19445b;        /* sampled from the ClinicNP mark */
  --navy-d:#102e3f;
  --navy-l:#eaf1f6;
  --red:#ec1f27;         /* sampled from the ClinicNP mark */
  --red-l:#fdeceb;
  --ibn-blue:#0443c6;    /* sampled from the Infobytes Nepal mark */
  --ibn-green:#00bc5d;   /* sampled from the Infobytes Nepal mark */
  --ink:#12222c;
  --mid:#5b7483;
  --line:#dfe6ea;
  --paper:#ffffff;
  --tint:#f6f9fb;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  font-family:"Segoe UI",-apple-system,system-ui,Roboto,Arial,sans-serif;
  color:var(--ink);background:var(--paper);
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
@page{size:A4;margin:0}

.page{
  position:relative;width:210mm;height:296.6mm;padding:14mm 14mm 15mm;
  overflow:hidden;page-break-after:always;break-after:page;
}
.page:last-child{page-break-after:auto;break-after:auto}
.page > * + *{margin-top:9px}
svg{display:block;flex:none}

/* ---------- running header ---------- */
.ph{display:flex;gap:9px;align-items:center;border-bottom:2px solid var(--navy);
  padding-bottom:7px}
.ph-ic{width:34px;height:34px;border-radius:8px;background:var(--navy);color:#fff;
  display:flex;align-items:center;justify-content:center;flex:none}
.kicker{font-size:7.6pt;letter-spacing:.16em;text-transform:uppercase;color:var(--red);
  font-weight:700;line-height:1}
.ph h2{margin:2px 0 0;font-size:16pt;line-height:1.1;letter-spacing:-.01em}

.lead{font-size:9pt;line-height:1.5;color:var(--mid);margin:0}
.lead i{color:var(--navy);font-style:italic}

/* ---------- icon + text point ---------- */
.pt{display:flex;gap:7px;align-items:flex-start}
.pt-ic{width:26px;height:26px;border-radius:7px;background:var(--navy-l);color:var(--navy);
  display:flex;align-items:center;justify-content:center;flex:none}
.pt-tx{font-size:8.2pt;line-height:1.35}
.pt-tx b{display:block;color:var(--ink);font-size:8.6pt}
.pt-tx span{display:block;color:var(--mid);margin-top:1px}
.pts-row{display:grid;grid-template-columns:1fr 1fr;gap:9px 13px}

/* ---------- chips ---------- */
.chip{display:inline-flex;gap:5px;align-items:center;padding:3.5px 8px;border-radius:999px;
  background:var(--tint);border:1px solid var(--line);color:var(--navy);
  font-size:7.8pt;font-weight:600;line-height:1}

/* ---------- screenshots ---------- */
.shot{margin:0}
.shot-frame{border:1px solid var(--line);border-radius:7px;overflow:hidden;
  background:#fff;box-shadow:0 1px 4px rgba(18,34,44,.09)}
.shot-bar{height:12px;background:var(--tint);border-bottom:1px solid var(--line);
  display:flex;align-items:center;gap:3px;padding:0 6px}
.shot-bar i{width:4px;height:4px;border-radius:50%;background:#c7d2d9}
.shot-frame img{display:block;width:100%}
.shot figcaption{font-size:7.4pt;line-height:1.35;color:var(--mid);margin-top:4px;
  border-left:2px solid var(--red);padding-left:6px}

/* ---------- scope note ---------- */
.scope{display:flex;gap:8px;align-items:flex-start;background:#fffbe9;
  border-left:3px solid #d9a520;border-radius:0 7px 7px 0;padding:9px 11px;
  font-size:8.2pt;line-height:1.45;color:#6b4e12}
.scope svg{flex:none;margin-top:1px;color:#b8860b}
.scope b{color:#4f3a0b}

/* ---------- phone-shaped screenshots ---------- */
.phones-row{display:flex;gap:14px;justify-content:center;align-items:flex-start}
.phone{flex:none}
.phone-scr{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff;
  box-shadow:0 1px 5px rgba(18,34,44,.12)}
.phone-scr img{display:block;width:100%}
.phones figcaption{margin-top:6px}

/* ---------- callout ---------- */
.callout{display:flex;gap:8px;align-items:flex-start;background:var(--navy-l);
  border-left:3px solid var(--navy);border-radius:0 7px 7px 0;padding:8px 10px;
  font-size:8.2pt;line-height:1.45;color:#25455a}
.callout svg{flex:none;margin-top:1px;color:var(--navy)}
.callout b{color:var(--navy)}

/* ---------- cover ---------- */
.cover{background:var(--navy-d);color:#fff;padding:15mm 15mm 13mm;
  display:flex;flex-direction:column}
.cover > * + *{margin-top:0}
.cover-logo{width:58mm;display:block}
.cover-mid{margin-top:16mm}
.cover-kicker{font-size:8pt;letter-spacing:.2em;text-transform:uppercase;
  color:#8fb4c8;font-weight:700;margin-bottom:5mm}
.cover h1{margin:0;font-size:30pt;line-height:1.07;letter-spacing:-.02em;font-weight:800}
.cover h1::after{content:"";display:block;width:24mm;height:3.4px;background:var(--red);
  margin-top:5mm;border-radius:2px}
.cover-lead{font-size:10pt;line-height:1.55;color:#cddce4;margin:5mm 0 0;max-width:150mm}
.cover-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:7mm;max-width:168mm}
.cover-chips .chip{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.19);color:#eaf3f7}
.cover-foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;
  border-top:1px solid rgba(255,255,255,.18);padding-top:6mm}
.cover-by{display:flex;flex-direction:column;gap:3mm}
.cover-by span{font-size:7.6pt;letter-spacing:.14em;text-transform:uppercase;color:#8fb4c8;font-weight:700}
.cover-by img{width:46mm;background:#fff;border-radius:5px;padding:2.6mm 3.4mm}
.cover-meta{text-align:right;font-size:8pt;line-height:1.75;color:#b6cbd6}
.cover-meta b{color:#fff;font-weight:700}
.cover-note{display:flex;gap:6px;align-items:flex-start;margin-top:5mm;
  font-size:7.3pt;line-height:1.4;color:#8fb4c8}
.cover-note svg{margin-top:1px;flex:none}

/* ---------- two modules ---------- */
.two-mod{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.mod{border:1px solid var(--line);border-radius:9px;padding:9px 10px;background:var(--tint)}
.mod-clinic{border-top:3px solid var(--navy)}
.mod-pharm{border-top:3px solid var(--ibn-green)}
.mod-h{display:flex;gap:6px;align-items:center;margin-bottom:5px}
.mod-clinic .mod-h{color:var(--navy)}
.mod-pharm .mod-h{color:#00994b}
.mod-h b{font-size:11.5pt;letter-spacing:-.01em}
.mod p{margin:0 0 7px;font-size:8.1pt;line-height:1.45;color:var(--mid)}
.mod-list{display:flex;flex-wrap:wrap;gap:4px}
.mod-list .chip{background:#fff;font-size:7.4pt;padding:3px 7px}

.join{display:flex;gap:7px;align-items:flex-start;background:var(--red-l);
  border-left:3px solid var(--red);border-radius:0 7px 7px 0;padding:8px 10px;
  font-size:8.2pt;line-height:1.45;color:#7d2b22}
.join svg{flex:none;margin-top:1px;color:var(--red)}
.join b{color:#5e1f18}

/* ---------- USP grid ---------- */
.usp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.usp{border:1px solid var(--line);border-radius:9px;padding:10px 10px 11px;background:#fff}
.usp-ic{width:36px;height:36px;border-radius:9px;background:var(--navy);color:#fff;
  display:flex;align-items:center;justify-content:center;margin-bottom:7px}
.usp b{display:block;font-size:9.4pt;line-height:1.22;margin-bottom:4px;letter-spacing:-.01em}
.usp p{margin:0;font-size:7.9pt;line-height:1.42;color:var(--mid)}
.usp code{font-family:ui-monospace,Consolas,monospace;background:var(--tint);
  border:1px solid var(--line);border-radius:3px;padding:0 3px;font-size:7.2pt}

.ticks{display:grid;gap:8px;background:var(--tint);border:1px solid var(--line);
  border-radius:9px;padding:11px 12px}
.ticks .pt-ic{background:#e3f6ea;color:#00994b}

/* ---------- map ---------- */
.map{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.map-grp{border:1px solid var(--line);border-radius:9px;padding:10px 11px;background:#fff}
.map-grp.clinic{border-left:3px solid var(--navy)}
.map-grp.pharm{border-left:3px solid var(--ibn-green)}
.map-grp-h{display:flex;gap:5px;align-items:center;font-size:7.6pt;font-weight:800;
  letter-spacing:.13em;text-transform:uppercase;color:var(--navy);
  padding-bottom:7px;margin-bottom:8px;border-bottom:1px solid var(--line)}
.map-grp.pharm .map-grp-h{color:#00994b}
.map-items{display:grid;gap:8px}

/* ---------- pipeline ---------- */
.pipeline{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.stage{position:relative;border:1px solid var(--line);border-radius:9px;padding:9px 7px;
  background:var(--tint);text-align:center}
.stage-n{position:absolute;top:-7px;left:50%;transform:translateX(-50%);
  width:16px;height:16px;border-radius:50%;background:var(--red);color:#fff;
  font-size:7.2pt;font-weight:800;line-height:16px}
.stage-ic{display:flex;justify-content:center;color:var(--navy);margin:6px 0 5px}
.stage-l{font-size:8.1pt;font-weight:800;line-height:1.15;color:var(--ink)}
.stage-s{font-size:6.9pt;line-height:1.3;color:var(--mid);margin-top:2px}

/* ---------- keyboard strip ---------- */
.keys{border:1px solid var(--line);border-radius:9px;background:var(--tint);padding:10px 11px}
.keys-h{display:flex;gap:6px;align-items:center;color:var(--navy);
  padding-bottom:8px;margin-bottom:9px;border-bottom:1px solid var(--line)}
.keys-h b{font-size:9.6pt}
.keys-h span{font-size:7.4pt;color:var(--mid);margin-left:auto}
.keys-g{display:grid;grid-template-columns:repeat(3,1fr);gap:7px 11px}
.keyrow{display:flex;gap:7px;align-items:center;font-size:8pt;color:var(--mid)}
kbd{font-family:ui-monospace,Consolas,monospace;font-size:7.4pt;font-weight:700;
  color:var(--navy);background:#fff;border:1px solid #c9d6de;border-bottom-width:2px;
  border-radius:4px;padding:2.5px 5px;min-width:34px;text-align:center;
  display:inline-block;line-height:1.1;flex:none}
.keys-h kbd{min-width:0;padding:1.5px 4px}

/* ---------- reports grid ---------- */
.rep-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.rep-col{border:1px solid var(--line);border-radius:9px;padding:10px 11px;background:#fff;
  display:grid;gap:8px;align-content:start}
.rep-h{display:flex;gap:5px;align-items:center;font-size:7.6pt;font-weight:800;
  letter-spacing:.13em;text-transform:uppercase;color:var(--navy);
  padding-bottom:7px;border-bottom:1px solid var(--line)}

/* ---------- roles table ---------- */
table.roles{width:100%;border-collapse:collapse}
table.roles thead th{background:var(--navy);color:#fff;font-size:7.8pt;padding:7px;
  text-align:center;vertical-align:middle}
table.roles thead th:first-child{width:47%}
table.roles thead th svg{margin:0 auto 3px}
table.roles thead th span{display:block;font-weight:700}
table.roles tbody th{text-align:left;font-weight:600;font-size:8pt;padding:6px 7px;
  border-bottom:1px solid var(--line);color:var(--ink)}
table.roles tbody tr:nth-child(even) th,
table.roles tbody tr:nth-child(even) td{background:var(--tint)}
table.roles td{text-align:center;border-bottom:1px solid var(--line);padding:6px;
  vertical-align:middle}
table.roles td svg{margin:0 auto}
table.roles td.yes{color:#00994b}
table.roles td.no{color:#c3ced4}
table.roles td.part{color:#b07d18}
table.roles td.part span{display:block;font-size:6.4pt;line-height:1.2;color:var(--mid);margin-top:1px}

/* ---------- practical ---------- */
.prac{display:grid;grid-template-columns:1fr;gap:9px}
.prac-b{border:1px solid var(--line);border-radius:9px;padding:10px 11px;background:#fff;
  display:grid;gap:8px}
.prac-h{display:flex;gap:6px;align-items:center;color:var(--navy);
  padding-bottom:7px;border-bottom:1px solid var(--line)}
.prac-h b{font-size:10pt}
.prac-note{display:flex;gap:5px;align-items:center;font-size:7.3pt;color:var(--mid);
  background:var(--tint);border-radius:6px;padding:6px 8px}
.prac-note svg{flex:none;color:var(--navy)}

/* ---------- closing ---------- */
.close{display:flex;flex-direction:column}
.close > * + *{margin-top:0}
.close-top{text-align:center;border-bottom:2px solid var(--navy);padding-bottom:7mm}
.close-logo{width:56mm;margin:0 auto 5mm;display:block}
.close-top h2{margin:0;font-size:19pt;letter-spacing:-.015em}
/* Free space on the last page is split above and below the middle group
   rather than all piling up over the footer. */
.close-pts{display:grid;grid-template-columns:1fr 1fr;gap:10px 13px;
  margin:7mm 0;margin-top:auto}
.close-pts .pt-tx b{font-size:9pt}
.close-pts .pt-ic{width:29px;height:29px;background:var(--navy);color:#fff}
.close-next{background:var(--tint);border:1px solid var(--line);border-radius:9px;padding:11px 12px}
.close-next-h{display:flex;gap:6px;align-items:center;color:var(--navy);margin-bottom:8px}
.close-next-h b{font-size:10pt}
.close-next-g{display:flex;flex-wrap:wrap;gap:5px}
.close-next-g .chip{background:#fff}
.close-foot{margin-top:auto;display:flex;gap:8mm;align-items:center;
  border-top:1px solid var(--line);padding-top:6mm}
.close-ibn{width:48mm;flex:none}
.close-contact{font-size:8.4pt;line-height:1.6}
.cc-h{font-size:11pt;font-weight:800;color:var(--ibn-blue);margin-bottom:2mm;letter-spacing:-.01em}
.cc-l{display:flex;gap:6px;align-items:center;color:var(--mid)}
.cc-l svg{flex:none;color:var(--ibn-green)}
.close-note{display:flex;gap:6px;align-items:flex-start;margin-top:5mm;
  font-size:7pt;line-height:1.4;color:#9badb7}
.close-note svg{flex:none;margin-top:1px}
`;

// ===========================================================================
// bespoke first and last pages
// ===========================================================================
const COVER = `<section class="page cover">
  <img class="cover-logo" src="${LOGO_CLINICNP_WHITE}" alt="ClinicNP">
  <div class="cover-mid">
    <div class="cover-kicker">Product Details Document</div>
    <h1>Clinic, laboratory<br>and pharmacy —<br>on one counter.</h1>
    <p class="cover-lead">
      ClinicNP runs the front desk of a Nepali polyclinic: patients and their
      visits, doctors and their shares, samples followed all the way to the
      report, medicines by batch and expiry, and one bill that carries all of
      it. Bikram Sambat throughout, and it keeps billing when the internet
      stops.
    </p>
    <div class="cover-chips">
      ${chip("users", "Patients &amp; visits")}
      ${chip("flask-conical", "Laboratory workflow")}
      ${chip("stethoscope", "Doctors &amp; payouts")}
      ${chip("boxes", "Pharmacy &amp; stock")}
      ${chip("receipt", "One invoice")}
      ${chip("chart-column", "Owner's reports")}
      ${chip("wifi-off", "Works offline")}
      ${chip("calendar", "Bikram Sambat")}
    </div>
  </div>
  <div class="cover-foot">
    <div class="cover-by">
      <span>A product of</span>
      <img src="${LOGO_IBN}" alt="Infobytes Nepal">
    </div>
    <div class="cover-meta">
      <div><b>Version</b> 2.0</div>
      <div><b>Document</b> Product details &amp; live screens</div>
      <div><b>Contact</b> +977 984 3468715 · +977 9863 777171</div>
    </div>
  </div>
  <div class="cover-note">
    ${icon("info", { size: 13 })}
    <span>Every screen in this document is a real screenshot of the working
    software, captured against a demonstration database. All names, rates and
    figures shown are sample data.</span>
  </div>
</section>`;

const CLOSE = `<section class="page close">
  <div class="close-top">
    <img class="close-logo" src="${LOGO_CLINICNP}" alt="ClinicNP">
    <h2>What it comes down to</h2>
  </div>
  <div class="close-pts">
    ${point("receipt", "One counter, one bill, one set of books", "the consultation, the scan, the tests and the medicines on a single invoice")}
    ${point("flask-conical", "No sample lost between two people", "five stamped stages, a dispatch slip, and a chased list of what has not come back")}
    ${point("handshake", "The partner laboratory, fully accounted", "billed, cost, margin, paid, owed — per partner, per period, exportable")}
    ${point("users", "A patient found in seconds, for years", "one lifetime number, every visit and every report on one card")}
    ${point("chart-column", "The owner's questions answered on a phone", "what did I collect, what did the machine earn, what does the lab owe me")}
    ${point("wifi-off", "It keeps working when the line drops", "and catches up by itself")}
  </div>
  <div class="close-next">
    <div class="close-next-h">${icon("arrow-right", { size: 17 })}<b>What a demonstration looks like</b></div>
    <div class="close-next-g">
      ${chip("monitor", "A live walkthrough on your own screens")}
      ${chip("database", "Your services and rates loaded in")}
      ${chip("graduation-cap", "Counter training for your staff")}
      ${chip("headset", "Support on the phone, in Nepali")}
    </div>
  </div>
  <div class="close-foot">
    <img class="close-ibn" src="${LOGO_IBN}" alt="Infobytes Nepal">
    <div class="close-contact">
      <div class="cc-h">Infobytes Nepal Pvt. Ltd.</div>
      <div class="cc-l">${icon("phone", { size: 14 })} +977 984 3468715 · +977 9863 777171</div>
      <div class="cc-l">${icon("package", { size: 14 })} ClinicNP — clinic, laboratory &amp; pharmacy management</div>
    </div>
  </div>
  <div class="close-note">
    ${icon("info", { size: 13 })}
    <span>Screens shown throughout this document are the working software on a
    demonstration database. Sample names, rates and figures only.</span>
  </div>
</section>`;

// ===========================================================================
// measure, then pack
// ===========================================================================
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
await p.emulateMedia({ media: "print" });

// Normalise every block to a list of variants, widest first.
for (const b of flow) if (!b.variants) b.variants = [{ html: b.html }];

// Pass 1 — every variant of every block rendered once, at the real content
// width, and measured.
const measureHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
  .measure{width:210mm;padding:0 14mm;box-sizing:border-box}
  .measure > *{margin:0}
</style></head><body><div class="measure">
  ${flow
    .map((b, i) =>
      b.variants
        .map((v, j) => `<div data-i="${i}" data-j="${j}">${v.html}</div>`)
        .join(""),
    )
    .join("")}
</div></body></html>`;

await p.setContent(measureHtml, { waitUntil: "load" });
await p.waitForTimeout(1500);

const measured = await p.evaluate(() =>
  [...document.querySelectorAll(".measure > [data-i]")].map((el) => ({
    i: +el.dataset.i,
    j: +el.dataset.j,
    h: el.getBoundingClientRect().height,
  })),
);
for (const m of measured) flow[m.i].variants[m.j].h = m.h;

// Page geometry in CSS pixels: 296.6mm tall, 14mm top and 15mm bottom padding.
const MM = 96 / 25.4;
const AVAIL = (296.6 - 14 - 15) * MM;
const GAP = 9; // .page > * + * margin-top

// Pass 2 — fill pages in order. A header may not be stranded at the foot of a
// page with nothing under it.
const packed = [[]];
let used = 0;
for (let i = 0; i < flow.length; i++) {
  const block = flow[i];
  const cur = packed[packed.length - 1];
  const gap = cur.length ? GAP : 0;

  // Widest variant that fits what is left of this page; null if none does.
  const room = AVAIL - used - gap;
  let pick = block.variants.find((v) => v.h <= room) ?? null;

  if (pick && block.keepWithNext) {
    // A header — or a header and its lead paragraph — may not be stranded at
    // the foot of a page. Every block here is atomic (a grid, a table, a
    // screenshot): none of them can split across a page boundary, so the whole
    // of the first real block after the chain has to fit too, not just a
    // slice of it. Measured at its narrowest variant, since the packer is
    // free to shrink a screenshot to make it work.
    let need = pick.h;
    let k = i;
    while (flow[k]?.keepWithNext && flow[k + 1]) {
      k++;
      need += GAP + (flow[k].variants.at(-1)?.h ?? 0);
    }
    if (used + gap + need > AVAIL) pick = null;
  }

  if (!pick) {
    if (cur.length) {
      packed.push([]);
      used = 0;
    }
    // On a fresh page take the widest variant; the first is always the target.
    pick = packed[packed.length - 1].length
      ? block.variants.find((v) => v.h <= AVAIL - used - GAP) ?? block.variants.at(-1)
      : block.variants[0];
  }

  const page = packed[packed.length - 1];
  used += (page.length ? GAP : 0) + pick.h;
  page.push(pick.html);
}

const bodyPages = packed
  .map((blocks) => `<section class="page">${blocks.join("")}</section>`)
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body>${COVER}${bodyPages}${CLOSE}</body></html>`;

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
await p.setContent(html, { waitUntil: "load" });
await p.emulateMedia({ media: "print" });
await p.waitForTimeout(1800);

const out = join(ROOT, "ClinicNP - Product Details.pdf");
await p.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate: `
    <div style="width:100%;font-family:'Segoe UI',system-ui,sans-serif;font-size:7pt;
                color:#9badb7;padding:0 14mm 6mm;display:flex;
                justify-content:space-between;align-items:flex-end;">
      <span>ClinicNP &middot; Product Details &middot; Infobytes Nepal Pvt. Ltd.</span>
      <span class="pageNumber"></span>
    </div>`,
});

if (process.env.PROOF) {
  const { mkdirSync } = await import("node:fs");
  const dir = join(ROOT, ".pitch-build", "proof");
  mkdirSync(dir, { recursive: true });
  const els = await p.locator("section.page").all();
  for (let i = 0; i < els.length; i++) {
    await els[i].screenshot({
      path: join(dir, `p${String(i + 1).padStart(2, "0")}.png`),
    });
  }

  const fill = await p.evaluate(() =>
    [...document.querySelectorAll("section.page")].map((pg, i) => {
      const cs = getComputedStyle(pg);
      const top = parseFloat(cs.paddingTop);
      const bottom = parseFloat(cs.paddingBottom);
      const avail = pg.clientHeight - top - bottom;
      const kids = [...pg.children];
      if (!kids.length) return { n: i + 1, pct: 0 };
      const pgTop = pg.getBoundingClientRect().top;
      const last = kids[kids.length - 1].getBoundingClientRect();
      return {
        n: i + 1,
        pct: Math.round(((last.bottom - pgTop - top) / avail) * 100),
      };
    }),
  );
  console.log("\npage fill:");
  for (const f of fill) {
    const flag = f.pct > 100 ? "  OVERFLOW" : f.pct < 75 ? "  thin" : "";
    console.log(`  p${String(f.n).padStart(2, "0")}  ${String(f.pct).padStart(3)}%${flag}`);
  }
}

await browser.close();

console.log(`\nblocks: ${flow.length}   pages: ${packed.length + 2}`);
if (missing.length) console.log("MISSING SHOTS:", [...new Set(missing)].join(", "));
console.log("written →", out);
