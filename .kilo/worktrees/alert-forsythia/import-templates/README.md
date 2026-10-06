# Import templates

Fill these in, send them back, and they get loaded into ClinicNP.

Each thing has **two** files:

- `something.csv` — **headers only. This is the one you fill in.**
- `something.EXAMPLE.csv` — the same headers with rows filled in, so you can
  see the shape. **Read it, do not send it back.**

They are split on purpose. Every number in an EXAMPLE file was made up to show
the format. A made-up price that survives into a real bill is a real bill with
a made-up number on it, so those rows must never reach the software.

## Already done for you: `pharmacy-items.STARTER.csv`

**932 real products** a clinic pharmacy in Nepal actually dispenses — brand and
generic names, category, manufacturer where it is known, pack structure and
the narcotics flagged. It is loaded with:

```
pnpm db:import-items import-templates/pharmacy-items.STARTER.csv          # shows what it would do
pnpm db:import-items import-templates/pharmacy-items.STARTER.csv --commit # does it
```

**Every price column in it is empty, on purpose.** Brand names are public;
what a shop charges is not, and there is no source for it that is not a guess.
Prices go in inside the software at **Items → Set prices**, which lists every
unpriced medicine on one screen. Until a medicine has a price the counter
refuses to bill it and says so, rather than putting Rs 0 on a real bill.

Two things worth spot-checking before you price it:

- **Strip sizes.** Most are 10. The ones that are not — Azithral 500 in 3s,
  Clavam and Augmentin in 6s, Becosules in 20s, Neurobion Forte in 30s — were
  set deliberately, but pack sizes change and yours are the ones that count.
- **`controlled`.** Only the five narcotics and psychotropics are set to `Yes`
  (Tramazac, Alprax, Calmpose, Lonazep and the codeine syrup), because a `Yes`
  forces a patient name onto every bill. Antibiotics are set to `No` so the
  counter stays fast. DDA rules say antibiotics need a prescription, so if you
  want the software to enforce that, change that one column to `Yes`.

Re-running the import is safe. A brand name already in the database is skipped
whole — never re-priced, never re-shaped, never moved off its shelf — so you
can add rows to the bottom of a file and run it again.

## Also done for you: `pharmacy-items.EXTRA.csv`

**1,080 more real products**, on top of the starter and on top of everything
already in the shop's catalogue. It was built against a read-only list of the
brand names the clinic already holds, so nothing in it is a repeat — the
importer would skip a repeat anyway, but this file has none to skip.

```
pnpm db:import-items import-templates/pharmacy-items.EXTRA.csv          # shows what it would do
pnpm db:import-items import-templates/pharmacy-items.EXTRA.csv --commit # does it
```

What is in it: the second and third brand of the things a counter runs out of
first (Telma and Telista and Eritel, not just one of them), the molecules
written by name and strength the way a prescription and a generic range are
billed, the paediatric syrups and drops, the whole surgical and dressing
shelf, the rapid test kits, and the ayurvedic and over-the-counter names
people ask for by name. 927 medicines, 56 consumables, 97 other.

Same rules as the starter, and the same two things worth spot-checking:

- **Prices are all empty**, deliberately. Items → Set prices.
- **Strip sizes are 10** unless the pack is not a strip at all. That is right
  far more often than not, but it is a guess per product and yours are the
  packs that count — fix them as you price each one.
- **`controlled` is set from the molecule**, not by hand: the benzodiazepines,
  zolpidem, tramadol, pethidine and phenobarbitone come in as `Yes`, which
  forces a patient's name onto any bill carrying them.

## And a third: `pharmacy-items.EXTRA2.csv`

**3,181 more**, again checked against every name the shop already holds, so
nothing in it is a repeat. Together with the starter and EXTRA this takes the
catalogue past **five thousand products**.

```
pnpm db:import-items import-templates/pharmacy-items.EXTRA2.csv --commit
```

It is deliberately weighted to the pharmacy rather than the surgical shelf:
2,646 medicines, 527 other, 8 consumables. What is in it — whole brand families
in every strength they are sold in (Telma 20/40/80, Aztor 5 to 80, Thyronorm
across its eight strengths), molecules written by name and strength the way a
prescription and a generic range are billed, the same molecules in their other
forms (the syrup, the dispersible, the injection, the drops), the paediatric
range, the ayurvedic and homeopathy shelves, and the over-the-counter front of
the shop.

The same two caveats as the others: **every price is blank**, and **strip size
is 10** unless the pack is not a strip. `controlled` is set from the molecule,
so 53 of these come in as `Yes`.

## And a fourth: `pharmacy-items.REF.csv`

**1,446 products taken from a working pharmacy's own list** (`items_ref.xlsx`,
sent by the owner). Only the **Prodname** column was read — the stock, batches,
dates and amounts in that file belong to another shop and none of it came
across.

```
pnpm db:import-items import-templates/pharmacy-items.REF.csv --commit
```

The sheet held 1,571 distinct product names. 52 were already in the catalogue
spelled the same way, and another 72 were the same product spelled differently
— `PANTOP-40MG` against `Pantop 40`, `FLEXON TAB.` against `Flexon Tablet` — so
124 were dropped and 1,446 created.

Three things to know about these rows:

- **The names are kept exactly as that pharmacy writes them**, in capitals.
  That looks different from the rest of the catalogue on screen, but it is what
  a supplier's invoice prints, so it is what the invoice reader will match.
- **There is no generic name and no manufacturer** on any of them, because only
  the Prodname column was read. Search still finds them by brand name.
- **The pack shape is read off the name itself** — `SYRUP`, `INJ.`, `CREAM`,
  `DROPS`, `SUPPOSITORIES`, or a volume in millilitres. Anything with no such
  word is treated as a tablet in strips of 10, which is what most of a
  pharmacy's list is. Worth an eye as each one is priced.

The sheet's own `Unit` column (TAB, SYP, TUBE…) would set those shapes exactly;
say the word and it can be re-read from that instead.

## How to fill them

Open in Excel or Google Sheets, type into the rows, then **Save As → CSV
(comma delimited)**. Not `.xlsx`, not `.xls`.

Rules that apply everywhere:

- **Do not rename, reorder or delete the header row.** Its column names are how
  the data is matched.
- **Leave a cell empty if it does not apply.** Do not write "N/A", "-" or "0"
  to mean "nothing".
- **Money is in rupees**, written plainly: `18`, `18.50`, `1200`. No `Rs`, no
  `रू`, no commas in the number.
- **Yes / No columns** take exactly `Yes` or `No`.
- **A blank row ends the file.** Do not leave gaps in the middle.
- If a name contains a comma — `Vicks VapoRub, 25g` — Excel handles the quoting
  itself when you save as CSV. Just type it normally.

---

# 1. Pharmacy — `pharmacy-items.csv`

One row per **product**, not per batch. This is the catalogue: what a thing is,
not how much of it you have or which shelf it sits on. Stock, batch numbers,
manufacture and expiry dates are entered at the clinic afterwards under
**Stock → Opening stock**, and where each one is kept under **Stock → Shelves**.

| Column | Required | What goes in it |
|---|---|---|
| `brand_name` | **yes** | What is printed on the box, exactly as it is written there. `Cetamol 500mg`. |
| `generic_name` | no | The composition. `Paracetamol 500mg`. This is what a customer asking for "paracetamol" will be found by, so it is worth filling. |
| `category` | **yes** | One of `Medicine`, `Consumable`, `Other`. Tissues, cotton and antiseptic are `Consumable`. Cosmetics and anything non-medical are `Other`. |
| `manufacturer` | no | Company name. |
| `shape` | no | How it looks, so the counter can show the right picture. One of: `capsule`, `tablet`, `strip`, `bottle`, `box`, `tube`, `sachet`, `drops`, `vial`. Leave blank if unsure. |
| `controlled` | no | Blank counts as `No`. `Yes` for narcotics and anything needing a prescription record. `No` otherwise. A `Yes` forces a patient name onto the bill. |
| `reorder_level_base` | no | Low-stock warning level, counted in the **smallest** unit. `100` on a tablet item means "warn me under 100 tablets". Blank or `0` means never warn. |

### The units — this is the part that matters

Every product needs at least one unit, and up to three. **Unit 1 is always the
smallest thing you would ever sell**, and everything else is built from it.

| Column | What goes in it |
|---|---|
| `unit1_name` | **Required.** The smallest sellable unit. `Tablet`, `Capsule`, `Bottle`, `Jar`, `Tube`, `Roll`. |
| `unit1_rate` | Selling price of ONE of those, in rupees. May be left empty — see **Set prices** above. |
| `unit2_name` | The next size up, or blank. `Strip`, `Packet`. |
| `unit2_per_unit1` | **How many unit-1s make one unit-2.** A strip of 10 tablets is `10`. |
| `unit2_rate` | Selling price of one whole unit-2. |
| `unit3_name` | The largest, or blank. `Box`, `Carton`. |
| `unit3_per_unit2` | **How many unit-2s make one unit-3.** A box of 10 strips is `10` — not 100. |
| `unit3_rate` | Selling price of one whole unit-3. |
| `default_sell_unit` | `1`, `2` or `3` — which one the counter offers first. For strip medicines this is usually `2`. |

Worked example. A box holds 10 strips, each strip holds 10 tablets:

```
unit1_name=Tablet  unit1_rate=2
unit2_name=Strip   unit2_per_unit1=10   unit2_rate=18
unit3_name=Box     unit3_per_unit2=10   unit3_rate=170
default_sell_unit=2
```

That is 100 tablets in a box. `unit3_per_unit2` is **10**, because it counts
strips, not tablets. Getting this wrong is the one mistake that puts a hundred
times too much stock on the shelf, so it is worth checking twice.

For something with only one unit — a jar of VapoRub, a bottle of Dettol —
fill `unit1_name` and `unit1_rate`, set `default_sell_unit` to `1`, and leave
every other unit column empty.

---

# 2. Laboratory — two files

## `lab-test-groups.csv` — fill this one FIRST

The groups tests are sorted into, and the same list the clinic uses as
**departments**. There is not a second list of departments anywhere.

| Column | Required | What goes in it |
|---|---|---|
| `group_name` | **yes** | `Haematology`, `Biochemistry`, `Urine Analysis`. Whatever the report headings actually say. |
| `sort_order` | no | Position in lists. Use `10, 20, 30…` so a group can be slipped in later without renumbering. Blank sorts alphabetically. |

## `lab-tests.csv`

One row per test.

| Column | Required | What goes in it |
|---|---|---|
| `test_name` | **yes** | The full name as it appears on the report. `Complete Blood Count`. |
| `code` | no | A short typing shortcut for the counter. `cbc`, `lft`. Typing `cbc` then Enter reaches the test without spelling it. Worth filling for the common ones. |
| `group_name` | **yes** | Must match a `group_name` in `lab-test-groups.csv` **exactly**, spelling and capitals included. |
| `rate` | **yes** | What the patient pays, in rupees. |
| `sample_type` | no | What has to be collected: `Blood`, `Urine`, `Stool`, `Swab`, `Sputum`, `Semen`, `Fluid`, `Tissue`. Leave blank for anything that collects nothing. **Fill it for every test** — it is what the sample-collection screen groups by, so a test with no sample type is one nobody is told to draw. |
| `outsourced` | **yes** | `Yes` if the sample goes to an outside laboratory. For Chunidevi this is `Yes` for essentially every test. |
| `partner_cost` | only if outsourced | What the outside laboratory charges **you**, in rupees. The difference between this and `rate` is what the clinic keeps, and it is what the laboratory statement is built from. |
| `doctor_required` | **yes** | `Yes` only if a bill for this cannot be saved without naming a doctor. For most lab tests this is `No`. |
| `vat_applicable` | **yes** | `No` unless you are VAT registered and this test is taxable. |

### What happens to a test once it is billed

Every test with `outsourced` = `Yes` joins the laboratory queue the moment the
bill is saved, and moves through it one click at a time:

**To collect → To send → Awaiting report → Report in → Given out.**

Nothing is assumed. Saving a bill does not mean the sample is drawn, and
drawing it does not mean it has gone — each step is somebody saying it
happened, and each is stamped with the time it happened. Any step can be put
back if it was clicked by mistake.

### Not in this file, on purpose

- **Reference ranges, normal values, result fields.** ClinicNP records that a
  test was sent, what it cost, and that a report came back. It does not record
  what the report said — the outside laboratory issues that, and software that
  stores a number it did not measure starts looking like the authority on it.
- **Doctors and outside laboratories.** Short lists, entered once in Settings.
  Tell me the names and I will put them in, or add them yourself.

---

# What happens after you send them

1. The groups load first, then the tests that reference them.
2. Items load into the catalogue with their units and rates.
3. **Nothing else is touched.** An import creates what is missing and never
   overwrites a price you have already changed, a shelf you have already
   assigned, or any stock you have already counted.
4. You are told what was created, what was skipped, and any row that could not
   be read — with the row number — so a typo is something you fix rather than
   something you hunt for.
