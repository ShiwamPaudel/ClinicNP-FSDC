# Phases.md — ClinicNP
### Build order: 5 phases. Do not start a phase until the previous phase's acceptance checklist passes.

**Starting state:** the Faarma codebase, v1 feature-complete (all 5 v1 phases done, 68 tests green, not yet deployed to Vercel). ClinicNP continues that repository. Migrations continue from `0006`.

**Target install:** Family Smile Dental Care Center — both modules on.

---

## Phase 1 — Rename, modules, fiscal years, stock out
**Goal: the existing product becomes ClinicNP, gains a clean module boundary, and the two outstanding pharmacy gaps are closed.**

Build:
- **Rename to ClinicNP.** Package name, README, `strings.appName` (derived: clinic on → "ClinicNP", clinic off → "Faarma"), metadata and title template, `manifest.json`, PWA icons, brand assets in `public/brand/`, backup filenames, xlsx creator field, **IndexedDB database name** (with a one-time migration path or a documented "clear and re-sync" note), print headers. Retire the Faarma orange tokens; add the navy `--clinic-*` tokens from Design.md.
- **Module system.** `0006_modules_fy.sql` (`company.module_pharmacy`, `company.module_clinic`, `counters` table). `lib/modules.ts` — `getModules()` (request-cached), `requireModule()`, `ModuleDisabledError`, `<ModuleGate>`. Middleware 404s disabled module prefixes. Retro-fit `requireModule('pharmacy')` onto every existing pharmacy route handler and server action. **Settings → Modules** screen (Admin), with the last-module-on guard.
- **Sidebar regrouping** per Design.md §3 — grouped when both modules are on, flat when one is; collapsed mode preserved.
- **Fiscal years.** `fiscal_years.status/closed_at/closed_by/next_visit_no/next_stockout_no`, partial unique index enforcing one open year. `lib/repos/fiscal.ts` extended. **Settings → Fiscal years** list. **Close-year wizard** (unsent-bill check → auto backup → create next year → reset sequences → close previous → audit). App-wide **fiscal-year selector** (Admin/Accountant) wired into the bill register, purchase register and every report. Read-only mode + `--info-100` banner for closed years. `ClosedFiscalYearError` thrown from repos, mapped to plain language.
- **Accountant role.** Third role (read-only, all reports, all years). Decide table-rebuild vs side-column by reading `0001_init.sql` first; record the choice.
- **Stock out.** `0007_stock_out.sql` (`stock_adjustments`, `stock_adjustment_lines`, widened `stock_moves.reason` — rebuild the table if a CHECK constraint exists). `lib/repos/adjustments.ts`. **Stock → Stock out** entry screen with the reason-tile selector (Design.md §5), multi-line support, batch picker including expired batches, `returned_to_supplier` creating a real purchase return + supplier ledger credit. **Stock-out register** report + xlsx export. **Stock-out note** print component. Existing Expired-list write-off and return-to-supplier actions re-routed through this single path so there is one code path, not two.

Acceptance:
- [ ] `grep -ri "aushadhi"` over the whole repo returns nothing; app title, PWA name and print header all read ClinicNP.
- [ ] Turn Clinic off → clinic nav gone **and** a direct URL to a clinic route returns 404, not a redirect or an error page that names the module.
- [ ] Turn Pharmacy off with Clinic off → refused with the plain-language message; at least one module always remains.
- [ ] Close fiscal year 2082/83 → next year opens, invoice numbering restarts at 1, previous year's sales register still prints identically, and every write action in the closed year is refused with plain language.
- [ ] Attempting a close while a bill is unsent is refused and names the count in words.
- [ ] Stock out 1 strip as "Returned to supplier" → stock down, supplier ledger credited, purchase return visible, `stock_moves` row carries the reason, printed note correct.
- [ ] Stock out with reason "Used in the clinic" is hidden entirely when the Clinic module is off.
- [ ] Stock count correction moves stock **up** and is the only reason that can.
- [ ] Stock-out register totals cost value per reason and matches a hand calculation.
- [ ] `pnpm build` clean, all v1 tests still green plus new tests for `modules` and fiscal-year status.

---

## Phase 2 — Patients, visits, files
**Goal: the clinic's record-keeping exists and is fast. No billing yet.**

Build:
- `0008_clinic_core.sql`: `patients`, `visits`, `attachments` (plus the `bills.patient_id / visit_id / kind` columns, added now so Phase 3 only fills them).
- `lib/patient-no.ts` (+tests, lifetime counter, transactional), `lib/age.ts` (+tests: entry as y/m/d with "as on" date, DOB path, roll-forward display, edge cases at month and year boundaries).
- `lib/repos/patients.ts` — create (transactional number assignment), search (name / phone / number, prefix then fuzzy), detail with timeline, update, deactivate, **merge** (Admin, moves visits/bills/files, retires the number, audit-logged), duplicate detection.
- `lib/repos/visits.ts` — create, today's list, list with filters, detail, update, cancel with reason. Visit numbering from the open fiscal year.
- `lib/repos/attachments.ts` + `lib/files.ts` — MIME allow-list, 15 MB cap, blob key builder, soft delete.
- `/api/files/upload` (server-side blob write, session + role + module checked) and `/api/files/[id]` (authenticated stream, `nosniff`, sandboxed PDF frame). `/api/cron/files-gc` for the 30-day hard delete of soft-deleted files.
- Screens: **Patients** list + search, **Register patient** (6 required fields, inline duplicate warning), **Patient card** with the navy header, allergy strip, quick actions and the visit timeline (Design.md §4.2), **Edit patient**, **Merge patients** (Admin). **Visits**: Today (the front desk home), list, new, detail with the optional vitals row. **Files pending** list. Attachment grid + uploader with drag-drop and phone-camera capture.
- **OPD slip** print component (80 mm + A5), printable from a visit.
- Nav: the Clinic group appears, gated by the module.

Acceptance:
- [ ] Register a patient in ≤ 20 s with the keyboard only; the number is `P-000001`, sequential, and does not change when the fiscal year rolls.
- [ ] Register a second patient with the same name and phone → duplicate warning appears inline with the first patient's last visit date; saving anyway is allowed and both records exist.
- [ ] Merge the two → visits, bills and files all sit under the kept record, the retired number is not reused, and both actions are in the audit log.
- [ ] Search 2,000 seeded patients by partial name and by phone → results under 100 ms.
- [ ] A patient registered with "3 Months" a year ago displays as roughly 1 year 3 months, with the "as on" date visible; a patient with a DOB always displays a live age.
- [ ] Start a visit → it appears on Today with status Waiting; OPD slip prints with patient identity, visit number, BS date, doctor and an empty area for handwriting.
- [ ] Upload a PDF and a phone photo to a visit → both appear in the timeline, open inline, and download.
- [ ] Log out and hit the file URL directly → refused. The blob URL is nowhere in the page source.
- [ ] Delete a file as Admin → gone from the interface, audit-logged, still recoverable in the store for 30 days; Staff cannot see the delete action at all.
- [ ] With the Clinic module off, every screen and route from this phase returns 404.
- [ ] `age`, `patient-no` and a patients/visits integration test are green.

---

## Phase 3 — Services and clinic billing at the counter
**Goal: one counter, one invoice, medicines and services together. The 10-second bill survives.**

Build:
- `0009_services.sql`: `service_groups`, `services`, `doctors`, `lab_partners`, `bill_service_lines`, `sale_return_service_lines`, `lab_partner_payments`.
- Admin catalog screens: **Settings → Services** (groups with sort order; service form with every field from PRD §4B.3), **Settings → Doctors** (share basis + value), **Settings → Lab partners**. Seeded groups: OPD Consultation, Follow-up, Laboratory, Ultrasound, X-Ray, ECG, ECHO, Skin Analysis, Procedure/Dressing, Other — all renameable and extendable by the Admin.
- `lib/clinic-calc.ts` (+tests): follow-up resolution (window, free vs reduced, override), service line totals, per-service VAT, doctor share calculation with integer paisa rounding.
- `lib/bill-calc.ts` widened to take item lines **and** service lines and return one set of totals. Existing item-only behaviour must be byte-identical — assert it with the existing tests unchanged.
- **Counter changes:** unified search across items and services (`F3` narrows scope), Service result rows with group/partner/file glyphs, service line rows with doctor selection, the navy **patient bar** (`P` to attach, inline register), patient-required guard when a service line exists, follow-up notice and its magenta-stamped override, service-rate editing with the override dot.
- Zustand bill store widened: service lines, patient ref, visit ref. Held bills carry them.
- `/api/bills` ingest widened per Architecture §2.5: patient resolution (id / ulid / inline snapshot), visit resolve-or-create, service line insert with `partner_cost_paisa` and doctor-share snapshots, `bills.kind` derivation. Idempotency unchanged and re-tested.
- Catalog snapshot + delta extended with services and service groups; counter cache stores them.
- Print: invoice thermal + A5 gain the patient block and the service block (Design.md §6); **Lab dispatch slip** component, printed for outsourced service lines and stamping `dispatched_at`.
- Strings: the whole clinic counter vocabulary into `lib/strings.ts` with Nepali variants for the core actions.

Acceptance:
- [ ] Three-line **mixed** bill (consultation + USG + one strip of medicine) completed keyboard-only in ≤ 25 keystrokes and ≤ 10 s, with the patient attached.
- [ ] A bill with any service line refuses to save without a patient, in plain language; a medicine-only bill still saves anonymously.
- [ ] The invoice prints the service block above the medicine block, with batch and expiry on the medicine line and the doctor's name on the consultation line, one set of totals, PAN and BS date present, inside 80 mm.
- [ ] Bill a consultation, then bill a follow-up for the same patient and doctor 4 days later with a 7-day window → charged per the rule and labelled on the line; at 9 days → full rate. Overriding stamps the line and writes an audit entry.
- [ ] A lab test service produces a dispatch slip naming the partner laboratory and the tests; `dispatched_at` is stamped.
- [ ] Change a service's rate afterwards → the earlier bill and its reports are unchanged.
- [ ] Kill the network mid-bill → search still instant, mixed bill saves to the outbox, prints with a provisional number; restore → syncs exactly once, final invoice number on reprint, stock decremented once.
- [ ] Service lines never touch stock: `stock_moves` shows nothing for a service-only bill.
- [ ] Counter bundle has not grown past the v1 ceiling by more than 15%.
- [ ] `clinic-calc` tests green, including follow-up boundaries (day 0, day N, day N+1) and every doctor-share basis.

---

## Phase 4 — Clinic back office, ledgers, reports, dashboard
**Goal: the owner and the accountant get their answers, across both modules and every fiscal year.**

Build:
- **Bill register extended:** filters for kind (Medicine / Service / Mixed), patient, doctor, fiscal year; patient number shown; bill detail shows both line blocks; reprint, Admin cancel (number kept, stock restored, services voided).
- **Refunds:** the sales-return path widened to service lines (`sale_return_service_lines`) — nothing returns to stock, money and reports adjust, refund note prints, closed-year originals are refunded into the open year with a reference to the old number.
- **Lab partner ledger** — tests sent at partner cost, payments recorded, running balance, per-partner statement, consolidated view. Payment entry screen.
- **Doctor payouts** — consultations and services per doctor, share calculated from the snapshotted basis, payout sheet export.
- **Dashboard extended:** today's collection split (medicines / consultation / diagnostics / laboratory), patients seen today, new registrations today, low-stock / near-expiry / expired badges, files pending badge, top services this BS month, 30-day trend with a sage series for medicines and a navy series for services. Layout adapts when only one module is on.
- **Reports** — all with BS range presets + fiscal-year filter (including closed years), mobile-readable, printable, xlsx export: Day close (extended), Service revenue, Doctor-wise, Laboratory partner statement, Patient visit register, New vs returning patients, Files pending, Diagnostics utilisation. Plus every v1 pharmacy report and the Phase-1 Stock-out register, all now year-aware.
- **Audit log screen** extended with the new actions (patient edits and merges, file deletions, module toggles, year closes, follow-up overrides).

Acceptance:
- [ ] Sell a mixed bill → refund one service line and return one tablet → stock, day close, service revenue and profit reports all reconcile to a hand calculation.
- [ ] Doctor payout for a doctor on 40% of consultations matches a hand calculation across 10 bills, and does not change when the doctor's share is edited afterwards.
- [ ] Lab partner statement: 12 tests sent, 2 payments made, closing balance correct; margin equals billed value minus partner cost.
- [ ] Day close splits collection four ways and expected cash matches cash bills minus cash refunds.
- [ ] Every report exports to .xlsx that opens clean in Excel, with BS dates as text and the fiscal year named in the file name.
- [ ] Switch the fiscal-year selector to a closed year → every report recomputes for that year and every action is disabled.
- [ ] Owner-on-phone test at 390 px: dashboard, day close and patient search are readable and usable.
- [ ] With Clinic off, the dashboard and reports hub show only pharmacy content and no empty clinic panels.

---

## Phase 5 — Resilience, offline registration, and the Family Smile Dental Care Center install
**Goal: production-ready, deployed, and handed over to a real clinic.**

Build:
- **Offline patient registration**: `patient-outbox.ts`, provisional patient number (`New – <ULID6>`), `/api/patients` idempotent on ULID with transactional number assignment, bill payloads carrying an inline patient snapshot so either outbox can land first (Architecture §2.1 Path B), and an Admin **"Possible duplicate patients"** list for post-sync review.
- **Counter cache** extended with the recent-patients slice (2,000, identity fields only) and its delta sync; cache cleared on logout.
- **Backups** extended: new tables, plus a blob manifest and a dated blob copy job so files are recoverable. Restore covers the new tables in FK-safe order with `PRAGMA defer_foreign_keys=ON`; the confirmation text states that a restore returns the whole system, including fiscal-year status, to the snapshot.
- **CBMS** payload builder extended with the service block; service-only bills queue and transmit like any other; still inert until Admin enables it with real credentials.
- **PWA finish:** offline shell for the counter, catalog + patient delta sync on focus, outbox retry hardening for both queues, poison-record surfacing to Admin in plain language.
- **Concurrency pass:** two devices selling the same last strip; two devices registering the same patient offline; two devices billing the same patient simultaneously.
- **Performance pass:** counter search < 100 ms against 2,000 items + 300 services + 2,000 patients; counter bundle audit; Lighthouse PWA + a11y ≥ 90 on the counter, dashboard and patient card.
- **Final sweep:** banned-vocabulary grep; `aushadhi` grep; empty states everywhere; Nepali labels for core counter actions; contrast verification of every navy pair; `requireModule` coverage check across all routes.
- **The Family Smile Dental Care Center install:**
  - Seed script producing a clearly-sample clinic (sample services with placeholder rates flagged on screen, sample doctors, one sample lab partner, sample medicines) for training — and a separate **empty production bootstrap** that seeds only the company row, the fiscal year and the admin user.
  - Go-live checklist document in `prod-docs/`: company details and PAN entered, VAT decision confirmed with their accountant, services and rates entered and verified by the clinic, doctors and share bases confirmed, lab partner(s) entered, opening stock entered via stock-count-correction adjustments, printer tested on 80 mm and A5, users and PINs created, backup verified by a test restore, module toggles confirmed.
  - Updated **User Guide** (regenerate via the existing capture/build scripts) covering the counter, patients, visits, files, stock out and year close — screenshots captured against a throwaway seeded local database, **never against the clinic's live data**.
  - Deploy to Vercel with all env vars (`AUTH_SECRET`, Turso, Blob, `CRON_SECRET`); confirm crons fire.

Acceptance:
- [ ] Full offline day simulation: 20 bills and 5 new patient registrations offline → reconnect → everything syncs exactly once, invoice numbering continuous, patient numbers sequential, no duplicates.
- [ ] A bill saved offline for a patient registered offline resolves to one patient after sync, regardless of which queue drains first.
- [ ] Two devices register the same person offline → both records land, the duplicate list flags them, and merging cleans it up.
- [ ] Two-device race on the last strip resolves server-side; the discrepancy surfaces for Admin.
- [ ] Take a backup, add patients, bills and files, restore → data and files return exactly to the snapshot; the action is audit-logged.
- [ ] Simulated CBMS endpoint: medicine, service and mixed bills all transmit; retries recover from downtime; with CBMS off nothing transmits but the queue records.
- [ ] Install as a PWA on an Android tablet; register a patient, bill a mixed invoice, and print, all in airplane mode.
- [ ] Lighthouse ≥ 90 (PWA + a11y) on counter, dashboard and patient card; search under 100 ms at full seeded scale.
- [ ] Go-live checklist walked end to end on the real deployment with the clinic's own data.

---

## After Phase 5 — asked for by the clinic

Work since the five phases is recorded session by session in Memory.md. Acceptance for the larger pieces is kept here.

### Dues and part payments (C-015, 0019)
- [x] Cash · QR · **Dues** at the counter; Dues takes *Paying now* (Cash or QR) and shows *Left on dues*; paying the whole total on Dues is refused.
- [x] A bill on dues — medicine, service or both — cannot be saved without a patient (Clinic on) or a typed name (Clinic off); the server refuses it too.
- [x] The printed bill shows *Paid* and *Balance due*.
- [x] **Dues** in the sidebar: owed grouped by person, searchable, opens to the bills; receive a payment that clears the oldest bill first; more than is owed refused; a double press records once.
- [x] *Paid back* history; the owner can undo a payment entered by mistake; staff cannot; a payment in a closed year cannot be undone.
- [x] A debt from a closed year is collected into the open year without touching the closed year.
- [x] A return on a bill still owing comes off the debt first; the screen and the return note say how much was handed back.
- [x] Bill page, register, patient card and dashboard all show what is owed; cancelling takes a bill off the list.
- [x] Day close: cash/QR are money actually taken; left on dues; dues paid back; expected cash reconciles (hand calculation in `tests/dues.integration.test.ts`).
- [x] A credit bill made by pre-0019 code after the migration reads as owed, not paid.
- [x] 390 px: the Dues page and the payment dialog fit without sideways scrolling.
- [ ] **Production has run 0019** and the deploy is live (owner — see Deploy.md).

### Bill discount in rupees or percent (C-015)
- [x] `रू | %` switch on the bill discount; percent is of the bill as it stands and follows it when lines change; over 100% says so; the choice carries to the next bill.
- [x] The discount and tendered boxes clear after every save (they used to keep the last bill's figures).

### Date boxes in Nepali or English (C-016, 0020)
- [x] Settings → Company → *Calendar for dates*: Nepali (default) or English; every date box opens in it and writes the date in it.
- [x] A **नेपाली | English** switch inside every box, for one pick; the next open starts from the setting again.
- [x] A pick from the English grid emits the BS text of that exact day (every day 2020 – 2034 checked in `tests/calendar-view.test.ts`); dates are still stored and printed in BS.
- [x] `«` `»` jump a year; days beyond what the converter covers are disabled instead of failing; Escape and a click elsewhere close the popup.
- [x] 390 px: the open popup stays whole on screen and the page does not scroll sideways.
- [ ] **Production has run 0020** (owner, with 0019 — see Deploy.md).

### Manufacture date optional on a purchase (C-016)
- [x] *Mfg date (optional)*; a purchase saves without one and the batch has no manufacture date.
- [x] A manufacture date after the expiry is refused, on the screen and on the server.
- [x] An optional date box has *Clear*.

### A purchase entered from a photo of the bill (C-020)
- [x] *Fill from a photo* on Purchases → New purchase; it fills boxes and saves nothing.
- [x] Reads on the device (PaddleOCR as WebAssembly), model and runtime served by this app, nothing uploaded and nothing kept.
- [x] Straightens a photographed page first — the angled test photo went from 1 of 12 rows to 12 of 12.
- [x] Flags a row whose arithmetic disagrees, names a medicine it could not match, and sets the lines against the bill's own net total.
- [x] 19 tests pinned to the OCR text the owner's real bills actually produced; 22 checks in a browser against photographed invoices.
- [ ] Watch the first few real bills entered this way, then decide on blank batch/expiry for Consumable and Other items.

### A purchase that adds up to the supplier's paper (C-019, 0021)
- [x] *Discount on the bill* in rupees or percent, and a *Rounding* line that takes a minus figure.
- [x] VAT is charged on what is left after the discount, as the invoices print it.
- [x] The net total stored is the supplier's net total: checked in a browser against a real invoice (1,190.40 − 63.66 + 0.26 = 1,127.00).
- [x] A discount bigger than the bill is refused; purchases recorded before 0021 read unchanged.
- [x] **Production has run 0021** (owner, 2083-06-08).

### Batch number and expiry on every medicine bill (C-017)
- [x] The printed bill has *Batch no.* and *Expiry* columns filled for every medicine line, at the counter and on the reprint, and they agree.
- [x] A medicine from two batches prints both, each batch number level with its own expiry.
- [x] The counter refuses to save a medicine line whose batch number or expiry it cannot print, naming the medicine.
- [x] Covered by `tests/print-batches.test.tsx`, which renders the bill itself.
- [x] Expiry prints as the English month and year, `12/2026` for 30 December 2026 (D-142, C-018).

### Backups kept, not just counted (C-016)
- [x] Nightly, *Back up now* and close-year backups are kept in the private store, gzipped; each can be downloaded as the file Restore takes.
- [x] The newest 30 nightly and 20 manual copies are kept, year-end copies for good; the file goes before the row.
- [x] With no private store: nothing is kept or recorded, and Settings → Backup says *Automatic backups are off*.
- [x] Closing a year keeps its own backup, or without storage requires a download from the last day.
- [x] Downloads are streamed, so a backup past 4.5 MB still downloads.
- [ ] **A private Blob store is connected** and a *Nightly* row with *Download* appears the next morning (owner — see Deploy.md).

---

### Cross-phase rules
- Memory.md is updated at the end of **every** working session, not just phase ends.
- A phase is complete only when Rules.md §7 (Definition of Done) passes — including the module sweep and the vocabulary grep.
- Anything requested mid-phase that belongs to a later phase, or that Rules.md §2 puts out of scope (lab results, EMR, appointments), is written into Memory.md as a request and **not built**.
