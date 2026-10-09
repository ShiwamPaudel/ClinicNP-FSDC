# PRD.md — ClinicNP
### Clinic & Pharmacy Management System for Nepali polyclinics and retail pharmacies

| | |
|---|---|
| **Product name** | **ClinicNP** |
| **Version** | 2.0 (supersedes Faarma v1.0 / AushadhiPOS 1.0 — both names retired as product names) |
| **Document status** | Final — build-ready |
| **First installation** | **Family Smile Dental Care Center** |
| **Target market** | Nepali clinics (OPD + diagnostics), pharmacies attached to clinics, and standalone retail pharmacies |
| **Platform** | Web application / installable PWA (desktop-first for the counter, mobile-friendly for owner review) |
| **Modules** | **Pharmacy** (shipped, feature-complete as Faarma v1) and **Clinic** (new). Each toggled independently in Settings. |

> **Naming note (applies to every document and every string in the codebase):**
> The product is **ClinicNP**. **AushadhiPOS is retired** — the name must not appear anywhere in code, docs, assets, seed data, or IndexedDB store names. **Faarma** survives only as the *display name for a pharmacy-only install* (see §3.3) and as history in Memory.md. Nothing new is named Faarma.

---

## 1. Product Vision

Nepali clinics and pharmacies run on the same counter and the same problem: a queue of people, a paper register, and software that was written for a supermarket. ClinicNP is one system with two halves that share one counter, one invoice series, one patient, and one set of books.

- **Pharmacy** — medicines sold by the tablet, strip or box; batch and expiry decide whether stock is an asset or a write-off; FEFO; Bikram Sambat; PAN on every invoice; billing that survives a dead internet connection. *(Built and proven. v2 adds fiscal-year history and reasoned stock-out.)*
- **Clinic** — the patient exists here, unlike the pharmacy. Register them once, keep their visits, bill their consultation, their ultrasound, their ECG, their lab tests. Store the report that comes back from the outside lab so it can be found again in two years.

The promises the product is judged on:

1. **A bill leaves the counter in under 10 seconds, from the keyboard, online or offline** — medicines, services, or both on one invoice.
2. **A patient who walked in eighteen months ago can be found in under 5 seconds**, with every visit, bill and report attached.
3. **Nothing is lost** — not a bill during a power cut, not a report card, not last year's books.

---

## 2. Target Users & Personas

### 2.1 Persona A — Front desk / counter ("Anita")
Registers patients, collects money, hands out slips, answers "how much for an ultrasound?" fifty times a day. Types fast, hates the mouse, is interrupted mid-task constantly.
Needs: one search box that finds a patient *or* a medicine *or* a service; keyboard-only billing; hold-and-resume; instant printing; a patient's history one keystroke away.
Does not care about: modules, sync, settings.

### 2.2 Persona B — Pharmacist / counter staff ("Bikash")
Unchanged from v1. Sells by strip and tablet, negotiates a rate, needs the expiry warning before the sale, not after.

### 2.3 Persona C — Owner / Admin ("Dr. Sarita")
Owns the clinic, may also consult. Checks the day's collection from her phone at night. Wants to know what the ultrasound machine earned this month, what the lab partner owes or is owed, which medicines are dying on the shelf, and what she pays the visiting cardiologist.
Configures: services and rates, doctors, lab partners, users, company details, modules, fiscal years.

### 2.4 Persona D — The doctor (light user)
Sees a patient list for the day. Reads the patient's past visits and attached reports on screen. Writes complaint / findings / advice as free text if they choose to — most will keep writing on paper, and the system must not punish that.
**Not** an EMR user: no structured clinical coding, no prescriptions module, no e-signing in v2.

### 2.5 Persona E — Accountant (external, monthly)
Sales register, purchase register, VAT summaries, party ledgers, doctor payouts, lab-partner statements — all exportable to Excel, all filterable by BS date range and by fiscal year, including **closed** years.

### 2.6 Explicit non-users
- **The pharmacy walk-in customer.** Still no customer profile, no loyalty, no marketing. A pharmacy-only bill carries an optional free-text name and nothing else.
- **The outside laboratory's technologist.** ClinicNP does not produce lab results. See §6.

---

## 3. Core Principles (apply to every screen)

1. **User-facing language only.** No backend vocabulary anywhere a user can see it. (Full banned list: Rules.md §1.)
2. **Keyboard-first counter.** Every counter action reachable without a mouse; `?` opens the shortcut sheet.
3. **FEFO by default; expired stock is unsellable.** No override, ever.
4. **Bikram Sambat everywhere.** Fiscal year Shrawan 1 → Ashadh end. Past fiscal years stay readable forever.
5. **Offline never loses a bill** — and now, never loses a patient registration either.
6. **One patient, one number, one history.** A patient registered at the clinic is the same person at the pharmacy counter.
7. **Modules are a boundary, not a coat of paint.** A disabled module's screens, reports, API routes and nav are gone — server-enforced, not just hidden.

### 3.1 The module toggle (Settings → Modules, Admin only)

| Toggle | Default | Effect |
|---|---|---|
| **Pharmacy** | On | Medicine lines at the counter, selling prices, shelves and shop layout, profit and fast/slow-moving reports |
| **Clinic** | Off (On for Family Smile Dental Care Center) | Patients, visits, services, doctors, lab partners, attachments, service lines at the counter, clinic reports |
| *Supplies* — not a toggle | On with **either** module | Items, purchases, purchase returns, suppliers, supplier payables, purchase register. A clinic buys its materials on credit and pays in parts exactly as a pharmacy does (C-034). With Pharmacy off the menu calls it **Supplies**, and what is bought is for the clinic's own use — see §4F. **Stock** (opening, stock out, expiry, low stock, value) stays with the Pharmacy (C-035). |

- At least one module must stay on. Turning the last one off is refused with: *"At least one part of the system has to stay switched on."*
- Turning a module **off never deletes data.** It hides the module and blocks its routes. Turning it back on restores everything exactly as it was.
- **Both on** = the interesting case: one counter, one invoice that can carry medicines and services together, one dashboard, one set of books.

### 3.2 What the clinic module adds — scope, stated plainly
- Patient records and their visit history.
- Billing for **services**: OPD consultation, follow-up, ultrasound, X-ray, ECG, ECHO, skin analysis, procedures, and **laboratory tests**.
- **Laboratory is billing only.** The clinic has no lab. Samples go to an outside laboratory; the report comes back from that laboratory on paper or PDF. ClinicNP bills the test and **stores the report file it receives**. It does not enter results, produce reports, define reference ranges, or track sample status beyond "dispatched".
- Ultrasound / X-ray / ECG / ECHO / skin analysis likewise: ClinicNP bills them and **stores whatever image or report file the clinic wants to keep** against the visit, for future reference.

### 3.3 Product naming rule (derived, not a setting)
`strings.appName` is derived from the enabled modules — no extra toggle:
- Clinic on → **ClinicNP**
- Clinic off, Pharmacy on → **Faarma**

Logo, PWA name and print header follow the same derivation. This lets one codebase serve a pharmacy-only sale without a second build.

---

## 4. Feature Requirements

## 4A — PHARMACY MODULE

Everything in Faarma v1 carries forward unchanged unless listed below: keyboard POS, unit hierarchy (Box → Strip → Tablet) with per-level rates, pictorial unit picker driven by item shape, FEFO with per-line batch override, editable rate with magenta override dot, hard block on overselling, held bills, offline outbox, thermal + A5 print, item master, purchases and purchase returns, suppliers and party ledgers, stock/low/near-expiry/expired screens, sales returns, bill register, dashboard, reports, xlsx export, CBMS queue, backup/restore, PWA.

### 4A.1 Fiscal years — past years stay open for reading *(new)*

**Problem being solved:** at year end, the books close, the invoice series restarts at 1, and last year becomes unreachable. It must not.

- `fiscal_years` gains `status`: **open** (exactly one at a time — the *current* year) or **closed**.
- **Fiscal-year selector** in the header of every register, report and dashboard (Admin and Accountant; hidden for counter staff). Default = current open year.
- Viewing a closed year shows a persistent, calm banner: *"You're looking at 2082/83. This year is closed — you can read and print, but not change anything."* All create/edit/cancel/settle actions are disabled in that context.
- **Year-end rollover** (Settings → Fiscal years → *Close year and start 2084/85*), Admin only, guided:
  1. Refuses to run while any bill is still waiting to be sent (outbox or CBMS queue) — names the count in plain words.
  2. Makes sure there is a way back first (D-140). With private storage connected it keeps a backup there, shows its name, and does not close if the backup cannot be saved. Without it, it asks for a backup downloaded within the last day (a link is in the dialog) and refuses until there is one.
  3. Creates the next fiscal year, sets it open, resets invoice / return / purchase sequences to 1.
  4. Marks the previous year closed, stamped with who did it and when.
  5. Writes an audit entry. Cannot be undone from the interface.
- **Stock, suppliers, patients and services do not reset.** Inventory is perpetual; batches, balances and patient histories cross the year boundary untouched. Only the numbering series and the reporting boundary reset.
- **Corrections to a closed year** are never back-dated. A refund or return for a bill from a closed year is recorded in the **open** year, referencing the old invoice number, and prints that reference. The report for the closed year therefore never changes after closing — which is the entire point.
- Reports accept a fiscal-year filter *and* a BS date range; a range crossing a year boundary is allowed for reading (with both years labelled) but export files name every year they contain.

### 4A.2 Stock out with a reason *(new)*

**Problem being solved:** stock leaves the shelf for reasons other than a sale, and v1 only handled expired stock.

New screen: **Stock → Stock out** (Admin only; Staff can view the register, not create).

- Pick item → the batch list opens (FEFO order, expired batches included and clearly marked) → quantity in any unit → **reason** → optional note → save.
- **Reasons** (fixed list; no free-form reason codes, no settings sprawl):

| Reason | Notes |
|---|---|
| Returned to supplier | Creates a purchase return against that supplier: stock down, supplier ledger credited. Supplier is required. |
| Expired — disposed | The v1 write-off path, now one of the family. |
| Damaged / breakage | |
| Lost or missing | |
| Used in the clinic | Only when the Clinic module is on. Optionally tagged to a visit — a dressing used in a procedure. Value lands in the clinic's consumable-cost figure, not in sales. |
| Given as sample | |
| Stock count correction | The only reason allowed to move stock **up** as well as down. Requires a note. |

- Every stock-out writes one `stock_moves` row per batch with its reason, is audit-logged with the user, and can print a **Stock-out note** (80 mm or A5) for the supplier or the file.
- New report: **Stock-out register** — date range, reason filter, quantity and cost value per reason, with an export. The number the owner actually wants: *"what did I lose this year, and to what?"*
- Bulk stock-out (multiple items in one entry) is supported: one header, many lines, one printed note.

### 4A.3 Pharmacy-side changes when the Clinic module is on
- The bill's free-text patient name is replaced by a **patient picker** (`P`): search an existing patient or register one inline. Free-text remains available for the true walk-in.
- Item search results and the bill line show a small sage **Medicine** tag, so a mixed bill reads clearly.
- "Used in the clinic" stock-out can be attached to a visit.

## 4B — CLINIC MODULE *(new)*

### 4B.1 Patients

**Registration** (front desk, ≤ 20 seconds):

| Field | Required | Notes |
|---|---|---|
| Patient number | auto | `P-000123` — lifetime, sequential, never reused, never reset at year end. Assigned server-side. |
| Name | ✔ | |
| Sex | ✔ | Female / Male / Other |
| Age | ✔ | Entered as a number + unit (Years / Months / Days) — how Nepali clinics actually record it. Date of birth is an optional second field; when present, age is computed and always current. When absent, the stored age carries its "as on" BS date and the display shows the age as of that date, never a wrong current age. |
| Phone | ✔ | Used for lookup; duplicate-phone warning on registration (soft, not a block — households share numbers). |
| Address | ✔ | District + municipality/ward + tole, free text. |
| Guardian / attendant name | ✖ | |
| Blood group | ✖ | |
| Note / known allergy | ✖ | Free text, shown as a red strip on the patient card when filled. |
| Referred by | ✖ | Free text (a doctor, a health post, "self"). |

- **Duplicate guard:** on save, if name + phone or name + age + address closely match an existing patient, the system offers the match first: *"Is this the same person?"* with the existing patient's last visit date. Merging two patients is Admin-only, audit-logged, and moves visits, bills and files to the kept record.
- **Search** by name (partial), phone, or patient number — under 100 ms against the local cache, same as item search.
- **The patient card** is the one screen the clinic will live in: identity strip, allergy strip, quick actions (New bill — which opens the counter with the patient on the bill — Edit, Merge, Add file), a **history table** laid out like the clinic's paper card — *Date · Treatment notes · Service charge · Payment · Due / Advance*, oldest first, one line per bill, later payment, refund or visit, with the running balance (C-034) — and the patient's files. **Rows are added in the table** (C-036): date, doctor, the doctor's treatment notes, and optionally services with what was paid (in full, in part, or on credit, cash or QR). The notes become a visit; a charge becomes an ordinary numbered bill dated today, made by the same code as the counter's, so VAT, dues, doctor shares and laboratory costs are unchanged. A row with a charge cannot be back-dated. Notes on any row with a visit can be edited in place. Only people who can bill (Admin, Staff) add rows; rates are editable only by those allowed to change rates; follow-up rates are left to the counter.
- Patient data is **never** used for marketing. No bulk export of patient contact lists exists in the product (Admin data export exists for backup and is audit-logged).

### 4B.2 Visits

A **visit** is one encounter on one BS date.

- Created from the patient card, from the counter while billing, or from Visits → New.
- Fields: patient, BS date and time, **type** (New / Follow-up / Review of report), department or service group, **doctor** (from the Doctors list; optional for a pure-diagnostic visit like a walk-in ECG), complaint (free text), optional vitals row (BP, pulse, temperature, weight, SpO₂ — all optional, no charting, no graphs), findings/advice free text, and status (Waiting / Seen / Closed).
- **Visit number**: `V-2083/84-000456`, per fiscal year.
- **Today's list**: the front desk's home screen when the clinic module is on — everyone registered today, their doctor, their status, whether their bill is paid, one keystroke to their card.
- **Follow-up rule** (per service, configured by Admin): a consultation may include a free follow-up within *N* days, or a reduced follow-up rate. When the front desk bills a follow-up for a patient whose last consultation with the same doctor is inside the window, the system applies the rule automatically and says so on the line: *"Follow-up within 7 days — no charge."* It can be overridden per bill, and the override is stamped and logged like a rate override.
- Visits are never deleted. A visit created by mistake is **cancelled** with a reason, stays visible to Admin, and is excluded from counts.

### 4B.3 Services — the admin-configured catalog

Everything the clinic bills that is not a medicine is a **service**. All of it is configured under **Settings → Services** by the Admin — nothing is hard-coded.

**Service groups** (seeded, and the Admin can add/rename/reorder more):
`OPD Consultation` · `Follow-up` · `Laboratory` · `Ultrasound` · `X-Ray` · `ECG` · `ECHO` · `Skin Analysis` · `Procedure / Dressing` · `Other`

**Each service stores:**

| Field | Notes |
|---|---|
| Name | e.g. "USG — Abdomen and Pelvis" |
| Short code | optional, for fast keyboard search ("usgap") |
| Group | from the list above |
| Rate | integer paisa, editable at billing time like a medicine rate (magenta override dot, audit-logged) |
| Doctor required | if on, the bill line demands a doctor before saving |
| Default doctor | optional |
| Sent to an outside lab | if on, the line requires a **lab partner** and carries the partner's cost |
| Partner cost | what the clinic pays the outside lab per test — drives the margin report and the partner ledger |
| Keeps a file | if on, the visit expects a report/image to be attached later; unattached ones show in a "Files pending" list |
| Follow-up window | days of free/reduced follow-up (consultations only) |
| Follow-up rate | 0 = free |
| VAT applicable | per-service flag, only meaningful when the company VAT toggle is on. **Ticked by default** — a VAT-registered clinic charges VAT on its services and an exempt one is the exception, marked *No VAT* in the list (C-034) |
| Active | inactive services disappear from search, stay in history |

**Doctors** (Settings → Doctors): name, qualification as printed, specialty, NMC number, contact, **share basis** (none / percentage of consultation / fixed amount per consultation / percentage of listed services), share value, active. Drives the doctor payout report. A doctor is not a login — a doctor who also uses the system gets a normal user account separately.

**Lab partners** (Settings → Lab partners): name, PAN, phone, address, contact person, settlement terms. Each carries a **ledger** exactly like a supplier ledger: tests sent (at partner cost), payments made, running balance.

### 4B.4 Clinic billing

Clinic billing runs on the same counter, the same bill and the same invoice series as the pharmacy.

- **One search box.** With both modules on, typing searches medicines *and* services at once; results carry a sage **Medicine** or navy **Service** tag. `F3` narrows the search to one kind when the queue is long.
- A bill may hold **medicine lines and service lines together** — the reality at a clinic counter, where a patient pays for a consultation and the prescription in one go.
- Service lines have no batch, no expiry, no unit hierarchy: quantity (usually 1, but 2 films or 3 dressings happens), rate, discount, doctor, lab partner where applicable.
- **Patient is required** on any bill containing a service line. Medicine-only bills may stay anonymous.
- **Visit linkage:** if the patient has an open visit today, service lines attach to it automatically; if not, the system offers to open one — *"Start a visit for Anita Shrestha today?"* — and does it in one keystroke.
- Payment methods, tendered/change, discounts, held bills, offline outbox, cancel and reprint: identical to pharmacy behaviour.
- **Refunds** for services use the existing sales-return path, renamed on screen to **Refund** for service lines (nothing goes back to stock; the money and the reports adjust; a refund note prints).

### 4B.5 Printed output *(clinic)*

| Document | Size | Content |
|---|---|---|
| **Invoice** | 80 mm / A5 | Clinic name, address, phone, **PAN**, DDA no. where applicable; invoice number; BS date and time; **patient number, name, age/sex**; service lines (name, doctor, qty, rate, amount) and medicine lines (name, **batch number, expiry** — mandatory, D-141 — qty+unit, rate, amount) in separate blocks under one set of totals; VAT block when registered; payment, tendered, change; footer message. |
| **OPD slip** | 80 mm / A5 | Patient number, name, age/sex, visit number, BS date, doctor, department, complaint; a large empty area below the rule for the doctor's handwriting; clinic header and phone. This is the piece of paper the patient carries to the doctor's room. |
| **Lab dispatch slip** | 80 mm / A5 | Patient number, name, age/sex, BS date, **partner laboratory name**, tests requested, referring doctor, and a blank sample-collection line. Goes with the sample. Prints only for services flagged "sent to an outside lab". |
| **Refund note** | 80 mm / A5 | Original invoice number and BS date, refunded lines, amount, reason, who authorised. |
| **Stock-out note** | 80 mm / A5 | *(Pharmacy)* items, batches, quantity, reason, note, signature line. |

### 4B.6 Files (reports, images, scans)

- Attach to a **visit**, and optionally to the exact **bill line** that was billed (so an ultrasound report sits under the ultrasound charge).
- Types accepted: PDF, JPG, PNG, WEBP, HEIC. Max 15 MB per file, 10 files per upload.
- Upload from the patient card, the visit, or the "Files pending" list. Phone camera upload works — the front desk photographs the paper report that came back from the lab.
- Each file stores: title (defaults to the service name + BS date), kind (Report / Image / Scan / Other), who uploaded it, when.
- Viewing is inline (PDF and images); download is one tap; **deletion is Admin-only and audit-logged.**
- Files are included in backups.
- Storage is Vercel Blob with private access; files are served only through an authenticated app route. No public URLs, ever.

### 4B.7 Clinic reports

Every report: BS date range with presets, **fiscal-year filter including closed years**, mobile-readable, printable, Excel export.

1. **Day close (extended)** — collection by payment method across both modules, split: medicines / consultation / diagnostics / laboratory; refunds; what was left on dues and what dues were paid back (§4C); expected cash in drawer.
2. **Service revenue** — by group and by service: count, gross, discount, net. *"What did the ultrasound machine earn this month?"*
3. **Doctor-wise** — consultations and services per doctor, revenue, and the calculated share/payout per the doctor's share basis; export is the payout sheet.
4. **Laboratory partner statement** — tests sent per partner, patient billing value, partner cost, margin, payments made, closing balance. Per-partner and consolidated.
5. **Patient visit register** — visits in range: number, patient, age/sex, doctor, type, amount billed. The clinic's daily register replacement.
6. **New vs returning patients** — registrations and repeat-visit counts by month (BS), and the patients who haven't returned in 6 months.
7. **Files pending** — billed services flagged "keeps a file" with nothing attached yet, oldest first.
8. **Diagnostics utilisation** — count per modality (USG / X-Ray / ECG / ECHO / Skin analysis) per BS month, so the owner can see whether the machine is paying for itself.

Pharmacy reports from v1 all remain, plus the new **Stock-out register** (§4A.2).

### 4B.8 Users, roles & access (amended)

| Capability | Admin (Owner) | Staff (Counter) | Accountant *(new, read-only)* |
|---|---|---|---|
| Billing, holds, refunds/returns | ✔ | ✔ | ✖ |
| Rate / service-rate edit on a bill | ✔ | ✔ (Admin can disable per user) | ✖ |
| Register a patient, start a visit, upload a file | ✔ | ✔ | ✖ |
| Edit or merge a patient | ✔ | ✖ (edit own-day registrations only) | ✖ |
| Delete a file | ✔ | ✖ | ✖ |
| Purchases, suppliers, stock out | ✔ | ✖ | ✖ |
| Items, services, doctors, lab partners | ✔ | ✖ | ✖ |
| Financial reports | ✔ | Day close only | ✔ (all, read-only, all fiscal years) |
| Company details, users, modules, fiscal years, backup/restore | ✔ | ✖ | ✖ |
| Cancel a bill | ✔ | ✖ | ✖ |
| Put a bill on dues; receive a dues payment *(§4C)* | ✔ | ✔ | ✖ (sees the Dues list, read-only) |
| Undo a dues payment entered by mistake | ✔ | ✖ | ✖ |

Login by username + password; 4-digit PIN quick-switch on the shared counter device; brute-force lockout as built in v1. Every bill, visit, registration, file and stock-out records who did it.

---

## 4C — DUES *(both modules, added 2083-06-05)*

Family Smile Dental Care Center sometimes hands over medicine, or does a test, and is paid later — all of it, or the part the patient could not pay today. The owner asked for three things: bills sold on dues or part payment, for medicine and services alike; the patient's details on such a bill, exactly as a service bill has them; and a place to track who owes what by name and clear it when the money comes in.

### 4C.1 At the counter
- The payment methods are **Cash · QR · Dues**. Dues replaces the old "Credit" button and covers both cases: nothing paid now, or part paid now.
- Choosing Dues shows **Paying now** (default 0), **Paid by** Cash/QR for that part, and **Left on dues**. Paying the whole total is refused with *"That pays the whole bill. Choose Cash or QR instead."*
- **A bill on dues needs a patient**, attached in the navy patient bar exactly as for a service line (search or register on the spot; `P` opens it). A pharmacy-only install, which has no patients, requires the name typed on the bill instead.
- The printed bill says **Payment: Dues**, then **Paid** and **Balance due** under the total.
- Offline: a bill on dues queues and prints like any other bill.

### 4C.2 Dues (sidebar, beside Bills)
- **Owed**: everyone who owes, grouped by person (registered patient; else the typed name; a bill with no name stands alone), biggest debt first. Each person shows number, phone, bill count, amount owed and the age of the oldest bill; opens to list the bills behind it, and **under each bill every payment against it — date, time, amount, how, and who took it**, starting with what was paid at the counter (C-034). Search by name, phone or patient number.
- **Receive payment**: the amount starts at everything owed; a smaller amount clears the **oldest bill first**, and the split is shown before saving. More than is owed is refused. Cash or QR, with an optional note.
- **Paid back**: every payment, newest first, with its date and time, shown once however many bills it cleared. The owner can **Undo** a payment entered by mistake; it stays listed, marked Undone, and the amount is owed again.
- Money is recorded on the day it arrives, in the year that is open — a debt from a closed year can still be collected, and the closed year does not move (the rule D-060 already set for refunds).

### 4C.3 Elsewhere
- **Bill page**: *Owes Rs X* or *Dues cleared*; paid at billing, paid back since, taken off by returns, still owed; the payments against the bill; Receive payment for that bill alone.
- **Bills register**: status reads *Owes X* or *Dues cleared*.
- **Patient card**: *Owes Rs X on N bills*, linking to their dues.
- **Dashboard**: *Owed to you* when anybody owes anything.
- **Returns** on a bill still owing come off the debt first; only what is left after the debt is cleared is handed back. The return screen says which before saving and the return note prints both.
- **Day close**: Cash and QR count only money actually taken; **Left on dues**; **Dues paid back** in cash and by QR; expected cash = cash taken + dues paid back in cash − money handed back for returns.
- **Cancelling** a bill on dues takes it off the list; if money was already paid back against it, the cancel dialog says to hand it back.

### 4C.4 Not built
No interest, no due dates or reminders, no SMS, no credit limits, no advance/deposit balance (a patient who hands over more is given change), no separate customer accounts on the pharmacy side (§6).

---

## 4D — DATES, PURCHASE DATES AND BACKUPS *(added 2083-06-06)*

### 4D.1 Date boxes in Nepali or English
Medicine packs and supplier bills print expiry in English dates ("EXP 06/2027"); every date box offered only the Nepali calendar, so each one was converted in somebody's head.
- **Settings → Company → Calendar for dates**: Nepali (BS, the default) or English (AD). Every date box in the app opens in that calendar and writes the chosen date in it.
- Inside every box, a small **नेपाली | English** switch flips the grid for that one pick; the next open starts from the setting again. `«` `»` jump a year; under the grid the chosen day is written both ways ("28 Ashwin 2084 = 15 Oct 2027").
- **Only the picking changes.** Every date is still stored, sent, printed and reported in BS. Bills, reports, the day close and the header date stay Nepali (D-137).
- A date of birth on the patient form is not one of these boxes: it is typed, in English, as it always was.

### 4D.2 Manufacture date is optional on a purchase
Many packs and supplier bills do not print one. The purchase line reads **Mfg date (optional)**; batch number and expiry stay required. A manufacture date that is given must be on or before the expiry (D-139). Opening stock already treated it as optional.

### 4D.3 Backups are kept, not just counted
Until 2083-06-06 the nightly "Automatic" backup and the close-year backup wrote a size into a list and kept no file (D-138).
- Backups are kept only in **private** storage, the same store patient files use. With it connected: a full copy every night (the newest 30 kept), a copy of every **Back up now** (the newest 20), and the close-year copy kept for good. Each has a **Download** button that gives the same file Restore takes.
- Without it, Settings → Backup says **Automatic backups are off** in plain words, and nothing pretends otherwise.
- **Back up now** still downloads the file straight away, whatever the storage.

### 4D.6 A purchase entered from a photo of the bill *(added 2083-06-08)*
Typing a distributor's invoice is the longest job on the pharmacy side: ten to fifteen rows, each with a batch number and an expiry that must be right or the stock is wrong. A photo of the bill now fills those boxes in (D-145).

- **Purchases -> New purchase -> Fill from a photo.** Take or pick a photo; the lines below fill themselves; the person reads the paper against the screen, fixes what is wrong, and presses Save as before.
- **It fills, it never saves.** No purchase, batch or stock movement exists until the person presses Save, and every check that guarded the form by hand still guards it.
- **Nothing of the photo is kept** (D-144). It is read on the device and dropped: not uploaded, not attached to the purchase, not backed up.
- **It runs on the device.** PaddleOCR as WebAssembly, the model served by this app. No account, no key, no per-page charge, and nothing leaves the clinic.
- **What it says when it is unsure**, because that is the whole value: a row whose quantity times rate does not come to the printed amount is flagged; a medicine it could not find is left empty with the supplier's own wording beside it; and the net total the lines come to is set against the net total printed on the bill.
- **Handwritten bills are still typed by hand.** Three of Family Smile Dental Care Center's suppliers write theirs out; OCR returns nothing usable from those and the screen says so rather than inventing rows.

### 4D.5 A purchase adds up to the supplier's paper *(added 2083-06-07)*
Real invoices from Family Smile Dental Care Center's distributors take their discount off the **whole bill**, after the lines, and then round the net total to whole rupees: *LESS DISCOUNT 480.61 / ROUNDING 0.43 / NET TOTAL 9,132.00*, *10% Discount*, *Discount 0% + Trade Discount 0% + Taxable Amount + VAT + Net Total*.
- Purchase entry carries the supplier's own block: per-line discounts as before, then **Discount on the bill** (rupees or a percentage) and **Rounding** (which may be a minus figure), then VAT on what is left, then **Net total** (D-143).
- The order is the paper's order: lines → line discounts → discount on the bill → VAT → rounding → net total. The net total is what the supplier is owed, so the ledger and the VAT summary follow it.
- A discount bigger than the bill is refused; rounding is capped at a rupee or two.
- What a batch costs is still the line's own rate: the discount on the bill is recorded against the purchase, not spread across the medicines.

### 4D.4 Batch number and expiry on every medicine line of a bill *(mandatory, added 2083-06-06)*
- Every medicine on a printed bill — at the counter and on a reprint — shows the **batch number** it was sold from and that batch's **expiry**. A medicine taken from two batches prints both, each batch number level with its own expiry.
- There is no bill without them: the counter refuses to save a medicine line whose batch number or expiry it cannot print, and says which medicine (D-141). Batch and expiry are already required when stock comes in (purchase, opening stock), and the server records the batch of every medicine line or refuses the sale.
- The expiry prints as the **English month and year, `MM/YYYY`** — the way the pack prints it, so the two can be read against each other: an expiry of 30 December 2026 prints as `12/2026` (D-142). Every other date on the bill stays Nepali.

---

## 4E — VAT PRICING *(added 2083-06-22, C-034)*

With **VAT registered** on, Settings → Company asks **How rates are priced**:

| Choice | Crown filling at Rs 10,000 | Bill shows |
|---|---|---|
| **Add 13% VAT on top** *(default)* | patient pays **Rs 11,300** | Taxable Rs 10,000 · VAT 13% Rs 1,300 · Total Rs 11,300 |
| **Rates already include VAT** | patient pays **Rs 10,000** | Taxable Rs 8,849.56 · VAT 13% (included) Rs 1,150.44 · Total Rs 10,000 |

- VAT applies to medicines and to every service ticked *VAT applicable*; a bill discount is shared across the bill, so only its VAT-able share lowers the VAT.
- The counter's preview and the saved bill use the same calculation, so they never differ.
- **Each bill records the choice it was made under and its taxable amount.** Changing the setting later never changes how an old bill reads, reprints or is refunded. The VAT report adds up each bill's own taxable amount.
- A refund on a VAT-included bill gives back the amount paid; the VAT inside it goes with it.

## 4G — LEDGERS AS FILES *(added 2083-06-23, C-036)*

**PDF** and **Excel** buttons on: a **supplier's ledger** (Suppliers → a supplier; every purchase, return and payment, with the running balance), a **laboratory's statement** (Reports → Laboratory statements → a laboratory, for the dates chosen, with what was owed at the start and the end), the **Dues** list (everyone who owes, each bill under its person) and **one person's dues** (from their row on Dues, every payment under its bill, with date, time, method and who took it).

- The PDF is A4 with the clinic's name, address, phone and PAN/VAT number, the party's details, the period, the headline figures, the table with a total row, and *Page x of y*. Set in Mukta, so रू and Nepali names print correctly.
- The Excel sheet has the same heading lines, then the table; money is in rupees as numbers, not text.
- Whoever can open the screen can download it, and nobody else: suppliers and laboratories are Admin-only, Dues is everyone but a doctor.

## 4F — PURCHASES FOR THE CLINIC'S OWN USE *(added 2083-06-23, C-035)*

With **Pharmacy off**, nothing the clinic buys is sold — gloves, composite, burs are used in treatment. So a purchase is only **what was bought, from whom, for how much, and what is still owed**.

- **An item is its name and the unit it is bought in** (e.g. *Nitrile gloves (M)*, *Box*). No generic name, shape, selling rate, smaller units or controlled flag.
- **A purchase line is item · unit · qty · cost/unit**, with its amount shown. No batch number, expiry, manufacture date, bonus quantity or selling price. The supplier's invoice number, date, discount on the bill, VAT and rounding are kept as they were.
- **Payables work exactly as before**: paid in full, part paid or on credit when entered; later payments from Payables; the supplier's ledger and the purchase register include every purchase. A **purchase return** (damaged, wrong item, other) lowers what is owed.
- **No stock is counted.** The Stock pages, low-stock, expiry and stock-value reports are Pharmacy-only. The Items list shows **when each item was last bought and at what cost**; an item's page lists every purchase it was on and what has been spent on it.
- Nothing bought can reach the counter: with Pharmacy off the counter sells services only (§3.1).
- Turning Pharmacy on later would make these items sellable stock with no expiry. Do not turn it on for this install without first deciding how to separate the clinic's supplies from medicine for sale.

---

## 5. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Speed | Counter search (medicines + services + patients) < 100 ms from local cache; bill save perceived < 500 ms; first load of the counter < 3 s on 4 Mbps |
| Availability | Counter works with zero connectivity for a full business day: billing, patient lookup **and** new-patient registration; reconciles on reconnect |
| Devices | Desktop/laptop (counter), Android tablet (counter and file upload), phone (owner dashboards, doctor's patient view) |
| Data integrity | Stock never negative; batch allocation atomic; patient numbers and invoice numbers never duplicated or reused, including across offline devices |
| Patient data | Role-gated on the server for every read; files private and served only through an authenticated route; deletions and merges audit-logged; no patient contact export outside backup |
| Localization | English UI with Nepali labels where natural; BS dates; `रु 1,234.50` |
| Money | Integer paisa throughout; display 2 decimals; optional nearest-rupee rounding on the grand total |
| Security | Passwords and PINs hashed; role + module checked on every server action; CSP; audit log for overrides, cancels, merges, deletions, restores, year closes |
| Printing | 80 mm thermal and A5 through the browser; no drivers |
| Accessibility | Lighthouse a11y ≥ 90 on counter and dashboard; full keyboard operability; visible focus |

---

## 6. Out of Scope (v2) — hold this line

- **Laboratory results, reports, reference ranges, sample tracking, analyser integration.** ClinicNP bills the test and files the report it receives. Lab information management is a different product (Infobytes Nepal's **Nidanyo**); a future export of a dispatch slip to Nidanyo is a nice-to-have, not v2 scope.
- **EMR / EHR**: no structured clinical notes, ICD coding, prescription printing, drug-interaction checks, or clinical decision support.
- **Appointments and scheduling**, SMS/notification sending, patient portal, telemedicine.
- Customer profiles or loyalty on the pharmacy side (unchanged from v1).
- Insurance, Bipanna/social-security claim processing, government reporting beyond IRD CBMS.
- Multi-branch sync; payment-gateway processing (QR recorded, not processed); barcode label printing; full double-entry accounting.
- In-house lab or radiology equipment interfacing (DICOM, HL7).

---

## 7. Success Metrics

- Median bill time ≤ 10 s (three lines, keyboard only), medicine or service or mixed.
- Patient found and their history open in ≤ 5 s from an empty screen.
- 0 bills and 0 patient registrations lost across connectivity drops.
- 100% of expired-item sale attempts blocked.
- Every billed service that "keeps a file" has a file attached within 7 days ≥ 90% of the time (measures whether the clinic actually adopted the file store).
- Owner answers "what did I collect today and what does the lab owe me?" in ≤ 3 taps on a phone.
- Last fiscal year's sales register is printable at any time, unchanged, after year close.

---

## 8. Open Decisions (tracked, not blocking)

1. **VAT on health services** — *decided by the owner 2083-06-22 (C-034):* Family Smile Dental Care Center is VAT registered and charges VAT on its services; every service is VAT-able unless unticked. Whether rates **include** VAT or have it **added on top** is a setting (Settings → Company → *How rates are priced*). Which services, if any, are exempt should still be confirmed with their accountant. Nothing about Nepali tax treatment is hard-coded beyond `VAT_RATE = 13%`.
2. **Doctor share basis** per doctor at Family Smile Dental Care Center — confirm before the payout report is trusted.
3. Patient number format: `P-000123` flat and lifetime (recommended) vs. fiscal-year prefixed. Confirm at install.
4. Whether the pharmacy counter at Family Smile Dental Care Center is the same physical device as the clinic front desk (affects default counter mode and the PIN switch list).
5. Nepali-numeral display default: off. Grand-total rounding: default off. (Carried from v1.)
6. CBMS activation timing — depends on the clinic's IRD registration.
7. **Invoice photo → purchase entry** — **built** (C-020, §4D.6). Open: whether blank batch and expiry should be allowed on a purchase line for Consumable and Other items *with the pharmacy on*, which is what suppliers who print no batch column would need; today every such line still requires both, so those are typed off the pack. (With the pharmacy off neither is asked for at all — §4F.) Also open: remembering a supplier's own wording for a medicine, so the same name matches by itself next month.
