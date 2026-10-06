# .pitch-build — how "ClinicNP - Product Details.pdf" is made

Tooling for the product document in the project root. Nothing here is part of
the app; it exists so the document can be rebuilt rather than hand-edited.

Every screen in the PDF is a real screenshot of the working software, taken
against a **throwaway demo database** — never the live one. That is deliberate:
a document that gets emailed to a prospect must not carry a real patient's name.

## Rebuilding, start to finish

The app must be built and running against the demo database, not the live one.
`TURSO_DATABASE_URL` on the command line overrides `.env.local`.

```bash
# 1. a fresh demo database (clearly-fake data only, Rules.md §1.10)
export TURSO_DATABASE_URL="file:tests/demo-pitch.db" TURSO_AUTH_TOKEN=""
rm -f tests/demo-pitch.db tests/demo-pitch.db-*
pnpm db:migrate && pnpm db:seed
pnpm tsx .pitch-build/demo-data-1.ts   # company, patients, visits, bills, lab lines
pnpm tsx .pitch-build/demo-data-2.ts   # purchases, supplier return, stock-outs

# 2. serve it (production build — dev mode shows a dev badge and is slow)
pnpm build && pnpm start --port 3100

# 3. photograph it (separate shell)
node .pitch-build/capture.mjs           # 66 back-office screens, 1440x900 @2x
node .pitch-build/capture-doctor.mjs    # the doctor portal, at phone size
node .pitch-build/crop.mjs              # trim the dead space off each shot
cp .pitch-build/shots-doctor/*.png .pitch-build/cropped/

# 4. compose the PDF into the project root
node .pitch-build/build-pdf.mjs
PROOF=1 node .pitch-build/build-pdf.mjs # also writes proof/pNN.png + a fill report
```

Logins on the demo database: `admin/admin123` (owner), `bikash/staff123`
(counter), `karki/doctor123` (doctor — created by `capture-doctor.mjs`).

## What each script is for

| Script | Does |
|---|---|
| `demo-data-1.ts` | Switches both modules on, sets a sample company, and writes patients, visits, bills, laboratory lines at all five stages, appointments and audit entries. Refuses to run against anything but a `file:` database. |
| `demo-data-2.ts` | The pharmacy paperwork: a purchase, a supplier return, stock-outs — so the purchase and stock-out registers are not empty. |
| `capture.mjs` | Logs in as the owner and screenshots every route. Fails loudly on a 404 rather than shipping a blank page. |
| `capture-doctor.mjs` | Makes a `doctor`-role login, links it to a doctor with bookings, and shoots `/my/*` at 412px. The portal is gated to that role, so it cannot be photographed as the owner. |
| `crop.mjs` | Finds the last row carrying content in the main panel and cuts below it. A list screen shot at 1440x900 is often half empty, which in a document wastes a third of a page. |
| `icons.mjs` | Turns a `lucide-react` icon module into an inline SVG, so the document uses the same icon family as the app and fetches nothing at render time. |
| `build-pdf.mjs` | The document itself: content, styles, and a measuring paginator that packs blocks onto A4 pages. |
| `sheet.mjs` | A contact sheet of all shots, for reviewing them at a glance. `DIR=cropped OUTNAME=sheet-cropped.png node .pitch-build/sheet.mjs` |

## Why the paginator exists

Pages are fixed-height with `overflow:hidden`, so hand-placed content silently
falls off the bottom when a paragraph changes length. Instead every block is
measured in the browser at the real content width and then filled onto pages in
order. Screenshots are offered at five widths and the packer takes the widest
that still fits, which is what stops a tall shot from jumping to the next page
and leaving a third of the current one blank. `PROOF=1` prints how full each
page ended up; under ~75% means a page has visible dead space, over 100% means
content is being clipped and something must give.

## Colours

Sampled from the two marks rather than guessed: ClinicNP navy `#19445b` and red
`#ec1f27`; Infobytes Nepal blue `#0443c6` and green `#00bc5d`.
