/**
 * build-guide.mjs — assembles prod-docs/guide/ClinicNP-User-Guide.html from the
 * captured screenshots + the written walkthrough below. Images are embedded as
 * data URIs so the file is fully self-contained: open it in any browser and
 * "Save as PDF" (or Ctrl/Cmd+P → Save as PDF) to produce the printed guide.
 *
 * Regenerate after re-capturing:  node scripts/build-guide.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUIDE = join(__dirname, "..", "prod-docs", "guide");
const SCREENS = join(GUIDE, "screens");
const PUBLIC = join(__dirname, "..", "public");

function dataUri(absPath) {
  if (!existsSync(absPath)) {
    console.warn("missing image:", absPath);
    return "";
  }
  const b64 = readFileSync(absPath).toString("base64");
  return `data:image/png;base64,${b64}`;
}
const shot = (slug) => dataUri(join(SCREENS, `${slug}.png`));
// The wordmark is typographic, not an image (D-037): the name is derived from
// which modules are on, and a fixed picture cannot say two different things.
const WORDMARK = "ClinicNP";

/**
 * The cover mark. The owner supplied real artwork, so the cover uses it; the
 * name set in type stays as the fallback so this script still runs in a tree
 * where the file is missing.
 */
const LOGO = join(__dirname, "..", "public", "icons", "logo-main.png");
const COVER_MARK = existsSync(LOGO)
  ? `<img src="${dataUri(LOGO)}" alt="${WORDMARK}">`
  : `<div class="wordmark">${WORDMARK}</div>`;

// ---- The walkthrough content -------------------------------------------------
// Plain language only. Each section pairs a real screenshot with what the user
// sees and what to do. `n` numbers appear in the printed table of contents.
const CHAPTERS = [
  {
    id: "start",
    title: "Getting started",
    sections: [
      {
        img: "01-login",
        title: "Logging in",
        blurb:
          "ClinicNP opens here. Your clinic's own letterhead sits above the boxes, so you can always tell it is your shop's system you are typing into. Every person who works the counter gets their own username, so the shop always knows who made each bill.",
        points: [
          "Type your <b>username</b> and <b>password</b>, then press <b>Log in</b>.",
          "The eye button at the end of the password box shows what you have typed — useful on a tablet keyboard.",
          "There is no sign-up. The owner creates every account under <b>Settings → Users</b>, and only the owner can reset a forgotten password.",
          "Get the password wrong too many times in a row and ClinicNP pauses logging in for a few minutes. This is on purpose — it stops anyone guessing their way in. Just wait and try again.",
          "Owners see every tab. Counter staff see only what they need for billing and stock — this keeps the shop's numbers safe.",
          "The <b>support numbers are printed on this screen</b>, at the bottom. That is deliberate: it is the one screen you can still read when you cannot get in.",
        ],
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    sections: [
      {
        img: "02-dashboard",
        title: "Your shop at a glance",
        blurb:
          "The Dashboard is the first thing you see after signing in. It answers 'how is the shop doing today?' without you having to open a single report.",
        points: [
          "The four cards across the top show <b>today's sales</b>, <b>this month</b>, the running <b>fiscal-year</b> total, and how many <b>bills</b> you've made today.",
          "The three cards below are early warnings: <b>Low stock</b>, <b>Near expiry</b>, and <b>Expired</b>. A number above zero means something needs your attention — click through to Stock to see which items.",
          "The <b>Sales — last 30 days</b> graph shows the shape of your week and month at a glance.",
          "<b>Top items this month</b> tells you what's actually moving, so you know what to reorder first.",
          "Dates everywhere are in <b>Bikram Sambat</b> — the top-right shows today's Nepali date.",
        ],
      },
    ],
  },
  {
    id: "billing",
    title: "New bill (the counter)",
    sections: [
      {
        img: "03-billing",
        title: "Making a sale",
        blurb:
          "This is where you spend most of your day. It's built to be fast and keyboard-first — you rarely need the mouse. The left side is the bill; the green panel on the right is the money.",
        points: [
          "Start typing a medicine name in the <b>search box</b> and press <b>Enter</b> to add it to the bill. Keep searching to add more lines.",
          "For each line you can change the <b>quantity</b>, pick the <b>unit</b> (tablet, strip, box…), and — if you're allowed — nudge the <b>rate</b>. An edited rate shows a small mark so it's never hidden.",
          "Prefer to tap? Hit the <b>grid button</b> next to the quantity (or press <b>G</b>) to pick the amount visually — see the next page.",
          "ClinicNP always sells the <b>nearest-to-expiry stock first</b>, automatically. You never sell an expired batch by accident — those are locked out.",
          "You <b>can't oversell</b> — if a line is short on stock, saving is blocked until you lower the quantity or add the stock (record a purchase).",
          "On the right: enter any <b>bill discount</b> (in rupees or as a percentage — see below), choose <b>Cash</b>, <b>QR</b>, or <b>Dues</b>, type what the customer <b>tendered</b>, and ClinicNP shows the <b>change</b>.",
          "Press <b>F9</b> (or <b>Save &amp; print</b>) to finish. The bill prints and stock comes down on its own.",
          "Every medicine on the printed bill shows its <b>batch number</b> and <b>expiry</b> — the batch that was actually sold. A medicine taken from two batches shows both. Hand over the batch the bill names.",
          "No internet? Keep billing. ClinicNP works offline and quietly sends the bills the moment you're back online — the top of the screen tells you what's waiting.",
          "Not ready to finish a bill? <b>Held</b> (top right) parks it so you can start another and come back.",
          "Use <b>Back to app</b> (top left) to return to the dashboard any time.",
        ],
      },
      {
        img: "03b-visual-picker",
        title: "Pick the quantity visually",
        blurb:
          "Numbers all look alike; medicines don't. The <b>Unit</b> panel under the bill draws the actual item — capsules in a real strip, a bottle, a box — so you can tap what you're selling. Great on a touch screen, and it makes 'a strip and a half' obvious. What it draws comes from the item's form, set when you add the medicine.",
        points: [
          "Tap a capsule/tablet to set the quantity up to there — selling 4 loose ones? Tap the 4th. A part-used strip shows as <b>cut</b>, matching the shelf.",
          "The <b>packs on the left</b> (Box, Strip, Tablet) are quick-adds — tap <b>Strip</b> to add a whole strip (+10), <b>Box</b> to add a box.",
          "The running total shows both ways — e.g. <b>1 Strip + 4 Tablet</b> and the exact price — with <b>+ / −</b> for fine control.",
          "It sells in the smallest unit at that unit's price; the <b>Box / Strip / Tablet</b> chip on the bill line still switches to bulk pricing.",
        ],
      },
      {
        img: "53-discount-percent",
        title: "A discount in rupees or percent",
        blurb:
          "Next to <b>Bill discount</b> are two small buttons: <b>रू</b> and <b>%</b>. Choose one, then type the number.",
        points: [
          "In <b>रू</b>, the number is taken off the bill as it is.",
          "In <b>%</b>, it is that share of the bill — the line underneath shows exactly how much, e.g. <i>10% of रू 459.00 … − रू 45.90</i>. Add or remove a line and the discount follows the new total.",
          "Changed your mind? Switch between रू and % and the number you typed is read the new way.",
          "Your choice stays for the next bill, so a counter that always discounts in percent only chooses it once.",
        ],
      },
      {
        img: "49-counter-dues",
        title: "Selling on dues",
        blurb:
          "When a patient cannot pay all of it today, choose <b>Dues</b>. It works for medicines, services, or both on one bill.",
        points: [
          "Type what they are <b>paying now</b> (leave it empty if nothing), and choose <b>Cash</b> or <b>QR</b> for that part. <b>Left on dues</b> shows what they will owe.",
          "A bill on dues needs <b>the patient</b>, just like a service: press <b>P</b> or <b>Attach patient</b> and find them, or register them on the spot. ClinicNP will not save it without somebody attached.",
          "If they are paying the whole amount after all, choose Cash or QR instead — Dues is only for money still owed.",
          "The printed bill says <b>Payment: Dues</b> and shows <b>Paid</b> and <b>Balance due</b> under the total, so the patient's copy is a record of what they owe.",
        ],
      },
    ],
  },
  {
    id: "stock",
    title: "Stock",
    sections: [
      {
        img: "04-stock",
        title: "What's on the shelf",
        blurb:
          "Stock shows how much of every medicine you have right now, counted in the smallest unit so the number is always honest.",
        points: [
          "Each row is one medicine with its total quantity on hand and its value.",
          "The tabs let you jump straight to the lists that matter: <b>Low</b>, <b>Near expiry</b>, and <b>Expired</b>.",
          "Quantities read the way you stock — for example '4 Box + 3 Strip + 6 Tablet' — so you can match them to the shelf without doing maths.",
        ],
      },
      {
        img: "05-stock-low",
        title: "Low stock — what to reorder",
        blurb:
          "This list is your reorder sheet. Anything that has dropped below the minimum you set for it shows up here.",
        points: [
          "Set each medicine's minimum on its Item page; when stock falls under it, the item lands here.",
          "Use this before you call a supplier so nothing runs out mid-week.",
        ],
      },
      {
        img: "06-stock-near-expiry",
        title: "Near expiry — sell or return soon",
        blurb:
          "Medicines that will expire soon, so you can push them, return them, or move them before they become a loss.",
        points: [
          "The 'soon' window is set in Settings (for example, the next 90 days).",
          "ClinicNP already sells these first at the counter — this list is for the ones you may want to return to the supplier.",
        ],
      },
      {
        img: "07-stock-expired",
        title: "Expired — pull these off the shelf",
        blurb:
          "Anything past its expiry date. These are never sold to a customer — ClinicNP blocks them — but you still need to account for them.",
        points: [
          "Use the action here to write off expired stock so your on-hand numbers stay truthful.",
          "Every write-off is recorded, so the value that left your shelf is always explainable.",
        ],
      },
      {
        img: "54-opening-stock-dates",
        title: "Picking a date — Nepali or English",
        blurb:
          "Every date box opens a small calendar with a <b>नेपाली | English</b> switch at the top, so an expiry printed on a pack as “EXP 09/2027” can be picked straight off the pack, with no converting in your head.",
        points: [
          "Which calendar opens first is set once for the shop, in <b>Settings → Company → Calendar for dates</b>. The box also writes the chosen date in that calendar.",
          "The switch is for one pick. The next time a box opens, it starts from the setting again.",
          "<b>«</b> and <b>»</b> jump a whole year, which is quicker for an expiry two or three years away.",
          "Under the calendar the chosen day is written both ways, for example <i>28 Ashwin 2084 = 15 Oct 2027</i>, so you can check it against the pack.",
          "Only the picking changes. Bills, reports and the day close stay in Nepali dates.",
          "The screen shown is <b>Stock → Opening stock</b>: what was already on the shelf when ClinicNP arrived. It is not a purchase, so there is no supplier and nothing owed.",
        ],
      },
    ],
  },
  {
    id: "items",
    title: "Items",
    sections: [
      {
        img: "08-items",
        title: "Your medicine list",
        blurb:
          "Items is the master list of everything you sell. You set a medicine up once here, and the counter, stock, and reports all use it.",
        points: [
          "Add a medicine with its name, generic name, category, and rack location.",
          "Set the <b>units</b> and how they nest — for example 1 Box = 10 Strip, 1 Strip = 10 Tablet — and the selling rate. The counter then handles every unit for you.",
          "Set a <b>minimum stock</b> so the medicine shows up on the Low-stock list when it runs down.",
          "Turn a medicine <b>off</b> to hide it from the counter without losing its history.",
          "Use the <b>Edit</b> button on any row to change it later.",
        ],
      },
      {
        img: "08b-items-new",
        title: "Adding a medicine — and its look",
        blurb:
          "When you add an item, the <b>Looks like</b> row lets you pick its form — capsule, tablet, blister strip, bottle, box, tube, sachet, drops or vial. That choice is what the counter draws in the visual Unit panel, so staff recognise the medicine at a glance.",
        points: [
          "Pick the <b>form</b> that matches the medicine — a syrup is a Bottle, an antibiotic is a Capsule, and so on.",
          "Everything but the name and units is optional — the extra fields hide under <b>More options</b> to keep it quick.",
        ],
      },
    ],
  },
  {
    id: "purchases",
    title: "Purchases",
    sections: [
      {
        img: "09-purchases",
        title: "Stock coming in",
        blurb:
          "Purchases is the record of stock you've bought. Entering a purchase here is what puts medicines onto your shelf.",
        points: [
          "Each entry is one supplier bill, with the batches and quantities you received.",
          "Recording a purchase adds that stock automatically — you don't adjust counts by hand.",
        ],
      },
      {
        img: "10-purchases-new",
        title: "Entering a new purchase",
        blurb:
          "Copy a supplier's invoice into ClinicNP: pick the supplier, add each medicine with its batch number, expiry, cost, and quantity.",
        points: [
          "Enter the <b>batch number</b> and <b>expiry date</b> for each line — this is what powers sell-oldest-first and the expiry warnings.",
          "The <b>manufacture date</b> is optional. Leave it empty when the pack or the bill does not show one; if you do fill it in, it has to come before the expiry.",
          "Enter the <b>cost</b> you paid; ClinicNP uses it to work out real profit later, batch by batch.",
          "Save, and every line lands on the shelf and in your supplier's ledger.",
        ],
      },
      {
        img: "11-purchases-returns",
        title: "Returning to a supplier",
        blurb:
          "Sending stock back — damaged, wrong, or near expiry? Record it here so your on-hand count and the supplier's balance both stay correct.",
        points: [
          "Pick the batch you're returning and the quantity; the stock comes off the shelf.",
          "The supplier's ledger updates so you're never over- or under-paying.",
        ],
      },
    ],
  },
  {
    id: "suppliers",
    title: "Suppliers",
    sections: [
      {
        img: "12-suppliers",
        title: "Who you buy from",
        blurb:
          "Suppliers keeps your distributors and how much you owe each one, all in one place.",
        points: [
          "Each supplier shows a running <b>balance</b> — what you still owe after purchases and payments.",
          "Open a supplier to see their full history and to record a payment you've made.",
        ],
      },
    ],
  },
  {
    id: "bills",
    title: "Bills",
    sections: [
      {
        img: "13-bills",
        title: "Every sale you've made",
        blurb:
          "Bills is the searchable record of every sale. Come here to reprint, review, or fix a bill.",
        points: [
          "Open any bill to see its lines and <b>reprint</b> it for a customer.",
          "Made a mistake? <b>Cancel</b> a bill — the stock returns to the shelf and the bill keeps its number so nothing is ever quietly deleted.",
          "Take back part of a sale with a <b>return</b>; the medicine goes back on the shelf and the day's totals adjust.",
          "A bill somebody still owes on says <b>Owes</b> and how much; once paid off it says <b>Dues cleared</b>. Everything owed is kept together under <b>Dues</b> — the next chapter.",
        ],
      },
    ],
  },
  {
    id: "dues",
    title: "Dues",
    sections: [
      {
        img: "50-dues",
        title: "Who owes what",
        blurb:
          "<b>Dues</b>, in the menu under Bills, lists everybody who owes money — for medicine, services or both — with the biggest amount first.",
        points: [
          "Each person shows their patient number and phone, how many bills they owe on, the total, and how old the oldest one is (it turns orange after 15 days and red after 30).",
          "Click a person to see the bills behind the amount. <b>Open patient card</b> takes you to their record, which also says what they owe.",
          "Search by <b>name, phone or patient number</b> when somebody comes in to pay.",
          "<b>Paid back</b> (the second tab) lists every payment received, newest first.",
        ],
      },
      {
        img: "51-dues-receive",
        title: "Taking a payment",
        blurb:
          "Press <b>Receive payment</b> beside the person. The amount starts at everything they owe — if they are paying it all, just press the pink button.",
        points: [
          "Paying part of it? Type the amount. The <b>oldest bill is paid off first</b>, and the box shows how the money will be split before you save.",
          "Choose <b>Cash</b> or <b>QR / wallet</b>, and add a note if it helps (who brought it, a cheque number).",
          "ClinicNP will not take more than is owed — give the patient their change.",
          "Money paid today shows on today's <b>Day close</b> under <i>Dues paid back</i>, and is counted in the cash expected in the drawer.",
          "Typed the wrong amount? The owner can <b>Undo</b> it on the <b>Paid back</b> tab. It stays listed, marked <i>Undone</i>, and the amount is owed again.",
        ],
      },
      {
        img: "52-bill-dues",
        title: "Dues on a bill",
        blurb:
          "Open any bill that went on dues to see where it stands: paid at billing, paid back since, and what is still owed, with every payment listed underneath.",
        points: [
          "<b>Receive payment</b> here takes money against this bill alone.",
          "If they return medicine from a bill they still owe on, it comes <b>off what they owe first</b>; only anything left over is handed back. The return screen tells you which before you save.",
          "Cancelling a bill takes it off the dues list. If they had already paid something back on it, give that back to them.",
        ],
      },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    sections: [
      {
        img: "43-reports-service-revenue",
        title: "Service revenue",
        blurb:
          "What each service earned, after refunds, and what was paid out to a laboratory for it.",
        points: [
          "Every figure is what was actually charged at the time. Changing a price today does not move any of it.",
        ],
      },
      {
        img: "44-reports-doctors",
        title: "Doctor payouts",
        blurb: "What each doctor has earned over the period.",
        points: [
          "Worked out from the terms in force when each bill was made, so it does not change if the terms change afterwards.",
        ],
      },
      {
        img: "45-reports-lab-partners",
        title: "Laboratory statements",
        blurb:
          "Tests sent, payments made, and the balance with each outside laboratory.",
        points: [
          "Open one to see its statement, record a payment, or export the sheet to send to them.",
        ],
      },
      {
        img: "46-reports-visits",
        title: "Patient visit register",
        blurb: "Every visit in a date range, with the doctor and department.",
        points: [],
      },
      {
        img: "47-reports-new-patients",
        title: "New and returning patients",
        blurb: "How many of the people seen had been here before.",
        points: [
          "A first-ever visit counts as new — not merely somebody's first visit inside the dates you chose.",
        ],
      },
      {
        img: "48-reports-utilisation",
        title: "Diagnostics utilisation",
        blurb: "Which departments are busy, and what each brought in.",
        points: [],
      },
      {
        img: "14-reports",
        title: "The report shelf",
        blurb:
          "Reports turn the day's work into numbers you can act on or hand to your accountant. Every report can be exported to Excel.",
        points: [
          "Pick a report from the list; most let you choose a date range in Nepali dates.",
          "Use <b>Export</b> on any report to get a clean Excel file.",
        ],
      },
      {
        img: "15-reports-day-close",
        title: "Day close",
        blurb:
          "The end-of-day summary: what you sold, by payment type, and how much cash you should have in the drawer.",
        points: [
          "Shows gross sales, returns, and the <b>expected cash</b> to count against your drawer.",
          "Run it before you lock up so any difference is caught the same day.",
        ],
      },
      {
        img: "16-reports-sales-register",
        title: "Sales register",
        blurb: "Every bill in a date range, line by line — the full sales record for the period.",
        points: ["Great for cross-checking a busy day or handing sales to your accountant."],
      },
      {
        img: "17-reports-profit",
        title: "Profit by item",
        blurb:
          "What you actually earned, medicine by medicine. Profit is worked out from the real cost of the exact batches you sold — not a guess.",
        points: [
          "Returns are already subtracted, so the profit shown is what you really kept.",
          "Use it to see which medicines are worth the shelf space.",
        ],
      },
      {
        img: "18-reports-purchase-register",
        title: "Purchase register",
        blurb: "Every purchase in a date range — what you bought and from whom.",
        points: ["Handy for reconciling supplier statements at month end."],
      },
      {
        img: "19-reports-valuation",
        title: "Stock valuation",
        blurb: "What the stock on your shelf is worth right now, at cost.",
        points: ["A quick answer to 'how much money is sitting on my shelves?'"],
      },
      {
        img: "20-reports-vat",
        title: "VAT summary",
        blurb: "The VAT side of your sales, gathered for your tax filing.",
        points: ["Export it and hand it to your accountant at filing time."],
      },
      {
        img: "21-reports-expiry",
        title: "Expiry report",
        blurb: "A forward look at what's expiring and when, so nothing surprises you.",
        points: ["Plan returns and push near-expiry stock before it becomes a loss."],
      },
      {
        img: "22-reports-moving",
        title: "Moving items",
        blurb: "Your fast and slow sellers over a period.",
        points: ["Reorder the fast movers; rethink the slow ones."],
      },
    ],
  },
  {
    id: "patients",
    title: "Patients",
    clinicOnly: true,
    sections: [
      {
        img: "30-patients",
        title: "Everyone who has been here",
        blurb:
          "Every patient gets a number the first time they come, and keeps it for life. It never changes at year end and is never given to anybody else.",
        points: [
          "Search by name, phone or number. Part of any of them is enough.",
          "The number in navy is theirs — read it back to them and they will know you have the right record.",
        ],
      },
      {
        img: "31-patients-new",
        title: "Registering somebody",
        blurb:
          "Name, sex, age and phone are all that is needed. It is meant to be done while the person is still standing at the counter.",
        points: [
          "<b>Age can be entered as they say it</b> — '3 months', '7 years'. ClinicNP remembers the day you were told, so a baby registered last year shows as a year older today rather than staying three months old forever.",
          "If they know their date of birth, enter that instead and the age is always exact.",
          "The <b>allergy note</b> shows in red at the top of their record every time it is opened.",
          "If somebody with the same name or phone already exists, you are shown them before saving — but you can still save, because households share phones and names repeat.",
        ],
      },
      {
        img: "35-patients-duplicates",
        title: "Two records for one person",
        blurb:
          "If two counters registered the same person while the internet was down, both records are real and both are kept. This screen lists the ones that look alike.",
        points: [
          "It tells you what matches — the name, the phone, or both.",
          "Nothing is joined automatically. Open a pair, check they really are one person, and join them only then.",
          "Joining moves every visit, bill and file onto the record you keep. The other number is retired and never reused.",
        ],
      },
    ],
  },
  {
    id: "visits",
    title: "Visits and files",
    clinicOnly: true,
    sections: [
      {
        img: "32-visits-today",
        title: "Who is here today",
        blurb:
          "The front desk's screen. Everyone seen today, and who is still waiting.",
        points: [
          "Starting a visit prints the <b>OPD slip</b> the patient carries to the doctor's room.",
          "Billing a service for somebody opens their visit automatically if they do not have one yet — you never have to remember to.",
        ],
      },
      {
        img: "33-visits",
        title: "The visit record",
        blurb:
          "What they came in with, what was found, what was advised, and the optional vitals row.",
        points: [
          "Every box is optional. Nothing is required and nothing is interpreted — ClinicNP records what you write and does not judge it.",
          "A visit is never deleted. Cancelling one keeps it on the record with the reason, and leaves it out of the counts.",
        ],
      },
      {
        img: "34-files-pending",
        title: "Reports that have not come back",
        blurb:
          "Anything charged for that produces a report — a test, a scan — and whose report has not been attached yet.",
        points: [
          "It empties itself as reports come in, so what is left is what to chase.",
          "Photograph a paper report with the tablet, or attach the PDF the laboratory emailed. Both work the same way.",
          "Files are only ever visible to somebody signed in. A link on its own opens nothing.",
        ],
      },
    ],
  },
  {
    id: "services",
    title: "Services, doctors and laboratories",
    clinicOnly: true,
    sections: [
      {
        img: "36-settings-services",
        title: "What the clinic charges for",
        blurb:
          "Everything that is not a medicine — consultations, tests, scans, procedures — with its price and what it needs.",
        points: [
          "A service can require a <b>doctor</b> on the bill, be <b>sent to an outside laboratory</b>, or produce a <b>report</b> that is expected back.",
          "A <b>follow-up window</b> on a consultation means somebody returning inside that many days is charged the follow-up rate, or nothing at all. The counter says so on the line, and the front desk can still charge in full if that is the right call.",
          "Changing a price never changes a bill already made.",
        ],
      },
      {
        img: "37-settings-doctors",
        title: "Doctors",
        blurb:
          "The doctors who see patients here, and what each of them takes.",
        points: [
          "A doctor here is a name on a slip and a share of the takings. Giving someone a way to sign in is separate, under Users.",
          "The share is worked out when the bill is made and frozen there — changing it later never moves money already earned.",
        ],
      },
      {
        img: "38-settings-lab-partners",
        title: "Outside laboratories",
        blurb:
          "Laboratories that samples are sent to, and what is owed to each of them.",
        points: [
          "What is owed builds up from the cost of each test billed, and comes down as payments are recorded.",
          "A test sent out prints a <b>dispatch slip</b> that travels with the sample.",
        ],
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    sections: [
      {
        img: "23-settings-company",
        title: "Company details",
        blurb:
          "Set up your shop once: name, address, PAN, and the choices that shape your bills and warnings. This is Owner-only.",
        points: [
          "Your <b>name, address, PAN/DDA</b> and <b>invoice footer</b> print on every bill.",
          "Choose the <b>near-expiry window</b> and whether to <b>round</b> the grand total.",
          "Choose the <b>calendar for dates</b>: Nepali (BS) or English (AD). Every date box opens in it, and each box can still switch for a single pick.",
          "Turn on a warning if a rate is ever set <b>below what you paid</b>.",
        ],
      },
      {
        img: "24-settings-users",
        title: "Users",
        blurb: "Add the people who work the shop and decide what each can do.",
        points: [
          "Give each person a login and a role: <b>Owner</b> (sees everything) or <b>Counter staff</b> (billing and stock).",
          "Decide who is allowed to <b>edit the rate</b> on a bill.",
          "A quick <b>PIN</b> lets staff switch users at a shared counter without a full sign-out.",
          "Turn a user <b>off</b> when they leave — their past bills stay intact.",
        ],
      },
      {
        img: "26-settings-backup",
        title: "Backup &amp; restore",
        blurb:
          "Your shop's whole record can be saved to a file and, if ever needed, put back exactly as it was.",
        points: [
          "<b>Back up now</b> downloads a file with everything in it. Keep it somewhere other than this computer.",
          "<b>Automatic backups</b> need private storage, connected once by whoever set up ClinicNP. Then a full copy is saved every night and the last 30 are kept, every Back up now is kept there too, and a green note on this screen says so.",
          "Until then an orange note says automatic backups are <b>off</b>, and the files you download are the only backups. Back up at least once a week, and before anything big.",
          "Each kept copy has a <b>Download</b> button. <i>Downloaded only</i> means the only copy is the file that was downloaded. <i>Not kept</i> marks a nightly backup from before copies were kept, when only its size was written down.",
          "Closing the year saves a copy first. Without private storage it asks you to download one first, and will not close until you have.",
          "<b>Restore</b> replaces everything with a backup file. It asks you to type a confirmation first, and it's all-or-nothing — it can never leave your data half-changed.",
        ],
      },
      {
        img: "27-settings-audit",
        title: "Activity log",
        blurb:
          "A plain record of the important things that happened — cancelled bills, write-offs, restores — and who did them.",
        points: [
          "Use it to answer 'who did this, and when?' without guesswork.",
          "You can look but not edit — that's what makes it trustworthy.",
        ],
      },
    ],
  },
];

// ---- HTML assembly -----------------------------------------------------------
const GREEN = "#20342a";
const GREEN2 = "#35553f";
// The accent. Design.md retired the Faarma orange (#e87e28) at the rename and
// says it never comes back; this document was still printing it on its cover.
const ACCENT = "#b02a6e"; // magenta-600, the sanctioned accent
const CREAM = "#faf6eb";
const LINE = "#e3dbc6";

let toc = "";
let body = "";
let n = 0;
// Chapters are numbered by their position, not by a number typed into each
// title. Inserting a chapter in the middle used to leave two chapter sixes.
let chapterNo = 0;
for (const ch of CHAPTERS) {
  chapterNo++;
  const heading = `${chapterNo} · ${ch.title}`;
  body += `<section class="chapter"><h2 id="${ch.id}">${heading}</h2>`;
  for (const s of ch.sections) {
    n++;
    toc += `<li><span class="toc-n">${String(n).padStart(2, "0")}</span> ${s.title}<span class="toc-ch">${ch.title}</span></li>`;
    body += `
      <article class="shot">
        <h3>${s.title}</h3>
        <p class="blurb">${s.blurb}</p>
        <figure><img src="${shot(s.img)}" alt="${s.title}"/></figure>
        <ul class="points">${s.points.map((p) => `<li>${p}</li>`).join("")}</ul>
      </article>`;
  }
  body += `</section>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ClinicNP — User Guide</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0; color: ${GREEN}; background: #fff;
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 12.5px; line-height: 1.5;
  }
  .wrap { max-width: 900px; margin: 0 auto; padding: 0 24px 60px; }

  /* Cover */
  .cover {
    min-height: 90vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center;
    page-break-after: always;
  }
  .cover img { width: 260px; max-width: 60%; margin-bottom: 28px; }
  .cover h1 { font-size: 40px; margin: 0; letter-spacing: -0.5px; }
  .cover .sub { color: ${GREEN2}; font-size: 16px; margin-top: 8px; }
  .cover .meta { margin-top: 40px; color: ${GREEN2}; font-size: 12px; }
  .cover .rule { width: 64px; height: 4px; background: ${ACCENT}; border-radius: 999px; margin: 24px auto 0; }

  /* Intro + TOC */
  .card {
    background: ${CREAM}; border: 1px solid ${LINE}; border-radius: 12px;
    padding: 20px 24px; margin: 22px 0;
  }
  .card h2 { margin-top: 0; }
  .lede { font-size: 14px; }
  .concepts { list-style: none; padding: 0; margin: 12px 0 0; }
  .concepts li { padding: 8px 0; border-top: 1px solid ${LINE}; }
  .concepts li:first-child { border-top: 0; }
  .concepts b { color: ${ACCENT}; }

  ol.toc { list-style: none; padding: 0; margin: 0; counter-reset: none; }
  ol.toc li {
    display: flex; align-items: baseline; gap: 10px;
    padding: 6px 0; border-bottom: 1px dotted ${LINE};
  }
  .toc-n { color: ${ACCENT}; font-weight: 700; font-variant-numeric: tabular-nums; }
  .toc-ch { margin-left: auto; color: ${GREEN2}; font-size: 11px; opacity: .8; }

  h2 {
    font-size: 22px; margin: 40px 0 4px; padding-bottom: 8px;
    border-bottom: 2px solid ${GREEN}; page-break-after: avoid;
  }
  .chapter { page-break-before: always; }

  .shot { page-break-inside: avoid; margin: 26px 0; }
  .shot h3 { font-size: 16px; margin: 0 0 4px; color: ${GREEN}; }
  .shot h3::before {
    content: ""; display: inline-block; width: 8px; height: 8px;
    background: ${ACCENT}; border-radius: 2px; margin-right: 8px; vertical-align: middle;
  }
  .blurb { margin: 0 0 12px; color: #2c3b32; }
  figure { margin: 0 0 12px; }
  figure img {
    width: 100%; height: auto; display: block;
    border: 1px solid ${LINE}; border-radius: 10px;
    box-shadow: 0 1px 2px rgba(22,36,27,.08), 0 6px 18px rgba(22,36,27,.06);
  }
  ul.points { margin: 0; padding-left: 0; list-style: none; }
  ul.points li {
    position: relative; padding: 5px 0 5px 22px;
  }
  ul.points li::before {
    content: ""; position: absolute; left: 4px; top: 11px;
    width: 6px; height: 6px; background: ${GREEN2}; border-radius: 999px;
  }
  ul.points b { color: ${GREEN}; }
  .foot { margin-top: 40px; text-align: center; color: ${GREEN2}; font-size: 11px; }
  a { color: ${GREEN}; }
  @media screen {
    body { background: #ece7d8; }
    .wrap { background: #fff; box-shadow: 0 4px 30px rgba(0,0,0,.1); margin-top: 24px; margin-bottom: 24px; }
    .printhint {
      position: sticky; top: 0; z-index: 10; background: ${GREEN}; color: ${CREAM};
      text-align: center; padding: 10px; font-size: 12.5px;
    }
    .printhint b { color: ${ACCENT}; }
  }
  @media print { .printhint { display: none; } }
</style>
</head>
<body>
<div class="printhint">To save as PDF: press <b>Ctrl/Cmd + P</b> → Destination <b>Save as PDF</b> → Save. (This bar won't be printed.)</div>
<div class="wrap">

  <div class="cover">
    ${COVER_MARK}
    <h1>User Guide</h1>
    <div class="sub">Clinic and pharmacy, on one counter</div>
    <div class="rule"></div>
    <div class="meta">A walk through every screen · For shop owners and counter staff</div>
  </div>

  <div class="card">
    <h2>Welcome to ClinicNP</h2>
    <p class="lede">ClinicNP runs your counter, your stock room and your patient records from one place — billing medicines and services on a single invoice, tracking every batch, following a sample out to the laboratory and back, and turning the day's work into clear numbers. This guide walks through each screen with a real picture and plain steps. No jargon.</p>
    <ul class="concepts">
      <li><b>Nepali dates.</b> Every date is in Bikram Sambat, the way you already work.</li>
      <li><b>Sells the oldest first.</b> ClinicNP always picks the nearest-to-expiry batch, and never sells an expired one.</li>
      <li><b>Works offline.</b> Keep billing with no internet; bills send themselves when you're back online.</li>
      <li><b>One bill.</b> Medicines and services go on the same invoice, printed on A4 under your own letterhead.</li>
      <li><b>Roles.</b> Owners see everything; counter staff see billing and stock. Set this up in Settings → Users.</li>
      <li><b>Your own login.</b> The owner creates an account for each person under Settings → Users. Ask them for yours — never share one, because the shop's record of who did what depends on it.</li>
    </ul>
  </div>

  <div class="card">
    <h2>What's inside</h2>
    <ol class="toc">${toc}</ol>
  </div>

  ${body}

  <div class="foot">ClinicNP · User Guide · Generated ${new Date().toISOString().slice(0, 10)}</div>
</div>
</body>
</html>`;

const out = join(GUIDE, "ClinicNP-User-Guide.html");
writeFileSync(out, html, "utf8");
console.log("guide written →", out, `(${(html.length / 1024 / 1024).toFixed(1)} MB)`);
