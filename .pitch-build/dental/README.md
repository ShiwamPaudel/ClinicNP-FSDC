# .pitch-build/dental — how "ClinicNP Dental.pdf" is made

The 8-page A4 product document for dental clinics, in the project root. Every
screen in it is the working software, photographed on a **throwaway demo
database** ("Demo Dental Clinic", every person and lab named *Sample …*). It
must never be photographed from a live install, and no real clinic's name may
appear in it.

```bash
# 1. the demo clinic (refuses anything but a file: database)
export TURSO_DATABASE_URL="file:tests/demo-dental.db" TURSO_AUTH_TOKEN=""
rm -f tests/demo-dental.db tests/demo-dental.db-*
pnpm db:migrate && pnpm db:seed
DEMO_DB="file:tests/demo-dental.db" pnpm vitest run --config .pitch-build/dental/vitest.config.ts

# 2. serve it — a production build; blank the file store so nothing reaches it
pnpm build
BLOB_READ_WRITE_TOKEN="" BLOB_STORE_ID="" npx next start -p 3100

# 3. photograph, trim, compose (separate shell)
node .pitch-build/dental/capture.mjs         # or name shots: capture.mjs teeth billing
node .pitch-build/dental/crop.mjs
PROOF=1 node .pitch-build/dental/build-pdf.mjs   # proof/pNN.png + how full each page is
```

Logins on the demo: `admin/admin123` (owner), `bikash/staff123` (front desk),
`karki/doctor123` (a dentist's own phone screens).

| File | Does |
|---|---|
| `seed.test.ts` | The demo clinic, through the app's own code: dental groups and services (placeholder rates), three dentists with shares, two labs, twelve patients, bills oldest first, treatment notes, lab work at every stage, appointments, tooth marks, supplies, staff and a salary month. |
| `capture.mjs` | Shots in a tall window (the app scrolls inside its own panel), plus the counter, the lab list and a dentist's phone. |
| `crop.mjs` | Cuts the empty page below the last row. |
| `build-pdf.mjs` | The eight pages. Crops inside a shot are fractions (`t`, `b`, `l`, `r`), so check the proofs after the demo data changes. Logos are trimmed of their transparent margins at build time. |
| `assets/` | The Infobytes Nepal marks. ClinicNP's come from `public/icons`. |
