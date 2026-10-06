# Deploy.md — ClinicNP

What has to be true for a deployment to work, and what to check after it does.
The install itself is `Go-live-checklist.md`; this is the machinery underneath.

---

## Environment variables

All five are required. The app fails loudly on the first four and quietly
changes behaviour on the fifth, which is why it is listed with the rest.

| Variable | What it is | If it is missing |
|---|---|---|
| `TURSO_DATABASE_URL` | the database, `libsql://…` | nothing works |
| `TURSO_AUTH_TOKEN` | its token | nothing works |
| `AUTH_SECRET` | signs the session cookie | nobody can sign in |
| `CRON_SECRET` | what the nightly jobs present to prove they are the scheduler | the crons are refused |
| `BLOB_STORE_ID` (or `BLOB_READ_WRITE_TOKEN`) | private storage for patient files **and backups** — set by Vercel when a private Blob store is connected to the project | **patient files are written to the machine's own disk instead** (they survive nothing, and a second instance cannot see them) and **no backup is kept anywhere** — Settings → Backup says "Automatic backups are off" |

Generate the two secrets with `openssl rand -base64 32`. Set every one of them
for Production *and* Preview, or a preview deployment will quietly write to
whichever database it can reach.

### The storage has to be a private store

A Vercel Blob store is created either public or private and the choice is
permanent. A public store hands out URLs that work forever for anybody who has
them, which is not acceptable for a patient's lab report or a backup holding
every patient's details, so the app **probes the store once and refuses to use
a public one** — files fall back to local disk, nothing is backed up, and
Settings → Backup says so.

The store connected on 2083-06-05 is **public** and is refused. Private Blob
storage has been generally available since 30 June 2026 and `@vercel/blob`
2.8 (already installed) supports it. To connect one (C-016, D-138):

1. Vercel → the project → **Storage** → the existing public Blob store →
   **Projects** → disconnect it from this project. Nothing is stored in it:
   the app has refused it from the start.
2. **Storage → Create Database → Blob → Access: Private** → connect it to the
   project for Production and Preview. Vercel adds `BLOB_STORE_ID`, and
   functions sign in with the project's own short-lived OIDC token, so there
   is no long-lived secret to copy anywhere.
3. Redeploy (or push). Then **Settings → Backup** shows a green "Automatic
   backups are on", and adding a patient file no longer says it is kept on
   this computer.

The SDK prefers `BLOB_STORE_ID` over `BLOB_READ_WRITE_TOKEN` on Vercel, so an
old public token left behind does no harm once the private store is
connected. For a local run against the private store, `vercel env pull`
brings the OIDC token down with the other variables.

---

## A new migration means migrating production

The app is deployed from the repository; the database is not. A deploy
carrying a new migration lands code that queries tables the production
database does not have yet, and the pages that use them return 500 while
everything else keeps working — which is exactly what it looks like when only
one screen is broken.

```bash
pnpm db:migrate     # with the production env vars, before or right after the deploy
```

Check what production actually has before assuming:

```sql
SELECT name FROM _migrations ORDER BY name;
```

A migration that rebuilds a table deserves a dry run against a copy of the
real row first. `0012` rebuilds `company`, and its first version silently
dropped `module_pharmacy` and `module_clinic` — which would have switched the
Clinic module off at the clinic.

## Starting fresh after testing on sample data

`db:seed` is for training and leaves "Green Cross Sample Pharmacy", sample
services, sample doctors and demo patients behind. None of that belongs in a
database a clinic is about to bill from.

```bash
pnpm db:reset --yes      # empties every row, keeps the schema, restarts patient numbering
pnpm db:bootstrap --name "…" --pan … --admin … --password "…" --pin … --clinic
```

`db:reset` prints what it is about to delete and refuses without `--yes`. It
also refuses if it finds a table holding data that it does not know about,
rather than leaving it behind quietly.

**`--clinic` is not optional for Chunidevi.** The schema defaults to
pharmacy-only, and without that flag every clinic route returns 404 on the
first morning for no visible reason.

---

## Vercel refuses to deploy a vulnerable Next.js

This is not a build error and it does not look like one. The build completes,
prints its route table, traces the server files, and is then rejected at
`Deploying outputs...` with:

```
Vulnerable version of Next.js detected, please update immediately.
```

There is nothing wrong with the code when this happens. The pinned Next.js
version has a published advisory against it and the platform will not host it.
The fix is to upgrade Next.js and redeploy; nothing else will clear it.

`pnpm audit --prod` lists what is outstanding. Prefer the newest release on the
major already in use — a major upgrade is not something to attempt while a
deployment is blocked.

---

## Deploying

```bash
# 1. schema first, always — the code assumes it
pnpm db:migrate

# 2. an empty production start (NOT db:seed, which is sample data)
pnpm db:bootstrap --name "Chunidevi Health Polyclinic Pvt. Ltd." --pan 601234567 \
  --address "…" --phone "…" --admin sarita --admin-name "Sarita" \
  --password "…" --pin 1234

# 3. deploy
vercel --prod
```

Migrations are append-only and each one runs inside a single transaction with
its own bookkeeping row, so a failed migration leaves the database exactly as
it was. Run `pnpm db:migrate` before every deploy that contains a new one; it
is safe to run when there is nothing to do.

---

## After the first deploy

- [ ] Sign in as the bootstrapped Admin. If this fails, the password hash and
      `AUTH_SECRET` are the two places to look.
- [ ] **Settings → Backup**: take one, download it, and confirm the file opens.
      The note under the button must be the green "Automatic backups are on".
- [ ] Add a patient file and confirm the app does **not** say files are being
      kept on this computer.
- [ ] Check both crons appear under the project's Cron Jobs, and confirm the
      next morning that a **Nightly** row with a **Download** button is in
      Settings → Backup. Download it once and restore it into a throwaway
      database.

### The crons

| Path | When | What it does |
|---|---|---|
| `/api/cron/backup` | 18:00 UTC daily | keeps a full backup in the private store (gzipped) and lets go of nightly copies past the newest 30; with no private store it keeps nothing and records nothing |
| `/api/cron/files-gc` | 18:30 UTC daily | permanently removes files deleted more than 30 days ago |

Both refuse anything that does not present `CRON_SECRET`, so they are safe to
leave reachable. 18:00 UTC is a quarter to midnight in Nepal — after the clinic
has closed, before the date rolls over.

---

## Checks that run in the repository

Run all of these before deploying. Each one has caught something real.

```bash
pnpm typecheck   # no TypeScript errors
pnpm test        # the full suite
pnpm sweep       # the retired name, backend words on screen, stray control characters
pnpm run audit   # module guards, colour contrast, empty states
pnpm build       # it compiles, and the counter bundle is visible in the output
pnpm a11y http://localhost:3000   # against a running instance
```

`pnpm run audit`, not `pnpm audit` — pnpm has a built-in command by that
name and it wins, so `pnpm audit` silently reports dependency advisories
instead of running any of the checks above.

**Never run `pnpm build` while `pnpm dev` is running.** They share `.next`, and
the build fails part-way through prerendering with
`TypeError: Cannot read properties of undefined (reading 'call')` from
`webpack-runtime.js` — which reads like a real fault in whichever page happened
to be next in the queue, and is not. Stop the dev server, `rm -rf .next`, build
again.

`pnpm sweep` also refuses vendor names (Turso, Vercel, IndexedDB…) and
build-plumbing words (migration, schema, deploy, JSON) in anything a user can
read — Rules §1a. Put `sweep-ok` on the line when the word genuinely never
reaches a screen, such as a file extension or a URL pattern.

The counter bundle is worth watching: v1 shipped at 140 kB First Load, and
Phases.md allows 15% growth. The build output prints it as `/billing`
(145 kB as of 2083-05-25); `/login` is 128 kB.

---

## When a deploy lands on somebody mid-shift

The service worker holds the file list of the version it was built from, so a
page open across a deploy asks for files the new build renamed. The app detects
that and reloads once — once only, because a reload loop is worse than the
problem. Nothing in either queue is at risk: bills and registrations waiting to
be sent live in IndexedDB and survive a reload, which is why they are there.

---

## Rolling back

Redeploying an earlier build is safe **only if it does not need an earlier
schema**. Migrations are append-only and are never automatically reversed, so a
rollback across a migration means restoring a backup taken before it. Take one
before deploying anything that migrates.

## 0013 drops columns — back up before you migrate it

`0013_furniture_and_locations.sql` is the first migration in this project that
drops columns. It moves where-a-medicine-is-kept off `items` and into
`item_locations`, then drops `items.rack`, `rack_id`, `rack_row` and
`rack_col`.

It copies before it drops, and it was dry-run against copies of real data both
ways round (cells populated, and only free-text notes) with zero dangling
foreign keys afterwards. It still drops columns, so:

Take the backup from **Settings -> Backup** and download the file before you
run anything. There is no backup script on the command line; that screen is
the only path, and the download is the copy that matters.

    pnpm db:migrate

### Migrate FIRST, then deploy

A deploy does not run migrations, so for a few minutes production runs one
half of this change without the other. Both orders leave a gap; they are not
the same size.

**Migrate first (do this).** The old code keeps reading `SELECT * FROM items`
and simply finds no location, so **the counter keeps working and keeps
billing**. What breaks until the deploy lands is Settings -> Shop layout, the
shelf list, the expiry report and the item edit screen, because those name the
dropped columns directly and SQLite errors on a column that is gone.

**Deploy first (do not).** The new code reads `item_locations`, which does not
exist yet, so `/api/catalog` fails — and a counter opened on a new device has
no catalog at all. Devices already carrying a cached catalog would limp on;
a fresh one would have nothing to sell from.

So: back up, migrate, then deploy.

## 0019 dues — migrate, then deploy

`0019_dues.sql` is **additive only**: two columns on `bills`
(`due_paisa`, `paid_now_method`), one on `sale_returns`
(`against_due_paisa`), a new `due_payments` table, and indexes. No table is
rebuilt and no existing value changes, except that credit bills get
`due_paisa = total_paisa` (production had none on 2083-06-05). It was
rehearsed with `pnpm db:migrate` on a replica built from a full copy of
production: 10 statements, row counts unchanged, every trading day's day close
identical afterwards.

    (take a backup from Settings -> Backup and keep the file)
    pnpm db:migrate          # .env.local points at production
    pnpm db:check            # "schema is up to date (19 migrations)"
    git push                 # Vercel builds; db:check now lets it through

**Why this order is safe.** The code running before the deploy never names the
new columns, so it keeps billing normally. The one thing it can still do is
make a "Credit" bill, which lands with `due_paisa = 0`. The new code reads any
credit bill with `due_paisa = 0` as owing its whole total (`OWED_AT_SALE_SQL`,
D-129), because it can never write that combination itself — so a credit bill
made in the gap still shows as owed, never as paid.

**Deploy first (not possible).** `pnpm build` refuses while production lacks
0019, which is the point of the guard below.

## C-020 invoice reader — no migration, but new assets

Nothing to migrate. Two things to know about the deploy:

- `scripts/copy-ort.mjs` runs from `dev`, `build` and `postinstall`, and puts
  the WebAssembly runtime into `public/ort/` out of node_modules. That folder
  is gitignored and rebuilt on Vercel at install time; `public/ocr/` (the
  ~6 MB model) **is** committed.
- The first photo read on a device fetches roughly 20 MB — the model, the
  runtime and the OpenCV chunk — and then it is cached. Later reads are a few
  seconds. Worth knowing before somebody tries it on a phone on mobile data.

## 0023 payables — already applied

`0023_payables.sql` adds `purchase_id`, `voided_at`, `voided_by` and
`void_reason` to `supplier_payments`, the three void columns to
`lab_partner_payments`, and two indexes. Additive with defaults: the code
deployed before it reads none of them, so it could go first.

**Applied to production on 2083-06-14** (C-029), after a copy of the payment,
purchase, supplier and laboratory tables was written to
`backups/prod-before-0023-payables-*.json` (gitignored): 9 statements, row
counts identical before and after. Deploying the code that uses it is only:

    pnpm db:check            # "schema is up to date (23 migrations)"
    git push                 # Vercel builds; db:check lets it through

## 0022 purchase line selling rate — already applied

`0022_purchase_line_selling_rate.sql` adds one column to `purchase_lines`
(`selling_rate_paisa`, default 0): the selling price set on a purchase line,
kept as a record. Nothing is rebuilt, and the code deployed before it keeps
working with the column in place, which is why it could go first.

**Applied to production on 2083-06-14** (C-028), after a copy of the purchase
tables was written to `backups/prod-before-0022-purchases-*.json` (gitignored):
1 statement, row counts identical before and after across `purchases`,
`purchase_lines`, `batches` and `item_units`, and every existing line reads 0.
So deploying the code that uses it is only:

    pnpm db:check            # "schema is up to date (22 migrations)"
    git push                 # Vercel builds; db:check lets it through

## 0021 purchase bill discount — migrate, then deploy

`0021_purchase_bill_discount.sql` adds two columns to `purchases`
(`bill_discount_paisa`, `rounding_paisa`), both defaulting to 0. Nothing is
rebuilt and every existing purchase reads exactly as before. Rehearsed on a
replica built from a full read-only copy of production taken on 2083-06-07 (43
tables, 3,170 rows): the guard refused, 2 statements applied with row counts
unchanged, the guard then passed at 21 migrations, and production's one
existing purchase came back with both new columns at 0.

    (Settings -> Backup -> Back up now, and keep the file)
    pnpm db:migrate          # .env.local points at production
    pnpm db:check            # "schema is up to date (21 migrations)"
    git push                 # Vercel builds; db:check now lets it through

## 0019 and 0020 together — one run

On 2083-06-06 production was still at 0018: the pushes `dues fix` and
`discount changes` were refused by the guard, so the live site is still the
build from before them. **`0020_date_calendar.sql`** is one `ALTER TABLE
company ADD COLUMN date_calendar TEXT NOT NULL DEFAULT 'bs'` with a CHECK —
the calendar the date boxes open in (D-137). Nothing is rebuilt.

Both were rehearsed together on a replica built from a full read-only copy of
production taken that day (42 tables, 3,132 rows, kept at
`backups/prod-before-0020-2026-09-22T05-11-10Z.json`, gitignored): the guard
refused, `pnpm db:migrate` applied 0019 (10 statements) and 0020
(1 statement) with every `@verify` count unchanged, the guard then passed at
20 migrations, every table's row count and every field of the company row
matched the copy, and `date_calendar` came out `bs`.

    (Settings -> Backup -> Back up now, and keep the file)
    pnpm db:migrate          # .env.local points at production; runs 0019 then 0020
    pnpm db:check            # "schema is up to date (20 migrations)"
    git push                 # Vercel builds; db:check now lets it through

The same reasoning as 0019 makes the order safe: the code running before the
deploy never reads `date_calendar`, and the new code is not built until the
column exists.

### The build now refuses to get ahead of the schema

That order used to be a paragraph in this file, and on 2083-05-23 a deploy went
out without it and production answered "Application error: a server-side
exception has occurred" with a digest and nothing else, on every screen that
touched the new table.

`pnpm build` now runs `db/check.ts` first, and Vercel runs `pnpm build`, so a
deploy cannot ship code the database is not ready for. When it stops a build it
names the database and the missing files:

    db:check - REFUSING TO BUILD.
      healthclinic-... has not run:
        0013_furniture_and_locations.sql

It is deliberately hard to fail by accident. It only stops a build when it can
positively read `_migrations` AND find a file on disk that is not in it.
No database configured, no network, no `_migrations` table yet - it prints a
line and lets the build through, because a check that breaks deploys for
unrelated reasons gets deleted within a week and then protects nothing.

Run it on its own any time with `pnpm db:check`.

---

## Brand artwork, and the icons derived from it

Three files are supplied by the owner and are the only hand-made artwork in the
repository:

| File | What it is | Used by |
|---|---|---|
| `public/icons/logo-main.png` | the full mark, navy and red | light surfaces |
| `public/icons/logo-white.png` | the same mark in white | the sign-in panel, and anything that is not white |
| `public/icons/favicon.png` | the round mark, white on navy | the browser tab |

Everything else is **derived** and must never be hand-cropped:

```bash
node scripts/make-icons.mjs
```

That reads `favicon.png` and writes `icon-192.png`, `icon-512.png`,
`icon-maskable-512.png` and `apple-touch-icon.png`. There is no image library
in this project and adding one for a job that runs about once a year is not
worth it, so it resizes in the browser that is already installed for the
accessibility gate.

Two of the four are not obvious:

- **The maskable icon** gets a solid tile in the mark's own navy with the mark
  inset 12%. Android crops an installed icon to whatever shape the launcher
  uses and may eat everything outside the middle 80%, so the corners it loses
  are corners with nothing in them.
- **`apple-touch-icon.png` is opaque.** iOS ignores transparency and composites
  a home-screen icon onto black, which would put black corners around a
  transparent disc.

Re-run it whenever `favicon.png` changes, and commit all four outputs.

**A pharmacy-only install shows no artwork.** The files spell "ClinicNP" and
that install is called something else (D-025), so it falls back to the wordmark
set in type. Do not "fix" this by showing the logo anyway.
