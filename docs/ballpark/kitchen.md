# Kitchen Ballpark — Intake Sheet and JobTread Template

**Deitemeyer Brothers · General Construction · DRAFT 2026-09-27**

> The second of the three ballpark templates proposed in `../preconstruction-redesign.md` §4.
> It works exactly like the bathroom template (`bathroom.md`): a two-page site-visit sheet, 21
> JobTread job parameters, and a formula-driven cost group that prices the kitchen at Good,
> Better and Best at once. It runs on the same pricing engine and DB's same catalog rates.

| File | What it is |
|---|---|
| [`kitchen-intake-sheet.docx`](kitchen-intake-sheet.docx) | The two-page site-visit form. Prints on US Letter. |
| [`kitchen-ballpark-template.xlsx`](kitchen-ballpark-template.xlsx) | The JobTread build sheet, a working calculator, the parameter list, markup rates and the checks against DB's kitchens. |
| [`model/kitchen_model.py`](model/kitchen_model.py) | The kitchen template the workbook mirrors. `kitchen_calib.py` runs the checks. |

---

## 1. The honest starting point

**DB has not signed a kitchen since the move to JobTread.** The proposal said so (§1.4), and a
search of every estimate for cabinet, countertop, backsplash and appliance lines confirms it.
This is what exists:

| Job | What it is | Status | Total | Used for |
|---|---|---|---|---|
| 261384 | Full kitchen, ~181 SF, premium KraftMaid, quartz, full-height quartz backsplash | Pending | $98,986 | End-to-end check |
| 261062 | Full kitchen, ~200 SF, premium KraftMaid, quartz, tile backsplash, two walls moved | Pending | $91,173 | End-to-end check |
| 261268 | Whole-house remodel with a 28 LF kitchen | Pending | $277,971 | Better cabinet and quartz rates |
| 258551 | Kitchen addition with 30 LF of cabinets | Lost | $127,367 | Best cabinet and quartz rates, install hours |
| 258811 | Three apartment kitchens, builder-grade | Lost | $101,437 | Good laminate rate |

Two full kitchens, both premium and both still pending, is not enough to calibrate. The
template can be checked against them. It cannot yet be proven on them.

## 2. What DB's kitchen estimates showed

These are DB's own pricing conventions. The template follows them so its numbers read like
DB's.

1. **Cabinets are priced per linear foot of base-cabinet run, with uppers included.** On both
   the whole-house remodel and the kitchen addition, countertop square feet are exactly twice
   the cabinet feet, so the run is measured along the countertop.
2. **Pantry and locker towers are inside that price.** Neither full kitchen breaks its towers
   out of the cabinet lump sum, and neither per-foot bid has a tower line. A first draft priced
   towers separately, which double-counted them. The sheet now asks reps to include tower width
   in the run.
3. **DB's standard cabinet allowance is $600 cost per foot** ($870 price). The whole-house
   remodel used exactly that. It is the Better tier.
4. **Premium 3 cm quartz runs $117–$120 cost per SF.** The whole-house remodel and the kitchen
   addition priced it at $169–$174 per SF. The template's Best countertop is $123 cost, installed
   by the sub, or $160 price. Neither full kitchen records its countertop square feet, so their
   countertop lines can't confirm the rate.
5. **Laminate on the apartment kitchens was $33.75 per SF.** The template's Good top is $33.35.
6. **Kitchen electrical material is priced per square foot of floor**: $2.61 cost ($3.78
   price) on both full kitchens. The template does the same.
7. **Cabinet install time depends on the cabinet line.** The template uses 4 hours plus 1.1,
   1.3 or 1.5 hours per foot of run for Good, Better and Best. That matched the whole-house
   remodel to within 1 hour. It ran 32% short on the kitchen addition, which is recorded below
   as a known gap.

## 3. How close it gets

| Check | Actual | Template | Error |
|---|---|---|---|
| 261384 full kitchen, at the tier quoted | $98,049 | $97,341 | −1% |
| 261062 full kitchen, at the tier quoted | $91,173 | $96,109 | +5% |
| 261384 labor, rough-in and general requirements | $28,547 | $28,454 | 0% |
| 261062 labor, rough-in and general requirements | $33,724 | $33,566 | 0% |
| Better cabinets per LF (261268) | $870 | $870 | 0% |
| Best cabinets per LF (258551) | $1,178 | $1,305 | +11% |
| Good laminate per SF (258811) | $33.75 | $33.35 | −1% |
| Best quartz per SF (261268 / 258551) | $174 / $169 | $160 | −8% / −6% |
| Cabinet install hours, Better, 28 LF (261268) | 40 | 41 | +3% |
| Cabinet install hours, Best, 30 LF (258551) | 72 | 49 | −32% |

**Read the first four rows carefully.** The inputs for the two full kitchens were rebuilt from
those same estimates, including cabinet runs the estimates don't record. A close match shows
the template can express how DB prices a kitchen. It does not show it can predict one.

**The totals also land close partly because line errors cancel.** Line by line on the two full
kitchens:

| Line | 261384 | 261062 |
|---|---|---|
| Countertops | +20% | +12% |
| Backsplash | −52% (full-height slab) | −35% |
| Appliances DB supplied | a $725 hood priced as a full $3,335 appliance | +78% |

Cabinets aren't in that table because their runs were reconstructed from their own prices.

The Good tier rests on a single source, the apartment-kitchen bid. That makes it the least
tested part of the template.

**So kitchens are quoted at ±20%, not ±15%**, as the proposal planned. The workbook's Rates tab
is already set to ±20%. After three kitchens close, run `kitchen_calib.py` against them and
tighten the band.

### Known gaps

- **Full-height slab backsplash.** The Best backsplash prices an 18-inch quartz slab. 261384's
  full-height slab cost $12,604, about twice what the template gives. Price a full-height slab
  by hand until DB has a second example.
- **Complex installs.** The kitchen addition took 72 install hours for 30 feet. Crown, light
  rail, and angled or stacked uppers add time the per-foot rate does not see.
- **Appliances.** DB supplied appliances on one of the two kitchens. The allowance is per
  appliance DB buys, from $700 to $2,300 cost by tier. Install hours count every appliance.

## 4. The intake sheet

Same layout as the bathroom sheet, with kitchen questions:

1. **The design-step screen.** Five yes/no questions. Moving the sink or range, opening a
   structural wall, or changing the cabinet layout routes the job through the Design & Pricing
   Agreement. Most full kitchens will.
2. **The 21 measurements.** These cover the room, cabinets and counters (run, island,
   backsplash), plumbing and appliances (supplied versus installed), floor, electrical and
   doors. Three fields are notes for the estimator only: layout today, range fuel and panel
   capacity.
3. **What the customer wants.** Good, Better and Best in customer terms for cabinets,
   countertops, backsplash, floor and appliances.
4. **Photos and notes**, including cabinets open under the sink and the electrical panel label.

**Measure the cabinet run along the countertop.** Include the island and the width of any
pantry or oven towers. Do not measure uppers. This matches how DB's estimators already price
cabinets, and it is the single number that moves a kitchen ballpark most.

## 5. The example on the Calculator tab

A 180 SF gutted kitchen with a 26-foot run including a 6-foot island, new backsplash, four
appliances installed (none supplied), six recessed lights, two pendants, three new circuits,
under-cabinet lights and 180 SF of new floor:

| | Good | Better | Best |
|---|---|---|---|
| Ballpark | $41,991 | $56,289 | $77,711 |
| Range shown (±20%) | $33,600–$50,400 | $45,000–$67,500 | $62,200–$93,300 |

## 6. Building it in JobTread

The same six steps as the bathroom (`bathroom.md` §5), using this workbook's Template tab. The
cost group is `BALLPARK — Kitchen`. On a test job, the example values should reproduce
$41,991, $56,289 and $77,711 to the dollar.

**A job with both a kitchen and a bathroom.** Every kitchen parameter starts with `Kitchen `
and every bathroom parameter with `Bath `, so both groups can sit on one job without sharing a
value. Each group carries its own general requirements, though. On a combined job, delete the
second group's permit and site-prep lines, and set its dumpster loads and travel hours to 0.

## 7. Decisions for Carl

1. **Allowance type** for the selection lines. The draft uses `cost`, the same as the bathroom.
2. **The products behind each tier.** Name the cabinet line, the countertop material and the
   backsplash for Good, Better and Best so sales can show them.
3. **Appliances.** Should DB supply appliances by default, or only when asked?

## 8. Re-running the checks

The two full kitchens' line items are DB pricing data. They live in
`local/kitchen-estimates.txt`, which is not committed. Re-pull them with the query in
`bathroom.md` §7 (documents 22Pea5zKMYmy and 22PcvqdGHKS7). Then, from `docs/ballpark/model/`:

```
python3 kitchen_calib.py                  # end-to-end and component checks
python3 build_kitchen.py                  # rebuild the workbook (then recalculate)
node build_intake.js intake_kitchen.json  # rebuild the intake sheet
```
