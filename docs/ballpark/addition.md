# Addition Ballpark — Intake Sheet and JobTread Template

**Deitemeyer Brothers · General Construction · DRAFT 2026-09-27**

> The third of the three ballpark templates proposed in `../preconstruction-redesign.md` §4.
> It covers room additions, sunrooms and detached garages, one or two storeys. It works like the
> bathroom and kitchen templates (`bathroom.md`, `kitchen.md`): a two-page site-visit sheet,
> 28 JobTread job parameters, and a formula-driven cost group that prices Good, Better and
> Best at once. It runs on the same pricing engine, with DB's catalog rates and markup.

| File | What it is |
|---|---|
| [`addition-intake-sheet.docx`](addition-intake-sheet.docx) | The two-page site-visit form. Prints on US Letter. |
| [`addition-ballpark-template.xlsx`](addition-ballpark-template.xlsx) | The JobTread build sheet, a working calculator, the parameter list, markup rates and the checks against DB's additions. |
| [`model/addition_model.py`](model/addition_model.py) | The addition template the workbook mirrors. `addition_calib.py` runs the checks. |

---

## 1. What this ballpark is for

Every addition has a new foundation and a roof tie-in, so under the proposal's screen (§3.3)
every addition goes on to the Design & Pricing Agreement. The ballpark's job is to come
first: give the customer a written budget range at the site visit, **before** the designer
spends an hour. A customer who balks at $70K–$82K for a family room has not cost DB any
design time. That is the loss Carl described, and it is what this template prevents.

So the intake sheet's first question changes. It doesn't ask whether the addition needs the
design step; it always does. It asks whether the job belongs on the proposal's exception
track (§3.4): a second storey over existing rooms, a difficult site, a utility in the
footprint, an undersized panel or HVAC system, or a design DB hasn't built before. Any "yes"
means the CGM quotes the DPA individually and the contract carries the design-to-budget clause.

## 2. What DB's addition estimates showed

JobTread has 118 jobs tagged as additions. Eight have estimates that price a real addition:

| Job | What it is | Status | Total |
|---|---|---|---|
| 258410 | Finished 420 SF room on a crawl space, with a bathroom; house re-sided to match | Signed | $155,764 |
| 25-8197 | 795 SF shell on a crawl space, framed and dried in; customer finishes the inside | Signed | $98,096 |
| 261040 | 286 SF porch-type room on piers, wired but not insulated | Signed | $30,651 |
| 261094 | Detached 24×24 garage on a footed slab, drywalled and heated | Pending | $80,139 |
| 260109 | Detached 14×24 garage on a footed slab, drywalled | Signed | $55,879 |
| 246466 | Sunroom of about 360 SF on a crawl space, stone-coated steel roof, plus a deck | Signed | $127,397 |
| 258551 | 273 SF kitchen addition on a crawl space | Lost | $127,367 |
| 258684 | Tear-down and rebuild of a 333 SF sunroom, with deck work and a PVC roof deck | Signed | $186,054 |

Not used: 260820 (a porch repair), 261340 (a garage conversion), 261265 (a pole building),
261377 (siding only), 261089 and 260056 (remodels), and the Kay Oss test jobs.

What they showed:

1. **Scope moves the price far more than finish level does.** Finished rooms ran $251–$324
   per SF, garages $139–$166, the shell $115 and the porch-type room $107. On the
   Calculator's example, Best is only 17% above Good. For a bathroom it is more than double.
   The intake questions that matter most are finished or shell, the foundation, and heating
   and cooling.
2. **DB's catalog foundations fit.** The crawl-space item ($26.20 price per SF) matched
   258410's concrete sub to within 1%. Small or complicated foundations cost more per foot.
   The 14×24 garage's slab ran $45.60 per SF against the catalog's $30.45.
3. **Framing labor runs about 1 hour per 6 SF of floor**, plus about 8 hours per opening cut
   into the house and per roof tie-in. That matched DB's hours on 258410 (84 against 86)
   and 258551 (60 against 62). A framing sub costs about the same: $19 per SF price on
   25-8197 and 261094.
4. **The catalog's framing lumber rate is out of date.** DB's two most recent lumber quotes
   came to $22.40 and $22.80 cost per SF of floor. The catalog item is still $17.65, and
   older estimates used it. The template uses $22.50.
5. **A new HVAC unit is the largest single mechanical line.** DB's four addition HVAC subs
   ran $7,979 to $13,000. The template uses the median, about $9,750 price.
6. **Estimates often carry lines at $0.** The pending garage priced its siding, roofing,
   garage doors and entry door at $0. Neither garage priced its insulation or its overhead
   doors. The comparison below leaves those lines out of the template's side rather than
   count them as template error. A $0 line should say "by owner" in its name, so the
   customer can see it.
7. **Cost codes are inconsistent.** Five estimates filed insulation under Siding. One
   garage bought a single "framing package" that included its roof, siding and window
   materials. That makes line-level comparison noisy, and it will do the same to job costing.

## 3. How close it gets

Compared like for like. The actual leaves out work another template or an add-on prices:
the design fee, deck work, and the bathroom or kitchen finishes inside the addition. The
template leaves out lines the estimate carried at $0.

| Job | Same-scope actual | Template at its tier | Error |
|---|---|---|---|
| 258410 finished room with bath | $136,052 | $122,284 | −10% |
| 25-8197 shell | $91,096 | $85,071 | −7% |
| 261040 porch-type room | $30,651 | $34,329 | +12% |
| 261094 detached garage | $80,139 | $81,460 | +2% |
| 260109 detached garage | $55,879 | $55,682 | 0% |
| 246466 sunroom | $115,818 | $105,312 | −9% |
| 258551 kitchen addition | $68,589 | $77,062 | +12% |
| 258684 sunroom tear-down (not counted) | $174,714 | $102,280 | −41% |

**Seven of seven within ±15%, median error 9%, no bias.** All seven sit inside the
Good-to-Best band at ±20%. 258684 is shown but not counted. A tear-down with a PVC roof
deck, stone and whole-house gutters is outside what this template prices.

**Read that carefully. It is weaker evidence than it looks.**

- **It is in-sample.** The inputs were rebuilt from those same estimates. Two jobs' torn-down
  area was set from their own demolition hours, and 258410's extra siding from its own
  house-wrap line. Three rates were set against these jobs: framing hours, rental weeks and
  the HVAC unit.
- **The totals land close partly because block errors cancel.** Block by block, model
  against actual:

| Block | 258410 | 25-8197 | 261040 | 261094 | 260109 | 246466 | 258551 |
|---|---|---|---|---|---|---|---|
| Foundation & site | −12% | −27% | −8% | −6% | −33% | +3% | +98% |
| Framing | +27% | −2% | +69% | −7% | −14% | −9% | +39% |
| Roofing & gutters | −44% | −2% | +3% | – | +80% | −68% | +19% |
| Siding, soffit & fascia | −28% | +59% | −27% | – | +20% | +155% | +48% |
| Windows & doors | +5% | −42% | – | – | +195% | −2% | +56% |
| Interior finishes | +6% | – | – | +87% | +65% | +31% | −10% |
| Electrical, plumbing & HVAC | −19% | – | −8% | +21% | −12% | −8% | −13% |
| Demolition & general | −13% | +66% | +1% | −36% | −1% | −15% | 0% |

  Some of that is filing: 260109's framing package holds its roof, siding and window
  materials, so its blocks shift while its total holds. Some of it is real. The sunroom's
  stone-coated steel roof cost about three times the template's Best.

**So additions are quoted at ±20%**, the same as kitchens. The workbook's Rates tab is set to
±20%. Accept the template for live use when **8 of the next 10 additions** land within ±20% of
their signed price. Tighten to ±15% only if they land within that.

### Known gaps: price these by hand

- **Specialty roofs.** Stone-coated steel, PVC membrane or a roof deck.
- **Tear-down and rebuild**, and deck work of any kind.
- **Brick or stone** to match the house.
- **Basements and second storeys.** No basement or two-storey addition was in the data, so
  those formulas are untested. The screen sends both to the exception track.
- **Partial foundations.** 258551's crawl space ran under only 130 of its 273 SF.
- **Customer-supplied materials.** Count the item as usual so the labor is priced, then
  delete its allowance line.

## 4. The intake sheet

Same layout as the bathroom and kitchen sheets:

1. **The exception-track screen.** Five yes/no questions (§1 above).
2. **The measurements**, in 23 rows: size and shape, foundation and site, roof and exterior,
   windows and doors, and inside. Rows that feed several parameters list them all: the
   foundation row, the two door rows and the heating row. Two fields are notes for the
   estimator only: the exterior material today, and the panel and furnace.
3. **What the customer wants.** Good, Better and Best in customer terms for roof, siding,
   windows, patio door and floor.
4. **Photos and notes**, including the roof line where it ties in, the ground in the
   footprint, and the panel and furnace labels.

**Tick exactly one foundation.** It becomes 1 and the other three 0. The same goes for
heating and cooling.

## 5. The example on the Calculator tab

A 16×20 family room on a crawl space, attached, with a simple roof tie-in, four windows, a
patio door, one opening into the house, and ductwork extended from the house system:

| | Good | Better | Best |
|---|---|---|---|
| Ballpark | $70,257 | $74,302 | $81,977 |
| Range shown (±20%) | $56,200–$84,300 | $59,400–$89,200 | $65,600–$98,400 |

## 6. Building it in JobTread

The same six steps as the bathroom (`bathroom.md` §5), using this workbook's Template tab. The
cost group is `BALLPARK — Addition`, with four phases: General Requirements, Foundation &
Framing, Exterior & Rough-In, and Interior. On a test job, the example values should reproduce
$70,257, $74,302 and $81,977 to the dollar.

**Cost type U.** Lines marked `U` are labor the catalog prices per square, foot or piece:
siding, roofing, gutters and garage-door wrap. Build them as JobTread's Labor type at the
unit cost shown. Their price is cost ×1.45, as in the catalog, not the hourly $55 / $100.

**A bathroom or kitchen inside the addition.** Add both cost groups to the job. Every
parameter starts with its room's prefix, so they never collide. The addition group already
prices the whole shell and floor area: drywall, paint, flooring labor, electrical, and the
plumbing rough-in. In the room's group, keep its finish selections, fixtures, cabinets and
their install labor. Delete its Phase 1 lines and its drywall, paint and flooring lines, and
set its Full Gut, Walls Moved and Fixtures Relocated to 0. No estimate has tested this
combination yet, so check the first one line by line.

## 7. Decisions for Carl

1. **Allowance type** for the selection lines. The draft uses `cost`, the same as the other two templates.
2. **The products behind each tier.** Name the shingle, siding, window and patio door for
   Good, Better and Best so sales can show them.
3. **Framing lumber.** Update the catalog's `Framing/Sheathing Materials` to about $22.50 per
   SF, or keep the override in this template.
4. **Permit.** Drafted at $200 cost. DB's addition permits ranged from $58 to $1,595 depending
   on the city.
5. **"By owner" lines.** Should a $0 line always name who supplies it? This matters for the
   customer and for future calibration.

## 8. Re-running the checks

The eight estimates' totals by cost code are DB pricing data. They live in
`local/addition-estimates.txt`, which is not committed. To rebuild that file, pull each estimate
grouped by cost code and cost type, with the query in `bathroom.md` §7 but grouping
`by: [["costCode","name"], ["costType","name"]]`. Then, from `docs/ballpark/model/`:

```
python3 addition_calib.py                  # totals, band and block-by-block checks
python3 build_addition.py                  # rebuild the workbook (then recalculate)
node build_intake.js intake_addition.json  # rebuild the intake sheet
```
