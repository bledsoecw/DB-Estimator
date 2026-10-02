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

The Kitchen Remodel copy carried its own price, $1.02 cost and $1.70 price
(x1.667), where the item it points at is $1.479 (x1.45, the Materials
policy). At Carl's request its price was set to $1.479 the same day, to
match its master, as the 2026-09-29 corrections above did for other copies;
read back at $1.02 cost and $1.479 price.

## Changed 2026-10-01: Drywall Sub to Hours

The three template lines named Drywall - Sub said Hours, while the item they
price from, Drywall Sub `22PLN6M7K2w8`, said Lump Sum at $55 cost and $79.75
price. $55 is DB's hourly rate everywhere else, so at Carl's request the
item's unit was changed to Hours, through `updateCostItem` (`unitId` to Hours
`22PBAjfWNQqP`), and read back. The item and all three lines now agree.

| Item or line | Where | Before | After |
|---|---|---|---|
| Drywall Sub `22PLN6M7K2w8` | loose (Cost Items tab) | Lump Sum | Hours |
| Drywall - Sub `22PLwnKctZFM` | Addition/House Build | Hours | unchanged, now agrees |
| Drywall - Sub `22PM23fwBfbf` | Door/Window Installation | Hours | unchanged, now agrees |
| Drywall - Sub `22PPsvvVSeBd` | Bathroom Remodel | Hours | unchanged, now agrees |

The drafter and the build flag any line counted in one unit and priced per
another (`src/draft/checks.ts`). The sweep below covers the rest of the
templates.

## Changed 2026-10-01: every construction template line now in its price's unit

A sweep of all 1,977 template lines (every catalog line inside a template
group; each one points at a priced item). For each of the organization's 28
units, JobTread was asked for the lines in that unit whose price item is in a
different one, plus the lines with no unit whose item has one and the reverse.
96 lines disagreed, on 31 price items.

At Carl's request the same day, groups 1 to 4 below were applied through
`updateCostItem` (`unitId` only; no price changed): 73 lines set to their
price's unit, and two items, Bulk Excavation and Electrical Sub, set to the
unit their lines and formulas use. The shutters are priced per pair (the item
reads "One set of vinyl shutters"), so their lines went to Set. Group 5, the
roofing templates, was left alone. The sweep was then run again: the only
mismatches left are the 19 roofing lines in group 5.

JobTread prices a line as its quantity times the item's price, whatever the
line's unit says. So a mismatch matters exactly when a rep, or the drafter,
counts in the line's unit and the price is per something else.

### 1. Wrong dollars when counted as the line says: each line set to its price's unit (45 lines, applied)

| Item, price (cost / price) | Line says | Price is per | Lines | Templates (line ids) |
|---|---|---|---|---|
| Plumbing Labor `22PLiRMRn39c`, $55 / $100 | Square Foot | Hours | 12 | X-Division 15 `22PLiRuA4ack`; Kitchen Remodel `22PLiULQaivK` `22PLiV63RKBW`; Bathroom Remodel `22PLm7f9eika` `22PLm7f9eimG`; Addition/House Build `22PLwktUit8m` `22PLwqDbqWzz` `22PLwqDbqtui`; Countertop Replacement `22PLxHbz3dwh`; Covered Porch `22PLxKt8KKeB` `22PLxKt8Kgbm`; Deck `22PLxQwYMiER` |
| Electrical Labor `22PLiT7FjgXV`, $55 / $100 | Each | Hours | 11 | X-Division 16 `22PLiTV8MfcD`; Kitchen Remodel `22PLiULQaivH` `22PLiV63RKBX`; Bathroom Remodel `22PLm7f9eikX` `22PLm7f9eimK`; Addition/House Build `22PLwktUit8a` `22PLwqDbqtum`; Covered Porch `22PLxKt8Kgbb` `22PLxKt8Kgcv`; Deck `22PLxQwYMiEM` `22PLxQwYMiEW` |
| HVAC Labor `22PLiRRP7giK`, $55 / $100 | Each | Hours | 4 | X-Division 15 `22PLiRydtgN7`; Kitchen Remodel `22PLiULQaivJ`; Bathroom Remodel `22PLm7f9eikc`; Addition/House Build `22PLwktUit8e` |
| Cabinetry Labor `22PCCE44RN7w`, $55 / $100 | Linear Feet | Hours | 4 | Kitchen Remodel `22PLkhJfWP2m`; Bathroom Remodel `22PLm7f9eim8`; Countertop Replacement `22PLxHbz3dwZ`; Addition/House Build `22PMwuJwv2uG` |
| Door Labor `22PLep9UAwcc`, $55 / $100 | Each | Hours | 3 | X-Division 08 `22PLhsQZnhDp`; Bathroom Remodel `22PLm7f9eim2`; Addition/House Build `22PLwk8fHWyb` |
| Fireplace Sub `22PLiEByuk4u`, $2,500 / $3,625 | Hours | Lump Sum | 3 | X-Division 10 `22PLiF73hrs4`; Addition/House Build `22PLwqDbqX25`; Covered Porch `22PLxKt8KgbU` |
| Vinyl Soffit Install `22PLm2GUPX5q`, $4 / $5.80 | Square | Square Foot | 3 | Siding `22PLm3qHY9fN`; Addition/House Build `22PLwk8fHWxt`; Covered Porch `22PLxKt8Kgag` |
| Shutters Labor `22PLks6CQff8`, $55 / $100 | Each | Hours | 2 | Siding `22PLkvvLassR`; Addition/House Build `22PLwk8fHWxX` |
| Bathroom Fan Venting Labor `22PLm93NfBfp`, $55 / $100 | Each | Hours | 2 | Bathroom Remodel `22PLm99tyFkB`; Addition/House Build `22PLwqDbqtup` |
| Concrete Labor `22PLzebnjmMX`, $55 / $100 | Bag | Hours | 1 | Deck `22PLzek8kciM` |

What it costs when counted as the line says: 120 SF of bathroom plumbing at
$55 is $6,600; eight hours of a fireplace sub at $2,500 is $20,000; five
squares of soffit at $4 is $20 instead of $2,000 for 500 SF.

### 2. The item's unit was wrong, not the lines' (applied: Bulk Excavation to Cubic Yard; Electrical Sub and its 3 lines to Hours)

| Item, price | Item said | Lines say | Lines | Why the item | Templates (line ids) |
|---|---|---|---|---|---|
| Bulk Excavation `22PCCDhfeApu`, $29.63 / $53.87, Labor | Hours | Cubic Yard | 4 | every line's formula is `({Area}*{Depth})/27`, cubic yards | X-Division 02 `22PF3nUfgGv6`; X-Division 03 `22PFHFwr6WFD`; Addition/House Build `22PLm9zvBKbU`; Covered Porch `22PLxKt8KKdm` |
| Electrical Sub `22PLiTAjtd8Y`, $55 / $79.75 | Lump Sum | Each | 3 | the same $55 as Drywall Sub, which Carl set to Hours; item and lines would go to Hours | X-Division 16 `22PLiTV8MfcE`; Bathroom Remodel `22PLm7f9eikY`; Addition/House Build `22PLwktUit8b` |

### 3. Labels only: the dollars come out right either way (21 lines, applied)

A package counted as 1 Each or 1 Lump Sum costs the same; a line with no unit
leaves the rep to guess what to count. Aligning the line to its price's unit
changes no dollars.

| Item, price | Line says | Price is per | Lines | Templates (line ids) |
|---|---|---|---|---|
| Concrete Sub Pckg `22PCCDhqwKsC`, $1,500 / $2,175 | Each | Lump Sum | 4 | X-Division 03 `22PF3qKB7HYi`; Addition/House Build `22PLm9zvBKbd`; Covered Porch `22PLxKt8KKdw`; Deck `22PLxQwYMMHU` |
| Deck Labor Sub `22PLegccuqGH`, $5,000 / $7,250 | Each | Lump Sum | 3 | X-Division 06 `22PLegru6qw3`; Addition/House Build `22PLwk8fHWyG`; Deck `22PLxRnc7acj` |
| HVAC Sub `22PLiRWcc6Va`, $17,500 / $25,375 | Each | Lump Sum | 2 | X-Division 15 `22PLiRydtgN8`; Addition/House Build `22PLwktUit8f` |
| Permit `22PEjZMRaX6W`, $0 | no unit | Lump Sum | 6 | X-Division 01 `22PF3i5ZiGxk`; Addition/House Build `22PLm9zvAwgP`; Covered Porch `22PLxKt8Jwik`; Deck `22PLxQwYMMGa`; Door/Window Installation `22PM233XxWHC`; Bathroom Remodel `22PM5zuH5VrF` |
| 3CC0100 - Concrete → Concrete `22PCCDhpbtAn`, $8.40 | no unit | Bag | 1 | X-Division 03 `22PF3pw9AxhA` |
| 3CC0400 - Concrete Slab → `22PCCDhtBEU4`, $8.80 | no unit | Square Foot | 1 | X-Division 03 `22PF3pw9AxhB` |
| 3CC0500 - Concrete - Stamped → `22PCCDhtqwqR`, $32.45 | no unit | Square Foot | 1 | X-Division 03 `22PF3pw9AxhC` |
| 3CC0200 - Fndtn - Crawl → `22PCCDhrmTn2`, $18.07 | no unit | Square Foot | 1 | X-Division 03 `22PFGvmC9eVw` |
| 3CC0300 - Fndtn- Abv Grnd Stem → `22PCCDhsTyPP`, $21 | no unit | Square Foot | 1 | X-Division 03 `22PFGvmC9eVx` |
| 3CC0600 - Concrete Cookie → `22PCCDhuX2Ra`, $10 | Bag | Each | 1 | X-Division 03 `22PF3pw9AxhD` |

### 4. Shutters (4 lines, applied: priced per pair, lines set to Set)

| Item, price | Line said | Price is per | Lines | Decision | Templates (line ids) |
|---|---|---|---|---|---|
| Shutters `22PL8kngwMvL`, $91.16 / $132.18, Materials | Each | Set | 4 | Carl: priced per pair; a rep counts pairs | X-Division 07 `22PL9Cz5xTVg`; Siding `22PLkvvLassQ`; Addition/House Build `22PLwk8fHWxW`; Door/Window Installation `22PSSgVruC4g` |

### 5. Roofing templates (19 lines): left for Shawn, unchanged

Roofing is priced from Shawn's templates, so these are listed for him, not
proposed here.

| Item, price | Line says | Price is per | Lines | Templates (line ids) |
|---|---|---|---|---|
| OSB 7/16, 1/2, 5/8, 3/4 x 4 x 8 (`22PCCDkB5ueQ`, `22PCCDk8r7hu`, `22PCCDkAMmyZ`, `22PCCDk9dB6c`), $13.33 to $27.10 | Each | Sheet | 4 | *Roofing - DB Duration Shingle Roofing › Wood Repairs `22PQe3zgngQx` `22PQe3zgngQy` `22PQe3zgngQz` `22PQe3zgngR2` |
| Wood Repair Labor `22PCCDk6XDeG`, $20 / $36.36, Labor | Square | Sheet | 2 | X-Division 07 › Roofing `22PL9HJLLwBh`; *Roofing - DB Duration Shingle Roofing `22PQQzg4pRMh` (both "Allowance for Wood Repair"; a square is about three sheets) |
| SS 26 Gauge Steel Panel `22PHfUX8CuYt`, $213 / $308.85 | Linear Feet | Square | 1 | *Roofing - Standing Seam `22PTSS9tGhrK`, named "SS 26 Gauge Steel Coil" with formula `ceil({Roof Facets Area}*{Waste Factor}*.75)`: it may point at the wrong item |
| Ultimate Fasteners-2 1/2" `22PHfMuEfx6G`, $70 / $101.50 | Bag | Box | 1 | *Roofing - Standing Seam `22PTSS9tH6kT` |
| Chimney Removal `22PCCDiBmaju`, $55 / $100 | Each | Hours | 1 | *Roofing - Standing Seam `22PTSS9tGhqq` |
| Logistical Management `22PHGSH5wSWR`, $65 / $94.25 | Each | Hours | 1 | *Roofing - Standing Seam `22PTSS9tGhrF` |
| Drip Edge - Color `22PdWbd4MrkQ`, $10.20 | no unit | Piece | 1 | *Roofing - DB Duration Shingle Roofing `22PdWbgyzhym` |
| Aluminum Trim Coil - Color `22PdWbexnWH4`, $2.79 | no unit | Linear Feet | 1 | *Roofing - DB Duration Shingle Roofing `22PdWbhip8KC` |
| Platinum Metals 40 Warranty `22PHfSBPyCTr`, DB 10 YR Wrkmnshp Warranty `22PHfRuTnaxF`, no price | Square | no unit | 3 | *Roofing - Exposed Fastener `22PHfSDSvNgJ`; *Roofing - Standing Seam `22PTSS9tH6kY` `22PTSS9tH6kZ` |
| Permit `22PEjZMRaX6W`, $0 | no unit | Lump Sum | 4 | *Roofing - Exposed Fastener `22PHefqheW5y`; X-Division 07 › Roofing `22PL9HJLLZGM`; Addition/House Build › Roofing `22PLwk8fHA3b`; *Roofing - DB Duration Shingle Roofing `22PQQzg4pRLb` |

Job budgets are not touched by any of this: a job keeps its own copy of
every line it was built with. Budgets built after today get the corrected
units.

How the sweep was run, so it can be run again: for each unit id `U`, template
lines with `unit.id = U` and `organizationCostItem.unit.id != U` (the `!=`
also returns items with no unit), plus `unit.id = null` with
`organizationCostItem.unit.id != null`; template lines are cost items with
`job` and `document` null and `costGroup` set. More than five such aliased
queries at 30 a page in one request is refused as too large; five is not.

## Added 2026-10-02: Wainscot Labor

Found on test job 25-0000: the framed-wall choice kept 29 wainscot panels with
no labor to hang them, and the run before had put the panels in Trim Labor.
Carl: wainscot needs its own labor line, not counted twice in Trim Labor. The
catalog had Wainscoting (material) and no labor item for it. Added at Carl's
request through the JobTread API (`createCostItem`), then read back.

| | |
|---|---|
| Catalog item | `Wainscot Labor` — id `22PfZZt5r3C2`, ungrouped |
| Unit · cost type · cost code | Hours · Labor · Interior Trim/Casing/Paneling (06WP-2), as Trim Labor |
| Unit cost · unit price | $55.00 · $100.00 · not taxable |
| Description | Labor to install wainscot panels. Wainscot only: the trim (cap, baseboard, chair rail) is Trim Labor. |

One template line in each template that carries Wainscoting, placed right
after it in Interior Trims & Finishes and pricing from the item:

| Template | Group | Wainscoting | New line `Wainscot Labor` |
|---|---|---|---|
| X-Division 06 Wood & Plastics (Framing/Decks) | `22PL8UPjRNaj` | `22PL8aDkhk9R` (p) | `22PfZZtxdNVE` (pn) |
| Bathroom Remodel › Phase 4 - Finishes | `22PR7qasE9ti` | `22PLm7f9eikv` (n) | `22PfZZtxdjPX` (nn) |
| Addition/House Build › Phase 4 - Finishes | `22PLwk8fHWyc` | `22PLwk8fHWym` (p) | `22PfZZtxfbsy` (pn) |
