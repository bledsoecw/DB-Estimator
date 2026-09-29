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
| General HVAC MAT `22PHGfWHEStf` | Phase 3 - Interior > HVAC | Labor | $50 -> $90 | $50 -> $90.909091 |
| Crew Labor `22PQQzg4pRMb` | DB Duration Shingle Roofing > Shingle Roof Replacement | Labor | $52.50 -> $94.50 | $55 -> $100 |
| Crew Labor `22PTgLRkCHdN` | Insurance Restoration Agreement > INSURANCE RESTORATION | Labor | $52.50 -> $94.50 | $55 -> $100 |
| Project Management (R) `22PQQzg4pRMc` | Shingle Roof Replacement > Project Management | Labor | $52.50 -> $94.50 | $55 -> $100 |
| Project Management (R) `22PTSS9tGhrE` | Shingle Removal (recommended) > Project Management | Labor | $52.50 -> $95 | $55 -> $100 |
| Project Management (R) `22PTSS9tH6kW` | Standing Seam Install > Project Management | Labor | $52.50 -> $95 | $55 -> $100 |
| Standing Seam Trailer Overhead `22PTSS9tGhrL` | Standing Seam Install > SS 26 Gauge Steel Panel | Labor | $0.30 -> $0.54 | $0.30 -> $0.545455 |
| Service Repair Materials `22PLugN6tnME` | loose (Cost Items tab) | Materials | $50 -> $75 | $50 -> $72.50 |
| Siding - Lighting Labor `22PLkt6AJrqk` | loose (Cost Items tab) | Subcontractor | $105 -> $157.50 | $105 -> $152.25 |
| Siding - Flashing Labor `22PLkssMWuvS` | loose (Cost Items tab) | Subcontractor | $2.50 -> $3.75 | $2.50 -> $3.625 |

General HVAC MAT: the name says material, the cost type says Labor, and it was
priced to what the cost type says. If it is really a material, the cost type
should change to Materials and the price to $72.50.

## Changed by Carl in JobTread

Roof Removal `22PHexRsW9fT` (loose) was Subcontractor at $65 -> $117 (x1.80).
It sat in the same x1.80 cluster as the steep-pitch steel panels, which were
approved as a premium, but it is not a pitch item. Carl changed it to cost
type Labor at the 45% margin: $65 -> $118.18. Read back from JobTread the same
day.
