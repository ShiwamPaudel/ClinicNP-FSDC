# Memory.md — ClinicNP
### The AI agent's working memory. Read it first, every session. Update it at the end of every session.

> **Why this file exists:** when the context resets or a different tool picks up the project, this file is the difference between continuing the work and rediscovering (or hallucinating) the codebase. Maintaining 40 lines here is cheaper than burning tokens re-reading everything.

> **Migration note for whoever installs this file:** this replaces the header and decisions table of the previous Faarma Memory.md. **Keep the previous file's full session entries S-001 … S-009 verbatim** under "Inherited session log" below — they are history and Rules.md forbids deleting them. The one-line index below is an index, not a replacement.

---

## How to maintain this file (rules for the AI)

1. **Read this file first, every session** — before opening any code.
2. **Update it at the end of every working session**, not only at phase ends. This is part of the Definition of Done (Rules.md §7).
3. **Append, don't rewrite.** Session entries are immutable. Only the "Current state" block is edited in place.
4. Keep it tight: Current state ≤ 45 lines; each session entry ≤ 15 lines. Link to files and commits instead of pasting code.
5. Record every **decision** and **assumption** the moment it's made, especially deviations from the PRD or Architecture.
6. Record anything that was **requested but deliberately not built** (out-of-scope asks per Rules.md §2) so the next session doesn't quietly build it.
7. Never store secrets, patient data, or real customer data here.

---

## CURRENT STATE  *(edit in place — the only mutable section)*

*Last rewritten 2083-05-26 (C-014); production figures re-read 2083-06-06 (C-016). Everything below is verified against production, not remembered.*

> **This install is set up and empty of trading.** Checked 2083-06-22 against `clinicnpforfsdc-fsdc.aws-ap-south-1.turso.io`: **24 migrations** (ends at `0024_vat_inclusive.sql`, C-034); **6,646 items and 14,187 units** from `import-templates/fsdc-items.csv`, every rate blank (C-032); bootstrapped 2083-06-21 (C-033) with PAN/VAT no. and phone, address blank. **Settings the owner has since changed in the app:** **clinic on, pharmacy off** — so suppliers, purchases, stock and payables show under **Supplies** (C-034) — and **VAT registered on**, rates priced *VAT on top* until they choose otherwise. Kept from their setup: 2 users, 1 doctor, 1 laboratory partner, 10 service groups and **Crown Filling** (Rs 10,000, VAT-able). **Trial patients, visits, bills and dues were cleared 2083-06-22** (C-034) with `db:reset --keep-setup`, after a full backup to `backups/prod-before-clear-patients-*.json`; patient, bill and visit numbering restart at 1. 🔴 The admin password and PIN are simple placeholders the owner chose (Rule 7: not written here). **No letterhead is set** (the logo alone would replace the printed name, address and phone). A private Blob store **is connected** (probed 2083-06-21: private writes accepted).
>
> The figures in the paragraph above replaced the previous install's. **The code is unchanged and still at the same maturity**; what reset is the data.

**Product:** **ClinicNP** — clinic + pharmacy, two toggleable modules. Current install: **Family Smile Dental Care Center** — clinic + pharmacy, both modules on. *Address, PAN and phone not yet supplied; they are entered by the clinic at `db:bootstrap`, never hard-coded (Rules §1.4).*
**Predecessor:** Faarma v1 (pharmacy only), itself formerly AushadhiPOS. AushadhiPOS is fully retired as a name. Faarma survives only as the derived `appName` when the Clinic module is off.
**Phase:** all five phases complete and deployed. The work since has been what a real shop asks for once it starts using the thing. **The software is ready to trade.** What is left is the clinic's own data entry, plus one blocking security item (below).
**Repo:** `D:\IBN\Installations\clinicnp-fsdc`, branch `main`, pushed to `github.com/ShiwamPaudel/ClinicNP-FSDC`.
**Deployed:** Vercel, against hosted Turso `clinicnpforfsdc-fsdc.aws-ap-south-1.turso.io`. **This is the production database for this install** — schema and catalogue only as of 2083-06-20, but treat it as live from the moment `db:bootstrap` runs, and never point a test script at it without backing up first.

### 🔴 The one blocking item

**The admin password and PIN are simple placeholders** (2083-06-21, owner's choice — "they will configure them later"). They must be changed before the site is reachable from outside; earlier installs kept throwaway ones on the public URL for weeks.

### What was in production on a PREVIOUS install (re-read 2083-06-06, C-016) — historical, not this database

*Kept for the record only. None of these rows exist in this install's database; see CURRENT STATE above.*

- **21 migrations** applied (`0021` run by the owner on 2083-06-08). Latest full copy: `backups/prod-before-0021-*.json` (43 tables, 3,170 rows; gitignored). Latest full copy: `backups/prod-before-0020-2026-09-22T05-11-10Z.json` (42 tables, 3,132 rows; gitignored — it holds patient details). The C-015 copy `prod-before-0019-…` is still beside it.
- **Backups: none kept yet.** 16 rows in `backups`, none with a kept copy — sizes only (D-138). Still waiting on a private Blob store.
- **Trading.** 8 bills (all cash, all clinic, 2083-05-29 → 2083-06-05), 10 patients, 8 visits, 19 service lines. No credit bills, no returns.
- **The first medicine has been billed** (11 bills, 1 medicine line with its batch recorded); all 24 batches have a batch number and an expiry. 1 purchase.
- **938 items / 1,622 item_units** on 2083-06-06 (932 / 1,614 the day before; the owner's "meds update", c5bf0aa, added to the 478). **1 purchase, 24 batches** — 22 of them with no manufacture date, which is why the owner asked for it to be optional. **251 services** in 2 groups (the lab rate list import, e224003), **16 doctors**, 1 laboratory partner, 17 suppliers, 5 pieces of furniture, 4 users, 7 booked consultations, 2 phones registered for alerts.
- Company row: name and address set, letterhead uploaded; `pan_no` and the `ClincNP` footer typo were the owner's to fix — not re-checked this session.
- Fiscal year **2083/84** open.
- **Alerts are not configured on the live site.** No `VAPID_*` and no `RESEND_API_KEY` / `MAIL_FROM` in the hosting settings, so a booking saves and the screen says plainly that nobody was told. Generate the key pair once with `pnpm alert-keys` and never change it (D-122).

### Schema

`0001` … `0020`, append-only, never edit an applied file. The last five: `0015` first-price/pricing groundwork · `0016_lab_workflow.sql` (collected/received/given timestamps on `bill_service_lines`) · `0017_floor_plan.sql` (`racks` rebuilt in centimetres with rotation; `company.floor_width_cm` / `floor_depth_cm`) · `0018_consultations.sql` (`users` rebuilt for the `doctor` role; `doctors` gains `email` / `user_id` / `notify_push` / `notify_email`; new `appointments`, `push_devices`, `alerts_sent`) · `0019_dues.sql` (`bills.due_paisa`, `bills.paid_now_method`, `sale_returns.against_due_paisa`, new `due_payments`; additive, **not yet on production**) · `0020_date_calendar.sql` (`company.date_calendar` `bs`|`ad`, the calendar every date box opens in; **not yet on production**). `_migrations` tracks by column **`name`**, not `filename`; the table is created by `db/migrate.ts`, not by a migration file.

**Audit facts established 2083-05-12 (do not re-derive):**
- `stock_moves.reason` and `users.role` have CHECK constraints → changing either needs a table rebuild.
- Table rebuilds work **only** with `PRAGMA foreign_keys = OFF` issued *outside* the transaction. `PRAGMA defer_foreign_keys = ON` inside it fails with `SQLITE_CONSTRAINT_FOREIGNKEY` (tested both ways).
- libSQL **does** support `ALTER TABLE … DROP COLUMN`, so not every column removal needs a rebuild.
- All business tables use **TEXT ULID** primary keys; only `fiscal_years` is INTEGER.

### Environment quick-reference

- pnpm 11.13 · vitest · Playwright · Vercel. Settings in `pnpm-workspace.yaml`.
- Local dev needs `TURSO_DATABASE_URL=file:./local.db` + `AUTH_SECRET`. Storage: with no `BLOB_STORE_ID` / `BLOB_READ_WRITE_TOKEN`, files and (outside production) kept backups go to the gitignored `.filestore/`. The `BLOB_READ_WRITE_TOKEN` in `.env.local` is the **public** store's — refused; blank it in the shell for local runs so nothing probes it. `db/*.ts` scripts read `.env.local` then `.env` via `process.loadEnvFile`. **A shell variable beats `.env.local` under Next** — that is how a script ends up writing to the wrong database.
- 🔴 **As of 2083-06-05 `.env.local` points at the LIVE production database**, not the local file D-039 describes (the local line is commented out). `pnpm dev`, `db:seed`, `db:reset` and `db:migrate` all hit production unless a shell variable overrides it. `process.loadEnvFile` does **not** override a variable already set (verified), so always `export TURSO_DATABASE_URL=file:<drive letter path>` first for local work. **`db:seed` has no guard against a hosted database** — never run it without that export.
- Commands: `pnpm db:migrate` · `db:check` · `db:seed` · `db:bootstrap` · `db:reset [--keep-access|--keep-setup]` · `db:import-items` · `pnpm dev` · `build` · `test` · `sweep` · `run audit` · `a11y <url>` · `alert-keys` · `node scripts/make-icons.mjs`.
- **The clinic module defaults OFF on a fresh company row** (`module_clinic INTEGER NOT NULL DEFAULT 0`, 0006). Every clinic route 404s until it is switched on — which looks exactly like a broken build when a scratch install is set up by hand. `counters` uses **`next_value`**, not `value`.
- **Alerts to a phone cannot be tested under `pnpm dev`.** The offline layer is switched off in development, so nothing is installed in the browser to receive one. Use `pnpm build && pnpm start`, or the deployed site.
- **`pnpm run audit`, never `pnpm audit`** — pnpm's builtin shadows it.
- **Never run `pnpm build` while `pnpm dev` is running.** They share `.next` and the build dies mid-prerender with `TypeError: Cannot read properties of undefined (reading 'call')`, naming an innocent page. Stop dev, `rm -rf .next`, rebuild.
- **Windows notes:** libsql `file:` paths need a drive letter (a Git Bash `$(pwd)` path gives SQLITE_CANTOPEN 14). Free a held port with `Get-NetTCPConnection -LocalPort N -State Listen | Stop-Process`. Bash heredocs mangle backslashes and quotes here — use the Write tool or a scratchpad `.mjs`/`.py` file for anything with escapes in it.
- **Testing note:** integration tests import repos with the vitest `@` alias plus a `server-only` stub (`tests/stubs/server-only.ts`); point `TURSO_DATABASE_URL` at a temp file DB before importing repos; `fileParallelism: false`; `__resetDbForTests()` between files.
- Bundles at 2083-06-05: `/billing` **146 kB**, `/login` **129 kB**, `/dues` **125 kB** First Load.

### Working practices that were earned the hard way

- **Verify against the thing you changed, not a copy of it.** C-012: the item import was run against a scratch database, reported as done, and production had nothing in it. Every claim about production is now read back from production.
- **Back up before every destructive or schema-changing operation**, and dry-run every table rebuild against a replica built from that backup. Where production is empty, seed the replica with representative rows first — an empty rebuild proves nothing.
- **Migrations are mine to run.** The owner's standing instruction (D-088): *"Always Fix the Migrate Please."* A schema change is not finished until production has run it and the screens have been opened.

**In progress:** C-015 to C-019 are committed and live, `0021` included. C-020 (the invoice reader) is uncommitted and needs no migration. Kept backups still wait on a private Blob store.

**Next up**
0. **Connect a private Blob store** — the code to keep backups is built (C-016, D-138); it keeps nothing until a private store is connected. Then check the next morning's *Nightly* row downloads and restores.
0a. **Invoice photo → purchase entry**: a paid model is ruled out on cost; the free on-device route was checked in C-018 and works on printed invoices. Not built — waiting on the owner's answers (C-018) and 5–10 real invoice photos.
1. Replace `admin` / `admin123`; create real accounts, roles and PINs.
2. Services, rates, doctors and follow-up rules, as the clinic supplies them.
3. Prices for the 478 medicines — **Items → Set prices**, or let the counter set each one on its first sale (D-105).
4. Opening stock with batch numbers and expiry dates — **Stock → Opening stock**.
5. `company.pan_no`, and the `ClincNP` typo in the invoice footer.

### Known issues / risks

- `nepali-date-converter.toJsDate()` returns non-midnight times → `lib/bs.ts toAD()` normalises to local midnight; keep all date maths on `toAD()` output (D-006).
- Stock valuation "salable value" uses the base-unit selling rate — a conservative proxy (D-010). With 478 items unpriced it currently understates badly; it corrects itself as prices arrive.
- Offline bills print a provisional slip number; the final SI number appears on reprint after sync (D-003).
- CSP still allows inline script (nonce CSP deferred); the login throttle is per-identity, not per-IP.
- `company.print_format` is still stored and validated but **nothing reads it** — there has been one bill format since D-102/D-103. Harmless; do not wire it back up.
- `storageDescription()` in `lib/file-store.ts` and `NOT_BACKED_UP` in `lib/repos/backup.ts` are exported and **called from nowhere**. Wording was made user-safe in C-013 in case they are ever wired up.
- The dashboard still shows pharmacy panels when the pharmacy module is off.
- 🟠 **Backups are kept only once a private store is connected** (C-016 fixed the code, D-138). Until then the nightly job keeps and records nothing, the close-year wizard requires a download from the last day (D-140), and Settings → Backup says "Automatic backups are off". The 14 old "Automatic" rows are kept and shown as *Not kept*.
- **Restore still receives the whole archive as one request body**, and a Vercel function's request body stops at 4.5 MB (downloads are streamed and have no limit). Production's archive was 0.9 MB on 2083-06-06 — not urgent, but before it nears 4.5 MB Restore should read a kept copy on the server instead.
- The opening-stock row's "optional" / "what you paid" hints push those two boxes up out of line with their neighbours on a wide screen. Cosmetic, pre-existing; the purchase form avoided it in C-016 by putting "(optional)" in the label.
- *(latent, not fixed)* `billRequestBody` in `offline/outbox.ts` drops the inline `patient` snapshot (`OUTBOX_ONLY_FIELDS` lists it, since fa88d88), although D-064 and `ingestBill` expect it. The patient queue drains first, and a bill that overtakes it fails on the foreign key and retries until the registration lands, so it self-heals — but D-064's "the bill can create the patient itself" is not what ships.
- The per-line "Disc." boxes on medicine and service lines are still rupees only; only the bill discount has the `रू | %` switch (C-015).
- Per-report recomputation beyond the `?fy=` range, and "refund a closed-year bill into the open year", remain unbuilt.

**Requested but deliberately NOT built** *(keep this list; it is the scope fence)*
- Lab result entry / report generation / reference ranges — belongs to Nidanyo, not ClinicNP (Rules.md §2.2).
- EMR features, prescription printing, appointments, SMS, patient portal.
- A print-format setting. One bill, on A4, letterhead across the top (D-102, D-103).
- Any maker's badge, version string or support number on a screen behind the login. The sign-in screen is the only place ClinicNP or Infobytes Nepal is named (D-108).
- Dues extras nobody asked for: interest, due dates, reminders or SMS, credit limits, advance/deposit balances, a payment receipt slip, a dues export. The Dues screen is who owes, what, since when, and taking the money.

---

## DECISIONS LOG  *(append only)*

### Inherited from Faarma v1 — still binding
| # | Decision | Why |
|---|---|---|
| D-001 | No ORM; raw SQL via `@libsql/client` in `lib/repos/` | Team practice; transaction control |
| D-002 | Stock in base units only; conversion in `lib/units.ts` | One source of truth for strip/tablet maths |
| D-003 | Offline bills get provisional numbers; final invoice number assigned on sync | Server-side sequential numbering is a compliance requirement |
| D-004 | Magenta reserved for human decisions + one CTA per screen | Design discipline |
| D-005 | Auth.js v5 split config: edge-safe `auth.config.ts` for middleware; providers/DB only in `auth.ts` | Keeps libsql/node-crypto out of the edge runtime |
| D-006 | `toAD()` normalises to local midnight; all date maths uses it | Converter returns non-midnight times |
| D-007 | PIN quick-switch is a second Credentials provider (`id: "pin"`) | Reuses one session mechanism |
| D-008 | *(assumption)* `items.preferred_supplier_id` + `company.min_rate_is_cost` added up front | Needed by reorder + below-cost warning |
| D-009 | Login/PIN lockout: 5 fails / 15 min → 15-min lock | A 4-digit PIN must be throttled |
| D-010 | *(assumption)* Salable value = sellable base qty × base-unit rate | Consistent, conservative |
| D-011 | Purchase per-base cost spreads over free/bonus units | Bonus stock genuinely lowers unit cost |
| D-012 | Backup/restore is a logical JSON export/import in one txn with `PRAGMA defer_foreign_keys=ON`, not Turso branch-swap | Branch-swap needs the platform API; logical restore is atomic |
| D-013 | PWA via serwist; `src/app/sw.ts` excluded from the app tsconfig; SW off in dev | Avoids dom/webworker lib conflicts |
| D-014 | Brand name "Faarma" (per logo art) | Owner-confirmed at the time |
| D-015 | User guide = self-contained HTML with real screenshots, owner prints to PDF | Simplest reliable handover |
| D-016 | Visual picker sells in base unit at base rate; larger-unit pricing stays on the unit chip | v1 scope |
| D-017 | Manufacturer dropped from the item UI; column retained | Owner request |
| D-018 | Perceived slowness was `pnpm dev` recompiles; production is fast | No code change needed |
| D-019 | **Hard block on overselling** (client + server + 409 route); supersedes the soft-allow era of `bill_lines.short_base_qty` | Owner decision |
| D-020 | Item `shape` drives all unit art; default `tablet` | Pictorial picker |
| D-021 | Inline unit panel replaces the modal picker | Owner mockup |
| D-022 | SVG art, not photos, for unit art | Offline-safe, small |

### New for ClinicNP v2
| # | Decision | Why |
|---|---|---|
| D-023 | **ClinicNP continues the Faarma repository** rather than starting green-field | v1's FEFO, outbox, numbering and print are proven and tested; rebuilding would risk all of it for no gain. *(If the owner instead wants a separate repo, this is the one decision to flip — everything else in these docs holds either way.)* |
| D-024 | **AushadhiPOS retired everywhere**; Faarma survives only as the derived `appName` when the Clinic module is off | One codebase, two sale-able SKUs, no extra setting |
| D-025 | `appName` is **derived from enabled modules**, not stored as a setting | Avoids settings sprawl (Rules.md §6) |
| D-026 | **Service lines live in `bill_service_lines`**, a sibling of `bill_lines` under the same `bills` parent — not a widening of `bill_lines` | Keeps the hottest, most-tested table and the whole FEFO path untouched; the two line kinds have genuinely different shapes |
| D-027 | **One sales invoice series** covers medicine, service and mixed bills | IRD expects one unbroken sequence per business; a mixed invoice cannot belong to two series |
| D-028 | **Patient numbers are lifetime** (`P-000123`) from a `counters` table, never reset at year close, never reused after a merge | A patient is not a fiscal-year object |
| D-029 | **Closed fiscal years are read-only**; corrections are booked in the open year with a reference to the old number | A closed year's report must never change after it is closed |
| D-030 | **Modules enforced server-side** via `requireModule()`, with a 404 (not 403) for disabled routes | Hiding nav is cosmetics; a 403 would confirm the data exists |
| D-031 | **Age stored as value + unit + "as on" date**, with DOB optional | Nepali clinics record age, not DOB; a stored age must never display as if it were current |
| D-032 | **Partner cost and doctor share are snapshotted onto the bill line** at billing time | Editing a rate or a share must never rewrite history |
| D-033 | **Patient files: server-mediated upload and serve only**, private blobs, soft delete with a 30-day GC | A file URL that works logged-out would be a serious breach |
| D-034 | **Offline patient registration** reuses the bill outbox pattern (client ULID → provisional number → server-assigned number on sync); duplicates are flagged for a human, never auto-merged | A clinic in a power cut still has to register the person in front of them |
| D-035 | Stock-out reasons are a **fixed list**, not user-configurable codes | Reports depend on stable reason semantics; free-form codes make them meaningless |
| D-036 | ClinicNP lives in a **new git repo** at `Installations/clinicnp-fsdc`, seeded from the v1 tree; the v1 tree is left untouched | v1 had no git at all, so there was no rollback net. Confirms D-023 (continuation) while giving Phase 1 a safe baseline commit |
| D-037 | The wordmark is **typographic, not raster** (`components/ui/wordmark.tsx`) — sage with the "NP" in navy; Faarma renders in sage alone | A derived name (D-025) cannot be a fixed image. Also removed `next/image` from the counter, taking `/billing` from 140 kB → 135 kB. The old Faarma brand PNGs are deleted |
| D-038 | The counter's IndexedDB is renamed `faarma` → `clinicnp` with a **verified carry-over**: copy `outbox` + `held`, confirm the counts, and only then delete the old database | A queued bill is never destroyed to tidy a name. Risk is near-zero anyway (v1 never deployed), but the guard is cheap |
| D-039 | The hosted Turso is **never** the dev target. `.env.local` in this repo points at a local file DB and carries **no** Turso credentials | Memory's standing rule: never test or capture against the clinic's data |
| D-040 | *(assumption, pending owner)* The vocabulary sweep **excludes `db/migrations/`** | `0001_init.sql:1` carries the retired name in a comment and Rules §5 forbids editing an applied migration. The name survives in no shipped string |
| D-041 | **CBMS removed entirely** at the owner's instruction, not left behind a toggle | The clinic does not report to the government billing system. `cbms_queue` and `company.cbms_enabled` stay in the schema (unused, empty) because removing them needs a rebuild that buys nothing |
| D-042 | Table rebuilds use `PRAGMA foreign_keys = OFF` **outside** the transaction | Tested: `defer_foreign_keys = ON` inside the transaction fails with `SQLITE_CONSTRAINT_FOREIGNKEY` on `DROP TABLE`. `db/migrate.ts` implements this behind the `@rebuild` directive, with `@verify` row counts |
| D-043 | **`(app)/loading.tsx` removed.** Its Suspense boundary streamed a 200 before any guard ran, so `notFound()` gave a 404 body with a 200 status | Rules §1.11 needs a real 404. Measured 200 → 404 after removal. `NavProgress` still covers navigation feedback. Reasoning kept in `src/app/(app)/README-loading.md` |
| D-044 | Middleware does **not** enforce modules (contra Architecture §2.2) | Middleware is edge-only and D-005 keeps libSQL out of the edge runtime. Enforcement is `requireModule`/`requireModulePage` at every page, route and action — verified 200 → 404 → 200 across all 15 pharmacy routes |
| D-045 | **Rate limiting lives in our own database** (`rate_limits`), no third-party service | Owner asked for it without external dependencies. Fixed windows keyed by window index, so one upsert is the whole algorithm; swept by the nightly cron |
| D-046 | **`bill_line_batches` is read back by `rowid`, not `id`** | Ids are ULIDs, and two minted in the same millisecond sort backwards ~44% of the time (measured over 20,000 pairs). `ORDER BY id` was handing returned stock to the wrong batch and mis-costing COGS. This was the real cause of the "flaky phase-4 test" — it was never flakiness |
| D-047 | Accountant is enforced read-only by `canBill()`, not just by the role label | Every existing `role !== "admin"` branch meant "staff"; without an explicit guard the new third role would have silently inherited Staff's billing rights |
| D-048 | Clinic tables use **TEXT ULID primary keys**, and the id IS the client ULID — no separate `ulid` column | Matches `bills`, so an offline registration keeps one identity end to end (Phase 5). Architecture's INTEGER-key sketch would have needed a second column saying the same thing |
| D-049 | Files go to **Vercel Blob `access:'private'`**; with no token configured they go to a gitignored `.filestore` instead | The private mode exists in @vercel/blob 2.8. The local folder is a development convenience so the upload/serve path is testable without provisioning a store — it is never used when a token is present, and it is not a second production backend |
| D-050 | The visit vocabulary lives in **`lib/visit-types.ts`**, not in the repo | `lib/repos/*` is `server-only`, and the browser needs the same labels. Importing a value from a server-only module broke the build; types and labels now sit outside the repo layer |
| D-051 | `lib/age.ts` shifts a notional birth date back with the **day clamped to the month end** | Without the clamp, 29 Feb minus one year became 1 March, which delayed every later birthday and cost a whole year at the leap-day boundary. Caught by a test, fixed in the module |
| D-052 | "Files pending" currently lists **visits with no file attached** | The PRD defines it as billed services flagged "keeps a file". Services arrive in Phase 3; until then a visit with nothing attached is the honest stand-in, and the repo query narrows in Phase 3 |
| D-053 | The follow-up window runs from the last **paid** consultation, not from the last follow-up | `lastConsultationAd` ignores lines where `followup_applied = 1`. Otherwise one paid visit would chain free follow-ups indefinitely, each one restarting the clock |
| D-054 | Which service groups count as **consultations** is a flag on the group (`0010`), not the group's name | The doctor-share bases `pct_consult`/`fixed_consult` pay on consultations only, and the follow-up window is a consultation idea. Every group is renameable and a clinic may add "Emergency Consultation", so matching on the name would be a rule that quietly breaks the first time somebody edits a label |
| D-055 | A **public** Vercel Blob store is refused outright; files fall back to local disk and the checklist says why | The supplied token was valid but its store was created with public access, which hands out permanent world-readable URLs — exactly what a patient's lab report must never have (Rules §1.13). A store is created public or private once and for all, so this needs a new store, not a setting |
| D-056 | The server **refuses** a line claiming a follow-up discount the rule does not allow, but **accepts** a person deliberately charging the full rate inside the window | The first is a price nobody chose — stale catalog or worse. The second is a call somebody made at the counter, marked on the line with the magenta dot and audit-logged. Architecture §5.3 says the server wins; it does not say the server overrules a human being |
| D-057 | `bill_service_lines.partner_cost_paisa` stores the cost **per test**, not per line | The ledger multiplies by quantity. Storing the line total as well would double-count the moment anyone billed two of anything — which is exactly what the first draft did |
| D-058 | The outbox payload is built by an **exported, tested function** rather than inline | It is listed field by field so the queue's bookkeeping never reaches the server, and that shape silently dropped service lines and the patient when bills grew. `tests/outbox.test.ts` fails when a bill gains a field the payload does not carry |
| D-059 | Clinic reports filter on **AD dates**, like every other report | The range picker and the fiscal-year selector both produce AD bounds. One date basis is what makes a clinic report and a pharmacy report over the same period agree with each other; BS is still what people read |
| D-060 | A bill in a **closed year is refundable**, into the year that is open, carrying a reference to the original invoice | The closed year's figures must never move (D-029), but a patient standing at the counter is owed their money. The closed year keeps the sale; the open year carries the refund |
| D-061 | The dashboard trend computes **each series on its own, net of refunds** | It used to sum `bills.total_paisa`, which is gross, so subtracting a net service figure drew a medicine line reading Rs 509 beneath a tile reading Rs 9. Both halves are now netted the same way and the chart adds up to the tiles |
| D-062 | A doctor's share on a refunded line is scaled by **how much of the line was refunded** | A fully refunded consultation takes its whole share back; a partial refund takes back its share of it. The frozen `doctor_share_paisa` stays on the row either way, so nothing is rewritten |
| D-063 | On a screen narrower than 768px the menu **starts as icons only** | A 232px menu on a 390px phone leaves 158px for the day's takings. A phone's choice is not written to the width preference, so a desktop does not inherit it |
| D-064 | A patient registered offline is identified by a **client-minted ULID**, and the bill made for them carries their details inline | The two queues drain independently and either can land first. Whichever reaches the server creates the person under that id; the other finds them already there. Without the inline copy, a bill that overtook its registration would have nobody to belong to |
| D-065 | Two devices registering the same person offline **both land**, and are listed for review rather than merged | Both records are real and both may already have a bill against them. A household sharing one phone is ordinary, and two people can have one name — so the machine says what matches and a person decides |
| D-066 | **One retry loop drives both queues**, registrations first, and the status chip counts them together | What the counter needs to know is how much work has not left this machine, not which list it is on. Registrations go first only so the common case is tidy; nothing depends on the order |
| D-067 | After three failures an item **stops retrying in silence**: the counter says why and an Admin may take it out | A queue that retries forever without saying so is how a day's work disappears. Nothing is ever discarded without somebody choosing to |
| D-068 | Logging out clears the caches and **deliberately leaves the queues** | A bill or registration that has not reached the server is work nobody else has a copy of. Signing out is not a reason to throw it away |
| D-069 | The backup carries a **manifest** of patient files, not the bytes | A clinic's scans run to hundreds of megabytes and a backup nobody can download is not a backup. After a restore the owner is told how many files were found and how many were not |
| D-070 | The service worker **never caches a write, and never caches a patient file** | A cached "OK" would swallow a day's work, and a file must not sit in a browser cache on a shared counter machine after somebody signs out |
| D-071 | `lib/bs.ts` unwraps the converter's **CommonJS default** either way | Next's bundler hands back the constructor; a plain Node runner hands back the module object. Any script using BS dates died on `NepaliDate is not a constructor` |
| D-072 | Guide chapters are numbered **by position**, not by a number typed into each title | Inserting the clinic chapters in the middle produced two chapter sixes |
| D-073 | The **INSERT arity check** lives in `scripts/audit.mjs`, not in a code review | `saveCompany` shipped with fourteen columns against fifteen values and threw on every single call. Counting placeholders is something a person does badly and a machine does perfectly |
| D-074 | Every repo function a screen calls gets **at least one test that calls it** | The company profile was the one write path no test touched, and it was the one that was broken. Green tests measured what was covered, not what worked |
| D-075 | **Service groups are the department list.** There will not be a second list of departments | Groups already carry the services, their rates and their reports. A parallel department table would drift from them within a month, and then two screens would disagree about which department a test belongs to |
| D-076 | The outside-lab workflow stops at **Report received**. ClinicNP records that a report came back; it never records what the report says | Family Smile Dental Care Center sends samples out and the partner laboratory issues the result. Storing values would make ClinicNP look like the authority on a number it did not measure. This is the same line Rules §2.2 draws around lab results, and it holds |
| D-077 | **Opening stock is not a purchase**, and will not be recorded as one | Entering the shelf as a fake purchase invents a supplier, an invoice number and a payable that nobody owes. `createBatchWithStock` already takes a null `purchaseId`; the gap is a screen, not a schema |
| D-078 | **The rack map and the free-text shelf note both stay**, and the item form shows whichever fits: the picker when racks are drawn, the note when they are not | Deleting the note would throw away what shops typed for years; showing both at once would give one question two answers. The note also remains the counter's fallback, so a shop that never draws a rack loses nothing |
| D-079 | **An item's shelf is saved by the item form**, not by a separate action, and validated by one shared `assertCellFits` | A second save button for a field on the same screen is a second thing to forget. Both writers — the form and the shelf inspector — go through the same check, so a rule added once holds everywhere |
| D-080 | **Racks ride in the offline catalog**, and `catalogVersion()` counts them | The counter has to name a shelf with the connection down, like everything else it does. Renaming a rack touches no item and no stock move, so without racks in the version string a counter would keep lighting up "Rack 1" after it became "Fridge" |
| D-081 | A rack cell is **all three columns or none**. A rack chosen with no row and column is **refused**, never quietly stored as no shelf | Half a cell is somebody who meant to finish and was interrupted. Dropping it silently loses their intent; the map then lights nothing and nobody knows why |
| D-082 | Shelf information is shown **at search**, not on the bill line | Search is the one second between hearing a name and walking to a shelf. Once the medicine is on the bill it has already been fetched, and a location on a printed bill tells the customer where the shop keeps its stock |
| D-083 | **`items` is a product catalogue, not a shop's copy of one.** Where a medicine is kept moved to `item_locations` (0013), and `items.rack` / `rack_id` / `rack_row` / `rack_col` were dropped | Vicks comes in a jar in every pharmacy in Nepal; which shelf it sits on is true in one shop. Mixing the two means a shared Nepali catalogue could never be imported or refreshed without trampling what each shop arranged. D-078 to D-081 stand, but on the new table |
| D-084 | **Selling rates have the same problem and are NOT being moved.** `item_units.selling_rate_paisa` is per-shop and stays where it is; the rule is that an import creates missing items and never overwrites a rate, a location or stock | Splitting rates off `item_units` would touch billing, returns, valuation, profit and the offline catalog for no benefit the import cannot get by simply not writing that column. Worth revisiting only if ClinicNP ever becomes multi-tenant |
| D-085 | **A shop floor holds racks, shelves and desks.** One table, one `kind` column, no behaviour attached to it | All three are a grid of places as far as the software is concerned. The distinction is for the person reading the map: a plan that says "Rack 3" while they are looking at the front desk is a plan they stop trusting. The day a desk needs its own rules it is a different feature, not a different label |
| D-086 | **No CHECK constraint on `racks.kind`**, and an unrecognised value reads as a rack | This project has twice rebuilt a table to widen a CHECK (0007 for stock_moves.reason, 0012 for the whole company table). A CHECK here would guard a column only a compiler-checked enum writes to, and would cost a rebuild the day somebody adds a fridge |
| D-087 | **Drawing the room is a setting; putting things in it is stock.** Settings to Shop layout draws furniture, Stock to Shelves places medicines | The owner's own words: location "is something I would like to Stocks". It is also the faster path, since a shop opening with two hundred items will not visit two hundred item-edit screens, and this screen keeps focus in the search box after each placement |
| D-088 | **Migrations are mine to run.** The owner's standing instruction, 2083-05-23: "Always Fix the Migrate Please". A schema change is not finished when the file is written, or when the code is committed; it is finished when production has run it and the screens have been loaded | Handing a migration over as a line in a report put production in front of a database it did not match. The person who wrote the migration is the one who knows what it does and what to check afterwards |
| D-089 | **`pnpm build` refuses to build against a database that has not run every migration**, and Vercel runs `pnpm build` | Discipline in a document did not survive one busy afternoon. A guard in the build cannot be forgotten. It fails only on positive evidence (it read `_migrations` and found a file missing) and skips on anything else, so it can never break a deploy for an unrelated reason |
| D-090 | **One bill format, on A4, with the shop's own letterhead as an image.** The `thermal` / `a5` / `a4_half` choice is gone from Settings and `InvoiceA4` is what every bill renders | The owner said three times that the printer is a normal A4 office printer, and the software defaulted to an 80mm thermal roll — `a4_half` was selectable and still printed a receipt. A format setting is a thing that gets set wrong once and then prints wrong for a year. The narrow slips (lab dispatch, OPD, return, stock-out) keep their column: they are internal paperwork to be cut out and clipped to something, not bills |
| D-091 | **The letterhead is an image stored in `company.logo_url` as a data URL**, resized in the browser to fit ~220 KB — not a file path, and not a blob fetched at print time | Every shop already has a letterhead it is happy with; re-typing it into six fields gets a bill that looks like the software rather than the shop. A file on one PC's disk is not on the tablet, is gone after a reinstall and is not in the backup. A data URL travels with the company profile, is cached with it, is backed up with it, and is already in the page before anybody presses Print — which matters because a pharmacy prints most often with the internet down. PAN and DDA stay as text behind the image: they are what make it a tax invoice, and an image cannot be relied on to carry a number somebody has to read back |
| D-092 | **An imported medicine with no price cannot be billed.** The counter refuses it and says "No price yet"; Items to Set prices is where it stops being unpriced | Brand names are public and a shop's prices are not, so a catalogue arrives unpriced and that is the correct state, not an error. But a zero rate reaching a bill is a real bill with Rs 0 on it. Refusing at the counter and giving one screen to clear the condition is cheaper than either inventing prices or blocking the import |
| D-093 | **The item importer only ever creates.** A brand name already present is skipped whole — never re-priced, never re-shaped, never moved off its shelf — and it shows before it writes | This is D-084 made operational. An import that overwrites is an import nobody dares run twice, and the one thing it must survive is being re-run with ten more rows on the end |
| D-094 | **A laboratory stage is four timestamps, not a status column.** `collected_at`, `dispatched_at`, `report_received_at`, `report_given_at` (0016); the stage is derived from which of them are stamped | A status says where something is; a timestamp says where it is *and* when it got there, which is the half you need when a sample has gone missing and the question is who had it last. Deriving the stage means it cannot disagree with itself |
| D-095 | **Saving a bill no longer means the sample has gone.** `bills.ts` used to stamp `dispatched_at` for any line with a lab partner; it now writes null, and dispatch is a click on Laboratory to Send | Ordering a test is not drawing a sample, and drawing one is not sending it. The old behaviour made the first two stages unreachable and would have shown every new test as already at the laboratory. The stage conditions are still written to survive a line dispatched without ever having been collected, because those old rows exist |
| D-096 | **`outsourced` is what puts a test in the laboratory queue** — not `keeps_file`, which is gone from every screen and replaced by `services.sample_type` | `outsourced` already means "this goes to somebody else", and a second flag beside it would let the two disagree. `keeps_file` existed to drive a files-pending list that the pipeline replaces. The column stays in the table, unread |
| D-097 | **ClinicNP still records that a report came back, never what it said** | Unchanged from the original brief, and worth restating now that there is a screen called "Report in": the outside laboratory issues the result, and software that stores a number it did not measure starts looking like the authority on it |
| D-098 | **The shop floor is a room measured in centimetres, not a grid of rack-widths** (0017). `pos_x` / `pos_y` and the `UNIQUE (pos_x, pos_y)` index are gone; furniture carries `x_cm`, `y_cm`, `width_cm`, `depth_cm` and a quarter-turn `rotation` | A pharmacy is a long counter, a tall rack against the back wall, a fridge in the corner and a shelf tucked in a gap. None of that fits on a chessboard of identical squares, and the unique index meant two pieces could never share a square even when one was a third the size of the other. Centimetres because that is what somebody measuring a shop with a tape has; integers because a floor plan does not need half a millimetre |
| D-099 | **Two pieces of furniture may now stand in the same place.** Overlap is drawn on the plan, never refused by the database | A shelf tucked under a counter is a real arrangement, and a planner that would not store it would be lying about the room. The warning belongs where somebody can see it and judge it |
| D-100 | **The floor planner is hand-built SVG, with no canvas library** | Konva, Fabric and the rest are built for thousands of shapes and draw to a `<canvas>`, which is one opaque element to the keyboard and to a screen reader — and every screen here has to pass `scripts/a11y.mjs`. A pharmacy has twenty pieces of furniture, not twenty thousand. Every piece is a real SVG node that can be tabbed to, nudged with the arrow keys and read aloud; the theme colours come from the same tokens as the rest of the app; and it adds nothing to the bundle |
| D-101 | **A drag saves geometry and nothing else.** `moveRacks` can touch position, size and rotation, and has no way to reach a name, a kind, or the grid of shelves inside a piece | The planner writes on every drop, so it must be the narrowest write in the app. Moving a rack across the room must never be able to strand a medicine on a shelf number that stopped existing, and the way to be certain is for the move to have no way of changing shelf numbers. It is also not audited per drag: a floor plan is moved dozens of times in one sitting, and an audit log full of "rack moved 5 cm" is an audit log nobody reads |
| D-102 | **The letterhead carries PAN and DDA; the bill does not repeat them.** The registration strip prints only when no header image is set | D-091 kept them as text on the grounds that an image cannot be relied on to carry a number. The owner's letterhead does carry them, so the strip was printing the same two numbers twice. A shop without an image still needs them somewhere, which is what the fallback is for |
| D-103 | **Nothing after the total but the shop's own footer line, left aligned.** No signature blocks, no "billed by" | Nobody signs a pharmacy counter bill. Two ruled lines at the foot of every sheet are a form asking to be filled in that never is, and they push a short bill down the page for nothing |
| D-104 | **`--keep-setup` is the go-live reset.** It deletes bills, patients, visits and the audit trail, and keeps the item catalogue, shelves, shop layout, services, doctors, laboratories, suppliers, logins and company details | A catalogue of five hundred medicines is not sample data. `--keep-access` was written for a shop that had typed its own name into Settings; by the time a shop is ready to trade it has also typed its catalogue, drawn its room and listed its tests, and none of that is a transaction |
| D-105 | **The first price a medicine is sold at becomes its price — once.** A unit whose `selling_rate_paisa` is still 0 takes the rate typed on the bill; every later bill prices that line for itself and leaves the shop's price list alone | 478 medicines arrived unpriced, and making somebody stop and open Items the first time each one is asked for is how a counter ends up not being used. The "once" is enforced as `UPDATE ... WHERE selling_rate_paisa = 0`, not by reading first: the second sale's update matches no row, and two tills selling the same new medicine in the same second cannot both win. Only the unit actually sold is priced — a strip at Rs 18 does not make a tablet Rs 1.80, because shops round loose sales up, and a derived price is a made-up price. The counter refuses to save a line still at zero, since a zero would otherwise become the price for good. It is the selling rate, never cost, and it is written to the audit log with the name of whoever set it |

| D-106 | **The settings preview of the bill is drawn by hand, and is therefore a liability.** It lives in `components/app/company-form.tsx` and must be changed by hand whenever `components/print/invoice-a4.tsx` changes | Rendering the real bill there would need a whole saved bill — lines, batches, totals, a fiscal year — which the settings screen does not have and should not fetch. So it is a picture of the bill rather than the bill. It fell out of date the same day the bill lost its PAN band, and sat there showing `PAN: —` on the one screen whose entire job is to say what will come out of the printer. There is now a comment on it saying so. If it drifts a second time, the answer is to delete it rather than to keep two things in step by memory |
| D-107 | **Never repeat back what an error object said.** Only text written for a screen may reach one; recognise your own errors by type and use your own wording for everything else | The offline queues wrote `HTTP ${status}` and `err.message` into `lastError`, which `components/pos/stuck-queue.tsx` prints verbatim on a counter screen — so a dropped connection showed a shopkeeper `TypeError: Failed to fetch`, and a server fault showed `HTTP 500`. Both now say what happened in a sentence. `ImageProblem` in `lib/logo-image.ts` is the pattern to copy: a named error class for messages authored for a user, and a fallback sentence for anything the browser threw on its own |
| D-108 | **The sign-in screen is the only place the maker is named.** `lib/vendor.ts` holds the company name and the support numbers, and nothing behind the login imports it | Everything past the login belongs to the clinic — their name on the bill, their letterhead, their stock. A maker's badge in the corner of a counter screen is the maker talking over the shopkeeper all day. The sign-in screen is the honest exception: nobody is working yet, and it is the screen somebody is looking at when they cannot get in, which is exactly when a support number stored anywhere else is no use |
| D-109 | **What the sign-in screen advertises is filtered by the modules that are switched on**, and it never lists more than five things | It is the only screen in the product that makes a claim, which makes it the only one that can lie. A pharmacy-only install must not be told about patients and laboratory samples: those pages 404 for it (D-030), so the first thing a new user would learn is that the software describes itself wrongly. Everything is claimed in the present tense because everything listed is already built. Pinned by `tests/login-screen.test.ts` |
| D-110 | **"Keeps working offline" outranks "Nepali dates" for the last of the five slots** | A clinic with a pharmacy fills four slots before either of them, so the ordering has to earn the last place rather than let one fall off the end. Bikram Sambat dates are table stakes for anything sold in Nepal; billing through a power cut is the claim nothing else on the shelf makes. Caught by the test, not by looking — the first version silently dropped the offline line on exactly the install this was written for |
| D-111 | **The installed-app icons are derived from `favicon.png` by `scripts/make-icons.mjs`, never hand-cropped** | Four sizes kept in step by hand drift, and the drift is invisible until somebody installs the app. There is no image library in this project and adding one for a job that runs about once a year is not worth it, so it resizes in the Playwright browser that is already here for the accessibility gate. Two of the four are not obvious: the maskable icon gets a solid navy tile with the mark inset 12%, because Android may crop everything outside the middle 80%; and `apple-touch-icon.png` is opaque, because iOS composites a transparent home-screen icon onto black and would put black corners around the disc |
| D-112 | **Vendor names and build vocabulary are banned on screen, and `pnpm sweep` enforces it** — Turso, Vercel, IndexedDB, the service worker, and migration, schema, deploy, JSON, timestamp | "Could not reach the database" and "Turso is unavailable" are the same unhelpful sentence, and the second is worse, because it sounds like the shopkeeper's fault for not knowing what a Turso is. The sweep now reports which kind of word it found. `sweep-ok` stays the escape hatch for a genuine non-screen use — a file extension, a URL pattern |
| D-113 | **Help text says what to do, never why the screen was built that way** | Rules §1b, and the reason it exists: the owner read "There is one bill format — the header image is the only thing that changes how it looks" on their settings screen and asked what it was doing there. It is a note to another programmer wearing a user's clothes. If a sentence would only make sense to somebody who had considered the alternative, it belongs in a code comment. This cannot be grepped for; it is review's job, and the whole product was read through once in C-013 looking for it |
| D-114 | **The sign-in form comes first on a phone, above the brand panel** (`order-1 lg:order-2`) | Somebody opening this on the shop's tablet wants the password box, not the sales pitch. The first version stacked the panel on top and put five features and a support block between the top of the page and the username field. The pitch is still there, underneath, where somebody idly waiting will find it |

| D-115 | **Booked consultations are built, overturning Rules §2.4's "no appointments, no scheduling"** | The rule was written to stop the product drifting into a hospital information system. The owner asked for this one directly and specifically: a doctor's name, a patient, a date and a time, and the doctor told. That is a diary, not a scheduling engine, and Family Smile Dental Care Center was keeping it on paper on one desk. The rest of §2.4 is untouched and now says so explicitly — no SMS, no patient portal, no patient-facing booking, no recurring bookings, no queue numbers, no calendar sync |
| D-116 | **A booking is a separate row from a visit, and never becomes one automatically** | A visit is the record of an encounter that happened; a booking is an arrangement that may be cancelled, missed, or never turned up for. Writing a visit at booking time would put people who never came into the day's counts, the doctor's share and every clinic report. `appointments.visit_id` is set only when somebody actually walks in |
| D-117 | **Time of day is stored as `HH:MM` text beside the date, not as one combined moment** | A clinic books "Thursday at 2" in local time and always will. A combined moment forces a zone on a fact that has none, and the pair sorts correctly as text, which is all these lists ever ask of it. Both dates are kept as usual: `date_ad` for arithmetic and range reads, `date_bs` for what is shown (Rules §1.5) |
| D-118 | **Back to back is not a clash** | The overlap test is strictly `aStart < bEnd && bStart < aEnd`, so a 2:00 that runs fifteen minutes and a 2:15 are two consecutive patients, not a double booking. Getting this wrong in the other direction would have the software refuse the way every clinic in the country actually runs its afternoon. Pinned by `tests/appointment-types.test.ts` |
| D-119 | **A cancelled booking gives its time back; a called-off one still shows on the day** | Only `booked` and `arrived` occupy a slot. The row is never deleted — a consultation cancelled by mistake has to be visible, with its reason, or the front desk cannot tell "nobody booked" from "somebody unbooked them" |
| D-120 | **The booking is saved first and the doctor is told afterwards, best-effort** | A mail service having a bad afternoon must never be why the front desk has to ask a patient to ring back. `notify.ts` throws at nobody: every attempt is written to `alerts_sent` as sent, failed or off, and the screen says in one plain line what actually reached the doctor rather than claiming success |
| D-121 | **`web-push` is the one new dependency; email is one `fetch` and no dependency at all** | Alert delivery is ECDH plus HKDF plus AES-GCM against RFC 8291 and a signed token per delivery service — well over the ~50 lines Rules §3 says to hand-roll, and the wrong place to be clever. Sending email through Resend is a single POST with a key on it, so `lib/email.ts` calls it directly rather than adding a package that wraps one call. `web-push` is in `serverExternalPackages` |
| D-122 | **The two alert keys are configuration, generated once, never rotated** | Every phone that has switched alerts on is registered against the public half. A new pair silences all of them, with no error anywhere and nothing on any screen to show for it — the doctor simply stops being told. `pnpm alert-keys` prints a pair and says so; nothing in the app generates them at runtime |
| D-123 | **The Doctor role gets its own route tree (`/my`), not a narrowed back office** | A doctor holds a phone between patients. One column, thumb-height controls, a bar at the bottom. `requireBackOfficeUser()` sends a doctor to `/my/schedule` from every back-office page, and a Doctor sign-in never appears in counter quick-switch: it belongs to one person on their own phone, not to the shared machine |
| D-124 | **A Doctor sign-in with no doctor attached is told so, rather than shown an empty list** | An empty list looks like a quiet day. A doctor would sit through an afternoon of patients believing nobody had been booked. `/my/not-linked` says what is wrong and who can fix it |
| D-125 | **There is a "send a test alert" button, and it is not a nicety** | Turning alerts on succeeds on every phone, including the ones where nothing will ever arrive — a private window, a browser that never installs the app, a phone that has quietly withdrawn permission. Without a button that makes one appear, the first time anybody finds out is the morning a patient is waiting |

| D-126 | **Dues from a closed year are still collected — into the open year, and the old bill is never written to** | A patient pays in Shrawan for medicine taken in Ashar; refusing the money would be absurd, and writing `credit_settled_at` onto a closed year's bill is exactly what Rules §1.12 forbids. D-060 already solved this for refunds: the money lands where it arrived, referencing the old bill. So "paid" is derived from `due_payments`, not stamped on the bill, and the old whole-bill "Mark paid" is retired |
| D-127 | **A bill on dues must say who owes it** — a registered patient with the Clinic module on, a typed name without it — **but only a bill carrying `paidNowPaisa` is held to it** | The owner asked for dues bills to carry the patient's details "similar to service bills". Every counter since 0019 sends `paidNowPaisa`; a credit bill already queued on a counter before the deploy does not, and refusing it would strand it in a queue nobody can edit, which loses a sale. Those land as before and show on Dues as "No name on the bill" |
| D-128 | **What a bill owes is derived, never stored; payments are voided, never deleted** | A stored balance is a second copy of the truth that the first return, refund or undo would leave behind. One formula (`balanceDue` + `OWED_AT_SALE_SQL`) feeds every screen. A payment typed wrongly has to be correctable, so Admin can Undo — but the row stays, marked void, because a day already closed must still show what was entered and taken back. Undo is refused in a closed year |
| D-129 | **A credit bill with `due_paisa = 0` reads as owing its whole total** | New code cannot write that combination (`splitAtSale` turns a fully-paid dues bill into a cash/QR bill). It only arises from pre-0019 code running between the migration and the deploy, or from a pre-0019 backup — both from when credit meant nothing was paid. Found while planning the production run: without this, a "Credit" bill made in that window would have read as paid and the debt would have vanished. Replaced a restore-time fix-up with one read-side rule |
| D-130 | **'credit' stays the stored method; "Dues" is the word on screen** | Widening `bills.payment_method`'s CHECK means rebuilding the hottest table, with every foreign key into it, for a label. 'credit' already meant "not paid at the counter"; part payment is `due_paisa` < total plus `paid_now_method`. Day close splits a dues bill's paid part into Cash/QR, so the three method figures still add up to gross sales |
| D-131 | **One payment is one person's, clears their oldest bill first, and is idempotent on a receipt id the screen mints** | A person settling up asks what they owe in total, not per bill, and a shop clears the oldest debt first by hand. The receipt id makes a double press or a retry record once; `UNIQUE (receipt_id, bill_id)` makes even two racing presses land once. Mixing two people's bills in one receipt is refused |
| D-132 | **A return on a bill still owing comes off the debt first** (`sale_returns.against_due_paisa`) | Handing somebody cash for goods they have not finished paying for is wrong, and leaving the debt at its old figure would chase them for medicine they gave back. The day close subtracts only what was actually handed back from expected cash |
| D-133 | **Dues is its own sidebar item, beside Bills, outside both module groups** | The owner offered "a tab under a related one, or a new one". It is used daily by the front desk, spans medicine and services, and a button inside Bills (the old "Credit bills") was where nobody looked. `/bills/credit` redirects to `/dues`; the reports hub card points there too |
| D-134 | **Anyone who can bill can take a dues payment; only the owner can undo one** | Taking money is counter work — the old Admin-only "Mark paid" meant staff could not record a patient paying. Recording a receipt only adds money the drawer should hold, so it is not the fraud path; removing one is, so Undo is Admin-only and audited. The Accountant sees Dues read-only |
| D-135 | **A percentage bill discount is of the bill as it stands, recomputed as it changes, and sent as rupees; the rupees/percent choice carries to the next bill** | "10%" that froze at the moment it was typed would be wrong the moment a strip was added. The server and the printed bill only ever see the rupee figure, exactly as before, so nothing downstream changed. A counter that discounts in percent does so all day; making them switch every bill is friction for nothing |
| D-136 | **A cancelled bill takes its dues payments out of the day close too** | Cancelling has always taken a bill's money out of its day. Money paid back against it is part of that; the cancel dialog tells the owner to hand it back, and the day close now agrees with the drawer after they do |
| D-137 | **Every date box can show Nepali or English; everything behind it stays BS** — `company.date_calendar` (0020) picks the calendar a box opens in and writes its date in; a switch inside the box flips it for one pick | Packs and supplier bills print expiry in English, so every expiry was converted in somebody's head. The owner first asked for the choice in Settings (scope chosen: every date box), then for a toggle inside the popup as well. Keeping the box's contract as BS text in, BS text out means no server code, stored date, report or printed bill changed. Date of birth is not a date box — it is typed, in English, as before, and BS cannot represent anyone born before 1943 |
| D-138 | **Backups are kept in the private Blob store, or not at all — and never a row that claims otherwise** | The nightly job and the year close had been recording a size and discarding the backup since Phase 5. A public store is refused for patient data (D-055) and a Vercel server's disk is read-only, so the only honest home is a private store (GA 30 June 2026, supported by the installed SDK). The existing `backups.blob_url` holds the kept copy's key, so no migration; old size-only rows stay as the record. Copies are gzipped; the newest 30 nightly and 20 manual are kept, year-end copies for good. Downloads are streamed past Vercel's 4.5 MB response limit |
| D-139 | **The manufacture date on a purchase line is optional; if given, it must not be after the expiry** | Owner request. 22 of production's 24 batches already had none (opening stock never required it). Batch and expiry stay required — they drive sell-oldest-first and the expiry warnings; the manufacture date drives nothing |
| D-140 | **Closing a year needs a real backup: kept by the wizard, or downloaded within the last day** | The wizard's "a backup was taken first" named a file that did not exist. With private storage it keeps one and refuses to close if that fails; without it a year close is irreversible and the admin's own download is the only way back, so one from the last 24 hours is required, with a link in the dialog |
| D-141 | **Batch number and expiry are mandatory on every medicine line of a printed bill** — each batch the line was sold from, each with its own expiry; the counter refuses to save a line that cannot print both | Owner requirement ("It is mandatory"). The bill already had the columns, filled from the counter's FEFO preview and from `bill_line_batches` on a reprint, but a missing batch would have printed "—" without complaint. `lib/print-batches.ts` decides what prints and returns nothing when a batch number or expiry is missing, the counter refuses with the medicine's name, and the bill renders one batch per line in both cells so two batches read as two pairs. Expiry stays a BS date like the rest of the bill |
| D-142 | **The expiry on a bill prints as the English month and year, `MM/YYYY`** — 30 December 2026 → `12/2026`; supersedes D-141's "BS like the rest of the bill" | Owner decision. The pack prints "EXP 12/2026", and the person checking a bill against a pack reads the two side by side; a BS day date makes them convert. The day is dropped because packs do not carry one. Read straight from the stored AD date text, so no conversion or time zone can shift the month. Only the printed bill changes: the bill page on screen, the stock screens and the stock-out note keep their BS dates |
| D-143 | **A purchase carries the supplier's own totals block: a discount on the whole bill, and a rounding line** (`0021`), with VAT charged after the discount and the batch cost left at the line's rate | Every real invoice the owner sent ends this way — "LESS DISCOUNT 480.61 / ROUNDING 0.43 / NET TOTAL", "10% Discount", "Discount 0% + Trade Discount 0% + Taxable + VAT". Without somewhere to put them a purchase could not add up to the paper it was copied from, and the supplier's ledger would be wrong by the discount. `discount_paisa` keeps its old meaning (the line discounts) so nothing recorded before reads differently; the new figure is capped at what is left, because a mistyped discount that made a payable negative would flow straight into the ledger. The batch cost stays the line rate: the discount belongs to the invoice, not to one medicine — revisit only if profit-by-item needs landed cost |
| D-144 | **An invoice photo is read and thrown away; nothing is kept with the purchase** | The owner's instruction. It also keeps the feature out of the storage question entirely: no private store needed for it, nothing to back up, nothing to delete later |
| D-145 | **The invoice reader fills the purchase form and nothing else: it never saves, never picks the supplier, and leaves a box empty rather than guessing at it** | The owner's own description of how it should work — the photo fills the fields, the person tallies against the paper, amends, and only then records the purchase. So the reader writes to the same form the counter has always used, behind the same checks, and the Save button stays where it was. It does not touch the supplier: a name on a bill is not a supplier record, and the wrong one puts money on the wrong ledger. It fills no medicine it is not sure of, because a wrong medicine on a purchase is wrong stock, and it flags what it is unsure of instead — a row whose arithmetic does not close, a name it could not find, and the bill's own net total against what the lines come to |
| D-146 | **The model, the WebAssembly runtime and OpenCV are served by this app, not by a CDN** | The clinic's line is not reliable, and the moment somebody presses "Fill from a photo" is the worst moment to be waiting on somebody else's server — or to discover it is blocked. The model (~6 MB) is committed under `public/ocr/`; the runtime is copied out of node_modules into `public/ort/` at install and build time, so a 14 MB binary is not carried in git. `onnxruntime-web` is aliased to its wasm-only build, which avoids serving a 28 MB WebGPU runtime the reader never asks for |
| D-147 | **A photographed page is straightened before it is read** | Measured, not assumed: the same invoice photographed flat gave back all 12 of its rows and photographed at an angle gave back 1. OpenCV finds the sheet of paper and warps its corners square first. It costs a 13 MB lazy chunk, fetched once and cached, which is the price of the feature working on a photo taken by hand rather than on a scan |
| D-148 | **A saved purchase can be edited, behind the signed-in admin's password, guarded by the stock it already put on the shelf** (C-028) — reverses C-027's read-only stance at the owner's request | Quantity may rise freely and fall only to what has already left the shelf; a line whose batch has moved (sold, returned, counted) keeps its item and cannot be removed; the date stays in the purchase's fiscal year and a closed year cannot be edited. Stock corrections are *appended* as `adjustment` moves pointing back at the purchase — never written over the original `purchase` move — and a removed line's batch is emptied and kept. The whole change and an audit entry with before and after commit together. The password is checked at the moment of the write, not when the screen opens, so there is no unlocked state to leave on a shared machine; wrong attempts are throttled on their own bucket so they cannot lock anybody out of signing in |
| D-149 | **The selling price is typed on the purchase row and updates the item's price for that unit; a copy is kept on the line** (`0022`) | `item_units.selling_rate_paisa` stays the one place a price lives — every batch of an item sells at one price. The line copy is only a record, so a purchase can say later what price was set on it. On an edit, the item's price is updated only where the line's price was changed *in that edit*: re-saving an old purchase for an unrelated fix must not put its recorded price back onto an item whose price has moved on since |
| D-150 | **A typed date's year decides its calendar: 2060 and up is Nepali, below is English** | People copy these dates off paper, and a pack prints English while a Nepali bill prints Nepali. Reading typed text in the shop's one setting got both wrong in turn — on a Nepali-set shop `2028-01-31` off a pack was saved as 14 May 1971; on an English-set one `2083-06-13` off a bill was refused. BS runs ~57 years ahead, so no real purchase or expiry date falls on the wrong side of 2060 (AD 2060 is further out than any expiry; BS 2059 is AD 2002). The setting still decides how dates are shown |
| D-151 | **A purchase can be paid for as it is entered — on credit, in full, or in part — and what was paid is an ordinary supplier payment** (`0023`, C-029) | The owner asked for it: big bills get paid in part. The supplier's balance was already purchases − returns − payments, so a payment row in that same table is all it takes, written in the same atomic batch as the purchase. "On credit" writes nothing, which is exactly what every purchase was before. *Paid in full* pays the total the server works out, never a figure from the browser; a part payment above the bill is refused (a typo far more often than an advance, and an advance can still be paid on purpose from Payables). `supplier_payments.purchase_id` only records which purchase a payment came with |
| D-152 | **Payments reduce the supplier's overall balance; they are not allocated to bills** | The owner's choice, over per-bill Paid/Left. A purchase shows what was paid *when it was entered* and what that left on credit; later payments live on the supplier's ledger and in Payables. If a purchase's supplier is corrected, the payment made with it moves along — otherwise one supplier shows paid and the other owed for the same invoice |
| D-153 | **Payables is one screen for everyone the clinic owes — suppliers and laboratories — beside Dues, owner only** | The mirror of Dues. Each half shows only while its module is on. Its figures are *read from* the supplier ledger and the laboratory statement's "owed now" (refunds netted), never kept separately, so the three screens cannot disagree. The existing payment boxes on a supplier's page and on a laboratory statement stay as they were. Sidebar (admin): Bills · Dues / Payables · Reports / Settings |
| D-154 | **A payment to a supplier or laboratory typed wrong is undone with a reason, never deleted** (`0023`) | The dues rule (0019) applied to the other direction: `voided_at` / `voided_by` / `void_reason`; the row stays, marked, and stops counting in every balance, statement and opening balance. Refused once the payment's fiscal year is closed (D-029). Supplier payments made on their own also gained the closed-year refusal and an audit entry, which laboratory payments already had |
| D-155 | **Every key the counter's shortcut sheet lists is wired, and the sheet lists only keys that are** (C-031) | The owner found F2 ("Start a new bill") did nothing but move the cursor. Walking the sheet key by key found more: `P` and `?` could never fire because the search box always has focus; resuming a held bill brought back its medicines only and deleted the rest; the held tray and the patient search could not be used without a mouse; QR left "Enter to payment" with nowhere to go; the F-keys stayed live behind dialogs (F9 could save from behind the batch picker); and F9 pressed twice queued the bill twice. Now: F1/? help, F2 new bill (asks: hold / clear / keep), F4 or P patient (↑↓ Enter), F7 hold, F8 tray (↑↓ Enter, 1–9, Esc), F9 save once, Alt+1/2/3 Cash/QR/Dues, Esc back to the search, Enter on a line back to the search, U/B/Del on any of a line's boxes. F-keys stand down while a dialog is open |
| D-156 | **F2 opens New bill from any back-office page, asking first if anything has been typed there** | What the owner expected F2 to do. Leaving a half-entered purchase silently would be the worst way to honour it; typing in a search box does not count as unsaved work. The sidebar's look is unchanged (C-026 asked for Dashboard / New bill to stay exactly as they are) |
| D-157 | **Resuming a held bill brings back all of it, and never writes over the bill on the counter — that one is held in its place** | Held bills always stored their services and patient (`HeldBill.serviceLines`, `patientId`), but resume only loaded medicines and then deleted the held copy: a held clinic bill lost its consultation and patient for good. The attached patient is now kept whole on the held bill (`attachedPatient`); bills held before that are matched by `patientId` against the counter's patient cache |
| D-158 | **A new purchase row's expiry starts at today + 4 years, marked as a default until changed** | The owner's instruction. The risk is a default that is never corrected and quietly becomes a real batch's expiry, so the row says "4 years from today — change to the pack's" in warn amber until the date is edited, and the date box selects its whole value on focus so typing replaces it. Rows filled from a photo keep what the bill printed (or empty, D-145) — never the default, which would pass for a date read off the paper |
| D-159 | **The margin under the sell price is on the selling price — (sell − cost) ÷ sell — and, where free goods or a line discount lower the real unit cost, the margin they give is shown beside it** | Nepal pharmacy margins are quoted on the selling price/MRP ("16% margin"). A blank sell price leaves the item's price as it is, so the margin is worked on that price. "Margin 13.8% · 28.2% with free" for 10 + 2 free at 112.07 against 130 |

*(Add D-036+ as they happen. Assumptions use the `ASSUMPTION:` prefix.)*

---

## SESSION LOG  *(append only — newest at the bottom)*

### Template
```
### C-___  ·  [BS date]  ·  Phase [N]
Built: …(files/features, 2–4 bullets)
Decisions/assumptions: D-___ …(or "none")
Schema changes: …(migration file, or "none")
Broke/fixed: …
Verified: …(which acceptance boxes from Phases.md now pass)
Not built (requested, out of scope): …(or "none")
Next: …(the single most important next step)
```

### Inherited session log (Faarma v1) — index only; **paste the full original entries here and keep them**
- **S-001** · 2083-03-30 · Phase 1 — Next 15 + TS strict + Tailwind v4, tokens/fonts, `0001_init.sql` (21 tables + FEFO index), `lib/bs.ts` + `lib/money.ts` (+22 tests), Auth.js v5 (password + PIN), UI kit, layouts, settings/users, dashboard.
- **S-002** · 2083-03-30 · Phase 2 (+security) — lockout (`0002`), `lib/units.ts` (+13 tests), repos for items/suppliers/batches/purchases/catalog, all Phase-2 screens, `/api/catalog`; 7-part integration acceptance.
- **S-003** · 2083-03-30 · Phase 3 — the POS: `fefo.ts`, `invoice-number.ts`, `bill-calc.ts`, `ingestBill` (idempotent, authoritative FEFO), outbox/held/catalog cache, POS components, thermal + A5 print. `0003`.
- **S-004** · 2083-04-01 · Phase 4 — bill register + detail, sale returns, dashboard (recharts), reports hub + 8 reports, xlsx export, audit screen.
- **S-005** · 2083-04-01 · Phase 5 — CBMS queue + cron, backup/restore (`0004`), PWA via serwist, Nepali label toggle, cron auth, README.
- **S-006** · 2083-04-01 — Rebrand AushadhiPOS → Faarma, PWA icons, cursor/perf fixes, self-contained User Guide (Playwright capture + build scripts).
- **S-007** · 2083-04-01 — UX round 2: required purchase batch/mfg/expiry, collapsible sidebar, progressive disclosure, POS "Back to app", CSP, visual unit picker v1.
- **S-008** · 2083-04-01 — Hard block on overselling across client, server and route (409), outbox surfaces the reason. D-019.
- **S-009** · 2083-04-02 — Pictorial unit picker driven by item `shape` (`0005`), inline POS Unit panel, SVG unit art. D-020/021/022. 68 tests green.

### C-001  ·  2083-05-12  ·  Phase 1 (milestone 1 of 4 — rename)
Built: repo established + git baseline; **rename to ClinicNP** — package `clinicnp` v2.0.0, metadata/title template, `manifest.json`, README, guide scripts, backup filename (`clinicnp-backup-*`), xlsx creator, sidebar preference key; `lib/app-name.ts` (derived name + description, 6 tests); typographic `Wordmark`/`AppMark` replacing the raster Faarma art; IndexedDB `faarma` → `clinicnp` with a verified carry-over; Design.md tokens — Faarma orange **retired**, navy `--color-clinic-*` scale added.
Decisions/assumptions: D-036, D-037, D-038, D-039, D-040 (assumption).
Schema changes: none yet (`0006`/`0007` are milestones 2 and 4).
Broke/fixed: nothing broke. Counter bundle *improved* 140 kB → 135 kB by dropping `next/image` from the POS tree.
Verified: `pnpm build` clean; **74 tests green** (68 inherited + 6 new); browser confirms `<title>` = ClinicNP and the only IndexedDB is `clinicnp`; login, dashboard and counter all read ClinicNP. Vocabulary sweep clean outside `db/migrations/` (D-040).
Not built (requested, out of scope): none.
Next: milestone 2 — `0006_modules_fy.sql`, `lib/modules.ts`, Settings → Modules, and the `requireModule('pharmacy')` retrofit.

### C-002  ·  2083-05-13  ·  Phase 1 (milestones 2-4 + CBMS removal) — PHASE COMPLETE
Built: **CBMS removed** entirely (D-041). **Module system** — `0006_modules_fy.sql`, `lib/modules.ts`, Settings → Modules, retrofit onto 18 pages + 7 actions, nav grouping, derived name/title. **Fiscal years** — status + close-year wizard + selector + closed-year banner + `ClosedFiscalYearError` on every write path; Accountant role wired through. **Stock out** — `0007_stock_out.sql` (stock_moves rebuild), `lib/repos/adjustments.ts`, reason-tile entry screen, register with value-by-reason, detail + 80mm note, xlsx export, and the Expired list re-routed through the one path. **Rate limiting** in our own DB.
Decisions/assumptions: D-041 … D-047.
Schema changes: `0006_modules_fy.sql`, `0007_stock_out.sql` — both applied to the new hosted Turso after a dry run on a scratch copy.
Broke/fixed: **found and fixed a real pharmacy bug (D-046)** — sale returns restored stock to the wrong batch ~44% of the time because allocation order was recovered by ULID sort. This had been mis-recorded as "flaky test isolation" since v1. Also fixed: `createPurchase` briefly lost its fresh-install bootstrap; the seed created a fiscal year with no status.
Verified: 106 tests green, 8 consecutive clean runs (the suite is no longer flaky). Build clean. Browser-verified against the live DB: all 15 pharmacy routes 200 → 404 → 200 on the module toggle; a pharmacy-only install titles itself "Faarma"; a 1-strip supplier return took stock 30 → 20, credited the supplier, wrote the purchase return and a reason-carrying ledger row, and logged the audit entry.
Not built (requested, out of scope): none. Deferred to their scheduled phases: dashboard module-adaptive layout (Phase 4), refunds of closed-year bills into the open year (Phase 4).
Next: Phase 2 — patients, visits and files.

### C-003  ·  2083-05-13  ·  Phase 2 — PHASE COMPLETE
Built: `0008_clinic_core.sql` (patients, visits, attachments + `bills.patient_id/visit_id/kind`). `lib/age.ts` (+18 tests) and `lib/patient-no.ts`. Repos for patients (transactional lifetime numbering, idempotent on the client id, search, duplicate detection, Admin merge), visits (per-year numbering, today's list, cancel-with-reason) and attachments (soft delete + 30-day sweep). `lib/files.ts` + `lib/file-store.ts`. `/api/files/upload`, `/api/files/[id]`, `/api/cron/files-gc`. Screens: patients list, register, patient card with the navy header and visit timeline, edit, merge, Today, visits list, visit detail with vitals, files pending. OPD slip. Clinic nav group.
Decisions/assumptions: D-048 … D-052.
Schema changes: `0008_clinic_core.sql`, applied to the hosted Turso after a scratch dry run.
Broke/fixed: fixed a leap-day bug in the age roll-forward before it shipped (D-051). Hit — and fixed — a build break from importing a runtime value out of a `server-only` repo into a client component (D-050).
Verified: **144 tests green over three consecutive runs**; build clean. Browser-verified against the live DB: registration in 856 ms, duplicate warning inline, visit started, PDF + photo uploaded, **file URL 401 logged out / 200 with `nosniff` signed in, zero storage keys in the page source**, and with the clinic module off all eight clinic routes plus the file route return 404 (200 again when switched back on). Verification data was then removed from the database.
Not built (requested, out of scope): none. Lab results, reference ranges and sample workflow remain out of scope (Rules §2.2) and nothing in this phase approaches them — ClinicNP stores the file it receives and does not read it.
Next: Phase 3 — services, doctors, lab partners, and clinic billing on the shared counter.

### C-004  ·  2083-05-21  ·  Phase 3 — PHASE COMPLETE
Built: `0009_services.sql` and `0010_consultation_groups.sql`. `lib/clinic-calc.ts` (follow-up rule, doctor share, +23 tests). `lib/bill-calc.ts` widened to take service lines and return one set of totals, with per-service VAT and a proportionally shared bill discount — the v1 tests are untouched and still pass, which is the proof the medicine path did not move. Repos for services, doctors and lab partners. Settings → Services / Doctors / Lab partners, all module-gated. Counter: unified search with F3 scoping, the navy patient bar on `P` with inline registration, service line rows with doctor and laboratory pickers, the follow-up notice and its magenta override. `/api/bills` ingest widened; `/api/followup`, `/api/patients`, `/api/patients/search` added. Invoice service block on thermal and A5, plus the lab dispatch slip. Clinic vocabulary in `lib/strings.ts` with Nepali variants. Sample clinic catalog in the seed, every rate flagged as a sample.
Decisions/assumptions: D-053 … D-058.
Schema changes: `0009_services.sql`, `0010_consultation_groups.sql`, both dry-run on a scratch file DB before the hosted Turso.
Broke/fixed: **the outbox dropped service lines and the patient in transit** — a mixed bill left the counter complete and arrived as a medicine-only sale, silently. Found only because the browser check read the saved row back instead of trusting the screen. Fixed and guarded by `tests/outbox.test.ts`. Also removed two NUL bytes a heredoc had left inside `patients.ts`, where a "match nothing" sentinel was meant; it is `NULL` now. Also caught and fixed a nonsense per-line VAT expression and a partner cost that would have double-counted against quantity.
Verified: **211 tests green.** Counter bundle 144 kB against the v1 ceiling of 140 kB — +2.9%, well inside the 15% allowance. Browser-verified against the live database: one search box returning both kinds with tags, F3 narrowing, a service bill refused without a patient, a mixed bill saving as `kind = mixed` with the visit opened and doctor shares of Rs 200 and Rs 240 from snapshotted terms, the follow-up notice in plain words with an override offered, the dispatch slip naming the laboratory, and — offline — an instant search, a provisional slip, nothing in the database, then exactly one bill and one stock movement on reconnect. With the clinic module off every clinic route 404s and a queued service bill is refused 409. Verification data was then removed.
Not built (requested, out of scope): none. Lab **results** remain out of scope (Rules §2.2) — ClinicNP records that a test was sent and what it cost, and stores the file that comes back without reading it.
Next: Phase 4 — clinic back office, ledgers, reports, dashboard.

### C-005  ·  2083-05-21  ·  Phase 4 — PHASE COMPLETE
Built: refunds widened to service lines (nothing returns to stock) and to closed-year bills (recorded in the open year, referencing the original invoice). `lib/repos/clinic-reports.ts`: service revenue, doctor payouts, laboratory ledger with running balance and per-partner statement, patient visit register, new-versus-returning, diagnostics utilisation, and the real "files pending" that retires the Phase 2 stand-in (D-052). Six report screens plus laboratory payment entry, all fiscal-year aware and all exporting to .xlsx. Bill register gained a kind filter and the patient number; bill detail shows both line blocks. Dashboard split four ways with patients seen, registrations, files pending, top services and a two-series trend. Day close gained the four-way split. Audit log gained the whole new vocabulary in plain words. Every clinic screen, report card and export is module-gated.
Decisions/assumptions: D-059 … D-063.
Schema changes: none — Phase 4 is all reads on what Phase 3 laid down, plus `sale_return_service_lines` which 0009 already created.
Broke/fixed: the dashboard trend was drawing a medicine series gross of refunds directly beneath a tile that was net of them — Rs 509 against Rs 9 (D-061). Found by looking at the rendered chart, not by a test. Also found at 390px that the menu still took 232px, leaving 158px of usable screen: a real failure of the owner-on-phone acceptance box, and one my first overflow check passed because the layout scrolls inside a container.
Verified: **227 tests green**, including 16 Phase 4 integration tests where every figure is checked against a hand calculation written into the test — a mixed bill refunded across both kinds, ten consultations at 40%, twelve tests and two payments, and the day-close split reconciling to net sales. Browser-verified against the live database: the register, both bill blocks, a service refund with zero stock movements, all six reports, a laboratory payment moving the balance, five real .xlsx files, and — with the clinic off — no clinic panels, no clinic report cards, and 404 on every clinic report and export. Verified at 390px on dashboard, day close, patient search, laboratory statements, doctor payouts and bill detail. Verification data was then removed.
Not built (requested, out of scope): none. Lab **results** remain out of scope (Rules §2.2).
Next: Phase 5 — resilience, offline registration, and the install.

### C-006  ·  2083-05-21  ·  Phase 5 — PHASE COMPLETE, PROJECT COMPLETE
Built: `offline/patient-outbox.ts` with provisional numbers and an inline patient snapshot on the bill, so the two queues can land in either order. The counter's recent-patients slice, searched locally when the connection is down and said so on screen. "Possible duplicate patients" for post-sync review. One retry loop over both queues, a status chip that counts them together, and a stuck-queue notice after three failures. Backups extended to every table with a file manifest and an after-restore file check; the restore wording now says what a restore actually does. Service worker: nothing that writes is cached, no patient file is cached, and a navigation with no connection lands on a precached offline notice. Recovery from a deploy landing mid-shift. `db/bootstrap.ts` for an empty production start. `scripts/audit.mjs` (module guards, contrast, empty states) and `scripts/a11y.mjs`. `Go-live-checklist.md` and `Deploy.md`. User Guide regenerated with 48 screenshots and three clinic chapters.
Decisions/assumptions: D-064 … D-072.
Schema changes: none. Phase 5 is resilience and packaging on top of what 0006–0010 laid down.
Broke/fixed: the offline fallback did not work — serwist precaches the script that renders a page, not the page, so there was nothing to fall back to and no network to fetch it with; the offline notice is an explicit precache entry now. `db:bootstrap` hashed passwords with sha256 while the app verifies salted scrypt, which would have produced an Admin who could not sign in on the clinic's first morning. `lib/bs.ts` could not be used from any script at all (D-071). The counter's register-a-patient form had no ids, so its labels were not attached to its inputs. Guide chapters collided at six. My first concurrency test fired two write transactions at one SQLite file, which tests the driver's lock rather than the product and left the file locked for the four tests after it.
Verified: **247 tests green**, typecheck clean, sweep clean, audit clean, accessibility clean across seven screens with the rules proven against a page of deliberate faults. Counter bundle 146 kB against the v1 baseline of 140 kB — +4.3%, inside the 15% allowance. Patient search over 2,000 records: worst case 6.8 ms against a 100 ms budget. Verified in a production build on a tablet-sized profile: the service worker installs, the counter opens with no connection, a patient is registered under a provisional number, a mixed bill is billed and printed, nothing reaches the database, and on reconnect there is exactly one patient and one bill, correctly attached.
Not built (requested, out of scope): **CBMS** — the owner dropped it; the dead `cbms_queue` table remains only because 0004 is applied and migrations are append-only, and it is written down in `NOT_BACKED_UP` so nobody wonders. Lab results, reference ranges, sample workflow, EMR, appointments and SMS remain out of scope (Rules §2.2) and nothing was built near them.
Could not be done here: installing as a PWA on a physical Android tablet, and the Vercel deployment itself, both of which need the owner's hardware and account. The behaviour underneath each was verified in a real browser against a production build.
Next: the install. See "Next up" at the top.

### C-007  ·  2083-05-22  ·  Deployment unblocked, and the bug that green tests missed
Vercel refused the deployment. Not a build error — the build completed, then was rejected at `Deploying outputs...` with "Vulnerable version of Next.js detected". `next` 15.1.6 → **15.5.25** (stayed on 15.x; 16 is a major and this was not the week), and `next-auth` beta.25 → **beta.32**, which brings `@auth/core` to 0.41.3 and patches "configuration errors can cause auth checks to fail open". There is no stable Auth.js v5; `latest` is still 4.24.15.

**The company profile could never be saved.** `saveCompany` built an INSERT with fourteen columns, fifteen values and thirteen arguments. It threw `SQLITE_ERROR: 15 values for 14 columns` in the driver every time, the action caught it, and the owner saw "Something went wrong. Please try again." while trying to put the clinic's own name into the software. 247 tests were green because **no test ever called it** (D-074). Fixed, covered by `tests/company.integration.test.ts` (proven to fail without the fix), and the whole class is now mechanical (D-073): 66 INSERTs checked for column/value arity, with a comma splitter that respects quoted strings so `'Kalimati, Kathmandu'` counts as one value.

The `sw.js` "no-response" line reported alongside it was an **aborted RSC link prefetch** — cosmetic, and not why the save failed. Verified after the fix in a browser on a production build with the service worker active: saves, says Saved, survives a reload, zero console errors.

Also corrected: `Deploy.md` told the next person to run `pnpm audit`, which pnpm's own built-in shadows — that line never ran `scripts/audit.mjs` once.

Verified: **250 tests green**, typecheck clean, sweep clean, audit clean, counter bundle 146 kB → **143 kB** on the newer shared chunks. Middleware bypass CVE-2025-29927 confirmed never exploitable here — every page sits under a layout calling `requireUser()` and all 14 API routes guard themselves — checked by sending the bypass header and getting the same redirect to /login as an anonymous request.

### Requested at Family Smile Dental Care Center, not yet built  ·  2083-05-22
The owner walked through how the clinic actually runs. What was asked for, and what is already there:

**Already built, no work needed.** Tests and their rates go in **Settings → Services**, each one carrying its group, rate, whether it is sent to an outside lab (with the partner and what they charge), whether a report is expected back, and whether a doctor is required. **Service groups are fully editable** — create, rename, delete — through `settings/catalog-actions.ts`. Ten are seeded.

**Real work, not yet started.**
1. **Department on a visit is free text.** `visits.department` is a plain string typed by hand; it must become a choice from the service groups (D-075). Until then two spellings of "Ultrasound" are two departments in every report.
2. **The outside-lab workflow has one step, not three.** `bill_service_lines.dispatched_at` and the dispatch slip exist. **Sample collected** and **Report received** do not, and neither does report-received closing that test's part of the visit (D-076).
3. **Opening stock cannot be recorded.** Batches are created only by a purchase. `createBatchWithStock` in `batches.ts:57` takes exactly the right shape — batch number, expiry, cost, quantity, and a **nullable `purchaseId`** — and has **no callers at all**. The count-correction adjustment cannot stand in: `StockOutLineInput` requires an existing `batchId`, so it can only top up a batch that is already there. Today the shelf has to be entered as a fake purchase, which invents a supplier and a payable (D-077).
4. **Lab bill on A4, top half only**, so one sheet carries two bills. `company.print_format` is `thermal | a5` today, and A5 is exactly half of A4 — this may be a stock-and-margins question rather than a new format.
5. **Reports out of the Pharmacy module.** Only four are gated on pharmacy — valuation, expiry, moving, profit. The rest already are not, so this is mostly where they sit in the navigation.
6. **Items and rates** — the owner said items "don't have a rate thing in them, just the units". Rates live on `item_units.selling_rate_paisa`, one per unit. Whether that is the complaint or the requirement is **not yet clear and was not guessed at**.

Still out of scope and not drifted into: lab **results**, reference ranges, EMR, appointments, SMS (Rules §2.2). Recording that a report came back is not recording what it said (D-076).

### C-008  ·  2083-05-23  ·  Racks made real: the map now points at something
The rack map shipped in C-007 could be drawn and could store nothing. There was no way to put a medicine on a shelf, the counter never read `company.rack_display`, and `setItemCellAction` had no callers — a floor plan with an empty floor. The owner asked the right question: what is the use of racks at billing, and how are they linked to the medicines? They were not linked at all.

Researched how other systems do it before building. Marg ERP and Gofrugal both keep stock rack-wise for exactly this purpose — "identify which item is kept in which rack **at the time of billing**" — and both also offer rack-wise stock and expiry reports, which turned out to be the more durable use. Western retail (Lightspeed) stores Aisle/Bay/Shelf/Bin as a text code. **Nobody draws a picture**, because their users are trained staff for whom `A-3-2` is faster to read than a map. Family Smile Dental Care Center's counter staff are not, which is why the picture stays — but the text form had to work too, and now does.

Built: **`cell-picker.tsx`**, the one "where is it kept" control, adapting to whether racks exist (D-078). **`shelf-inspector.tsx`** on Settings → Racks — click a shelf, see what is on it, put things on it, take them off; this is the bulk path, because a shop opening with two hundred items will not visit two hundred edit screens. **The counter** now honours all three `rack_display` modes: off, the shelf written out beside every result, or the map with the cell lit beside the results list. **`/reports/shelf`** — the shop in the order you walk it, with the unshelved last where they read as work remaining, plus an .xlsx export that doubles as a stock-take sheet. **The expiry report** gained a Shelf column and a "Shelf by shelf" ordering, so clearing near-expiry stock is one walk instead of six. `db:seed` now draws two sample racks with the demo medicines on them, because a training database that shows an empty floor plan teaches that the feature does not work.

Decisions/assumptions: D-078 … D-082.
Schema changes: **none.** `0011` and `0012` already created `racks` and the three `items` columns; this session filled them in. **Production needs a deploy, not a migration.**
Broke/fixed: two accessibility defects on the rack page, both from C-007 and both invisible until `scripts/a11y.mjs` was pointed at that screen — the edit and remove buttons were icon-only and announced as "button", and the rack map used 10px and 9px type. The a11y script now covers `/settings/racks` and `/reports/shelf` permanently. Also learned the hard way that `items.rack_id` carries a real enforced foreign key: racks cannot be deleted until the items on them let go, which is why `deleteRack` nulls the cells inside its batch and why `db/reset.ts` lists `items` before `racks`.
Verified: **263 tests green** (13 new in `tests/racks.integration.test.ts`), typecheck clean, sweep clean, audit clean at 76 routes and 69 INSERTs, accessibility clean across 9 screens. The catalog-version tests were mutation-checked — reverting racks out of the version string fails exactly those two and nothing else. Browser-verified against a throwaway seeded file database, 35 checks: the inspector opening on a clicked shelf, an item moved between shelves and the move read back out of the database, all three display modes at the counter (map lit, text only, silent), both reports, the .xlsx download, and — with every rack deleted — the free-text note taking over on both the item form and the counter, with the shelf list saying so instead of drawing an empty table.
Not built (requested, out of scope): the put-away direction (a delivery arriving and the software saying where each item goes) was identified in the research as a real third use and deliberately left out — Family Smile Dental Care Center has not asked for it.
Still open from C-007: department as a pick-list (D-075), sample-collected / report-received (D-076), the opening-stock screen (D-077), A4 top-half printing, reports out of the pharmacy module, and the item-master import. **`print_format = 'a4_half'` is still selectable in Settings and still prints thermal** — the setting landed in C-007 and the template did not.
Next: the owner's call. The A4 template is the smallest real gap; the item import is the largest win before go-live.

### C-009  ·  2083-05-23  ·  The item master stops knowing where things are
The owner read C-008 and pushed back on the part that mattered: "linking the rack thing on the item isn't something I expected — the item is supposed to go public." They are right, and the reason is sharper than "it feels wrong". `items` describes a **product**: Vicks VapoRub comes in a jar, and that is true in every pharmacy in Nepal. Which shelf it sits on is true in exactly one shop. With location on `items`, a shared Nepali catalogue could never be imported — or refreshed later — without trampling what each shop had arranged. C-008 built the right feature on the wrong table.

`0013_furniture_and_locations.sql` moves it. `item_locations` is keyed by item, owned by the installation, and carries the free-text note as well; `items.rack`, `rack_id`, `rack_row` and `rack_col` are **dropped**, so the item master now holds nothing about where anything is (D-083). One location per item today, but a table rather than columns precisely so that "Vicks by the counter and on the back rack" needs one index dropped rather than a schema redesign. No table rebuild was needed — libSQL accepts ALTER … DROP COLUMN, verified against copies of real data before the migration file was written.

Also asked for and built: **racks, shelves and desks** (D-085). One `kind` column, no behaviour attached, no CHECK (D-086). The map draws a desk squared off and a shelf as a thin plank so the plan reads without a legend, and picking a kind reshapes the defaults (a shelf is 1x6, a desk 2x4) only while the name and size still look untouched. And **Stock → Shelves**, the tab the owner asked for: click a shelf, type a name, it is placed, and the search box keeps focus for the next one. Underneath is the list of everything with no place — the honest measure of how far the job has got — with an inline note field for things genuinely kept loose. Settings → Racks became **Settings → Shop layout** and now only draws the room (D-087).

Decisions/assumptions: D-083 … D-087.
Schema changes: **`0013_furniture_and_locations.sql`** — the first migration since 0012, and the first here to drop columns. Dry-run twice against copies of real data (one with cells populated, one with only notes): both carried everything into `item_locations`, both left zero dangling foreign keys.
Broke/fixed: the counter's `PosRack` had no `kind`, so a desk would have drawn as a rack — caught by the catalog-snapshot test, not by looking. `catalogVersion()` had to gain `item_locations`: since 0013 moving a medicine writes only to that table and no longer touches `items.updated_at`, so without it a counter would have kept pointing at the old shelf for as long as its cache lasted. `db/reset.ts` and `backup.ts` both needed the new table in the right order — it points at **both** racks and items.
Verified: **271 tests green** (21 in the rack suite, rewritten around the new model, including one that reads `pragma_table_info('items')` and fails the day somebody puts a location column back). Typecheck, sweep and audit clean at 71 INSERTs; accessibility clean across 10 screens. Counter bundle 145 to **144 kB**. Browser-verified on a fresh 0013 database, **38 checks**: a shelf added through the kind picker and read back out of the database, an item moved between shelves, taken off, and given a written note instead, the item form proven to no longer mention location at all, an item edited without disturbing where it is kept, and the counter still lighting the right cell with the desk drawn beside it.
Not built: the two questions the owner asked — see below. Nothing was half-built toward either.
Next: the item-master import, which this migration was the precondition for.

### Answered at Family Smile Dental Care Center, 2083-05-23 — and still true
**"Can I update stock other than by a purchase?" — No.** `createBatchWithStock` in `batches.ts` takes exactly the right shape, including a nullable `purchaseId`, and has **no callers outside tests** — correcting an earlier note in C-007 that said no callers at all. It also hardcodes `reason = 'purchase'`, so an opening-stock screen needs either a new `'opening'` reason (stock_moves.reason carries a CHECK, so that means a table rebuild) or an accepted lie in the ledger. Recommend the rebuild: opening stock and a purchase are different facts and the day-book should not claim otherwise. Until then the shelf can only be entered as a fake purchase, which invents a supplier and a payable (D-077).

**"Any Excel file at installation, or do we create items one by one?" — One by one, today.** There is **no import path anywhere in the codebase**: `exceljs` appears in exactly one file, `api/export/[report]/route.ts`, and only to write. Items, suppliers and purchases are all hand-entered. For an install with a few hundred medicines that is not acceptable, and it is the largest remaining win before go-live. 0013 was the precondition — an importer can now create missing items and touch neither location, rate nor stock.

### C-010  ·  2083-05-23  ·  The outage I was told about, and the guard that ends it
Production answered **"Application error: a server-side exception has occurred"** with digest 3923158810 on every screen that touched the new table. The cause was the one written down in C-009 as the order not to use: the code from 14012f3 shipped while the database was still at **0012**, so everything reading `item_locations` hit a table that did not exist. I had put that order in `Deploy.md` and then left the migration to somebody else, which is how a documented hazard becomes an outage.

Fixed: backed up production first (38 tables, 91 rows, read back and verified identical), rebuilt a **local replica from that backup** and dry-ran 0013 against the real data — both items carried their cell and their note, every row count unchanged, all four columns gone, `racks.kind` present, zero dangling foreign keys — then ran `pnpm db:migrate` and verified. Production is at 0013 with all 91 rows intact and both medicines still standing on Rack 1 and Rack 2.

Verified afterwards on the live site, signed in, **13 checks**: the dashboard, item list, stock, the new Stock → Shelves, Settings → Shop layout, the shelf list, the expiry report and the counter all load, Rack 1 is still drawn, the medicine still shows against its rack, and there is no 5xx anywhere.

Then the part that matters more than the fix. `db/check.ts` runs at the top of `pnpm build`, and Vercel runs `pnpm build`, so **a deploy can no longer get ahead of the schema** (D-089). It names the database and the missing files when it refuses. It is deliberately hard to trip by accident: it stops a build only when it can positively read `_migrations` and find a file on disk missing from it, and skips with a printed line on anything else — no database configured, no network, no `_migrations` table. Tested in all three states: refuses against a database held at 0012, passes against production, skips against an unreachable host.

Decisions/assumptions: D-088, D-089.
Schema changes: none of its own — this session applied 0013 to production, which C-009 wrote.
Broke/fixed: `db/check.ts` first shipped with its own `.env` parser and failed `tsc` under strict indexing; it now uses `process.loadEnvFile`, the same loader as `db/migrate.ts`, so both are guaranteed to look at the same database.
Verified: 271 tests green, typecheck, audit at 71 INSERTs and sweep all clean, build green with the check in front of it, counter bundle 144 kB.
Still live and still wrong: **`admin` / `admin123` signs in as Owner on the public URL.** I used it again to verify these pages. Flagged in C-008 and unchanged since.
Next: the item-master import.


### C-011  ·  2083-05-25  ·  A real catalogue, one bill, the laboratory queue, and the room

Four things the owner asked for, in the order they were asked.

**211 real medicines, no prices.** `import-templates/pharmacy-items.STARTER.csv` is a working Nepali clinic-pharmacy catalogue — generic names, pack structure, manufacturer where it is known, the five narcotics flagged. Every price column is empty and stays empty: brand names are public, what a shop charges is not, and there is no source for it that is not a guess (D-092). `pnpm db:import-items <file> [--commit]` loads it, shows before it writes, and only ever creates (D-093). That opened a hazard inside the same change — an unpriced medicine billing Rs 0 — so the counter now refuses one and says why, and Items to Set prices lists every unpriced medicine on one screen with a box per unit and one save. The write behind it touches `selling_rate_paisa` and `updated_at` and nothing else, and refuses a bigger pack priced at or below a smaller one.

**One bill, on A4, with the shop's letterhead across the top** (D-090, D-091). The three-format setting is gone. The header is uploaded in Settings to Company, resized in the browser, and stored with the company profile so it prints from any machine with the internet down.

**The laboratory queue** (D-094 to D-097). Billed, then To collect, To send, Awaiting report, Report in, Given out — each a click, each stamped with the time it happened, each undoable. Grouped by bill rather than listed by test, because a patient billed for three tests is one person sitting down once and one needle. Files-pending and the visit's file uploader are gone; `services.sample_type` replaces `keeps_file` and is what the collection screen groups by.

**The shop as a room** (D-098 to D-101). The old screen was a list of racks with arrow buttons nudging them around a chessboard. It is now a floor plan measured in centimetres: drag to move, handles to resize, R to turn, arrow keys to nudge, Alt to ignore the 5 cm grid, undo and redo, zoom and pan, and a properties panel. Racks, shelves, desks, counters, fridges and doors. Overlap, and anything standing outside the room, are drawn as warnings rather than refused. The counter and Stock to Shelves draw the same picture from the same data, so somebody who arranged the room recognises it instantly.

Decisions/assumptions: D-090 to D-101.

Schema changes: **0016** (the lab pipeline: four timestamps and a note on `bill_service_lines`) and **0017** (rebuild `racks` onto centimetres, drop `UNIQUE (pos_x, pos_y)`, add the room's size to `company`). Both applied to production by me (D-088), each after a backup and a dry run against a replica built from the real data. 0017's replica was seeded with four pieces of furniture and two placed medicines, because an empty rebuild proves nothing about whether the conversion carries them; it does — 0 became 0, 1 became 110, 2 became 220, -1 became -110, each kind got its own footprint, and both medicines were still on their shelves afterwards with zero dangling foreign keys.

Broke/fixed: my first stage conditions read `to_collect` as merely "not collected", which put a line stamped as dispatched-but-never-collected — exactly what the old bill-save behaviour produced — on two worklists at once, so clicking it on either said somebody else had moved it. The ladder now excludes every rung above it explicitly, and a test asserts the five stages partition the work exactly.

Verified: 325 tests green across 28 files; typecheck, audit at 73 INSERTs and sweep all clean; build green with the five `/lab` routes at 119 kB, the floor planner at 113 kB and the counter at 145 kB.

Still live and still wrong: **`admin` / `admin123` signs in as Owner on the public URL.** Flagged in C-008, C-009 and C-010.


### C-012  ·  2083-05-25  ·  Going live: the catalogue doubled, the bill trimmed, the test data gone

The owner opened Items and found it empty. **I had run the importer against a scratch database, seen "Created 211 medicines", and reported them as loaded — production had none.** Verifying against the thing I actually changed, rather than against a convenient copy of it, is the whole lesson.

Loaded for real, then extended: **478 products**, 907 units, 358 Medicine / 66 Consumable / 54 Other, ten controlled. The second batch fills what a Nepali counter is actually asked for and the first pass skipped — more antibiotics and strengths, the cardiac and diabetes range, paediatric syrups and drops, dermatology, eye and ear drops, neurology and psychiatry, injectables and IV fluids, orthotics and surgical disposables, Ayurvedic lines (Liv 52, Cystone, Chyawanprash, Zandu, Honitus), infant formula, and the front-of-shop FMCG a pharmacy lives on. Every price column still empty (D-092).

Bill trimmed to what the owner asked for (D-102, D-103) and checked the way it actually prints — a bill saved through the real counter on a scratch database, screenshotted under print media, with a letterhead image in place.

Production cleared with the new `--keep-setup` (D-104): 63 rows gone — six test bills, two visits, one patient, the audit log, a backup record and the rate limits — and patient numbering restarted at 1. Kept: 478 items, 907 units, five pieces of furniture the owner placed at 06:21 that morning, two services, two service groups, the outside laboratory, both logins, the company row and the fiscal year. Zero dangling foreign keys afterwards.

Decisions/assumptions: D-102, D-103, D-104.
Schema changes: none.
Broke/fixed: `db/seed.ts` still wrote `racks.pos_x` / `pos_y`, which 0017 removed — so `pnpm db:seed` threw on any fresh install. Found only because the bill demo needed a seeded database. Fixed to write centimetres.
Verified: 325 tests, typecheck, audit, sweep, build, accessibility clean across 14 screens; the importer re-run as a no-op; the printed bill inspected as an image.
Still live: **`admin` / `admin123`.** The owner has said they will change it themselves.

### C-013  ·  2083-05-25  ·  The front door, the vocabulary, and the handover

The owner's last session before handing the project to a new conversation, so this entry is written to be read cold.

**It started with one screenshot.** The settings screen still showed `PAN: —` above the invoice preview, days after the bill stopped printing PAN. The bill was right; the preview was not, because the preview is drawn by hand rather than by rendering `invoice-a4.tsx` — which needs a whole saved bill to render at all. Fixed, and the reason it drifted is now a comment on it and D-106. The same drift had reached `Go-live-checklist.md`, which still told the installer to check the PAN on the invoice and to watch the edge of 80 mm paper.

**Then the wider version of that complaint.** The owner asked, in effect, for the whole product to be read for sentences that talk like a programmer — naming "Stored in Turso's database" and the bill-preview caption as the kind of thing they never want to see. Every string and every JSX paragraph in `src/` was extracted and read (a first pass missed multi-line JSX, which is exactly where the caption they objected to was living). The voice was already good; four things were genuinely wrong:

- the bill-preview caption (D-113),
- the pricing screen explaining why it exists rather than what to do,
- `storageDescription()` describing a storage misconfiguration to a shopkeeper,
- and the real one: **`stuck-queue.tsx` printed `lastError` verbatim**, so a dropped connection put `TypeError: Failed to fetch` on a counter screen and a server fault put `HTTP 500` there (D-107).

`pnpm sweep` now also refuses vendor names and build vocabulary and says which kind it found (D-112); Rules §1 gained 1a, 1b and 1c.

**The sign-in screen was rebuilt** (D-108 to D-110, D-114). Two halves: the software on the left in sage with the white mark, a headline, five features with icons, and — the only place in the product that says it — `by Infobytes Nepal Pvt. Ltd.` with both support numbers. The clinic's own letterhead sits above the fields on the right, so somebody at a shared machine sees whose system this is before typing into it. Only `company.name` and `company.logoUrl` cross to the browser; both are printed on every bill that leaves the shop. `lib/vendor.ts` is the one home for the maker's name and numbers. Documented as Design.md §9.

**The icons are finally real.** The owner supplied `logo-main.png`, `logo-white.png` and a new `favicon.png`; `public/icons/*.png` had been placeholder Faarma artwork since the rename, listed as a go-live blocker in three previous sessions. `scripts/make-icons.mjs` now derives the 192, 512, maskable and Apple touch icons from the favicon (D-111). That blocker is closed.

Decisions/assumptions: D-106 to D-114.
Schema changes: none. Production untouched all session — read once to confirm the company row, never written.
Broke/fixed: `tests/first-price.integration.test.ts` did not typecheck (a libSQL `execute({ sql })` with no `args`) — it was committed that way last session and my "typecheck clean" claim for C-012 was wrong. The new login test caught a real defect before anyone saw it: at five features the both-modules install silently dropped "Keeps working offline", the most distinctive claim on the screen (D-110). A `pnpm build` run while `pnpm dev` was live failed mid-prerender on `/stock/opening` with a webpack-runtime error naming an innocent page — they share `.next`; now written into Deploy.md.
Verified: 343 tests across 30 files, typecheck, `run audit`, sweep, and a clean `pnpm build` (`/billing` 145 kB, `/login` 128 kB) with no dev server running. Accessibility clean across **15** screens — the sign-in screen is now audited too, before signing in, which it never was. The login screen was screenshotted at 1440, 900 and 390 px wide and read back for the vendor name and both numbers.
Docs: `Memory.md` CURRENT STATE rewritten from production rather than from memory · Rules §1a/1b/1c · Design §9 · Architecture file tree · Deploy (brand artwork, the dev/build clash, the extended sweep) · Go-live-checklist (a standing "where Family Smile Dental Care Center actually stands" table, §6 rewritten around the admin login, a new §6a for the sign-in screen, print-format line deleted).

**The User Guide had two things in it that should not have been.** It published `admin / admin123` and `bikash / staff123` to the owner in print — twice, once on the welcome card and once in the login section — and its cover was still ruled in the retired Faarma orange `#e87e28`, which Design.md has said never returns since the rename. Both fixed, the accent is now magenta-600, the cover carries the real `logo-main.png` (the `.cover img` CSS rule had been sitting there unused since the guide was written), the welcome card no longer describes ClinicNP as pharmacy-only, and `01-login.png` was re-captured. Rebuilt: 6.5 MB, `node scripts/build-guide.mjs`. **Only that one screenshot was re-captured** — the rest were taken against seeded demo data and re-running the whole capture against production, which now has no bills or patients, would replace a guide full of worked examples with a guide full of empty screens.

**For whoever picks this up next.** The software is ready to trade; everything left needs the clinic in the room. In order: replace `admin`/`admin123` and create real accounts; services, rates and doctors; prices for the 478 medicines (or let the counter set them as they sell, D-105); opening stock with batches and expiry. Two small ones the owner owns: `company.pan_no` is empty, and the invoice footer says `ClincNP` — missing an `i` — on every bill.

Still live: **`admin` / `admin123`.** The owner has said, more than once, that they will change it themselves and that it is not mine to chase. Do not re-raise it unprompted. Do not write it down anywhere as though it were fixed.

### C-014  ·  2083-05-26  ·  Booked consultations, a doctor who can sign in, and an alert that reaches a phone

The owner asked for four things in one message: a Clinic tab for a doctor's booked consultations, a way to configure doctors like laboratories are configured, a Doctor login that sees only their own list on a phone, and an alert — on the phone and by email — the moment a consultation is booked.

**The first thing to say is that this contradicted a standing rule.** Rules §2.4 read "no appointments, no scheduling, no SMS, no patient portal, no telemedicine in v2". It was written to stop the product drifting into a hospital information system, and it was right to be there. The owner asked for this specifically and it is a diary, not a scheduling engine — Family Smile Dental Care Center was keeping it on paper on one desk, which is exactly the failure the software exists to end. Built, and §2.4 rewritten so it says what is now in and what is still firmly out (D-115). Nothing else on that list moved: no SMS, no patient portal, no patient-facing booking, no recurring bookings, no queue numbers, no calendar sync.

**Doctors were already half there.** `doctors`, `lib/repos/doctors.ts`, Settings → Doctors and the doctor-share reports have existed since Phase 3. This session gave a doctor an email, a link to a sign-in, and two alert switches, rather than building a second doctor.

**A booking is not a visit** (D-116). `appointments` is its own table; `visit_id` is set only when somebody actually walks in. Writing a visit at booking time would put people who never came into the day's counts, the doctor's share and every clinic report. Time of day is `HH:MM` text beside `date_ad` and `date_bs` (D-117) — a clinic books "Thursday at 2" in local time and always will.

**Back to back is not a clash** (D-118). The overlap test is strict on both ends, so 2:00 for fifteen minutes and 2:15 are two consecutive patients. Getting that backwards would have the software refuse the way every clinic in the country runs its afternoon. A cancelled booking gives its slot back but stays on the day with its reason (D-119) — "nobody booked" and "somebody unbooked them" must not look the same.

**The booking is saved first and the doctor is told afterwards** (D-120). `lib/notify.ts` throws at nobody: every attempt is written to `alerts_sent` as sent, failed or off, and the front desk is told in one plain line what actually reached the doctor. A mail service having a bad afternoon is not a reason to ask a patient to ring back. Booking with nothing configured at all was run end to end and reports `push off / email off` with the consultation saved.

**The doctor's phone is its own route tree** (`/my`, D-123), not a narrowed back office: one column, thumb-height controls, a bar at the bottom, and their own details with the two alert switches, an on/off for this phone, and a test button. The test button is not a nicety (D-125) — turning alerts on succeeds on every phone including the ones where nothing will ever arrive, and without it the first anybody learns is the morning a patient is waiting.

Decisions/assumptions: D-115 to D-125.
Schema changes: **`0018_consultations.sql`** — `users` rebuilt again for the `doctor` role (third time; the CHECK is still the reason), `doctors` gains `email`, `user_id`, `notify_push`, `notify_email`, plus new `appointments`, `push_devices` and `alerts_sent`. Applied; `foreign_key_check` clean; `users`/`doctors`/`patients` row counts unchanged. **Production has run it.**
New dependency: **`web-push`** and its types (D-121). Alert delivery is RFC 8291 encryption plus a signed token per delivery service — well past the ~50 lines Rules §3 says to hand-roll. Email needed nothing: `lib/email.ts` is one `fetch` at Resend.
Broke/fixed: nothing existing broke. Three things the click-through caught that reading would not have: the clinic module defaults **off** on a fresh company row, so a scratch install 404s every clinic route until it is switched on; `counters` uses `next_value`, not `value`; and a doctor signing in was pushed to `/dashboard` by the login form and only then turned around by the layout — one wasted hop and a flash of somebody else's screen. `/` is now the front door and routes by role, and `manifest.json` starts there too, so an installed app opens on the right screen for whoever holds the phone.
Verified: **374 tests across 33 files**, up from 343 — 31 new in three files: `appointment-types` for the clock arithmetic, `consultations.integration` for idempotency, clashes, cancellation, moving and one doctor not seeing another's list, and `phone-alerts` which encrypts a real browser key and proves the failure is the connection rather than the crypto. Typecheck, sweep, and a clean `pnpm build`. Clicked through the running build against a throwaway database at 1440px as the owner and at 390px as the doctor: the board, a doctor's day, the booking dialog with patient search, a booking that landed, Settings → Doctors, the doctor's list and their details — and the four screens a doctor must not reach, each of which turned them around. `alerts_sent` was also checked with nothing configured, which is how Family Smile Dental Care Center will first see it.
**Not configured yet, and this is the part that needs the owner.** `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` are in `.env.local` for local work only — the live site needs its own pair, generated once with `pnpm alert-keys` and **never changed** (D-122). Email needs `RESEND_API_KEY` and `MAIL_FROM` on a domain Resend has been shown to own. Until each is set the screens say so plainly and bookings still save.
**A note for testing alerts:** the app's offline layer is switched off under `pnpm dev`, so there is nothing installed in the browser to receive an alert. Alerts can only be tested against `pnpm build && pnpm start`, or the deployed site.
Still live: **`admin` / `admin123`.** Untouched, unmentioned to the owner, and not fixed.

### C-015  ·  2083-06-05  ·  Dues and part payments, a rupees-or-percent discount, and a backup that was never kept

The owner asked for three things: bills sold on dues or part payment (medicine and services alike), the patient's details on such a bill as a service bill has them, and a place to track who owes what by name and clear it when the money comes in. Mid-session they added: the bill discount should take rupees **or** a percentage; and — looking at Settings → Backup — where are the "Automatic" backups kept?

**Dues** (D-126 … D-134, D-136). The counter's methods are now Cash · QR · **Dues**; Dues takes *Paying now* (Cash or QR) and shows *Left on dues*, and needs a patient attached exactly as a service does (a typed name on a pharmacy-only install). `lib/dues.ts` is the arithmetic — split at sale, balance, return split, oldest-first allocation, grouping by person — and `lib/repos/dues.ts` the SQL, with `OWED_AT_SALE_SQL` as the one reading of what a bill left owing. A new **Dues** item in the sidebar lists people who owe, biggest first, opening to their bills; *Receive payment* clears the oldest bill first and shows the split before saving; *Paid back* lists payments, which the owner can undo. It reaches the bill page (still owed, payments, receive for this bill), the register (*Owes X* / *Dues cleared*), the patient card, the dashboard, returns (debt first, then cash), the printed bill (*Paid*, *Balance due*) and the day close (money actually taken, left on dues, dues paid back, expected cash). The old whole-bill "Mark paid" and `credit-bills.tsx` are gone; `/bills/credit` redirects.

**Discount** (D-135). A `रू | %` switch on the bill discount in `lib/discount.ts` (`counterTotals`, shared by the pane and the save). Found and fixed on the way: the discount and tendered boxes kept the previous bill's figures after a save while the total silently ignored them.

**Backups — found, not fixed.** The nightly cron and the close-year "backup first" both record a size and keep no file (Known issues). The owner asked only where they are stored, so this is written down and put to them rather than changed.

Schema: **`0019_dues.sql`** (additive). Rehearsed on a replica rebuilt from a full read-only export of production with the real runner: guard refused → 10 statements, row counts unchanged → guard clean; every real trading day's day close identical afterwards. **Not applied to production** — the tool's permission check blocked it; the owner runs it (Deploy.md, "0019 dues"). Backup of production at `backups/prod-before-0019-2026-09-21T12-19-26Z.json`, and `backups/prod-*.json` is now gitignored.
Broke/fixed: planning the production run exposed that pre-0019 code could still write a credit bill with `due_paisa = 0` after the migration, which would read as paid (D-129) — fixed on the read side and tested. `getBillDetail` never joined `patients`, so the bill page never showed a patient number; now it does. The Dues table pushed a phone's screen sideways and wrapped patient numbers; it stacks on a phone now.
Verified: **436 tests across 36 files**, up from 374 (62 new: 61 in `dues.test.ts`, `dues.integration.test.ts` and `discount.test.ts`, one in `outbox.test.ts`), mutation-checked by breaking the return split (5 fail). Typecheck, `run audit` (80 INSERTs), accessibility clean across **16** screens (`/dues` added), sweep clean in `src/`. A real browser against a production build on a seeded scratch database: 50 checks for dues (counter, patient required, dues list, oldest-first split, over-payment refused, toasts, bill page, register, patient card, return split, undo, day close, dashboard, old address, 390 px) and 10 for the discount.
Docs: PRD §4C (new) and the roles table · Architecture §2.5, §3.2–3.3, file tree, §5.7 (new) · Rules §2.10–2.11 · Design sidebar + payment pane + Dues screen · Phases "After Phase 5" with acceptance boxes · Go-live checklist (status, printing, the backup warning, first day) · Deploy "0019 dues". **User Guide** rebuilt (8.0 MB): a new *Dues* chapter and *Selling on dues* / *discount* sections from five new screenshots (`49`–`53`, captured from the seeded sample database, never production), "Credit" wording gone, and the sentence "ClinicNP also backs up nightly on its own" — false — replaced with what is true. Also: a bill of services alone no longer draws an empty medicine table on its bill page.
Not built (requested, out of scope): none. Offered, not built: `रू | %` on the per-line discount boxes; a fix for backups.
Also found: `.env.local` now points at production (see Environment), and the outbox drops the inline patient snapshot (Known issues). Neither changed.
Next: owner runs 0019 on production, commits the rest and deploys; then decide where backups may be kept.

### C-016  ·  2083-06-06  ·  Nepali or English date boxes, an optional manufacture date, backups that are kept, and reading an invoice photo (explored)

The owner asked for: (1) the manufacture date on a purchase made optional; (2) Nepali/English calendars in Opening stock, switchable from Settings — scope chosen when asked: **every date box** — then, mid-session, a small toggle inside the popup too, with the Settings choice as the calendar a box opens in and shows; (3) yes to building the backup store offered in C-015; (4) the feasibility of photographing a supplier invoice and filling the purchase from it — explore only.

**Date boxes** (D-137, `0020`). `lib/calendar-view.ts` lays out either grid and converts English picks back to BS; `DatePickerBS` keeps its BS-text contract and gains the नेपाली | English switch, year jumps, Clear (for optional dates), Escape / click-outside, and a left shift so it stays whole on a phone. The setting is on Settings → Company, read by the `(app)` layout on its own query and handed down by `DateCalendarProvider`. **Mfg date** optional (D-139): validator, form label, and a mfg-after-expiry check on both sides. **Backups** (D-138, D-140): `lib/backups.ts` + `lib/backup-keys.ts`; the nightly cron, Back up now and the year close keep gzipped copies in the private store (`file-store.ts` now also recognises a Vercel-connected `BLOB_STORE_ID`); Settings → Backup says whether backups are on and lists each kept copy with Download (`/api/backup/kept/[id]`, streamed); the year close requires a real backup.
Schema: **`0020_date_calendar.sql`** (one column). Rehearsed with 0019 on a replica of a fresh read-only export of production (42 tables, 3,132 rows): guard refused → 0019 (10 statements) and 0020 (1) with `@verify` counts unchanged → guard clean at 20; every table count and every company field matched; `date_calendar = 'bs'`. **Not applied to production** (permission check; the owner runs it).
Broke/fixed: the first build put the purchase form's "optional" hint under the Mfg box, lifting it out of line with Expiry — seen in the guide screenshot, moved into the label. The wider popup ran 8 px off a 390 px screen — now shifts left. A test that deleted backup rows before their files left copies in `.filestore/` — fixed, and the leftovers removed.
Verified: **468 tests across 40 files** (32 new: `calendar-view` 12 — every day 2020–2034 round-trips — `backup-keys` 7, `backups-kept.integration` 5, `purchase-validator` 5, `company.integration` +3). Typecheck, `run audit`, sweep clean in `src/`, `next build`, accessibility clean across 16 screens, and 33 browser checks on a production build over a seeded scratch database (both calendars, the setting, year jumps, Clear, mfg refused/optional, 390 px, backup-off banner, year close refused then allowed after a download, the download a whole archive).
Docs: PRD §4A.1 step 2, §4D (new), §8.7 · Architecture §2.6–2.7, 0020, tree, §5.8–5.9 (new) · Rules §1.14–1.15 · Design date box + backup status · Phases (three new blocks) · Go-live (status, §0, §7) · Deploy (storage variables, private store steps, cron, "0019 and 0020 together"). **User Guide** rebuilt (8.6 MB): new *Picking a date — Nepali or English*; purchases, company and backup sections rewritten; screenshots `10`, `23`, `26` retaken and `54` added, from the seeded sample database.
**Explored, not built — invoice photo → purchase entry.** Feasible. Recommended shape: photo (phone camera or upload) → server route → Claude Sonnet 5 vision with a structured-output JSON schema (supplier, PAN, invoice no., date as printed, VAT, lines with name/batch/mfg/expiry/qty/free/rate/discount/amount, totals) → **our own code** parses dates, checks each line's arithmetic and the total, matches supplier by PAN and items against the catalogue (remembering a supplier's printed name → item once confirmed) → pre-fills the existing purchase form beside the photo, with doubtful cells marked; the person checks and saves through the unchanged `createPurchaseAction`. About US$0.02–0.05 a page at $2/$10 per million tokens. Needs `ANTHROPIC_API_KEY` + `@anthropic-ai/sdk`, the private store if photos are to be kept, and 10–20 real invoices to tune on. Alternatives weighed: Google Document AI / Azure invoice models (~$0.01/page, generic fields — weak on batch, expiry, free quantity), Mistral OCR (text only, still needs a model to structure it), Tesseract.js (poor on phone photos of tables). PRD §8.7.
Not built (requested, out of scope): none. Also noted: date of birth stays a typed English date (D-137).
Next: owner runs 0019 + 0020, commits, pushes, and connects a private Blob store; then check a *Nightly* backup downloads and restores.

### C-017  ·  2083-06-06  ·  Batch number and expiry on every medicine bill

The owner: "on billing the pharmacy items (medicines) — has the Batch No. and the Expiry Date printed itself on the bill too. It is mandatory."

Found: the A4 bill already had *Batch* and *Expiry* columns, filled at the counter from the FEFO preview and on a reprint from `bill_line_batches`, and the server records a batch for every medicine line or refuses the sale — so a saved medicine line always had a batch. What was not guaranteed: a batch the counter could not find would have printed "—", and a medicine from two batches printed "A, B" / "date, date" in one run of text. Production has never billed a medicine (`bill_lines` = 0), and all 24 of its batches carry a number and an expiry (read-only check).
Built (D-141): `lib/print-batches.ts` (`batchesForPrint`, `expiryForPrint`), shared by the counter and the reprint; the counter refuses to save a medicine line whose batch number or expiry it cannot print, naming the medicine; the bill prints each batch on its own line in both cells, in mono, unwrapped, under *Batch no.* and *Expiry*. `vitest.config.ts` now compiles JSX with the automatic runtime, as Next does, so a test can render the bill.
Verified: **476 tests across 41 files** (8 new in `tests/print-batches.test.tsx`, two of which render the bill to HTML), typecheck. **Printed bill checked in a real browser** (9 checks, seeded scratch database; `next dev` on :3150, because `next build` died out of memory twice while another project's build and server held the machine's last gigabyte): a medicine-only bill and a mixed bill print *Batch no.* and *Expiry* with the batch the stock records say goes first, and the reprint from the bill page prints the same batch and expiry.
Docs: PRD §4B.5 table + §4D.4 · Design §6 (the A4 bill described; thermal kept for reference) · Rules §1.16 · Phases · Go-live §5 · User Guide (making a sale).
Also: production now has 0019 and 0020 (the owner ran them); backups still have no kept copy.

### C-018  ·  2083-06-06  ·  Expiry as MM/YYYY on the bill; a free way to read an invoice photo (explored, checked)

The owner: the expiry printed on a bill should be the English month and year only — 30 December 2026 as `12/2026`. Claude is ruled out for reading invoice photos on cost; find a completely free alternative, explore, ask, run checks — do not build yet. And: the User Guide need not be rebuilt every session; update the other prod-docs as needed.

Built (D-142): `expiryForPrint` returns `MM/YYYY` from the stored AD date; `PrintBatchLine.expiryBs` renamed `expiry`. The counter print and the reprint share it. Tests updated (the owner's own example is one of them).
Docs: PRD §4D.4 · Design §6 · Rules §1.16 · Phases. The User Guide was **not** rebuilt (owner's instruction) — its text names the batch and expiry without a format, so nothing in it is now wrong.
Verified: 476 tests, typecheck, and a real browser print on a seeded scratch database (`next dev`): the counter and the reprint print `02/2028` for a batch stored as 2028-02-04 and `11/2026` for 2026-11-06, and agree.

**Invoice photo → purchase entry, free — explored and checked, not built.** A made-up distributor tax invoice (12 lines; batch numbers built to trip OCR — 0/O, 1/I, 5/S; expiry as MM/YY; free quantities) was rendered as a clean scan, a phone photo (2° tilt, 7° lean, blur, uneven light, JPEG) and a rough photo (5°, 14°, more blur, lower resolution), and scored against its answer key — exact batch / expiry / rate / amount per row, and whether each row's values stayed on one line:

| Engine | Clean scan | Phone photo | Rough photo | Same photos, straightened by hand | Straightened by the free OpenCV step |
|---|---|---|---|---|---|
| **PaddleOCR** (PP-OCRv6 tiny, `ppu-paddle-ocr`, MIT) | 11/12 batches, 12/12 expiry·rate·amount, 11 rows whole | table **not found** | table not found | phone 11–12/12 everything; rough 9–11/12 | phone 10/12 batches, 12/12 expiry·rate, 8 rows whole; rough 9/12, 4 rows |
| Tesseract.js (auto layout) | 10/12, 9 rows whole | 2/12, 0 expiries | 1/12 | 2–3/12 | — |

Read: PaddleOCR reads a flat printed invoice almost perfectly in 1–3 s on this PC's CPU; **tilt defeats every engine**, so a scanner step (find the paper, warp it flat; `ppu-ocv`/OpenCV.js, free) is mandatory, and the crude warp used here stretched the page — a proper one keeps the aspect ratio and lets the person drag the four corners. Tesseract is ruled out for photos. The one misread that nothing can fix alone is 0/O and 1/I inside batch numbers (`MF0I1830` → `MF011830`): the review screen must show the batch cells for an eye check. Numbers misread as letters ("o" for 0) are fixable because the column is known to be numeric. Free cloud tiers were weighed and kept as a fallback only: Gemini's free tier (reads structure directly, but free-tier inputs may be used by Google and limits can change), Azure Document Intelligence F0 (500 pages a month, 2 pages per document, needs an Azure account). The test harness is in the session scratchpad (`ocr-check/`), not the repo.
Questions put to the owner (answers decide the build): how their suppliers' invoices are printed (laser / dot-matrix / handwritten), which device takes the photo and which enters the purchase, whether on-device-only is required or a free cloud fallback is acceptable, multi-page invoices, keeping the photo with the purchase, and 5–10 real photos from different suppliers.

### C-019  ·  2083-06-07  ·  The supplier's discount after the total, and ten real invoices put through the free reader

The owner: no photo kept with the purchase; photos come from a phone and are uploaded; ten real supplier bills are in `bill_photos_example/`; some suppliers give the discount after the total — "add that feature too to make sure the bill is exactly reflected as in the paper"; and what has to be configured for PaddleOCR.

Built (D-143, `0021`): `purchases.bill_discount_paisa` and `rounding_paisa`; `purchaseTotals` now reads in the supplier's order (lines → line discounts → discount on the bill → VAT on what is left → rounding → net total) and caps the discount at what is left; purchase entry grew a `रू | %` *Discount on the bill* box and a *Rounding* box under a "from the supplier's bill" caption; the VAT summary subtracts both discounts and the purchase register adds them into its one column.
Verified: 485 tests across 42 files (9 new in `tests/purchase-bill-discount.test.ts`, pinned to figures off the owner's own invoices), typecheck, `run audit` (SQL arity — the INSERT grew two columns), and a browser run against a seeded scratch database entering the real Remedies invoice: stored subtotal 1,190.40, discount 63.66, rounding 0.26, **net total 1,127.00 — the paper's own figure**; percent mode showed 10% of 1,190.40 = 119.04. Migration rehearsed on a replica of that day's production (43 tables, 3,170 rows): guard refused → 2 statements, counts unchanged → guard clean at 21; production's one purchase came back with both columns at 0.

**The ten real invoices, measured (D-144 for the photo).** Three are **handwritten** (Heal Enterprises ×2, Agama Traders), five **dot-matrix** (Remedies, Surya ×2, K.B. ×2), two **laser** (Navya Jyoti, the same invoice twice). Formats vary wildly: batch and expiry columns exist on the dot-matrix bills (`EXP.DATE` as `2028/02`) and are **absent** from the Navya Jyoti laser bill; free goods appear as `- do -` continuation rows; every one ends with a discount after the total, most with a rounding line. All ten photos arrived through WhatsApp at ~800 px wide — about a quarter of a phone's own resolution.
Scored with an answer key read by eye, counting a row only when one OCR line actually holds its values together (`scratchpad/ocr-check/run-real2.mjs`): **printed bills — 31/33 rows recovered (94%); within those, qty 97%, rate 97%, amount 84%, expiry 74%, batch 65%. Invoice number 57%, total 86%, the discount line 100%, net total 86%.** Handwritten bills return nothing usable. Best settings of those tried: PP-OCRv6 **tiny** with the image upscaled ×2, `per-line`; the small and medium models were **worse** and medium took 15 s a photo; contrast equalisation traded expiry accuracy (−15 pts) for batch accuracy (+7) and row assembly (+10); hard thresholding destroyed the dot-matrix text completely (0%).
Not built: the reader itself. Still open before building — whether photos can be sent at full resolution rather than through WhatsApp, and how the three handwritten suppliers should be handled.

### C-020  ·  2083-06-08  ·  The invoice reader, built

The owner: *"the bills only fill the fields in the purchase entry then user tallys / rechecks with the actual paper then can choose to amend if not exactly reflected then only makes a purchase entry"*, high-resolution photos will be uploaded in the real system, suppliers with no batch or expiry column are left empty, handwritten bills are filled only where readable, and — the question that shaped the screen — what happens to a medicine that is not in the software.

Built (D-145 to D-147): `src/lib/invoice-read/` in four parts, only one of which needs a browser — `ocr.ts` (straighten, scale, PaddleOCR), and the pure `parse.ts`, `match.ts`, `draft.ts`. *Fill from a photo* sits at the top of Purchases → New purchase. No migration, no new table, nothing stored.
What the parser does with a real bill: hinges each row on its expiry column, falls back to the quantity when the expiry is missing or drifted onto its own line, reassembles a batch printed with a space in it, folds a `- do -` FREE row into bonus quantity on the row above, carries the name down a `- do -` row that is a second batch, and reads the closing figures separately (`TOTAL`, `LESS DISCOUNT`, `ROUNDING` including `-0.31`, `NET TOTAL`, and `Net Amount` / `Grand Total` for suppliers who word it differently). Expiry is read as `2028/02`, `06/28` or `12/2026` and dated to the end of that month, which is what makes it print back as `MM/YYYY` (D-142). Matching folds both sides onto one alphabet (O→0, B→8, S→5, I/L→1) so `S0LAY` finds `SOLAY`, and refuses a match it cannot separate from the runner-up, which is what stops `RAB` becoming `RAB 20` rather than `RAB 40`.
Two dead ends worth remembering. `looksLikeMoney` first missed `2754.26` — four integer digits with no thousands mark — which silently lost a bill's net total. And an expiry may be separated by `/` or `-` but never by `.`, or every rate on the page (`8.55`) reads as a date in the 2050s.

**Verified.** 504 tests across 43 files (19 new in `tests/invoice-read.test.ts`, pinned to the OCR text the owner's own bills actually produced, misreadings included), typecheck, `run audit`, sweep, and a production build. In a browser against a seeded scratch database, 22 checks: a flat invoice photo filled **12 of its 12 rows** with batch, quantity, cost and expiry; the same invoice photographed **at an angle** filled 1 of 12 before straightening and **12 of 12** after it; a rough photo said plainly that it read nothing; every line showed the supplier's own wording; the lines were set against the bill's net total; and `purchases` was untouched throughout — the reader writes nothing.

**Not done, deliberately.** A purchase line still requires a batch number and an expiry, so a supplier who prints neither (Navya Jyoti) means typing both off the pack; whether to relax that for Consumable and Other items is the owner's call and was left alone on a live system. Nothing remembers a supplier's wording between bills yet, so a name matched by hand this month is matched by hand again next month — that is the next worthwhile piece and needs a table of its own.

**Gone from the repo.** `bill_photos_example/` was removed by the owner mid-session (it was untracked, so there is nothing to restore); the browser checks now run against the generated invoices in the scratchpad. The measured accuracy on the ten real bills stands in C-019 above, taken from the OCR text those photos produced.

### C-021  ·  2083-06-08  ·  1,080 more medicines for the catalogue

The owner: the shop keeps meeting products the software does not have, 938-odd
is not enough, take it past 2,000 — real products only, nothing invented to pad
the table, and nothing repeated.

Built: `import-templates/pharmacy-items.EXTRA.csv`, **1,080 rows**, in the same
shape the existing importer reads, so nothing in the software changed. Deduped
against a **read-only list of production's own 939 brand names** and against
the 932-row starter, by a key that ignores case, spacing and punctuation — 290
of the names written were already held and were dropped rather than imported
twice. Prices are all blank, as the starter's are: an unpriced item is created
unsellable, which is the honest state for a catalogue that arrives before a
price list. `controlled` is set from the molecule rather than by hand, so the
benzodiazepines, zolpidem, tramadol, pethidine and phenobarbitone come in as
`Yes` and force a patient's name onto the bill.

Coverage: 927 medicines, 56 consumables, 97 other — the second and third brand
of what a counter runs out of first, molecules by name and strength the way a
prescription and a generic range are billed, the paediatric syrups and drops,
the surgical and dressing shelf, rapid test kits, and the ayurvedic and
over-the-counter shelf.

Verified on a scratch database built from `0021`: starter imported (932), then
this file — **1,080 read, 0 rejected, 0 collisions, 1,080 created, 2,012
items, no duplicate brand name, 29 controlled**. Units land as intended
(Tablet → Strip ×10 → Box ×100; one Vial, Tube or Piece for the rest).
Production is at 939, so the same run there lands at **2,019**.

Two things the owner has to accept as guesses, both flagged in the import
README: **strip size is 10** unless the pack is not a strip, and a
**manufacturer is left blank** wherever it was not certain rather than filled
in with something plausible. The reliable way to match exactly what Family Smile Dental Care Center's own
distributors sell is still to import a supplier's price list through the same
importer.

### C-022  ·  2083-06-09  ·  A search box on Items, and the catalogue past 5,000

Three things the owner asked for at once: a search box on Items; an explanation
of why the Items tab showed ~1,180 when C-021 had claimed 2,019; and 5,000 real
pharmacy products, weighted away from the surgical shelf. Also a standing
instruction: **run the migrations and imports myself from now on**, leaving only
`git add`, commit and push to the owner.

**Why the count was short.** The importer wrote one statement at a time — for
1,080 products that is about 3,200 round trips to Turso, and the run was cut off
after 221 of them. Nothing was corrupt, because it only ever creates; it had
simply not finished. `db/import-items.ts` now writes in batches of 50 in a
single transaction each, which is one round trip per batch and makes a medicine
impossible to create without its units. Re-running is still the way to finish an
import that stopped, and that is how production was brought to 2,019.

**The search box** (`src/components/app/items-table.tsx`). The Items page used
to render every row; at 5,000 products that is a page nobody can open or type
into. It is now a client list with a box in front of it that matches brand,
generic and maker, ignoring case, spaces and punctuation, and it draws at most
200 rows at a time and says so. `useDeferredValue` keeps typing smooth. The page
itself stays a server component and passes a plain stock list, because a Map
does not survive the trip to the browser. One trap worth remembering: importing
`isUnpriced` from the items repo pulled `server-only` into the client bundle and
broke the build — the client uses `hasNoPrice` from `lib/units` instead.

**The catalogue** (`import-templates/pharmacy-items.EXTRA2.csv`, 3,181 rows).
Built from compact lists expanded by a script, so a brand family is one line and
the strengths it is really sold in are enumerated by hand rather than generated.
Deduped against a read-only export of production's own names. Production now
holds **5,200 items** — 4,218 medicines, 778 other, 204 consumables — with no
duplicate name, no item missing its units, and 82 controlled.

**Verified.** Dry run then commit on a scratch database built from `0021`
(5,193 items, 0 duplicates, 0 orphans), then the same file on production;
typecheck, 504 tests, audit, a production build, and 14 browser checks against a
5,195-item catalogue: the page opens in 3.4s, draws 200 rows, "telma" narrows to
8, "telmisartan" finds 49 including brands whose names do not contain it, and
typing a whole word takes 1.3s.

**Still the honest gap.** These are real products to the best of my knowledge of
the Indian and Nepali market, not Family Smile Dental Care Center's distributors' actual range. A price
list from Remedies, Surya, K.B. or Navya Jyoti run through the same importer
would be their names, their pack sizes and their spellings — and would match the
invoice reader first time.

### C-023  ·  2083-06-09  ·  A real pharmacy's own item list

The owner sent `items_ref.xlsx` — a stock report out of the software another
Kathmandu pharmacy runs — with one instruction: read the **Prodname column
only**, add what is missing, repeat nothing. The stock, batch numbers, purchase
dates and amounts in that file are that shop's, not Family Smile Dental Care Center's, and none of them
were read.

The sheet is a batch-level stock report, not an item list: 4,970 rows where
`Sn` marks what each row is — 1 a supplier heading, 3 a product's batch, 4 and 5
subtotals. Taking `Prodname` from the `Sn = 3` rows and collapsing the repeats
gave **1,571 distinct products**.

**Two passes of dedupe, because one was not enough.** The exact key (upper case,
punctuation stripped) caught only 52 — that pharmacy writes `PANTOP-40MG` where
the catalogue says `Pantop 40`. A looser key that drops the words for the form
(TAB, CAP, TABLET…) and a bare `MG` after a number caught **72 more**, every one
of them checked by eye and genuine. `ML` and `GM` are deliberately *not*
dropped: 40 ml and 40 mg of the same brand are two different products. 124
dropped, **1,446 created**.

Shapes are read off the product's own name, since no other column was read —
`INJ.` is a vial, `SUSP.` a bottle, `CREAM` a tube, `SUPPOSITORIES` a piece, a
volume in millilitres pours, and everything else is a tablet in strips of 10.
`controlled` is matched on **stems, not whole words**, which is what the sheet
needs: it writes `CLONAZ-0.5MG`, not `Clonazepam`, and the first attempt with
whole-word matching flagged nothing at all.

Production now holds **6,646 items** — 5,664 medicines, 778 other, 204
consumables — no duplicate name, no item missing its units, 84 controlled, and
the 24 batches, 11 bills and 1 purchase untouched. Rehearsed first on a scratch
database built from `0021` with all four catalogue files in order (6,639 items,
0 rejected, 0 duplicates, 0 orphans).

**Left on the table:** the sheet's `Unit` column (TAB, SYP, TUBE…) would set
every pack shape exactly rather than by guessing from the name. It was not read
because the instruction was Prodname only; it is one flag away if the owner
wants it.

### C-024  ·  2083-06-09  ·  The product moves to its second clinic

**The install changed hands.** Every occurrence of the first clinic's name — in the PRD, Rules, Phases, Deploy, the go-live checklist, this file, the
migration rationale comments, four source comments and three tests — now named
the second clinic. 56 replacements across 24 files.

**The one thing the rename had to not touch was `Himalaya`**, the medicine
brand, which appears 71 times in `items.csv` and 75 more across the catalogue
templates. Every rule either matched a longer phrase or guarded with `(?!aya)`,
and the uppercase `HIMALAYA` in `pharmacy-items.REF.csv` was left alone by the
same guard being case-sensitive. Verified after: no stray occurrence of the old name, 4 files still
carrying `Himalaya` at their original counts.

Three infrastructure facts moved with it and were corrected against the working
tree, `git remote -v` and `.env.local` rather than renamed blindly: the repo
path, the GitHub repository and the Turso host.

**A new, empty database.** Read-only check found **0 tables** — so `db:migrate`
took it from nothing to **21 migrations** in one run.

**The catalogue, rebuilt from its own sources.** `items.csv` — the file the
owner supplied — is a dump of the `items` table alone: 6,646 rows with no unit
columns at all. `db:import-items` cannot read it, and an item with no units
cannot be sold. The packaging was recovered rather than guessed: the four
`pharmacy-items.*.csv` templates these items were originally imported from
(C-021, C-022, C-023) still carry `unit1/2/3`, and covered **6,637** of them;
`item_units` in the last prod backup covered **8** more; the last one,
`HYTIDE 25`, was renamed in the app after import and was matched to its template
row `HYTIDE-25MG` by a stated alias, not by fuzzy matching. Nothing was derived
from `shape`.

The join was written out as `import-templates/fsdc-items.csv`, 6,646 rows
in the importer's own format, with `items.csv` as the authority for name,
generic, category, manufacturer, shape and reorder level. **All rates left
blank** — prices, services and stock come later, and the counter refuses an
unpriced item rather than billing Rs 0.

Imported: **6,646 items, 14,187 units**, 0 rows rejected. Verified against
`items.csv`: every one of its 6,646 names present, category split identical
(5,664 · 778 · 204), no item without a base unit, none without a default selling
unit. 504 tests pass across 43 files.

**Bootstrapped, after fixing the reason it could not be.** `db/bootstrap.ts`
was the **only** script in `db/` without the `process.loadEnvFile` block the
other six share, so it could never see `.env.local` and stopped at
*"TURSO_DATABASE_URL is not set"* no matter what was in the file. That is a
pre-existing bug, not something the rename caused — bootstrap has simply never
been runnable this way. Added the same block, with a comment saying why.

It then refused a second time, correctly: the password guard wants 8 characters
and the one supplied was 4. Nothing had been written — the guard runs before the
client is even constructed. Re-run with a longer one, it wrote the company row
(PAN, address, phone, **pharmacy + clinic**), opened fiscal year **2083/84** and
created one admin. Both the password and the PIN were then verified back through
the same salted scrypt the app signs in with, because a bootstrap that produces
a user who cannot sign in is only discovered at the clinic on the first morning.

**🔴 The admin password is eight repeated digits**, chosen against advice purely
to clear the length guard. It is the blocking item at the top of the go-live
checklist and must be replaced before the site is reachable from outside.

**Fixed on the way past:** `pnpm-workspace.yaml` had `allowBuilds` entries still
reading *"set this to true or false"*, so pnpm skipped esbuild's build script and
every `tsx` command in `package.json` failed with `ERR_MODULE_NOT_FOUND`. Set to
real booleans.

### C-025  ·  2083-06-09  ·  The sign-in screen that would not load, and the clinic's own letterhead

**"There is a problem with the server configuration"** is NextAuth saying
`AUTH_SECRET` is missing, and it was: `.env.local` carried the key with an empty
value. Nothing in the logs says so more plainly than the screen does, which is
why it is worth writing down once.

Filled the **empty** values only, leaving `VAPID_SUBJECT` and both Turso
settings as they were: `AUTH_SECRET` and `CRON_SECRET` from
`randomBytes(32).toString('base64')`, and a VAPID pair from `pnpm alert-keys` —
one invocation, because the script prints a **matched** pair and taking the
public key from one run and the private from another silences every phone.

`BLOB_READ_WRITE_TOKEN` is the one that cannot be filled here: Vercel issues it
when a private Blob store is connected. Left empty with a comment above it
saying what breaks meanwhile, rather than a value that would look set.

**The letterhead went in as data, not as code.** `company.logo_url` holds a JPEG
data URL — that is the designed path (`src/lib/logo-image.ts`): it is carried
with the company profile, cached with it, backed up with it, and already in the
page before anybody presses Print, which is what makes it work at a counter with
no internet. The supplied file is 872x546 and **46 KB as a data URL against a
220 KB cap**, so it needed no downscaling, and the stored base64 round-trips to
the same bytes. Setting that one row lit up the sign-in screen, the billing
screen, the A4 invoice and the stock-out and refund slips at once — no component
was touched.

**The product's own icons were deliberately left alone.** `public/icons/*` and
the manifest are ClinicNP's mark, and the sign-in screen is built as two halves
— the software on the left, the clinic on the right. Putting the clinic's logo
in the favicon would collapse that distinction; it is one command away
(`node scripts/make-icons.mjs`) if the owner wants it.

**Checked rather than assumed**, against a dev server on :3111: `/login` returns
200 with the letterhead in the HTML, the right password returns a session for
the admin user with role `admin`, `/dashboard` is 200 with that cookie and 307 to
`/login` without it, and a wrong password comes back `CredentialsSignin`.

### C-026  ·  2083-06-10  ·  245 laboratory tests, a purchase line that fits on one line, and a menu that scrolls

**The clinic is trading now** — 2 bills, 2 patients, 2 purchases, 7 stock moves,
its own four doctors and ten service groups. Everything below was done against
that, not against an empty database, which is why the import backs up first and
why the screen changes were kept to the three that were asked for.

**245 laboratory tests.** `services_lab.csv` is another install's `services`
table, so its `id`, `group_id` and `default_lab_partner_id` all point at rows
that do not exist here. None were carried across: new `ulid()` each, the group
and the laboratory resolved **by name in this database**. Only what describes
the test was read — name, code, sample type, whether a report comes back.

The three judgement calls were the owner's, not mine. The group is the
**existing `grp_lab` "Laboratory"**, not a new "Laboratory Services" beside it,
because a second lab group in the counter's list is a trap. Every test is
**outsourced with NOVUS PATH LAB AND DIAGNOSTIC CENTER as the default**, since
`bills.ts` refuses an outsourced line with no laboratory on it and a default
makes them billable without a per-line choice. And **every rate is 0**, with
partner cost 0 beside it: the source file's prices are another clinic's, and a
wrong price prints on a real bill where a missing one is simply refused.

Verified after: 245 in the group, 0 with a non-zero rate or partner cost, 0 not
outsourced, 0 orphaned partner references, all 245 CSV names present, and the
5 services that were already there untouched. Kept as
`db/import-lab-services.ts` — dry run by default, backs up `services` before the
first write, skips a name already in the target group so a second run is safe.

**The purchase line is one line.** Item · Unit · Batch · Expiry · Qty · Cost now
read left to right in the order they appear on a supplier's bill, instead of
splitting across two blocks with the eye jumping between them. It stacks below
`lg`. The "On the bill: …" note from the photo reader moved out of the Item box
to full width underneath, so one line being taller no longer ragged-edges the
whole row.

**Mfg date is gone from purchase entry** — not from the schema. `batches.
mfg_date_ad` stays, the validator still accepts the field, and the form simply
sends `""`, which was already stored as NULL. Nothing behind the screen changed,
so no migration and no server edit. Opening stock keeps its Manufactured box;
only purchase entry was asked for.

**An expiry can now be typed.** `DatePickerBS` grew an opt-in `typable` prop,
**off by default** — 8 screens use that component and only two of them are
somebody copying a date off a pack. On those two the box is an input with the
calendar still one click away. Typing is read in the shop's own calendar, the
one on screen and the one printed on the pack.

The parsing is in `calendar-view.ts` with the rest of the date maths, not in the
component, because the failure worth guarding is silent: a box that accepts
almost-a-date and commits the wrong day. A half-typed `2083-0` returns null and
**does not commit**, so backspacing never destroys the saved value; `2026-02-31`
is refused rather than rolled forward to 3 March the way `new Date` would.
8 new tests, 512 passing across 43 files.

**The menu scrolls.** `<aside>` is `h-full` inside an `overflow-hidden` parent,
so on a short screen the lower half of the menu was simply unreachable. The nav
list is now its own `min-h-0 flex-1 overflow-y-auto` region: `min-h-0` is the
part that matters, since a flex child will not shrink below its content without
it. The wordmark stays at the top and the name and Sign out stay at the bottom,
which is what somebody reaches for on a shared counter machine. Checked at
1600x560: scrollable, reaches the bottom, footer still visible — and at
1600x900 it does **not** scroll, so no scrollbar appears where none is needed.

### C-027  ·  2083-06-13  ·  Two tiles to a row, the real logo, and a purchase you can read back

**The sidebar is two columns instead of a scroll.** C-026 made the menu
scrollable, which solved the symptom: on a short screen the lower half was
unreachable. The better answer is that the list is short enough to fit if it is
laid out — so each group now runs two tiles to a row and nothing needs
scrolling at all. The scroll region stays as the safety net.

Three details earn it: the first block (Dashboard, New bill) stays one per row,
because those are the two most-used destinations and a full-width row is the
bigger target; a group with an odd number of items gives the last one the whole
row, which is what lets **Laboratory** show its full name rather than clipping;
and the tile drops to 13 px with a tighter icon gap to buy the width.
Measured after, not assumed — **no label in the menu is clipped** at any role.
Collapsed mode returns to one icon per row, since a second column at 68 px
leaves nothing to hit.

**Bills and Dues were reading as part of Pharmacy.** In one column the blocks
were far enough apart to tell; packed two-up they merged, and the first
screenshot showed Bills sitting under the PHARMACY heading as though it belonged
there. An unlabelled block that follows a labelled one now gets a divider.

**The mark is the real logo.** `logo-white.png` is 1500x800 with the artwork
filling 88% x 45% of it, so used as-is a third of the header would have been
empty transparency. Cropped to its own bounds once
(1316x360) and saved beside the original as `logo-white-trim.png` — the
original is untouched. `AppLogo` falls back to the typeset `Wordmark` when the
derived name is not ClinicNP, because the name follows the enabled modules
(D-025) and a raster cannot: a pharmacy-only install calls itself Faarma and
must not be shown a ClinicNP logo.

**A purchase can now be read back — there was no such screen at all.** Neither
the register nor the Purchases list linked anywhere, and no `/purchases/[id]`
route existed, so this was a page to build rather than a link to add.
`getPurchase()` joins the lines to items, batches and `item_units`, so a line
entered in boxes reads as boxes rather than as the base quantity it became, and
carries the batch's remaining-of-received alongside — "what did we buy" and
"how much is left" are the same question asked twice. The totals repeat the
supplier's own order (lines, line discounts, bill discount, VAT, rounding) so
the screen can be read against the paper it was copied from (D-143).

**Read-only, and deliberately so.** A saved purchase has already created
batches and raised stock through `stock_moves`, some of which may be sold. There
is no Edit button and the page says why: a correction is a purchase return.

Linked from the register **and** the Purchases list, since both show the same
rows and only one being clickable would be the odd thing. `PurchaseRegisterRow`
gained an `id`; the CSV export maps its columns by name, so its output is
byte-for-byte what it was.

**Caught by looking rather than by trusting a 200.** The first check reported
the detail page "loaded" — it had, as a Next.js error overlay. `ORDER BY rowid`
is ambiguous across three joined tables and SQLite refused it. Fixed to
`pl.rowid`, and the re-check now asserts the page has line rows and a net total
instead of merely responding. Both real purchases render.

**Add line moved under the lines** on purchase entry, out of the section
heading: the last box on a line is the cost, and the next thing somebody does
after typing it is start another line.

512 tests pass across 43 files; typecheck clean. Nothing in the database was
touched this session.

### C-028  ·  2083-06-14  ·  A selling price on the purchase row, dates that type themselves, and a purchase that can be corrected

**Live when this started:** 4 purchases, 9 lines, 2 purchase returns against
them, 3 bills — so everything here was built to respect stock that has already
moved, and **nothing was tested against production**. The browser runs used a
throwaway local database built from the migrations and deleted afterwards; the
dev server was pointed at it by environment override, and that override was
proved to win over `.env.local` before anything ran. Production was then
compared against the pre-migration backup: same row counts, no item price
changed, no audit or throttle rows written.

**Selling price on the row (0022, D-149).** A *Sell price* box after Cost/unit,
filled with the item's current price for the line's unit and refilled when the
unit changes. A price lives on `item_units`, per item and unit, never on a
batch; saving writes it there the same way Items → Set prices does, bumping
`items.updated_at` only when the price really changed, so counters refetch
their catalogue only when there is something new. `purchase_lines.
selling_rate_paisa` keeps the record. The one subtle rule is on edit: the
item's price moves only where the line's price was changed in *that* edit —
otherwise re-saving an old purchase would quietly undo a price set since.
`0022` was applied to production after a backup of the purchase tables; it is
additive, so the code already deployed kept working with it in place.

**Dates that type themselves.** `maskTypedDate` puts the dashes in as digits
arrive — `20250230` → `2025-02-30` — handles backspace without fighting it,
still accepts `/` `-` `.` out of habit, and pads a one-digit month or day when
a separator closes it. It only arranges characters; whether that is a real day
is still `parseTypedDate`'s call, so 30 February is shaped and then refused.
Turned on for the invoice date as well as each expiry.

**Found while checking it, and fixed (D-150).** The owner's own examples were
English years. The live shop is set to English, so those worked — but I
measured every combination instead of assuming, and the design was wrong both
ways: on a Nepali-set shop `2028-01-31` off a pack saved as **14 May 1971** and
the owner's `20250230` as **12 June 1968**, silently; on an English-set shop a
Nepali bill's `2083-06-13` was refused. Typed dates now take their calendar
from the year (2060 and up Nepali, below English), which no real date can fall
the wrong side of. Checked in the browser under both settings.

**A purchase can be edited (D-148)** — reversing C-027, where I had called it
read-only by design; the owner asked for it with an admin password, and the
design below is what makes it safe rather than merely possible.
`updatePurchase` runs in one write transaction. Quantity may rise, or fall to
what has already left the shelf and no lower; a line whose batch anything else
has touched keeps its item and cannot be removed ("touched" = any stock move on
the batch not referencing this purchase); the date stays in its fiscal year and
a closed year refuses. Corrections are appended to the ledger as `adjustment`
moves referencing the purchase — no new reason, so no rebuild of
`stock_moves`' CHECK — and each guarded `UPDATE` re-checks the shelf inside the
transaction so a counter sale made mid-edit cannot be undercut. A removed line
leaves its batch emptied and kept, with its history true. Header totals are
re-derived exactly as on create (the line/VAT logic was pulled into one
`resolveLines` shared by both actions, moved not changed). The supplier's
ledger needed nothing: it is already derived from `purchases.total_paisa`.

The password is the **signed-in admin's own**, checked at the moment of the
write, throttled like sign-in but on a separate `purchase-edit:<id>` bucket.
Every edit writes a `purchase_edit` audit entry with before and after; the
purchase page shows *Last changed by … on …* in Nepal time (the server is UTC,
so formatting with its clock would put an evening edit on the wrong day).

**Tests.** 14 integration tests in `purchase-edit.integration.test.ts`, every
refusal followed by a check that the database is byte-for-byte unchanged. A
mutation check proved they bite: disabling the stock guards failed exactly the
two tests that cover them. Ten new date tests replay input one keystroke at a
time. 32 end-to-end browser checks passed on the local database, plus four
calendar checks under both settings. **536 tests across 44 files**, typecheck
clean. Also proved: an expiry's BS → AD → BS round trip is lossless for every
day of BS 2080–2090 in UTC, Kathmandu and Los Angeles.

**Left as it was, on purpose:** the manufacture date is not on the purchase
form, so an edit leaves each batch's `mfg_date_ad` untouched rather than
clearing it.

### C-029  ·  2083-06-14  ·  Paying suppliers and laboratories: at purchase entry, later, and undoing a mistake

**Asked:** a purchase is cash or credit, but big bills are paid in part; record
that, handle laboratory payables the same way, and add supplier payment
recording if it was missing. **Found first:** supplier payments already existed
(a box on each supplier's page) and so did laboratory payments (on the
laboratory statement) — but a purchase had no way to say anything was paid, so
every purchase went wholly onto the supplier's balance. Live had 0 supplier and
0 laboratory payments. The owner chose: overall balance rather than per-bill
allocation (D-152), a Payables page (D-153), undo with a reason (D-154), and
back up then migrate now.

**Purchase entry (D-151).** Under *Net total*, a *Payment* block: On credit ·
Paid in full · Part paid, with *Paid now* and *How* (cash, bank, cheque, QR),
then *Paid now* / *On credit* figures. New purchases only; the edit screen says
what was paid with it and leaves it alone. The purchase page shows *Paid when
entered* and *Left on credit*.

**Payables (`/payables`).** Two tiles (owed to suppliers, owed to
laboratories), a table of each with *Pay* and a link to the ledger or
statement, and *Payments made* — both kinds, newest first, purchase-linked ones
linking back to the purchase, undone ones struck through with who and why. Pay
warns, not refuses, when the amount is more than is owed. Also a card on the
Reports hub.

**Undone payments drop out everywhere they are read** — the supplier ledger,
`partnerBalancePaisa`, the laboratory summary, statement and its opening
balance. Every query that sums either payment table was found by grep and
changed; `backup.ts` needed nothing (it copies whole rows, and restores in an
order where `purchase_id`'s target already exists).

**Caught by the tests:** the payments list first sorted a `UNION ALL` by a
column SQLite would not match inside a compound SELECT — it would have been the
Payables page's error overlay. Now sorted from outside.

**Tests.** 15 integration tests in `payables.integration.test.ts`; every
refusal is followed by a byte-for-byte unchanged check, and Payables is checked
to equal the supplier ledger for every supplier, returns included. A mutation
check proved they bite (removing the undone filter, and the over-the-bill
guard, each failed its test). 33 browser checks on a throwaway local database
(dev server pointed at it by environment override), plus screenshots read at
desktop and phone width. **551 tests across 45 files**, typecheck clean.

**Production.** Backed up `supplier_payments`, `lab_partner_payments`,
`purchases`, `suppliers`, `lab_partners`, `purchase_returns` and `_migrations`
to `backups/prod-before-0023-payables-*.json` (gitignored), then applied `0023`:
9 statements, row counts identical, `db:check` "up to date (23 migrations)".
Nothing else on production was written.

**Noticed, left alone:** Settings → Lab partners shows a balance from
`partnerBalancePaisa`, which counts tests before refunds, while the laboratory
statement (and so Payables) nets refunds out. They differ only after a
laboratory test is refunded. Pre-existing; not changed without being asked.

### C-030  ·  2083-06-14  ·  Trial purchases and bills cleared from production

**Asked:** clear the purchase entries and the bills, keep everything else the
clinic entered. **On live before:** 6 purchases (12 lines, 12 batches — all the
stock there was; no opening stock), 2 purchase returns, 3 bills (#1 and #2
medicine, #3 a CBC sent to NOVUS), 16 stock moves, 4 supplier payments to
OMEGA DRUG CENTER. **The owner chose:** all 3 bills (so invoice numbering could
restart cleanly), all 4 payments (they were against the purchases being
cleared; keeping them would have left OMEGA रू 3,089 "paid ahead"), and restart
purchase and invoice numbering at 1.

**How.** A full backup of every table first (43 tables, 21,317 rows,
`backups/prod-before-clear-trading-*.json`, gitignored, read back). Then one
write transaction that refused to start unless every row count and both
counters were exactly what the owner had been shown; deleted children before
parents; reset `next_purchase_no` and `next_invoice_no` to 1 (guarded on 7
and 4); wrote a `trading.cleared` audit entry; and before committing checked
that every cleared table was empty, every kept table's count unchanged, and
`PRAGMA foreign_key_check` clean. Run once as a dry run (rolled back), then
committed, then re-read independently.

**Kept, untouched:** items and units (prices included — the three set on
purchase lines stay, they are item data), suppliers, doctors, 15 patients,
3 visits (all already cancelled), 7 appointments, 251 services, the
laboratory, racks, users, company, the audit log, and the patient and visit
counters (next patient 16, next visit 4 — only purchases and invoices were
asked about).

### C-031  ·  2083-06-16  ·  Counter shortcuts that work, the purchase margin and default expiry, and a photo that "read nothing"

**Asked:** F2 did not open New bill as the shortcut sheet said; make every
counter shortcut work; show the margin under the purchase sell price; start a
row's expiry at four years from today; and why "Fill from a photo" got nothing
off a Sohan Medicine bill (CASR0001739), with the photo attached.

**The counter (D-155–D-157).** Read every key on the sheet against the code
rather than trusting it; the list of what was broken is in D-155. The two that
cost money: resume dropped a held bill's services and patient and then deleted
it (D-157), and F9/Enter twice queued two bills (a `savingRef` guard; the save
now also clears its busy state in a `finally`). New `GlobalShortcuts` in the
back-office layout for F2 anywhere (D-156). The shortcut sheet is rewritten in
sections and lists only wired keys.

**Purchase row (D-158, D-159).** Default expiry with its amber note; the date
box selects all on focus (every typable date box — harmless elsewhere, useful
everywhere); `MarginNote` under the sell price. On wide screens both notes sit
just under their box so the row's boxes stay in line; the row reserves 16 px for
them.

**The photo.** Run through the real reader in a real browser on the photo the
owner sent, then on a production build (`next build` + `next start`, service
worker active) exactly as live serves it: **it reads the bill — "Read 13 lines"
in ~15 s, every batch filled**. Also read at 2,400 and 4,000 px to stand in for
a full-size phone photo: still read. So the reader is not broken for this bill
on a computer; the "nothing" was specific to where it was tried, which the old
messages could not say — every failure said "check the connection". Each stage
now says what failed (photo would not open — e.g. HEIC; reader would not
download, ~40 MB first time; stopped while reading — usually memory on a
phone), and the button counts the seconds. **Asked the owner** which message
they saw and on what device.

**Parser fixes found on this bill**, pinned with its real OCR text as a test
(`SOHAN` in `invoice-read.test.ts`, 12/12 rows and every closing figure): a row
broken in two at the expiry is joined back; "do-"/"do -" with the leading dash
lost is a continuation row; "EREE"/"LFREE" are FREE; the next medicine's name
read in front of a "- do -" row is carried to the row it names; a FREE row
whose batch is plainly not the row above's is left out rather than put on the
wrong medicine; "NEI TOTAL" is the net total; a TOTAL figure lifted onto the
line above its label is still read. Before: 13 rows, three wrong (Calin lost,
its free row read as a paid line at MRP, Anomycetin's name on Clavam). The new
tests fail against the old parser.

**Checked:** 35 browser checks on a throwaway local database (every key above,
F9 ×3 saving one bill, F9 behind two dialogs saving none, held clinic bill
resumed whole, swap on resume, margin and expiry); production build passes;
**554 tests across 45 files**, typecheck clean. Production was not touched.

### C-032  ·  2083-06-20  ·  The product moves to Family Smile Dental Care Center

**The install changed hands again.** Every occurrence of the previous clinic's
name — the PRD, Rules, Phases, Deploy, Design, the go-live checklist, this file,
five migration rationale comments, six source comments, three tests and
`db/bootstrap.ts` — now reads **Family Smile Dental Care Center** (no "Pvt.
Ltd.", by the owner's choice): 63 replacements across 24 files. `Himalaya`, the
medicine brand, was not touched; it is product data. The catalogue template was
renamed with history to `import-templates/fsdc-items.csv`. The repo path,
`github.com/ShiwamPaudel/ClinicNP-FSDC` and the Turso host
`clinicnpforfsdc-fsdc` were corrected against `git remote -v` and `.env.local`.
C-024, which records the previous handover, was made name-neutral rather than
left claiming this repo and database.

`company.integration.test.ts` renamed the company between two *different*
names; both collapsed to the same string, so the "rename updates the row" test
would have passed against a repo that never saved. The second name is now
"Family Smile Dental Care".

**`.kilo/worktrees/alert-forsythia` removed from the repo** — 515 files, a Kilo
Code worktree committed by accident. Compared first: identical to the main tree
apart from line endings, the README and the old logo. `.kilo/` is now ignored.

**`node_modules` was a hollow copy** — package folders present but empty, so
`@libsql/client` and `web-push` did not resolve and no `db:*` script or
`alert-keys` could run. Reinstalled from the lockfile.

**`.env.local`: only the empty values filled.** `AUTH_SECRET` and `CRON_SECRET`
from `randomBytes(32)`; a VAPID pair from one run of `pnpm alert-keys`, checked
as a matched pair by deriving the public key from the private one.
`VAPID_SUBJECT` and both Turso settings were already set and are byte-identical
to before. `BLOB_READ_WRITE_TOKEN` stays empty — Vercel issues it. These go into
the Vercel project settings too; the live site does not read `.env.local`.

**A new, empty database.** Read-only check: **0 tables**. Rehearsed first on a
scratch file database: 23 migrations, then the import. Then for real:
`db:migrate` took it to **23 migrations**, and `db:import-items` (dry run, then
`--commit`) created **6,646 items and 14,187 units**, every rate blank.
Verified against `items.csv` by name: all 6,646 present, **0 field differences**
across generic name, category, manufacturer, shape, controlled flag, reorder
level and active; Medicine 5,664 · Other 778 · Consumable 204; 84 controlled;
no item without a base unit, none without exactly one default selling unit, no
duplicate names, no orphan units. `db:check` reports the schema up to date.

**Not done, deliberately:** `db:bootstrap` (company row, fiscal year 2083/84,
admin) needs the clinic's PAN and the admin's password and PIN. **No letterhead
was set:** `public/logo-fsdc.png` is a 4640x5328 logo, not a header band, and an
image letterhead replaces the printed name, address and phone on every bill —
so it waits for a full letterhead from the clinic (owner's call).

### C-033  ·  2083-06-21  ·  Bootstrapped, a clinic-first sign-in screen, and why it said "Faarma"

**"Faarma" on a ClinicNP install** was the missing company row, not a bug:
`getModuleFlags()` answers "pharmacy on, clinic off" when there is no row, and
the product name is derived from those flags. Bootstrapping with `--clinic`
turned it into ClinicNP everywhere — the title, the sidebar, the sign-in
artwork — with no code change.

**Bootstrapped** with the PAN/VAT number and phone the owner gave, address
blank, clinic + pharmacy, fiscal year 2083/84, one Admin. The password and PIN
were checked back through `verifyPassword` / `verifyPin`, wrong ones refused.
`vat_registered` was left off: a VAT number was supplied, but switching it on
changes the tax on every bill and is the accountant's call (Go-live §1).

**The sign-in screen leads with the clinic** (owner's request). With the Clinic
module on: "The whole clinic, on one screen.", and six features — doctor
consultations, every doctor's phone app, patient visits, samples, one bill
(medicines and dues folded in), offline — each on a 48px tile in its own tint.
Pharmacy stock no longer has a place of its own there. Every claim was checked
against what is built (D-115, D-118, D-123, D-125, D-127). The clinic tagline is
now "Patients, doctors and billing for the clinic and its pharmacy". A
pharmacy-only install is unchanged. `tests/login-screen.test.ts` and Design.md §9
were rewritten to the new rules.

**Checked** against a dev server on the live database: `/login` 200 at 1440px and
390px with no horizontal scroll; the right password lands on the dashboard
showing ClinicNP, both module menus and "Admin (Owner)"; a wrong password stays
on `/login`; `/dashboard` without a session goes to `/login`. 555 tests across
45 files, typecheck clean, production build passes.

**The logo is prepared but not stored.** `public/logo-fsdc.png` downscaled by the
same routine as Settings → Company (1600x1837 JPEG, 219,475 chars against the
220,000 cap). The sign-in screen and every bill read the same
`company.logo_url`, and an image there replaces the printed name, address,
phone and PAN on bills — so it waits on the owner's choice between keeping
that text under the logo or not.

### C-034  ·  2083-06-22  ·  VAT that is charged, supplies for a clinic, dues with times, a paper-card history, shorter words

**"I turned on VAT Registered, still the bill didn't calculate VAT."** The
calculation was right; the service was not VAT-able. VAT applies to medicines
and to services ticked *VAT applicable*, the box was off by default, and the
one service the owner had made — Crown Filling — had it off. Owner's call:
every service is VAT-able unless unticked. The form now starts ticked, an
unticked service shows *No VAT* in the list, and Crown Filling was ticked in
production.

**VAT included or on top, as a setting** (owner's example: a Rs 10,000 crown).
`0024_vat_inclusive.sql` adds `company.vat_inclusive`, and on each bill
`vat_inclusive` and `taxable_paisa`. On top: Rs 10,000 + Rs 1,300 = Rs 11,300.
Included: Rs 10,000 of which Rs 1,150.44 (13/113) is VAT, taxable Rs 8,849.56.
`vatSplit` in `lib/bill-calc.ts` is now the one calculation — the counter's
preview and `ingestBill` both call it; before, each had its own copy. A bill
keeps the mode it was made under, so changing the setting never changes an old
bill. The printed bill and the bill page show *Taxable amount* and *VAT 13%*
(or *VAT 13% (included)*). The VAT report sums each bill's own taxable amount,
which also fixes an older error: it used `subtotal − discount`, counting exempt
services as taxable on a mixed bill. Pinned by `vat-inclusive.test.ts`,
`vat-saved-bill.integration.test.ts` and `print-vat.test.tsx`.

**Suppliers for a clinic with no pharmacy.** The owner switched Pharmacy off
and then had nowhere to enter the materials they buy on credit. Suppliers,
purchases, items, stock (opening, stock out — *Used in the clinic* was already
a reason — expiry, value), supplier payables and the purchase register now open
with **either** module: `requireModule("supplies")` in `lib/modules.ts`. The
menu group reads **Supplies** with Pharmacy off. Still pharmacy-only: selling
prices, shelves and shop layout, profit and fast/slow-moving reports — they are
about selling medicine. Checked in a browser: those four answer 404 on a
clinic-only install, the rest 200.

**Dues show when each part was paid.** Every owed bill lists its payments under
it — date, time in Nepal, amount, how, and who took it — starting with what was
paid at the counter. *Paid back* and the bill page's dues table show the time
too. The time is from `created_at` / `client_created_at`, already stored;
`lib/clock.ts` formats it in Asia/Kathmandu so the server and the browser agree.
Reprinted bills now print their time (it was blank).

**The patient card's history is a table**, laid out like the clinic's paper
card the owner sent: *Date · Treatment notes · Service charge · Payment ·
Due / Advance*, oldest first, with a total. One line per bill (its services and
medicines, with the visit's complaint, findings, advice and doctor), per later
payment, per refund, per visit with no bill. `buildLedger` in
`lib/patient-ledger.ts` decides the order and the running balance and is pure;
the last balance equals what Dues says (`tests/patient-ledger.test.ts`). It
replaced the visit timeline, which was removed with `listBillsForPatient`.

**"(pending)" is gone from the bill.** The counter prints before the server
numbers the bill, so the first print carries a slip number; it no longer says
"(pending)" after it. A reprint from Bills shows the SI number.

**Shorter, plainer words** (Rules §1, amended). About forty passages rewritten
— backup, restore, modules, fiscal years, users, doctors, laboratories, opening
stock, the photo reader, the offline page, duplicate patients, reports — e.g.
*"Automatic backups are on. Saved every night; the last 30 are kept."* *Modules*
reads **Features**; *queue* reads *list*. Company settings hide the medicine-only
fields (DDA, expiry window, shelf display, minimum rate) when Pharmacy is off,
and say *Clinic name*.

**Dates in Nepal, not UTC.** The patient card's *Since*, backup dates and file
dates sliced the UTC timestamp, so anything done before 5:45 in the morning
showed yesterday. Found while checking the new table at 12:13 AM.

**Test data cleared from production**, as asked: a full copy of all 43 tables
to `backups/prod-before-clear-patients-*.json`, then `db:reset --keep-setup` —
1 patient, 2 visits, 2 bills, 2 service lines, 2 dues payments, 11 audit rows,
11 throttle rows. Kept: company, 2 users, fiscal year, 1 doctor, 1 laboratory,
10 service groups, Crown Filling, 6,646 items. **The reset left the year's
numbering at 3**, so the first real bill would have been SI-…-000003;
`db/reset.ts` now restarts the open year's bill, visit, return, purchase and
stock-out numbers with the patient number, and production was put back to 1.
Its closing message no longer tells a `--keep-setup` run to bootstrap.

**Checked:** 583 tests across 50 files; typecheck clean; production build; and
in a browser against a scratch copy (clinic only, VAT on, Crown Filling billed
Rs 11,300 with Rs 5,000 paid and Rs 2,000 later): the history table, dues
times, the bill's VAT lines, the VAT setting saving and the counter switching
to *VAT 13% (included)*, supplies pages, and the pharmacy-only 404s.
