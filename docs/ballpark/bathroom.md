# Bathroom Ballpark — Intake Sheet and JobTread Template

**Deitemeyer Brothers · General Construction · DRAFT 2026-09-27**

> The first of the three ballpark templates proposed in `../preconstruction-redesign.md` §4.
> A sales rep fills in a two-page sheet at the site visit. Those numbers become JobTread job
> parameters, and a formula-driven cost group prices the bathroom at Good, Better and Best at once.
> Every rate comes from DB's own bathroom estimates, read from JobTread on 2026-09-27.

| File | What it is |
|---|---|
| [`bathroom-intake-sheet.docx`](bathroom-intake-sheet.docx) | The two-page site-visit form. Prints on US Letter. |
| [`bathroom-ballpark-template.xlsx`](bathroom-ballpark-template.xlsx) | The JobTread build sheet, a working calculator, the parameter list, markup rates and the calibration. |
| [`model/`](model/) | The pricing engine shared with the kitchen template, the bathroom model and calibration, and the scripts that build both files. |

---

## 1. The open question from the roadmap is answered — VERIFIED

`ROADMAP.md` §1.2 left one thing unknown: where the values behind DB's roofing formulas are
entered. **They are job parameters.** `job.parameters` is a readable, writable array on every
job, and `createJob` and `updateJob` accept it. Job 260369 carries `Roof Facets Area = 3121`,
`Waste Factor = 1.1` and eleven more, which are exactly the names in the roofing formulas.
168 jobs carry parameters today.

A parameter is typed: `number`, `option`, `formula`, or a measurement type (`area`, `linear`,
`count` and pitch/volume variants) that can hold takeoff measurements tied to a plan. This
template uses plain numbers, the same as roofing.

Job 260369 also carries two parameters with no value set (`Vented Soffit Area`,
`Unvented Soffit Area`), which suggests
JobTread creates a job's parameters when a formula that names them is added. **Confirm this on a
test job before the build** (§5, step 3).

## 2. How the template works

- **22 site-visit parameters**, all numbers, plus two the estimator sets: the contingency rate and
  the permit fee.
  Yes/no items are 1 or 0. The full list, with how to measure
  each, is on the workbook's Parameters tab and printed beside every field on the intake sheet.
  Every name starts with `Bath ` (for example `{Bath Full Gut}`), so a job that also carries the
  kitchen template never shares a parameter between rooms.
- **Formulas use only what DB's live formulas already use:** `+ - * /`, parentheses, `round()`,
  `ceil()` and `{Parameter Name}`. None of DB's 101 live formulas uses a conditional, so none
  of these does either. A yes/no switch works by multiplying by its 0/1 parameter.
- **Common scope** (general requirements, demolition, rough-in, drywall, paint, trim, doors)
  sits in DB's usual four-phase tree and appears in every tier.
- **Finish selections** sit in one JobTread selection group, *Finish Level*, with three options:
  Good, Better and Best. It is a simple selection with one choice required, so the customer
  sees three totals on one Ballpark document. This is the same native mechanism the roofing
  option groups use.
- **Rates are DB's catalog rates.** Labor is $55 cost / $100 price per hour. Materials are
  marked up ×1.45, subcontractors ×1.30 and other costs ×1.45. Hauling uses DB's existing
  $250 / $450 catalog item.

### What the tiers mean

| | Good | Better | Best |
|---|---|---|---|
| Walk-in shower | Acrylic or fiberglass kit, DB installs in 12 h | Onyx / Al-Co panel system, DB installs in 24 h | Tile or large panel system, installed by sub |
| Glass | Framed bypass | Semi-frameless | Frameless panels |
| Vanity (per foot) | Stock, cultured-marble top | Semi-custom, quartz top | Custom, premium top |
| Floor | LVP, DB crew | Upgraded LVP, DB crew | Tile, installed by sub |

Tier prices are the medians of what DB actually charged on these jobs. The shower, glass and
vanity values drive most of the spread between tiers.

## 3. How accurate it is

Tested against the **17 single-bathroom estimates DB sent between January and September 2026**:
7 approved, 8 pending and 2 lost. Every estimate's line items were pulled from JobTread, and
the transcription reconciles to the penny with each document's total. For each one, the site-visit
inputs were reconstructed from its own lines. Room size was estimated where the estimate had
no square-foot line.

| Test | Result |
|---|---|
| **Structure** (everything except the customer's finish selections), median error | **10%** |
| Structure within ±15% | 13 of 17 |
| Structure bias | +2% |
| Actual price inside the Good-to-Best band (±15%) | **17 of 17** |
| Nearest tier within ±15% of the actual price | 15 of 17 |
| Tier read from the shower type within ±15% | 11 of 17 |
| One tier for everyone (Better) within ±15% | 5 of 17 |

**What this means for sales.** The formulas are sound. The price spread comes from the
customer's finish choices, which is why the ballpark must show all three tiers. DB's actual
prices sat 22% of the way from Good to Best at the median, so most customers land between
Good and Better. Section 9 of the intake sheet asks which level the customer leans toward,
so the estimator knows which tier to lead with.

**This is an in-sample check.** The rates came from the same 17 estimates. The real test is
out of sample: accept the template for live use when **8 of the next 10 bathroom jobs** land
within ±15% of their signed price at the tier the customer chose.

Excluded from calibration: 258657 (two bathrooms priced only as cost-group totals), 258797
(a bathroom plus three exterior doors), 260097 (a door job tagged as a bathroom) and 258668
(a bedroom remodel tagged as a bathroom).

### What DB's own estimates showed

These findings set the rates, and several contradict the first draft of the template.

1. **Drywall and paint do not scale with room size.** A gutted bathroom runs about $2,100
   whatever its size. A shower-only job runs about $1,300. The first draft charged by square
   foot and was 32% high.
2. **Premium showers and tile floors are subbed out.** DB logged zero crew hours on them.
   The install cost sits in the sub's price. The first draft charged 24 crew hours and was
   87% high on shower labor.
3. **Shower labor tracks the product.** Every shower unit under $4,000 was installed in
   12 hours. Every panel system of $4,000 and up took 24–26 hours.
4. **Relocating a fixture fits best at about 4 hours and $500 of material**, not the 6 hours
   and $700 the first draft assumed.
5. **DB's standard LVP line is $5.00 cost per SF ($7.25 price)** plus $0.75 cost per SF of
   misc. material. That is the Better floor.
6. **Demolition is 16 hours for a gutted bathroom** on 8 of 13 full-gut estimates (range 8–20),
   and 4–10 hours for shower-only work.

### Contingency — decided 28 Sep 2026

Each tier carries a named **Contingency** line, the same line the fixed-price proposal will
carry, so the ballpark and the contract never differ by a hidden 5–10%. The estimator sets
`{Bath Contingency Rate}`: **5%** when everything stays in place, **8%** when a fixture or a
wall moves. The customer is told that unforeseen conditions draw on it first and any unused
balance is credited at closeout.

The checks above compare prices **before** contingency, because DB's past estimates carried
none. From now on the signed price includes it, so the acceptance test (8 of the next 10
within ±15%) compares like with like.

## 4. The intake sheet

Two pages, US Letter, for the sales rep at the site visit:

1. **The design-step screen.** Five yes/no questions. Any "yes" routes the job through the
   Design & Pricing Agreement after the budget range.
2. **The 22 measurements**, grouped by room, shower and tub, plumbing, vanity and toilet,
   floor, electrical, and doors, travel and permit. Each field names its JobTread parameter in small
   print, so entering them afterward is mechanical.
3. **What the customer wants.** Their Good / Better / Best leaning, described in customer
   terms, plus budget, timing and whether all decision-makers were present.
4. **Photos and notes.** A checklist of the shots the estimator needs.

## 5. Building it in JobTread

About one day for the estimator. Start on a disposable test job, per the roadmap's
read-only discipline.

1. **Create the catalog items.** Use the workbook's Template tab: one row is one item, with
   its name, cost code, unit, unit cost, unit price and quantity formula. Paste the formulas
   exactly as written. Parameter names are case- and space-sensitive.
2. **Build the cost group** `BALLPARK — Bathroom` with the paths in the Template tab: the four
   phase groups, then a *Finish Level* group set as a simple selection (one required, show
   price deltas) holding Good, Better and Best option groups. Rows marked "[each tier]" become one
   item in each option at that tier's cost. Rows named for one tier go only in that option.
   Each option also gets its **Contingency** row: unit Lump Sum at $1.00, cost type Other with
   the markup set to 0, and a new cost code `Contingency`. JobTread formulas can't reference other
   lines, so its formula spells out the tier's subtotal; paste it whole, and regenerate it
   (`python3 build_bathroom.py`) after any rate change.
3. **Add the group to a test job** and check whether JobTread creates the 24 parameters
   automatically. If not, add them to the job by hand. Either way, write down which.
4. **Enter the Calculator tab's example values** as the test job's parameters. The Good, Better
   and Best totals, with the 5% contingency, should match the Calculator to the dollar:
   $19,413, $29,078 and $41,550. If they differ, one formula or price was mistyped.
5. **Set the allowance type to `price`** on every line the Template tab marks "Price" (§6).
6. **Price the next 10 bathroom site visits** with it alongside the normal process and record
   the ballpark midpoint on each job.

## 6. Decisions

Decided by Carl on 28 Sep 2026 (`../preconstruction-redesign.md` §9):

1. **Allowances are stated as customer prices** (JobTread allowance type `price`). No total
   changes. An overage or a credit is simply the difference in price, which is what the
   customer script promises.
2. **Contingency is a named line** on every tier, 5% or 8% (above).
3. **Tier products.** The estimator and the designer name one product per Good / Better / Best
   cell in one sitting and lock the grid for six months. The drafted allowances are medians of
   what DB charged; the proposal's §9 has the starting grid.

4. **Permit fee follows the jurisdiction.** `{Bath Permit Fee}` is the fee DB pays, in dollars; the
   estimator enters it from the permit table on the workbook's Rates tab (DB's permit bills for the
   last six months, from $10 in Convoy to $300 in Pleasant Township; Van Wert charges $20 plus $2
   per $1K of project cost over $10K). The default, $100, is what DB's own estimates of this type carried.
5. **Travel applies in Zones 2 and 3.** `{Bath Service Zone}` comes from the job's Service Zone field
   in JobTread. Travel hours are the crew's person-days times 0.5 h (Zone 2) or 1.25 h (Zone 3),
   which is DB's own Service Call zone charges ($85 / $115 / $155 cost) turned into drive time.
   Zone 1 adds none. Extended jobs (over 50 miles) are quoted by hand; enter 4 as a floor. The one bathroom estimate with travel, 261280 in the Extended
   zone, carried 30 h; zone 4 gives it 36.

## 7. Re-running the calibration

The raw line items are DB pricing data, so per `.gitignore` they are **not committed**. They
live in `local/bathroom-estimates.txt`. To rebuild them, pull each bathroom estimate's lines
grouped by name and cost type with this read-only query:

```json
{ "document": { "$": { "id": "<documentId>" }, "price": {},
    "costItems": { "$": { "size": 100, "group": {
        "by": [["name"], ["costType", "name"]],
        "aggs": { "p": { "sum": "price" }, "q": { "sum": "quantity" } } } },
      "withValues": {} } } }
```

Then, from `docs/ballpark/model/`:

```
python3 analyze.py                    # parse and bucket; checks each estimate reconciles to its total
python3 calib.py                      # structure error and tier-band check
python3 build_bathroom.py             # rebuild the workbook (then recalculate in Excel or LibreOffice)
node build_intake.js intake_bathroom.json   # rebuild the intake sheet (needs the docx npm package)
```
