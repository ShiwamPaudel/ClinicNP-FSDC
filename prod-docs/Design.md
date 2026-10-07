# Design.md — ClinicNP
### Visual language: "The Green Counter and the Blue Case Sheet"

The pharmacy half of this product already has a language and it works: the green cross sign, cream paper, and a chemist's magenta ink stamp for human decisions. **None of that is being redesigned.** The clinic half is not a second brand — it is the second piece of paper on the same counter.

So: **sage** is the counter. **Cream** is the paper. **Magenta** is the ink stamp — rare, deliberate, reserved for the moment a person made a call. And **navy** is new: the blue ballpoint of a case sheet. It marks *who this is about* — the patient, their visit, their file. Sage answers "what is being sold". Navy answers "who is it for". They never fight because they never do the same job.

If magenta appears more than twice on a screen, something is over-inked. If navy appears anywhere that isn't about a patient, it's wrong.

---

## 1. Color tokens (CSS variables)

### Sage (primary / brand / pharmacy) — unchanged
| Token | Hex | Use |
|---|---|---|
| `--sage-950` | `#16241B` | Print text on cream, highest-contrast text |
| `--sage-900` | `#20342A` | Headings, sidebar background |
| `--sage-700` | `#35553F` | Primary buttons, active nav, focused borders |
| `--sage-600` | `#41684D` | Primary hover, links |
| `--sage-500` | `#557F60` | Chart primary series, icons |
| `--sage-300` | `#9DBCA4` | Disabled primary, subtle icons |
| `--sage-150` | `#D5E4D7` | Selected row background, chips |
| `--sage-75`  | `#EBF2EC` | Section tint, table header fill |

### Cream (surfaces) — unchanged
| Token | Hex | Use |
|---|---|---|
| `--cream-100` | `#FAF6EB` | App background |
| `--cream-50`  | `#FFFCF4` | Cards, table rows, inputs |
| `--cream-200` | `#F1EADA` | Hovered rows, wells |
| `--line`      | `#E3DBC6` | Borders, dividers, table rules |

### Magenta (the ink stamp — accent only) — unchanged
| Token | Hex | Use |
|---|---|---|
| `--magenta-600` | `#B02A6E` | Rate-override dot, shortcut keycap highlight, the one primary CTA on the counter, active unit-chip ring |
| `--magenta-700` | `#93235C` | Hover / pressed |
| `--magenta-100` | `#F7E2ED` | Chip and tint backgrounds |

**Magenta discipline (extended to the clinic):** it now also marks a **service rate edited at the counter** and an **overridden follow-up charge** — both are the same thing as an edited medicine rate: a person made a call. It is never used for patients, never for status, never for errors.

### Navy (the case sheet — new, clinic only)
| Token | Hex | Use |
|---|---|---|
| `--clinic-900` | `#16283F` | Patient card header, OPD-slip header rule |
| `--clinic-700` | `#234A78` | Clinic nav group active state, patient number, "Service" line tag |
| `--clinic-500` | `#3E6FA3` | Visit timeline spine, secondary clinic icons, chart series for services |
| `--clinic-150` | `#DCE7F3` | Selected patient row, service chip fill |
| `--clinic-75`  | `#EEF3FA` | Service block tint in a mixed bill, patient search results panel |

**Navy discipline:** navy appears only where a human being is the subject — the patient bar at the counter, the patient card, the visit timeline, the "Service" tag on a bill line, the clinic nav group, and the clinic series in charts. It is **not** a second primary: buttons stay sage, focus rings stay sage, and there is no navy fill larger than a card header. Navy is deliberately distinct from `--info-600` (#2E6E8C): darker, warmer-blue, non-cyan. If the two ever sit adjacent, use the info chip's icon to separate them.

### Status (functional) — unchanged
| Token | Hex | Use |
|---|---|---|
| `--ok-600` / `--ok-100` | `#2F7D4F` / `#E2F1E7` | Saved, synced, in stock, paid |
| `--warn-600` / `--warn-100` | `#A8681B` / `#F9EDD9` | Near-expiry 31–60 d, low stock, below-cost rate, **file pending** |
| `--warn2-600` / `--warn2-100` | `#8F7A1F` / `#F7F1D6` | Near-expiry 61–90 d band |
| `--danger-600` / `--danger-100` | `#B3362B` / `#F9E4E1` | Expired, blocked sale, destructive confirm, **allergy strip** |
| `--info-600` / `--info-100` | `#2E6E8C` / `#E1EFF5` | Offline chip, neutral notices, **closed-fiscal-year banner** |

Errors are red, never magenta, never navy.

### Dark surfaces
Sidebar and the counter's payment pane stay `--sage-900` with `--cream-50` text. The **patient bar** at the counter is the one navy surface in the counter layout: a 44 px `--clinic-900` strip above the bill, cream text. No full dark mode.

### Retired
The Faarma orange brand tokens (`--color-brand-*`, #e87e28) are **removed**. ClinicNP's mark is sage and navy. A pharmacy-only install shows the Faarma wordmark in sage — the orange does not return.

---

## 2. Typography — unchanged, one addition

| Role | Face | Notes |
|---|---|---|
| Display / page titles | **Bricolage Grotesque** 600–700 | Page titles, dashboard numbers, invoice shop name |
| UI & body | **IBM Plex Sans** 400/500/600 | Workhorse |
| Devanagari | **Mukta** 400/500/600 | `unicode-range`-scoped to Devanagari glyphs |
| Numbers, money, tables, invoice body | **IBM Plex Mono** 400/500 or Plex Sans with `tabular-nums` | Every money and quantity column aligns vertically, always |
| **Patient identity** *(new)* | Plex Sans 600 at 18 px for the name; **Plex Mono 500** for the patient number | The number is data and must be scannable down a column; the name is a person and must not look like data |

Scale (rem): `12 / 13 / 14 (base) / 16 / 18 / 22 / 28 / 40`. Base UI 14 px; counter bill lines 16 px; minimum 12 px anywhere; line-height 1.45 body, 1.15 display.

---

## 3. Layout & spatial system

Unchanged: 4 px spacing base (`4, 8, 12, 16, 24, 32, 48`); radius 10 px cards, 8 px inputs, 999 px chips; one shadow level; 232 px fixed sidebar; 1240 px content max-width.

**Sidebar, with both modules on** — grouped, not merged, so nobody hunts, and
**two tiles to a row** inside each group so the whole menu is reachable without
scrolling at 232 px:

```
  [ClinicNP logo]              ← artwork, not type (see below)
  Dashboard                    ← first block stays one per row:
  New bill                       the two most-used destinations

  CLINIC          (navy group label)
    Today       │ Patients
    Visits      │ Doctors
    Laboratory                 ← odd one out takes the whole row

  PHARMACY        (sage group label)
    Stock       │ Items
    Purchases   │ Suppliers
  ─────────────────────────    ← divider: what follows is neither module's
    Bills       │ Dues           (dues cover medicine and services, 0019)
    Reports     │ Settings      (Settings is admin-only; staff see Reports
                                 alone on its row)
```
Two columns rather than a scrolling menu: the list is short enough to fit if it
is laid out, and a menu that has to be scrolled hides half of itself. The tile
drops to 13 px with a tighter gap to earn the width, a name too long to fit is
clipped with its full text on the `title`, and a group with an odd number of
items gives the last one the full row — which is also what lets "Laboratory"
show its whole name. The nav region still scrolls if it ever has to.

The mark is the real **ClinicNP logo** (`/icons/logo-white-trim.png`, the white
artwork with its transparent margin cropped so its height is all mark). The
typeset wordmark stays as the fallback and is still what a pharmacy-only
install shows, because the product name follows the enabled modules (D-025) and
a raster cannot: Faarma must not be handed a ClinicNP logo.

With one module on, the group labels disappear and the items sit flat — a
pharmacy-only install looks exactly like Faarma v1. Collapsed (icon-only) mode
from v1 is retained: it returns to **one icon per row**, since a second column
at 68 px leaves nothing to hit, and group labels become a 1 px divider.

**The counter (`/billing`)** keeps its own layout — no sidebar, three zones — with one addition:

```
┌──────────────────────────────────────────────────────────────┐
│  search  (56 px, full width — medicines AND services)         │
├──────────────────────────────────────────────────────────────┤
│  ▌ PATIENT BAR  P-000123 · Anita Shrestha · 34 F · 98… ✕      │  ← navy, 44 px, only when clinic is on
├───────────────────────────────────────────┬──────────────────┤
│  bill table (the paper, cream)             │  payment pane    │
│   medicines block                          │  (sage-900,      │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                  │   320 px)        │
│   services block (clinic-75 tint)          │                  │
│   ─ ─ perforation ─ ─                      │                  │
│   totals                                   │                  │
└───────────────────────────────────────────┴──────────────────┘
```
Empty patient bar = a quiet navy-outlined strip reading `Add patient (P)`. At ≤ 900 px the payment pane docks to the bottom and the patient bar stays pinned under the search box — the front desk needs to see who they're billing more than they need to see the change due.

---

## 4. The two signature elements

### 4.1 The ink & paper bill — unchanged, extended
The bill table is still the paper slip it will become: cream card, hairline rules, Plex Mono amounts, dashed perforation above the totals, magenta dot beside a hand-edited rate, magenta left-rule on an overridden batch, and the 250 ms magenta **`✓ Saved / बिल बन्यो`** stamp on save — still the only animation on the counter.

New: in a mixed bill, the service lines sit in a `--clinic-75` block below the medicines, separated by a single hairline, each carrying a small navy **Service** tag and, where relevant, the doctor's name in 12 px `--clinic-500` beneath the service name. Medicines carry a sage **Medicine** tag only when services are present — a pharmacy-only bill needs no tag at all.

### 4.2 The patient card — the clinic's signature
One screen the clinic staff will open a hundred times a day. It must feel like picking up a physical case-sheet folder.

```
┌────────────────────────────────────────────────────────────┐
│ ▌P-000123        Anita Shrestha            34 Y · Female   │  navy header, cream text
│ ▌9841XXXXXX · Bhaktapur, Suryabinayak-4    Since 2081-05-12│
├────────────────────────────────────────────────────────────┤
│ ⚠ Allergy: Penicillin                                      │  danger strip, only when filled
├────────────────────────────────────────────────────────────┤
│ [Start visit]  [New bill]  [Add file]                      │
│                                                            │
│ ●───── 2083-04-12  Visit V-…-000456 · Dr. Karki · Follow-up│  navy timeline spine
│ │        Consultation, USG Abdomen        रु 1,700         │
│ │        📎 USG report.pdf                                  │
│ ●───── 2083-02-02  Visit V-…-000188 · Dr. Karki · New      │
│ │        Consultation, CBC, RBS           रु 950            │
│ ○───── 2082-11-20  Bill SI-…-000901 (medicines only)       │
└────────────────────────────────────────────────────────────┘
```

Rules for the timeline: one vertical navy hairline spine; a filled node for a visit, a hollow node for a bill with no visit; BS date leading, AD on hover; money right-aligned tabular; attachments as small paperclip chips that open inline. The spine is the only decorative line in the product and it earns its place — it is what makes eighteen months of a person's history readable in one scroll. No cards-in-cards, no avatars, no colour-coded visit types beyond the type word itself.

---

## 5. Components (new and amended)

**Patient bar (counter).** 44 px navy strip: patient number in Plex Mono, name in 600, age/sex, phone. `✕` clears. Empty state is an outlined strip: `Add patient (P)`. When a service line exists and no patient is set, the strip turns `--danger-100` with `Patient needed before saving` — the only red thing on the counter that isn't an expiry.

**Patient picker.** Opens on `P`. One input, three result columns (number · name + age/sex · phone/address), `↑↓ Enter`, and a persistent last row: `+ Register new patient (Ctrl+Enter)` which opens the 6-field inline form without leaving the counter. Duplicate warning appears inline under the phone field, never as a blocking dialog.

**Service result row.** Navy **Service** tag, service name, group in 12 px sage-500, rate right-aligned tabular. If the service is sent to an outside lab, a small navy outline chip with the partner's name. If it keeps a file, a paperclip glyph. No stock, no expiry, no unit chip — the absence is itself the signal that this line behaves differently.

**Follow-up notice.** When the follow-up rule fires, the line shows a 12 px navy note beneath the service name: *"Follow-up within 7 days — no charge."* Overriding it back to the full rate stamps the line with the magenta dot, same as any rate override.

**Vitals row.** Five small inputs on one line (BP, Pulse, Temp, Weight, SpO₂), each 88 px wide, all optional, all blank by default, no units typed by the user (suffix is a static grey label). Nothing validates a physiological range — the front desk does not need the software arguing with them.

**Attachment tile.** 96 px square: PDF glyph or image thumbnail, title on two lines max, kind chip, uploaded date in 11 px. Hover reveals view/download; delete only for Admin, behind a typed confirm. Upload zone is a dashed `--line` rectangle: *"Drag a report here, or take a photo."*

**Fiscal-year selector.** Header-right, next to the offline chip, only for Admin/Accountant: a quiet sage-outlined select showing `2083/84 · current`. Choosing a closed year swaps the whole page into read-only and drops an `--info-100` banner beneath the header: *"You're looking at 2082/83. This year is closed — you can read and print, but not change anything."* The banner is not dismissible; leaving the year is the way out.

**Stock-out reason select.** Not a bare dropdown: a 2-column list of reason tiles with a one-line consequence under each — *"Returned to supplier — this also credits the supplier's account"*, *"Used in the clinic — this comes out of stock but is not a sale"*. The consequence text is what stops the wrong choice.

**Payment pane: Dues and the discount (2083-06-05).** The three method buttons read **Cash · QR · Dues**. Dues opens *Paying now* (tabular input), a small Cash/QR pair for that part when it is above zero, and *Left on dues* in `--warn-100` on the dark pane — owed money is a warning colour, never red and never magenta. The **bill discount** has a two-segment `रू | %` switch beside its box; the choice survives from one bill to the next, and in percent a 12 px line underneath says *"10% of रू 459.00 … − रू 45.90"* so nobody has to trust mental arithmetic.

**Dues screen.** Three summary tiles (*Owed to you* in `--warn-600`, *People who owe*, *Oldest*), then *Owed / Paid back* tabs and one search box. People, not bills, are the rows: name in 500, patient number in Plex Mono navy (it is a person), phone in mono sage-500, amount owed in `--warn-600`, age as a badge (neutral, warn over 15 days, danger over 30). A row opens in place to show the bills behind the figure — a table on a desk, stacked cards on a phone, so the list never scrolls sideways. *Receive payment* is secondary on the row; inside its dialog the confirm button is the screen's one magenta CTA (*"Receive रू 310.00"*), because money is moving. The dialog shows the oldest-first split in `--ok-600` before anything is saved.

**Date box (amended C-016).** The same 40 px box, now writing the date in the shop's calendar (Settings → Company → *Calendar for dates*: Nepali or English). The 288 px popup opens with a pill switch, **नेपाली | English** (active half `--sage-700` on cream), and *Clear* on the right when the date is optional. Under it: `«` `‹` title `›` `»` — the double chevrons jump a year. The Nepali title stays Devanagari with *"Ashwin · 2026-09-17"* under it, as before; the English title is *"September 2026"* over the Nepali months it spans (*"Bhadra – Ashwin 2083"*). Saturday red in both. The footer writes the chosen day both ways (*"28 Ashwin 2084 = 15 Oct 2027"*). Days outside what the converter covers are disabled, never hidden. On a narrow screen the popup shifts left to stay whole; it closes on a pick, on Escape (focus back to the box) and on a click elsewhere. Every open starts from the setting — the switch is for one pick.

**Typing a date (amended C-028).** On the two screens where a date is copied off paper — purchase entry (the invoice date and each expiry) and opening stock — the box also takes typing, with the calendar still one click away on its icon. Digits only: the dashes appear as they are typed, so `20280131` becomes `2028-01-31` and nobody hunts for `-` or `/`, which a phone's number pad does not have. Backspace takes a dash with the digit before it rather than fighting to put it back. **The year says which calendar it is**, not the setting: a pack prints English (`EXP 01/2028`) and a Nepali bill prints Nepali (`2083/06/13`), often on the same purchase, so anything from 2060 up is read as Nepali and anything below as English — the two never overlap for a real date. The setting still decides how the date is *shown* once the box is left. Every other date box is unchanged and picks only.

**The purchase row (amended C-028).** One line per medicine, left to right in the supplier's order: Item · Unit · Batch · Expiry · Qty · (Free) · Cost/unit · **Sell price** · remove. The sell price opens filled with the item's current price for the unit on that line, and changing the unit brings that unit's price with it — a strip price is not a box price. Saving a different figure updates the item's price for that unit exactly as Items → Set prices does. A sell price below the cost is said in danger red under the row, not refused: it is almost always one digit, but a loss-leader is the shop's decision.

**Editing a purchase (C-028).** *Edit purchase* on the purchase's own page opens the same form, filled in. Nothing changes until *Save changes* asks for the signed-in admin's password in a small dialog; a wrong password, or an edit the stock will not allow, is said in that dialog, next to the button, while the form behind keeps every change. A line whose batch has been sold from, returned or counted shows its Item box disabled and a grey lock where the remove button was, with one sentence above the form saying why. Photo import is not offered while editing — it replaces every line. The purchase's page then says *Last changed by … on …* in Nepal time.

**The purchase row's notes (C-031).** Two small lines can sit under a row's boxes, each directly under its own box (absolutely placed on wide screens, in the flow when the row stacks): under Expiry, `4 years from today — change to the pack's` in `--warn-600` until the date is changed (a new row starts four years ahead); under Sell price, `Margin 13.8%` in sage-600 (danger red when negative), with `· 28.2% with free` (or *discount*, *free & discount*) in sage-500 when those lower the unit cost. The margin is on the selling price.

**Counter keys (C-031).** The `?` sheet is sectioned — The bill · Adding · On a medicine line · Payment · Anywhere in the app — and lists only keys that work. F1/? help · F2 new bill (a dialog: *Keep this bill* / *Clear it* / **Hold it & start new**, the last focused so Enter holds) · F4 or P patient (the search highlights a result; ↑↓ Enter attach) · F7 hold · F8 the held tray (first bill focused, numbered 1–9 keycaps, ↑↓ Enter, Esc) · F9 save · Alt+1/2/3 Cash/QR/Dues · Esc back to the search · Enter on a line back to the search. The patient bar's keycap reads F4. F2 also opens New bill from any back-office page (asking first if something has been typed there); the sidebar itself is unchanged.

**Paying for a purchase (C-029).** Under *Net total* on a new purchase, a small `PAYMENT` heading and a three-chip group in the same style as the discount's रू/% chips: *On credit* (where it starts) · *Paid in full* · *Part paid*. Part paid opens *Paid now (रू)*; either paid choice opens *How* (Cash, Bank transfer, Cheque, QR / digital wallet). Two figure rows follow — *Paid now*, *On credit* — and one grey sentence saying the credit goes onto what the supplier is owed. More than the bill is said in danger red and refused on save. Not on the edit screen, which says in one boxed sentence what was paid with the purchase and that Payables is where a payment is undone. The purchase's page adds *Paid when entered* and *Left on credit* under the net total.

**Payables (C-029).** Sidebar, admin only, beside Dues: Bills · Dues / Payables · Reports / Settings. Two tiles (owed to suppliers, owed to laboratories — each only with its module on), then a table per kind: name, *Owed now* (danger red when owed, grey `… paid ahead` when overpaid), a *Ledger* or *Statement* link and a secondary *Pay* button. Pay is a dialog — date (typable), amount with the owed figure as its placeholder, how, note — that says what will still be owed, and warns in `--warn-600` (does not refuse) when paying more than is owed. *Payments made* lists both kinds newest first; a payment made with a purchase links to it; an undone one is struck through, grey, badged *Undone*, with who and why beneath. *Undo* asks for a reason in a dialog with *Keep it* / *Undo payment* (destructive), the Dues pattern plus the reason.

**Fill from a photo (Purchases → New purchase).** One secondary button at the top of the screen, above the supplier, with a line of text beside it that says what will happen: the boxes below get filled, they are to be checked against the paper, and the photo is not kept. While it reads, the button says what it is doing — *Opening the photo…*, *Getting the reader ready…*, *Reading the bill…* — because the first read of the day takes a few seconds longer and silence reads as broken (D-145).

Three things the filled form says that a hand-typed one never had to. A line the reader could not match shows the supplier's own wording in danger red — *"ONIDOM TAB" is not in the list* — with the choose-and-add way out; a line it did match shows it quietly in grey, *On the bill: …*, so the guess can be checked at a glance. A row whose quantity times rate does not come to the printed amount carries a warning triangle above it. And under the net total sits the bill's own net total: agreeing in grey, disagreeing in red with what the paper says, which is the one line that catches a row the photo missed altogether.

**Purchase totals (Purchases → New purchase).** The right-hand block is the supplier's own totals block, in their order, so the two can be read line by line (D-143). Under a small `FROM THE SUPPLIER'S BILL` caption sit two boxes: *Discount on the bill* with a `रू | %` switch (the same switch as the counter's bill discount, D-135), and *Rounding*, which accepts a minus figure. Below them the computed rows — *Taxable amount*, *VAT (13%)*, *Rounding* — and then **Net total** in bold above the rule. Nothing is shown that is zero, so a purchase with no discount looks exactly as it always did.

**Backup status (Settings → Backup).** Under *Back up now*, one line of status: `--ok-100`/`--ok-600` with a shield-check when backups are kept (*"Automatic backups are on…"*), `--warn-100`/`--warn-600` with a warning triangle when they are not (*"Automatic backups are off. No private storage is connected…"*). The list reads date · *Nightly / Back up now / Before closing the year* · size · **Download** for a kept copy, or *Not kept* / *Downloaded only* in sage-500 when there is none — the old rows are shown, not hidden.

**Module toggles (Settings → Modules).** Two large rows, each with the module name, a one-line description of what appears when it's on, and a switch. Turning one off shows a plain confirm: *"Turning off the clinic hides patients, visits and services. Nothing is deleted — turn it back on any time."* The last enabled module's switch is disabled with the reason shown inline.

**Unchanged:** Buttons (sage primary 40 px / 44 px counter, one magenta CTA per screen max, keycap chips), Inputs (40 px, 2 px sage focus ring — never blue, and **never navy**), Badges, Tables (sage-75 header, 44 px rows, hairlines, tabular numerics), Toasts (bottom-centre, one at a time, 3 s / 6 s errors), Empty states (icon + one plain sentence + one action), Offline chip, the pictorial unit picker driven by item shape.

---

## 6. Print design

**A4 invoice — the one bill (D-102, D-103).** Letterhead image across the top, *TAX INVOICE* / *INVOICE*, patient and bill details, services above medicines. The medicine table is `# · Medicine (generic under it) · Batch no. · Expiry · Qty · Rate · Amount`. **Batch no. and Expiry are mandatory on every medicine line (D-141)**: Plex Mono 10 px, never wrapped, one batch per line in both cells so a medicine taken from two batches reads as two pairs, each batch number level with its own expiry. Expiry is the English month and year, `12/2026`, as the pack prints it (D-142) — the one English date on the bill. There is no "—" for a medicine: a line that cannot print both is not saved. The thermal layout below is kept for reference only.

**Invoice (80 mm thermal)** — as v1, with a patient block and a service block:
```
    FAMILY SMILE DENTAL CARE CENTER
       Address · 01-XXXXXXX · PAN: XXXXXXXXX
────────────────────────────────────────────
  Invoice  SI-2083/84-000123
  Date     2083-04-12  10:42     (2026-07-27)
  Patient  P-000123  Anita Shrestha  34 Y / F
────────────────────────────────────────────
  SERVICES
  OPD Consultation — Dr. Karki    1   500.00
  USG Abdomen & Pelvis            1  1200.00
  CBC (sent to Sample Path Lab)   1   450.00
  MEDICINES
  Sample Amoxicillin 500          2 Strip
    B-4471 · exp 2084-08          @28.00  56.00
- - - - - - - - - - - - - - - - - - - - - -
  Subtotal                            2206.00
  Discount                               6.00
  Total                               2200.00
  Cash 2500.00        Change   300.00
────────────────────────────────────────────
            Get well soon.
```
Rules: pure black on white, Plex Mono 10–11 pt, clinic name in Bricolage 14 pt, PAN directly under the address, service block always above the medicine block, batch and expiry in 9 pt under each medicine line, no colour, no logo raster.

**A5 invoice** — same content, wider, includes the dashed perforation rule, sage-950 text if colour printing is available, black otherwise.

**OPD slip (80 mm / A5)** — the patient's piece of paper. Navy header rule (black in thermal), patient number/name/age/sex, visit number, BS date, doctor, department, complaint, then **at least 60% of the page left empty** below a single hairline for the doctor's handwriting. Resist every urge to fill that space.

**Lab dispatch slip** — partner laboratory name largest after the clinic name, patient identity, tests listed with checkboxes, referring doctor, sample-collected-by line, BS date. Prints only for outsourced services. Two copies on A5 (one for the lab, one for the file) or one on thermal.

**Stock-out note** — items, batches, quantity in mixed units, reason in words, note, and a signature line.

---

## 7. Motion & feel

Default is stillness. Allowed: the save-stamp on the counter (250 ms), dialog fade + 4 px rise (150 ms), toast slide (150 ms), dashboard skeleton shimmer, and one new one — the **patient bar fills with a 120 ms left-to-right wipe** when a patient is attached, because that moment must be unmistakable at a glance in a queue. All gated by `prefers-reduced-motion`. Nothing animates while typing. The visit timeline does not animate on scroll.

---

## 8. Accessibility & quality floor

- Contrast ≥ 4.5:1 for all text pairs. Verified pairs: sage-700 on cream-50 = 6.9:1 ✓; magenta-600 on cream-50 = 6.2:1 ✓; **cream-50 on clinic-900 = 14.2:1 ✓; clinic-700 on cream-50 = 7.4:1 ✓; clinic-700 on clinic-75 = 6.9:1 ✓.** Re-verify every new badge tint pair before shipping it.
- Full keyboard operability with a visible 2 px sage focus ring at 2 px offset — including the patient picker, the vitals row and the attachment grid.
- Touch targets ≥ 44 px; the counter works on a 10" Android tablet; the file uploader works from a phone camera.
- Colour is never the only signal: the Service tag carries the word "Service"; the allergy strip carries a warning glyph and the word "Allergy"; the closed-year banner says "closed" in words.
- Language: sentence case, verbs on buttons ("Register patient", "Start visit", "Add file", "Record stock out", "Close year"), an action keeps its name through to its toast ("Register patient" → "Patient registered"), and no technical vocabulary anywhere (Rules.md §1).

---

## 9. The sign-in screen — the only branded screen

Everything behind the login belongs to the clinic: their name on the bill, their letterhead, their stock, their patients. A maker's badge in the corner of a counter screen is the maker talking over the shopkeeper all day, so there isn't one. The sign-in screen is the deliberate exception — nobody is working yet, and it is the screen a new member of staff stares at while somebody explains what this thing is.

**Layout.** Two halves, `lg:grid-cols-[1.05fr_1fr]`, each filling the viewport height.

```
┌───────────────────────────────┬────────────────────────┐
│ ClinicNP  (white artwork)     │                        │
│                               │  ┌──────────────────┐  │
│ The whole counter,            │  │ their letterhead │  │
│ on one screen.                │  └──────────────────┘  │
│ <derived tagline>             │                        │
│                               │  Log in                │
│ ▢ One bill for everything     │  Use the username and  │
│ ▢ Stock that watches itself   │  password you were     │
│ ▢ Patients and their visits   │  given.                │
│ ▢ Samples followed to report  │                        │
│ ▢ Keeps working offline       │  Username [_________]  │
│                               │  Password [______][👁] │
│ ─────────────────────────────  │  [      Log in      ]  │
│ by Infobytes Nepal Pvt. Ltd.  │                        │
│              ☎ Support ×2     │  Accounts are set up   │
│                               │  by the owner…         │
└───────────────────────────────┴────────────────────────┘
     sage-900, cream text            cream-100
```

**Rules that hold it together:**

- **Sage, never navy.** Navy means a patient is involved (§1) and nobody has signed in. The mark itself is the sanctioned exception and it arrives as artwork, not as a colour token.
- **The form comes first on a phone.** `order-1 lg:order-2` on the form, `order-2 lg:order-1` on the brand panel. Somebody opening this on the shop's tablet wants the password box, not the sales pitch. The pitch is still there, below it.
- **The clinic's own letterhead sits above the fields**, so somebody at a shared machine can see whose system this is before typing into it. Falls back to their name set in type, then to nothing — never to a placeholder. Only `company.name` and `company.logoUrl` cross to the browser; both are printed on every bill that leaves the shop, so neither is a secret, and nothing else from the company profile is sent to a page anybody can open.
- **Four or five features, never more**, each with an icon, a title and one sentence. Built by `featuresFor(modules)` in `components/auth/brand-panel.tsx` and **filtered by the modules actually switched on** — a pharmacy-only install must not be told about patients and samples, because those pages 404 for it (D-030) and the first thing a new user would learn is that the software describes itself wrongly.
- **Offline outranks Nepali dates for the last slot.** Five is the cap and a clinic with a pharmacy fills four; Bikram Sambat is table stakes for anything sold here, and billing through a power cut is not. Pinned by `tests/login-screen.test.ts`.
- **Everything is claimed in the present tense**, because everything listed is already built. A sign-in screen that advertises what is coming is the first thing a user learns not to trust.
- **The support numbers live here** because this is the screen somebody is looking at when they cannot get in — which is exactly when they are needed and exactly when a number stored inside the software is no use. They and the vendor name come from `lib/vendor.ts`, which is the only place in the product that names the maker.
- **One word for one action.** The heading, the button and its busy state all come from `strings.login` — "Log in", never a mix of "Sign in" and "Log in" on the same screen.

**Brand assets** (`public/icons/`): `logo-main.png` is the mark on light surfaces, `logo-white.png` on anything that isn't white, `favicon.png` is the round mark. The three installed-app icons and `apple-touch-icon.png` are **derived** from `favicon.png` by `scripts/make-icons.mjs` — never hand-cropped, so they cannot drift apart. The artwork spells "ClinicNP", so a pharmacy-only install falls back to the wordmark set in type (`components/ui/wordmark.tsx`) rather than showing the wrong name in a picture.
