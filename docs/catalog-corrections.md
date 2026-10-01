# Catalog corrections, 2026-09-29

Fifteen catalog cost items were corrected in JobTread on 2026-09-29, at Carl
Bledsoe's request, after the first full catalog audit (718 priced items, 74 off
the cost-type defaults; the deliberate ones are recorded in
`src/rules/exceptions.ts`). The changes were made directly through the JobTread
API (`updateCostItem`), not by the auditor, which stays read-only. Every item
was read back afterwards; the "after" column is what JobTread returned.

Policy at the time: Labor 45% margin (price = cost / 0.55, x1.8182);
Materials, Other and Subcontractor 31.03% margin (price = cost x 1.45).

The template copies at $52.50 were set to match their loose master item
($55 -> $100) rather than left at $52.50 -> $95.45, so that the copy and the
master agree and the duplicate check stops flagging them.

| Item | Where | Cost type | Before | After |
|---|---|---|---|---|
| Tile Package - Kitchen `22PHGfWHEStw` | Phase 3 - Interior > Tile | Subcontractor | $50 -> $65 | $50 -> $72.50 |
| Drywall Brd- Labor `22PHGfWHEStk` | Phase 3 - Interior > Drywall/Plaster | Labor | $52.50 -> $94.50 | $55 -> $100 |
| Drywall Mud Labor `22PHGfWHEStn` | Phase 3 - Interior > Drywall/Plaster | Labor | $52.50 -> $94.50 | $55 -> $100 |
| Framing/Sheathing Labor `22PHGfWHEStY` | Phase 2 - Rough-In > Framing/Sheathing Materials | Labor | $52.50 -> $94.50 | $55 -> $100 |
| Project Management (C) `22PHGfWHEStR` | Phase 1 - General Requirements > Project/Site Management | Labor | $52.50 -> $94.50 | $55 -> $100 |
| General HVAC MAT `22PHGfWHEStf` | Phase 3 - Interior > HVAC | Labor, then Materials | $50 -> $90 | $50 -> $72.50 (see below) |
| Crew Labor `22PQQzg4pRMb` | DB Duration Shingle Roofing > Shingle Roof Replacement | Labor | $52.50 -> $94.50 | $55 -> $100 |
| Crew Labor `22PTgLRkCHdN` | Insurance Restoration Agreement > INSURANCE RESTORATION | Labor | $52.50 -> $94.50 | $55 -> $100 |
| Project Management (R) `22PQQzg4pRMc` | Shingle Roof Replacement > Project Management | Labor | $52.50 -> $94.50 | $55 -> $100 |
| Project Management (R) `22PTSS9tGhrE` | Shingle Removal (recommended) > Project Management | Labor | $52.50 -> $95 | $55 -> $100 |
| Project Management (R) `22PTSS9tH6kW` | Standing Seam Install > Project Management | Labor | $52.50 -> $95 | $55 -> $100 |
| Standing Seam Trailer Overhead `22PTSS9tGhrL` | Standing Seam Install > SS 26 Gauge Steel Panel | Labor | $0.30 -> $0.54 | $0.30 -> $0.545455 |
| Service Repair Materials `22PLugN6tnME` | loose (Cost Items tab) | Materials | $50 -> $75 | $50 -> $72.50 |
| Siding - Lighting Labor `22PLkt6AJrqk` | loose (Cost Items tab) | Subcontractor | $105 -> $157.50 | $105 -> $152.25 |
| Siding - Flashing Labor `22PLkssMWuvS` | loose (Cost Items tab) | Subcontractor | $2.50 -> $3.75 | $2.50 -> $3.625 |

General HVAC MAT was first priced to what its cost type said (Labor,
$90.909091). Carl then confirmed it is a material, so it was moved to cost
type Materials at $50 -> $72.50, and the same was done for every HVAC
materials line in every template. Six such lines exist; two were already
Materials (the loose `HVAC Materials` at $50 -> $72.50, and the copy in
Phase 2 - Rough-In > HVAC). The other three, all named `HVAC Materials`, were
cost type Labor with no price, and were changed to Materials:
`22PLiRydtgN6` (MECHANICAL (HVAC/PLUMB) > HVAC), `22PLm7f9eikb` and
`22PLwktUit8d` (each in a Phase 3 - Interiors > HVAC group).

## Changed by Carl in JobTread

Roof Removal `22PHexRsW9fT` (loose) was Subcontractor at $65 -> $117 (x1.80).
It sat in the same x1.80 cluster as the steep-pitch steel panels, which were
approved as a premium, but it is not a pitch item. Carl changed it to cost
type Labor at the 45% margin: $65 -> $118.18. Read back from JobTread the same
day.

## Changed 2026-10-01: drywall board template lines to Square Foot

Found on test job 25-0000, where the budget carried $21.42 of drywall board for
about 600 SF of wall. JobTread computes a line's cost as quantity times the
price of the item it points at, whatever the line's own unit says. These
template lines said Each while their price, Drywall Board - Mat
`22PCCE2cGYqw` at $1.02 cost and $1.479 price, is per Square Foot, so a rep or
the drafter counted sheets against a per-square-foot price. Changed at Carl
Bledsoe's request through the JobTread API (`updateCostItem`, `unitId` to
Square Foot `22PCC8zqEiwK`), then read back: all six lines that price from the
item now say Square Foot.

| Template line | Template | Before | After |
|---|---|---|---|
| Drywall Brd- Mat `22PLCchBuFMU` | X-Division 09 Finishes | Each | Square Foot |
| Drywall Board- Mat `22PLwktUit8p` | Addition/House Build | Each | Square Foot |
| Drywall Board- Mat `22PPsvvVSeBZ` | Bathroom Remodel | Each | Square Foot |
| Drywall Board - Mat `22PSSe3pfzsD` | Countertop Replacement | Each | Square Foot |
| Drywall Board - Mat `22PSSgVruC4j` | Door/Window Installation | Each | Square Foot |
| Drywall Brd- Mat `22PHGfWHEStj` | Kitchen Remodel | Square Foot | unchanged |

The evidence for square feet: the item's own unit, and past budgets that used
it at 990 (Currier) and 20 (Edgemont Colony) where a count of sheets would be
30 and 1; two reps overrode its price to $12 and $13.98 a sheet instead.

The Kitchen Remodel copy carries its own price, $1.02 cost and $1.70 price
(x1.667), where the item it points at is $1.479 (x1.45, the Materials
policy). Not changed; it is the same kind of template copy the 2026-09-29
corrections above set to match its master.

## Found 2026-10-01, not yet changed: Drywall - Sub

| Template line | Templates | Line's unit | Its price | Likely fix |
|---|---|---|---|---|
| Drywall - Sub `22PLwnKctZFM`, `22PM23fwBfbf`, `22PPsvvVSeBd` | Addition/House Build, Door/Window Installation, Bathroom Remodel | Hours | Drywall Sub `22PLN6M7K2w8`, $55 / $79.75 per Lump Sum | the item to Hours, if $55 is an hourly rate |

The drafter and the build flag any line counted in one unit and priced per
another (`src/draft/checks.ts`), so this one shows on a page whenever it is
kept. These came from one catalog search for "drywall"; the rest of the
templates have not been swept for the same thing.
