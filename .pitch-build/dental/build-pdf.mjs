/**
 * build-pdf.mjs — composes "ClinicNP Dental.pdf" (8 A4 pages) in the project
 * root from the cropped screenshots of the dental demo clinic.
 *
 *   node .pitch-build/dental/build-pdf.mjs            the PDF
 *   PROOF=1 node .pitch-build/dental/build-pdf.mjs    also proof/pNN.png, and how full each page is
 *
 * Everything is embedded, so the PDF is one file that can be mailed. Every
 * screen is the real software on a demonstration database (README.md).
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { icon } from "../icons.mjs";

const ROOT = process.cwd();
const HERE = join(ROOT, ".pitch-build", "dental");
const SHOTS = join(HERE, "cropped");

const b64 = (p) => readFileSync(p).toString("base64");
const png = (p) => `data:image/png;base64,${b64(p)}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });

/** The logo files carry wide transparent margins; cut them to the mark itself. */
async function trimmed(file) {
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    const cx = cv.getContext("2d");
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        if (d[(y * cv.width + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    const o = document.createElement("canvas");
    o.width = x1 - x0 + 1;
    o.height = y1 - y0 + 1;
    o.getContext("2d").drawImage(cv, -x0, -y0);
    return o.toDataURL("image/png");
  }, png(file));
}
const LOGO = await trimmed(join(ROOT, "public", "icons", "logo-main.png"));
const LOGO_WHITE = await trimmed(join(ROOT, "public", "icons", "logo-white.png"));
const IBN = await trimmed(join(HERE, "assets", "infobytes-nepal.png"));
const IBN_WHITE = await trimmed(join(HERE, "assets", "infobytes-nepal-white.png"));

const size = (file) => {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

/**
 * A screenshot in a browser-like frame. `t` and `b` cut it to a band of its
 * height (0..1), so one long screen can show just the part being talked about.
 */
function shot(name, { t = 0, b = 1, l = 0, r = 1, cap = "", frame = true, cls = "" } = {}) {
  const file = join(SHOTS, `${name}.png`);
  const { w, h } = size(file);
  const cw = w * (r - l);
  const ratio = cw / (h * (b - t));
  const top = ((t * h) / cw) * 100;
  const left = (l / (r - l)) * 100;
  const img = `<div class="crop" style="aspect-ratio:${ratio.toFixed(4)}"><img src="${png(file)}" style="width:${(100 / (r - l)).toFixed(3)}%;margin-top:-${top.toFixed(3)}%;margin-left:-${left.toFixed(3)}%"></div>`;
  return `<figure class="shot ${cls}">${frame ? `<div class="frame"><div class="bar"><i></i><i></i><i></i></div>${img}</div>` : img}${
    cap ? `<figcaption>${cap}</figcaption>` : ""
  }</figure>`;
}

const pt = (ic, title, text) =>
  `<div class="pt"><div class="pt-ic">${icon(ic, { size: 15 })}</div><div class="pt-tx"><b>${title}</b><span>${text}</span></div></div>`;
const chip = (ic, text) => `<span class="chip">${icon(ic, { size: 12 })}${text}</span>`;
const head = (n, kicker, title, ic) => `<header class="ph">
  <div class="ph-ic">${icon(ic, { size: 21 })}</div>
  <div><div class="kicker">${String(n).padStart(2, "0")} · ${kicker}</div><h2>${title}</h2></div>
  <img class="ph-logo" src="${LOGO}" alt="ClinicNP"><span class="ph-badge">Dental</span>
</header>`;
const foot = (n) => `<footer class="pf"><span>ClinicNP Dental · Infobytes Nepal Pvt. Ltd.</span><span>infobytesnepal.com</span><span>${n} / 8</span></footer>`;

const PHONES = "+977 984 3468715 · +977 9863 777171";

// ===========================================================================
// pages
// ===========================================================================
const P1 = `<section class="page cover">
  <div class="cover-top">
    <img class="cover-logo" src="${LOGO_WHITE}" alt="ClinicNP">
    <span class="cover-badge">Dental</span>
  </div>
  <div class="cover-grid">
    <div>
      <div class="cover-kicker">Practice management for dental clinics</div>
      <h1>Every tooth,<br>every rupee,<br>one screen.</h1>
      <p class="cover-lead">ClinicNP Dental runs a dental clinic from the front desk to the owner's
      books: the patient's card and tooth chart, the bill with the doctor and the lab on every line,
      crowns and dentures followed to the lab and back, the doctors' commission, the staff's
      salaries, and what the clinic really earned. In Bikram Sambat, in रू, and it keeps billing
      when the internet drops.</p>
      <div class="cover-chips">
        ${chip("smile", "Tooth chart")}
        ${chip("notebook-pen", "Treatment notes")}
        ${chip("receipt", "Billing &amp; dues")}
        ${chip("flask-conical", "Lab work")}
        ${chip("calendar-check", "Appointments")}
        ${chip("hand-coins", "Doctor commission")}
        ${chip("wallet-cards", "Salaries &amp; SSF")}
        ${chip("chart-column", "Income &amp; expenses")}
      </div>
    </div>
    <div class="cover-card">
      ${shot("teeth-svg", { frame: false })}
      <div class="cover-card-cap">${icon("mouse-pointer-click", { size: 13 })} The tooth chart, as the dentist faces the patient. Tap a tooth to mark it.</div>
    </div>
  </div>
  <div class="cover-strip">
    <figure>${shot("patient", { t: 0.02, b: 0.5, frame: false })}<figcaption>The patient's card</figcaption></figure>
    <figure>${shot("billing", { r: 0.76, b: 0.62, frame: false })}<figcaption>The counter</figcaption></figure>
    <figure>${shot("salaries", { t: 0.1, b: 0.62, frame: false })}<figcaption>Salaries &amp; SSF</figcaption></figure>
  </div>
  <div class="cover-foot">
    <div class="cover-by"><span>A product of</span><img src="${IBN_WHITE}" alt="Infobytes Nepal"></div>
    <div class="cover-meta">
      <div>${icon("globe", { size: 13 })} <b>infobytesnepal.com</b></div>
      <div>${icon("phone", { size: 13 })} ${PHONES}</div>
    </div>
  </div>
  <div class="cover-note">${icon("info", { size: 12 })}<span>Every screen in this document is the working software, photographed on a demonstration clinic. All names, rates and figures are sample data.</span></div>
</section>`;

const P2 = `<section class="page">
  ${head(1, "At a glance", "Built for the way a dental clinic works", "layout-grid")}
  <p class="lead">One system for the reception desk, the dentists and the owner. Each person sees what
  their job needs, and every rupee that comes in or goes out is in the same books.</p>
  <div class="tiles">
    ${tile("smile", "Tooth chart", "Both arches drawn tooth by tooth. Caries, fillings, RCT, crowns, implants, missing teeth — on the right surfaces, with dates.")}
    ${tile("notebook-pen", "The patient's card", "Laid out like the paper card: date, treatment notes, charge, payment and what is still due, one row per visit.")}
    ${tile("receipt", "The counter", "Consultation to implant on one bill, with the doctor and the lab on each line. Cash, QR, or part-paid on dues.")}
    ${tile("flask-conical", "Lab work", "Every crown, denture and aligner followed from impression to fitting, with what each lab is owed.")}
    ${tile("calendar-check", "Appointments", "Each dentist's day on one board, and on the dentist's own phone.")}
    ${tile("hand-coins", "Doctor commission", "Each dentist's share worked out on every bill line, paid out and tallied, bill by bill.")}
    ${tile("wallet-cards", "Salaries", "Monthly sheet with SSF, 1% tax, bonuses, advances, and a salary slip for each person.")}
    ${tile("truck", "Supplies &amp; payables", "Gloves, composite, LA — what was bought, from whom, and what is still owed.")}
    ${tile("chart-column", "Income &amp; expenses", "Billed, less VAT, refunds, doctors, labs, supplies and salaries: what the clinic actually made.")}
  </div>
  <div class="two two-dash">
    ${shot("dashboard", { b: 0.98, cap: "The owner's dashboard: today's collection, the month so far, dues outstanding, the busiest treatments and the trend." })}
    <div class="nepal">
      <div class="nepal-h">${icon("map-pin", { size: 15 })}<b>Made for clinics in Nepal</b></div>
      ${pt("calendar", "Bikram Sambat", "Every date in BS; the fiscal year runs Shrawan to Ashadh, and past years stay readable.")}
      ${pt("file-text", "PAN / VAT bills", "VAT off, added on top, or already in the rate — chosen once.")}
      ${pt("wifi-off", "Works offline", "Billing carries on without internet and catches up by itself.")}
      ${pt("printer", "Prints anywhere", "80 mm thermal or A5, straight from the browser.")}
      ${pt("smartphone", "Desk, tablet, phone", "The same system on every screen in the clinic.")}
    </div>
  </div>
  <div class="who">
    ${who("monitor", "Front desk", "Registers patients, books appointments, bills, takes dues, follows the lab work.")}
    ${who("stethoscope", "Dentist", "Writes treatment notes, marks the tooth chart, sees their own bookings on the phone.")}
    ${who("briefcase", "Owner", "Sets rates and shares, pays doctors, staff, labs and suppliers, reads every report.")}
    ${who("calculator", "Accountant", "Reads the books and reports for any fiscal year, without changing anything.")}
  </div>
  ${foot(2)}
</section>`;

function who(ic, title, text) {
  return `<div class="who-c"><div class="who-h">${icon(ic, { size: 15 })}<b>${title}</b></div><p>${text}</p></div>`;
}

function tile(ic, title, text) {
  return `<div class="tile"><div class="tile-ic">${icon(ic, { size: 18 })}</div><b>${title}</b><p>${text}</p></div>`;
}

const P3 = `<section class="page">
  ${head(2, "Odontogram", "A tooth chart that looks like teeth", "smile")}
  <p class="lead">Every patient card carries a tooth chart, closed until the dentist opens it. It is
  drawn as the mouth looks from above — incisors, canines, premolars and molars each in their own shape —
  so a finding is marked where it really is, and the next dentist sees it at a glance.</p>
  <div class="two">
    <div class="chart-card">${shot("teeth-svg", { frame: false })}</div>
    <div class="stack">
      ${pt("mouse-pointer-click", "Tap, choose, save", "Tap one tooth or several, pick what it is and which surfaces, add a note and the date.")}
      ${pt("grid-2x2", "Surfaces drawn on the tooth", "Mesial, occlusal, distal, buccal, lingual — a filling on MO colours just those parts of the tooth.")}
      ${pt("palette", "Thirteen findings, colour-coded", "Healthy, caries, filled, root canal, crown, bridge, implant, fractured, mobile, impacted, to extract, missing, watch.")}
      ${pt("history", "Every tooth keeps its history", "Caries, then RCT, then a crown: each mark dated and signed. A wrong one is undone, never rubbed out.")}
      <div class="kid">
        <div class="chart-card small">${shot("teeth-child", { frame: false })}</div>
        ${pt("baby", "Adult, milk teeth, or both", "FDI numbering, 11–48 and 51–85. Here an 8-year-old: milk tooth 75 out, caries on 84, first molars coming in.")}
      </div>
    </div>
  </div>
  ${shot("teeth", { t: 0.535, b: 0.865, cap: "Tooth 36 picked: the findings to choose from, the surfaces, and its history — caries, root canal, then a ceramic crown." })}
  ${shot("teeth", { t: 0.868, b: 1, cap: "Under the chart, every marked tooth in one list — what was found, when, and the note." })}
  ${foot(3)}
</section>`;

const P4 = `<section class="page">
  ${head(3, "Patients", "The patient's card, the way dentists already keep it", "notebook-pen")}
  <p class="lead">The history table follows the paper card a dental clinic already uses: the date, what
  was done, the charge, what was paid and what is still due — with a running balance underneath. The
  dentist's notes and the money are on the same line, so nobody has to match them up later.</p>
  ${shot("patient", { t: 0.02, b: 0.79, cap: "A patient card: the allergy strip in red, every visit's treatment notes and doctor, the charges, payments and dues." })}
  <div class="two two-row">
    ${shot("history-row", { t: 0.465, b: 0.865, cap: "Add row: the dentist's notes, and the charge and payment on the same line — paid in full, part paid or on credit." })}
    <div class="stack">
      ${pt("id-card", "One number for life", "P-000123, found by name, phone or number in a moment. Duplicates are caught at registration and can be merged.")}
      ${pt("pen-line", "Notes in place", "Edit a visit's notes right in the table. A charge added here becomes a proper numbered bill.")}
      ${pt("triangle-alert", "Allergies on top", "A known allergy or note shows in red on the card, every time it opens.")}
      ${pt("image", "X-rays and reports filed", "Photos, PDFs and scans kept with the visit, viewed in the browser, private to the clinic.")}
      ${pt("receipt", "New bill from the card", "Opens the counter with the patient already on the bill.")}
    </div>
  </div>
  ${foot(4)}
</section>`;

const P5 = `<section class="page">
  ${head(4, "Billing", "One counter for every treatment", "receipt")}
  <p class="lead">Type a few letters or a short code — <code>rct</code>, <code>crz</code>, <code>sc</code> — and press Enter.
  The dentist who did the work and, for crowns and dentures, the lab it goes to are chosen on the line itself,
  so the commission and the lab's bill are right from the moment the bill is saved.</p>
  ${shot("billing", { cap: "A bill for a consultation and a zirconia crown: the doctor on each line, the crown already routed to the ceramic lab." })}
  <div class="two two-even">
    <div class="stack">
      ${pt("banknote", "Cash, QR or dues", "Paid in full, part-paid, or left on dues against the patient — and collected later, oldest bill first.")}
      ${pt("pencil", "Rates that bend, with a record", "The rate list is the starting point; who may change it is set per user, and every change is logged.")}
      ${pt("percent", "VAT your way", "Not VAT-registered, VAT added on top, or rates that already include it — set once, per service.")}
      ${pt("printer", "Printed or not", "80 mm thermal or A5, with PAN, patient number, doctor and every line. Refund notes print too.")}
      ${pt("wifi-off", "No internet, no problem", "Bills are kept on the device and sent when the line comes back. None is ever lost.")}
    </div>
    ${shot("services", { t: 0, b: 0.42, cap: "Your own rate list: dental groups, codes, rates, which need a doctor, which go to a lab and at what cost." })}
  </div>
  ${shot("bill", { b: 0.64, cap: "Every saved bill, numbered per fiscal year: reprint it, refund part of it, or — for the owner — cancel it, with the reason kept." })}
  ${foot(5)}
</section>`;

const P6 = `<section class="page">
  ${head(5, "Lab work &amp; appointments", "Crowns and dentures, followed to the lab and back", "flask-conical")}
  <p class="lead">Billing a crown puts it on the laboratory list straight away. Each piece moves along by one
  tap, with the time stamped, so the front desk can answer "is my crown back?" without a phone call.</p>
  <div class="pipe">
    ${stage(1, "clipboard-list", "To collect", "billed, impression to take")}
    ${stage(2, "send", "To send", "impression ready for the lab")}
    ${stage(3, "hourglass", "At the lab", "sent, waiting days counted")}
    ${stage(4, "package-check", "Back", "the work is in")}
    ${stage(5, "smile", "Given out", "fitted for the patient")}
  </div>
  ${shot("lab", { l: 0.168, b: 0.86, cap: "The lab list: two pieces to send to Sample Ceramic Studio, with how long each has waited." })}
  ${shot("lab-statement", { t: 0.432, b: 0.99, cap: "Each lab's statement for the month: work sent at the lab's price, payments, and what is owed — as PDF or Excel. Reports list every lab side by side." })}
  <div class="appt">
    <div class="stack">
      <div class="sub-h">${icon("calendar-check", { size: 16 })}<b>Appointments, and the dentist's own phone</b></div>
      ${pt("layout-list", "The day's board", "Every dentist and how full their day is, so the desk knows who can see a patient and when. No double booking.")}
      ${pt("smartphone", "Each dentist's list", "A dentist signs in on their phone and sees their own bookings, with one tap to call the patient.")}
      ${shot("doctors", { cap: "Today's board: bookings per dentist." })}
    </div>
    <figure class="phone">${shot("doctor-phone", { frame: false, b: 0.66 })}</figure>
  </div>
  ${foot(6)}
</section>`;

function stage(n, ic, label, text) {
  return `<div class="stage"><span class="stage-n">${n}</span><div class="stage-ic">${icon(ic, { size: 18 })}</div><div class="stage-l">${label}</div><div class="stage-s">${text}</div></div>`;
}

const P7 = `<section class="page">
  ${head(6, "Doctors &amp; staff", "Commission and salaries, worked out for you", "hand-coins")}
  <p class="lead">Set each dentist's terms once — a percentage of all their work, a percentage of consultations, or a fixed amount per consultation.
  Their share is fixed on every bill line as it is billed, and every payout is matched to the oldest unpaid
  bills, so a dentist can see exactly which treatments they have been paid for.</p>
  ${shot("doctor-pay", { t: 0.355, b: 0.985, cap: "One dentist's statement: earned, paid and owed; each share marked Paid, Part paid or Unpaid; each payout with the bills it covered. PDF or Excel." })}
  ${shot("salaries", { t: 0.1, b: 0.935, cap: "The month's salary sheet: a Dashain bonus, an advance recovered, SSF and the 1% tax, what is paid and what is left — and a salary slip for each person." })}
  <div class="chips-row">
    ${chip("landmark", "SSF 11% + 20%, or 1% tax")}
    ${chip("hand-coins", "Advances recovered from salary")}
    ${chip("gift", "Bonus &amp; deduction lines")}
    ${chip("file-down", "Salary slip, PDF or Excel")}
    ${chip("history", "Raises never rewrite past months")}
  </div>
  ${foot(7)}
</section>`;

const P8 = `<section class="page">
  ${head(7, "Money &amp; control", "What the clinic really earned", "scale")}
  <p class="lead">Collections are not profit. ClinicNP Dental takes what was billed, removes refunds and VAT,
  then the dentists' shares, the labs' charges, the supplies and the salaries with the clinic's SSF — and shows
  beside it the money that actually went out.</p>
  ${shot("financials", { b: 0.97, cap: "Income and expenses for the month, with what was paid out to dentists, staff, suppliers and labs alongside." })}
  <div class="two two-even">
    ${shot("payables", { b: 0.655, cap: "Payables: what is owed to each supplier, lab and dentist, with Pay beside each one." })}
    <div class="stack">
      ${pt("user-cog", "Roles", "Owner, front desk, accountant (read-only) and dentist — each sees only their part.")}
      ${pt("scroll-text", "Activity log", "Rate changes, cancels, merges and undos, each with who and when.")}
      ${pt("database-backup", "Backups", "Everything, including files, backed up and restorable.")}
      ${pt("lock", "Private by design", "Patient files are shown only to people signed in. No patient list leaves the clinic.")}
    </div>
  </div>
  <div class="reports">
    <div class="sub-h">${icon("chart-column", { size: 15 })}<b>Reports, for any dates or fiscal year, to Excel or PDF</b></div>
    <div class="chips-row">
      ${["Day close", "Sales register", "Service revenue", "Doctor payouts", "Laboratory statements", "Patient visits",
        "New &amp; returning patients", "Income &amp; expenses", "Dues", "Payables", "Purchase register",
        "Supplier statements", "Salaries"].map((r) => `<span class="chip">${r}</span>`).join("")}
    </div>
  </div>
  <div class="close">
    <img class="close-logo" src="${LOGO}" alt="ClinicNP"><span class="close-badge">Dental</span>
    <div class="close-mid">
      <div class="close-h">See it on your own clinic's screens</div>
      <div class="close-s">A live walkthrough, your treatments and rates loaded in, and training for your front desk.</div>
    </div>
    <div class="close-ibn">
      <img src="${IBN}" alt="Infobytes Nepal">
      <div class="cc">${icon("globe", { size: 13 })} infobytesnepal.com</div>
      <div class="cc">${icon("phone", { size: 13 })} ${PHONES}</div>
    </div>
  </div>
  ${foot(8)}
</section>`;

// ===========================================================================
// styles
// ===========================================================================
const css = `
:root{
  --navy:#19445b; --navy-d:#0f2e3f; --navy-l:#eaf1f6;
  --red:#ec1f27; --red-l:#fdeceb;
  --ibn-blue:#0443c6; --ibn-green:#00bc5d;
  --ink:#12222c; --mid:#55707f; --line:#dbe3e8; --tint:#f5f8fa;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:"Segoe UI",system-ui,Arial,sans-serif;color:var(--ink);background:#fff;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}
@page{size:A4;margin:0}
.page{position:relative;width:210mm;height:296.6mm;padding:11mm 13mm 14mm;overflow:hidden;
  break-after:page;display:flex;flex-direction:column;gap:3.4mm}
.page:last-child{break-after:auto}
svg{display:block;flex:none}
code{font-family:Consolas,monospace;font-size:.92em;background:var(--tint);border:1px solid var(--line);
  border-radius:3px;padding:0 3px;color:var(--navy)}

.ph{display:flex;gap:9px;align-items:center;border-bottom:2px solid var(--navy);padding-bottom:2.4mm}
.ph-ic{width:33px;height:33px;border-radius:8px;background:var(--navy);color:#fff;display:flex;
  align-items:center;justify-content:center;flex:none}
.kicker{font-size:7.4pt;letter-spacing:.15em;text-transform:uppercase;color:var(--red);font-weight:700}
.ph h2{margin:1px 0 0;font-size:15.5pt;line-height:1.12;letter-spacing:-.01em}
.ph-logo{height:6.4mm;margin-left:auto}
.ph-badge{font-size:7pt;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fff;
  background:var(--red);border-radius:3px;padding:2px 5px;margin-left:1.5mm}
.lead{font-size:9pt;line-height:1.5;color:var(--mid);margin:0}
.pf{position:absolute;left:13mm;right:13mm;bottom:6mm;display:flex;justify-content:space-between;
  font-size:7pt;color:#8aa0ad;border-top:1px solid var(--line);padding-top:2mm}

.shot{margin:0}
.frame{border:1px solid var(--line);border-radius:6px;overflow:hidden;background:#fff;
  box-shadow:0 1px 4px rgba(18,34,44,.1)}
.bar{height:9px;background:var(--tint);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:3px;padding:0 5px}
.bar i{width:4px;height:4px;border-radius:50%;background:#c6d1d8}
.crop{overflow:hidden;width:100%}
.crop img{display:block;max-width:none}
.shot figcaption{font-size:7.3pt;line-height:1.35;color:var(--mid);margin-top:1.4mm;border-left:2px solid var(--red);padding-left:5px}

.pt{display:flex;gap:7px;align-items:flex-start}
.pt-ic{width:25px;height:25px;border-radius:7px;background:var(--navy-l);color:var(--navy);display:flex;
  align-items:center;justify-content:center;flex:none}
.pt-tx{font-size:8pt;line-height:1.36}
.pt-tx b{display:block;font-size:8.5pt;color:var(--ink)}
.pt-tx span{display:block;color:var(--mid)}
.stack{display:flex;flex-direction:column;gap:2.6mm}
.two{display:grid;grid-template-columns:1.05fr 1fr;gap:5mm;align-items:start}
.two-even{grid-template-columns:1fr 1fr}
.two-row{grid-template-columns:1.25fr 1fr}
.two-b{grid-template-columns:1.35fr .65fr}
.chip{display:inline-flex;gap:4px;align-items:center;padding:3px 7px;border-radius:999px;background:var(--tint);
  border:1px solid var(--line);color:var(--navy);font-size:7.5pt;font-weight:600;line-height:1.1}

/* cover */
.cover{background:var(--navy-d);color:#fff;padding:14mm 14mm 12mm;gap:0}
.cover-top{display:flex;align-items:center;gap:3mm}
.cover-logo{width:62mm}
.cover-badge{font-size:15pt;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#fff;
  background:var(--red);border-radius:5px;padding:2mm 3.4mm;margin-top:1mm}
.cover-grid{display:grid;grid-template-columns:1fr 88mm;gap:8mm;margin:auto 0;align-items:center}
.cover-kicker{font-size:8pt;letter-spacing:.2em;text-transform:uppercase;color:#8fb4c8;font-weight:700;margin-bottom:4mm}
.cover h1{margin:0;font-size:31pt;line-height:1.06;letter-spacing:-.02em;font-weight:800}
.cover h1::after{content:"";display:block;width:22mm;height:3.4px;background:var(--red);margin-top:5mm;border-radius:2px}
.cover-lead{font-size:9.6pt;line-height:1.55;color:#cddce4;margin:5mm 0 0}
.cover-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6mm}
.cover-chips .chip{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.2);color:#eaf3f7}
.cover-card{background:#fffcf4;border-radius:10px;padding:4mm;box-shadow:0 6px 24px rgba(0,0,0,.35)}
.cover-card-cap{display:flex;gap:5px;align-items:flex-start;font-size:7.3pt;line-height:1.35;color:#55707f;margin-top:2mm}
.cover-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;margin-bottom:8mm}
.cover-strip figure{margin:0}
.cover-strip .crop{border-radius:6px;border:1px solid rgba(255,255,255,.25);height:34mm;aspect-ratio:auto!important}
.cover-strip figcaption{font-size:7.4pt;color:#8fb4c8;margin-top:1.6mm;letter-spacing:.06em;text-transform:uppercase;font-weight:700}
.cover-foot{display:flex;justify-content:space-between;align-items:flex-end;
  border-top:1px solid rgba(255,255,255,.18);padding-top:6mm}
.cover-by{display:flex;flex-direction:column;gap:2mm}
.cover-by span{font-size:7.4pt;letter-spacing:.14em;text-transform:uppercase;color:#8fb4c8;font-weight:700}
.cover-by img{width:50mm;margin-left:-2mm}
.cover-meta{display:flex;flex-direction:column;gap:2mm;align-items:flex-end;font-size:8.6pt;color:#cddce4}
.cover-meta div{display:flex;gap:5px;align-items:center}
.cover-meta b{color:#fff}
.cover-note{display:flex;gap:5px;align-items:flex-start;margin-top:4mm;font-size:7pt;line-height:1.4;color:#8fb4c8}

/* page 2 */
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:2.6mm}
.tile{border:1px solid var(--line);border-radius:8px;padding:2.6mm 3mm;background:#fff}
.tile-ic{width:28px;height:28px;border-radius:7px;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:1.6mm}
.tile b{display:block;font-size:9pt;margin-bottom:.8mm}
.tile p{margin:0;font-size:7.6pt;line-height:1.38;color:var(--mid)}
.nepal{background:var(--red-l);border-left:3px solid var(--red);border-radius:0 8px 8px 0;padding:3mm 3.4mm;display:flex;flex-direction:column;gap:2.4mm;height:100%}
.nepal .pt-ic{background:#fff;color:#9b1d16}
.two-dash{grid-template-columns:1.8fr 1fr;align-items:stretch}
.nepal-h{display:flex;gap:5px;align-items:center;color:#9b1d16;font-size:9.4pt}
.nepal-g{display:flex;flex-wrap:wrap;gap:4px}
.nepal-g .chip{background:#fff}

/* page 3 */
.chart-card{background:#fffcf4;border:1px solid var(--line);border-radius:10px;padding:3mm}
.chart-card.small{padding:1.5mm;width:50mm;flex:none}
.kid{display:flex;gap:3mm;align-items:center}
.mini-cap{font-size:7.2pt;line-height:1.35;color:var(--mid);margin-top:1mm;border-left:2px solid var(--red);padding-left:5px}

/* page 6 */
.pipe{display:grid;grid-template-columns:repeat(5,1fr);gap:2mm}
.stage{position:relative;border:1px solid var(--line);border-radius:8px;padding:3mm 2mm 2.4mm;background:var(--tint);text-align:center}
.stage-n{position:absolute;top:-6px;left:50%;transform:translateX(-50%);width:15px;height:15px;border-radius:50%;
  background:var(--red);color:#fff;font-size:7pt;font-weight:800;line-height:15px}
.stage-ic{display:flex;justify-content:center;color:var(--navy);margin-bottom:1.2mm}
.stage-l{font-size:8.2pt;font-weight:800}
.stage-s{font-size:6.9pt;color:var(--mid);line-height:1.3;margin-top:.6mm}
.appt{display:grid;grid-template-columns:1fr 46mm;gap:6mm;align-items:start}
.sub-h{display:flex;gap:6px;align-items:center;color:var(--navy);font-size:10pt;border-bottom:1px solid var(--line);padding-bottom:1.6mm}
.phone{margin:0}
.phone .crop{border:1px solid var(--line);border-radius:12px;box-shadow:0 2px 8px rgba(18,34,44,.15)}

/* page 8 */
.who{display:grid;grid-template-columns:repeat(4,1fr);gap:2.6mm}
.who-c{border-top:3px solid var(--navy);background:var(--tint);border-radius:0 0 8px 8px;padding:2.4mm 2.8mm}
.who-h{display:flex;gap:5px;align-items:center;color:var(--navy);font-size:9pt}
.who-c p{margin:1mm 0 0;font-size:7.5pt;line-height:1.38;color:var(--mid)}
.chips-row{display:flex;flex-wrap:wrap;gap:4px}
.reports .sub-h{margin-bottom:2mm;font-size:9.4pt}
.ctrl{display:grid;grid-template-columns:1fr 1fr;gap:2.6mm 5mm;background:var(--tint);border:1px solid var(--line);border-radius:8px;padding:3mm 3.4mm}
.close{margin-top:auto;display:grid;grid-template-columns:auto 1fr auto;gap:5mm;align-items:center;
  border:2px solid var(--navy);border-radius:10px;padding:4mm 5mm;position:relative}
.close-logo{width:40mm}
.close-badge{position:absolute;left:46mm;top:3.4mm;font-size:6.6pt;font-weight:800;letter-spacing:.14em;color:#fff;background:var(--red);border-radius:3px;padding:1.5px 4px}
.close-h{font-size:12pt;font-weight:800;color:var(--navy)}
.close-s{font-size:8pt;line-height:1.4;color:var(--mid);margin-top:1mm}
.close-ibn{display:flex;flex-direction:column;align-items:flex-end;gap:1mm}
.close-ibn img{width:36mm}
.cc{display:flex;gap:4px;align-items:center;font-size:7.8pt;color:var(--ink)}
.cc svg{color:var(--ibn-green)}
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>ClinicNP Dental</title><style>${css}</style></head>
<body>${[P1, P2, P3, P4, P5, P6, P7, P8].join("")}</body></html>`;

await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);

// how full each page is: content must end above the footer
const fill = await page.evaluate(() =>
  [...document.querySelectorAll(".page")].map((p, i) => {
    const r = p.getBoundingClientRect();
    const kids = [...p.children].filter((k) => !k.classList.contains("pf"));
    const bottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
    const footTop = p.querySelector(".pf")?.getBoundingClientRect().top ?? r.bottom;
    return { page: i + 1, freePx: Math.round(footTop - bottom) };
  }),
);
console.log(fill.map((f) => `p${f.page}: ${f.freePx >= 0 ? `${f.freePx}px free` : `OVERFLOWS by ${-f.freePx}px`}`).join(" · "));

if (process.env.PROOF) {
  const dir = join(HERE, "proof");
  mkdirSync(dir, { recursive: true });
  const pages = await page.$$(".page");
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: join(dir, `p${String(i + 1).padStart(2, "0")}.png`) });
}

const out = join(ROOT, "ClinicNP Dental.pdf");
await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log("written:", out);
