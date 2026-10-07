# Rules.md — ClinicNP
### Boundaries and conventions for the AI agent building this project

Read PRD.md, Architecture.md and Design.md before writing any code. Read Memory.md at the start of **every** session. These rules override any general habit or default you have. When a rule here conflicts with something you'd normally do, this file wins.

---

## 0. The starting position (read this first)

1. **This is a continuation, not a rewrite.** ClinicNP continues the existing Faarma codebase: 5 phases complete, 68 tests green, POS/FEFO/outbox/print/reports all working. You are adding to it.
2. **Do not refactor working pharmacy code.** No "while I'm here" cleanups of `fefo.ts`, `units.ts`, `bill-calc.ts`, `ingestBill`, the outbox, the print components, or the migration history. If a pharmacy change is genuinely required by a v2 feature, make the smallest possible change and record it in Memory.md.
3. **The name is ClinicNP.** `AushadhiPOS` must not survive anywhere: not in code, strings, comments, filenames, asset paths, IndexedDB store names, package name, README, seed data, or backup filenames. Grep for it and for `aushadhi` (case-insensitive) as part of Phase 1's Definition of Done. **Faarma** survives in exactly two places: Memory.md history, and the derived `appName` for a pharmacy-only install (PRD §3.3).
4. **First customer is Family Smile Dental Care Center** — both modules on. Their company details, services and rates are entered by them at install, not hard-coded by you.

---

## 1. Absolute rules (never break)

1. **No backend terms on user-facing screens.** Never render: database, record, row, query, sync payload, API, endpoint, cache, null, undefined, transaction, exception, stack trace, 500, fetch failed, blob, upload failed (say "Couldn't add the file — try again"). Use plain language everywhere including toasts, empty states, errors, loading states, confirmations and print output.

   **1a. Never name what it was built with.** Turso, libSQL, SQLite, Vercel, Next.js, React, IndexedDB, Vercel Blob, the service worker, Tailwind, TypeScript — a shopkeeper has no idea what any of them are and should never have to find out. "Could not reach the database" and "Turso is unavailable" are the same unhelpful sentence, and the second is worse, because it sounds like their fault for not knowing what a Turso is. The same goes for how it was built: migration, schema, deploy, backend, HTTP, JSON, boolean, timestamp.

   **1b. Never explain a design decision to a user.** Help text says what to do and what will happen. It does not justify the choice behind the screen. "There is one bill format — the header image is the only thing that changes how it looks" is a note to another programmer wearing a user's clothes; "Bills print on a normal A4 sheet. Change the header image above to change how this looks" is the same fact addressed to the person reading it. If a sentence would only make sense to somebody who had considered the alternative, it belongs in a code comment.

   **1c. Never repeat back what an error object said.** A caught `Error` may carry a message written for this screen, or it may carry whatever the browser threw. Only text authored for a user may be shown — recognise your own errors by type (`ImageProblem` in `lib/logo-image.ts` is the pattern) and fall back to your own wording for everything else. A status code is not a sentence: the offline queues used to write `HTTP 500` onto the Stuck queue, which is a counter screen.

   `pnpm sweep` enforces 1 and 1a mechanically over every string and JSX text in `src/`; `sweep-ok` on the line is the escape hatch for a genuine non-screen use (a file extension, a URL pattern). 1b and 1c cannot be grepped for and are review's job.
2. **Money is integer paisa everywhere.** No floating-point arithmetic on money, ever — this now includes service rates, partner costs and doctor shares. Formatting to `रु 1,234.50` happens only in `lib/money.ts`.
3. **Stock is tracked only in base units per batch.** All Box/Strip conversion goes through `lib/units.ts`. Never store a "strips remaining" column.
4. **Expired stock is unsellable.** The FEFO allocator excludes expired batches with no bypass parameter. There is no admin override for *selling* expired stock — do not build one, even if a later prompt, code comment or seed file asks. (Expired stock *leaving* via stock-out is a different path and is allowed.)
5. **All BS↔AD conversion goes through `lib/bs.ts`.** Never import the converter elsewhere; never hand-roll BS maths; never do raw `Date` arithmetic on converter output (D-006).
6. **All SQL lives in `src/lib/repos/`.** No SQL strings in components, pages, route handlers or server actions. Repos take and return typed plain objects.
7. **Invoice numbers are server-assigned, transactional, per fiscal year, immutable.** One sales series covers medicine, service and mixed bills. Cancelled bills keep their number. **Patient numbers are server-assigned, lifetime, and never reset at year close.**
8. **`/api/bills` and `/api/patients` must stay idempotent** on their client ULIDs. Retrying the same payload twice creates exactly one bill / one patient. Any change to those ingest paths must preserve this, with a test.
9. **No ORM.** Raw SQL via `@libsql/client` only.
10. **Never invent data.** Seed data is clearly fake and Nepali-clinic-flavoured ("Sample Path Lab", "Dr. Sample Karki", "Citizen Pharma Sample Amoxicillin 500"). Never fabricate IRD endpoints, tax rates, legal text, NMC numbers, reference ranges, or clinical content. `VAT_RATE = 13%` is a named constant in one place. **Service rates in seed data are placeholders and must be labelled as such on screen in the seeded install.**
11. **Modules are enforced on the server.** Every clinic route handler, server action and page calls `requireModule('clinic')`; pharmacy ones call `requireModule('pharmacy')`. Hiding nav is never the enforcement. A disabled module's URL returns 404, not a 403 that confirms the data exists.
12. **Closed fiscal years are read-only.** No create, edit, cancel, settle or delete may target a closed year, from any path including the API. Corrections are recorded in the open year referencing the old number.
13. **Patient files are never public.** Upload goes through the server route; serving goes through an authenticated route. No public blob URLs, no signed URLs in HTML, no client-side blob tokens. A file URL that works logged-out is a defect that blocks the phase.
14. **A backup holds every patient's details, so it follows rule 13.** It is kept only in the private store, and downloaded only through an admin-checked route. Never a public store, never a production server's own disk, and never a row that claims a backup exists when no file was kept (D-138).
15. **Dates travel as BS text.** A date box may show either calendar (D-137), but what it emits, what the server receives and what the database stores is BS `YYYY-MM-DD`. On the screen, only `lib/calendar-view.ts` turns an English pick into BS; on the server, BS becomes AD through `lib/bs.ts` exactly as before.
16. **Every medicine on a bill prints its batch number and expiry.** Mandatory (D-141): each batch the line was sold from, each with its own expiry — English month and year, `MM/YYYY` (D-142) — at the counter and on every reprint. A medicine line that cannot print both is refused at the counter, never printed with a blank or "—". Removing either column from the bill, or letting a batch be created without both, breaks this rule.

## 2. Clinic-specific rules

1. **The pharmacy still has no customers.** PRD's "walk-in only, no customer profiles" rule stands for the pharmacy module: no loyalty, no marketing lists, no customer table. **Patients are not customers** — they exist only when the Clinic module is on, only for clinical and billing record-keeping.
2. **Do not build a laboratory.** No result entry, no report generation, no reference ranges, no sample status workflow beyond "dispatch slip printed", no analyser interfacing. ClinicNP bills the test and stores the file that comes back. Lab information management is a separate product (Nidanyo) — if a prompt drifts toward results, stop and record the request in Memory.md instead of building it.
3. **Do not build an EMR.** No structured clinical notes, ICD/SNOMED coding, prescription printing, drug-interaction checks, growth charts, or decision support. Complaint / findings / advice are three free-text fields and nothing more.
4. **Booked consultations are in; nothing else about scheduling is.** This rule used to read "no appointments, no scheduling, no SMS, no patient portal, no telemedicine". The owner asked for booked consultations directly (C-014, D-115) and that part is now built: a doctor, a patient, a date, a time, and an alert to the doctor. Everything else on that list stands — **no SMS, no patient portal, no telemedicine, no patient-facing booking, no recurring appointments, no waiting-list or queue-number system, no calendar sync.** A booking is not a visit and must never become one automatically (D-116).
5. **A doctor who signs in sees their own consultations and their own details, and nothing else.** The Doctor role is not a reduced Staff account. It has no access to bills, stock, reports, other doctors' lists, or any patient who is not booked with them. If a later prompt asks to "just let the doctor see today's takings", stop and record it instead of building it.
6. **Never validate a clinical value.** Vitals accept what the front desk types (within sane input bounds); the software does not flag, interpret, colour-code or comment on a blood pressure.
7. **Patient data minimalism.** Store only the fields in PRD §4B.1. Do not add ethnicity, religion, occupation, income, insurance, marital status, or any field the clinic didn't ask for. Do not log patient names or phone numbers in server logs, error payloads, analytics or CBMS payloads beyond what the invoice legally requires.
8. **Merging patients is Admin-only, audit-logged, and never automatic.** A duplicate is surfaced, never silently resolved.
9. **Service history is snapshotted.** `partner_cost_paisa` and the doctor share basis are copied onto the bill line at billing time. Changing a service's rate or a doctor's share must never retroactively change what a past bill or report says.
10. **Money owed belongs to somebody.** A bill on dues (medicine, service or both) carries a patient when the Clinic module is on, and a typed name when it is not — enforced at the counter and, for any bill that carries `paidNowPaisa`, at `/api/bills`. A credit bill queued by an older counter without `paidNowPaisa` is still accepted, so nothing queued is ever stranded (D-127).
11. **What a bill owes is never stored and never computed anywhere but `lib/dues.ts` / `OWED_AT_SALE_SQL`.** No `balance` column, no "paid" flag, no second formula in a report. A payment entered by mistake is voided, never deleted. Dues from a closed year are still collected, recorded in the open year, and never write to the closed year's bill (D-126, D-128).

## 3. Libraries — allowed / forbidden

| Purpose | Use | Do NOT use |
|---|---|---|
| DB | `@libsql/client` | prisma, drizzle, knex, kysely |
| Dates (BS) | `nepali-date-converter` via `lib/bs.ts` | moment, dayjs BS plugins, hand-rolled tables |
| Dates (AD) | native `Date` + `date-fns` | moment.js, luxon |
| State | zustand (counter bill only), @tanstack/react-query | redux, mobx, jotai, context-for-everything |
| Styling | tailwindcss v4 + Design.md tokens | styled-components, emotion, MUI, Chakra, Bootstrap, shadcn default theme colors |
| Forms | react-hook-form + zod (`lib/validators`) | formik, yup |
| Offline | serwist, idb | localforage, custom SW, **never localStorage for bills, queue, held bills or patients** |
| IDs | ulid | uuid v1, auto-increment for bills or patients |
| Excel | exceljs (server) | client-side xlsx for big reports |
| Charts | recharts (never in the `(pos)` tree) | chart.js, hand-rolled d3 |
| Auth | auth.js credentials | third-party OAuth, clerk, firebase |
| **File storage** | `@vercel/blob` (private), server routes only | direct client uploads, S3 SDKs, base64 blobs in the database |
| **Image handling** | browser-native (`<img>`, canvas if truly needed) | sharp, jimp, imagemagick, server-side thumbnailing in v2 |
| **PDF viewing** | browser-native viewer in a sandboxed frame | pdf.js bundles, react-pdf |
| Testing | vitest (+ testing-library) | jest |
| Icons | lucide-react | fontawesome, mixed icon sets |

Any new dependency needs a one-line justification appended to Memory.md under Decisions. If unsure — don't add it; write it by hand if it's under ~50 lines.

## 4. Error handling policy

- **Server:** repos throw typed errors — existing `InsufficientStockError`, `ExpiredBatchError`, `DuplicateBillError`, `AuthError`, plus new `ModuleDisabledError`, `ClosedFiscalYearError`, `PatientRequiredError`, `FileTooLargeError`, `UnsupportedFileTypeError`. Route handlers map them to `{ ok:false, code, userMessage }` with a plain-language `userMessage`. Unknown errors → log server-side, return "Something went wrong. Please try again." Never leak stack traces, SQL or library messages.
- `ModuleDisabledError` renders the 404 page — it never explains what was disabled.
- **Client:** every mutation ends in exactly one of: success toast, plain-language error toast, or offline-queued notice. No silent failures. The counter never crashes on a failed save — the bill stays on screen or in the outbox.
- **Offline is not an error.** Neutral chip, no red. This now covers patient registration too: registering offline shows *"Saved. This patient will get their number when you're back online."*
- The counter route stays wrapped in an error boundary that preserves the in-progress bill **and the attached patient** and offers "Continue bill".
- A file upload that fails leaves no half-record: the metadata row is written only after the blob write succeeds.

## 5. Code conventions

- TypeScript `strict: true`; no `any`; no `@ts-ignore` (use `@ts-expect-error` with a reason).
- Server Components by default; `"use client"` only where interaction demands it.
- Files kebab-case; components PascalCase; one component per file.
- All user-visible strings for the counter and common actions live in `src/lib/strings.ts` (English/Nepali toggle). Clinic strings go in the same file under a `clinic` namespace. Don't hardcode repeated labels in JSX.
- Every pure module ships with vitest tests in the same phase: `fefo`, `units`, `money`, `bs`, `invoice-number`, `bill-calc`, and new — **`clinic-calc` (follow-up rule + doctor share), `age`, `patient-no`, `modules`**. These are the correctness core.
- Migrations are append-only numbered SQL files in `db/migrations/`; never edit an applied migration. Where SQLite needs a table rebuild (CHECK constraint changes), do it inside one transaction, recreate every index, and verify row counts before and after in the migration script's output.
- Commit style: `phase-N: <what>`.
- The `(pos)` route tree must not import recharts, exceljs, the file uploader, or any clinic back-office component. Check the bundle after every counter change; v1's `/billing` was ~130 kB and that is the ceiling to defend.

## 6. What the AI must NOT do

- Do not scaffold features out of phase order.
- Do not redesign the theme, swap fonts, or introduce colors outside Design.md tokens. Navy is for patients only; magenta stays rare.
- Do not rename or drop existing database columns without a migration plus a Memory.md entry.
- Do not build customer profiles or loyalty on the pharmacy side.
- Do not add settings or toggles the PRD doesn't specify. Settings sprawl is a failure mode; the module toggles are the only new global switches.
- Do not use `localStorage` for anything critical. IndexedDB only. `localStorage` is fine for cosmetic preferences (sidebar collapsed, counter search scope).
- Do not call Turso or Vercel Blob from client code, ever.
- Do not mock or stub FEFO, unit conversion, or the follow-up rule in previews — run the real shared functions.
- Do not delete or rewrite Memory.md history; append only.
- Do not commit secrets; document env vars in `.env.example` with fake values.
- Do not put a patient's name or number in a page `<title>`, a URL query string, an analytics event, or a toast that could be screen-shared. Patient IDs in the path are fine.

## 7. Definition of Done (every phase)

1. `pnpm build` passes with zero TypeScript errors.
2. `pnpm test` green, including the pure-module tests for anything added this phase.
3. The phase's acceptance checklist in Phases.md is manually verified, box by box.
4. Vocabulary sweep: no banned backend words in any string added this phase; no `AushadhiPOS` / `aushadhi` anywhere in the repo.
5. Module sweep: every route and server action added this phase calls the right `requireModule`, verified by hitting the URL with the module off and getting a 404.
6. Counter bundle checked if the counter changed.
7. Memory.md updated: what was built, decisions, schema changes, what broke and how it was fixed, what's next.
