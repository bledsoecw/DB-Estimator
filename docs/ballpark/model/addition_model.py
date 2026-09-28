"""Addition ballpark template: every line is (phase, group, name, cost type, unit, formula, unit cost).

Covers room additions, sunrooms and detached garages, one or two storeys. A bathroom or kitchen
inside the addition is priced by that room's own template; this one prices only the plumbing
rough-in needed to reach it.

Rates are DB catalog items where one exists (foundations, insulation, drywall, siding labor,
roofing labor, doors, utilities, trim) and otherwise come from DB's addition estimates read
from JobTread on 2026-09-27 (see addition_calib.py). Cost type 'U' is labor the catalog prices
per unit (square, foot, each), marked up x1.45 like the catalog does.
Formulas use only what DB's live JobTread formulas use: + - * / ( ) round() ceil() {Params}.
"""
import engine
from engine import LAB, T

PARAMS = [  # name, type, default, help
 ('Addition Width', 'number', 20, 'Feet along the house wall (for a detached building, the front wall)'),
 ('Addition Depth', 'number', 16, 'Feet out from the house'),
 ('Addition Stories', 'number', 1, 'Finished floors on the new footprint: 1 or 2'),
 ('Addition Wall Height', 'number', 8, 'Wall height in feet per storey (8 for most rooms; 9–10 for garages)'),
 ('Addition Detached', 'number', 0, '1 = stand-alone building such as a garage (four new walls, no tie-in); 0 = attached'),
 ('Addition Crawl Space', 'number', 0, '1 = new crawl-space foundation. Set exactly one foundation to 1.'),
 ('Addition Slab', 'number', 0, '1 = footed slab with a 6-inch stem wall (garages, slab rooms)'),
 ('Addition Basement', 'number', 0, '1 = full basement under the addition'),
 ('Addition Piers', 'number', 0, 'Posts or piers, for a porch-type addition on piers (count). 0 for any other foundation.'),
 ('Addition Site Excavation', 'number', 0, "1 = DB digs, grades or trenches (tight access, slope, drainage). 0 = the concrete sub's price covers it."),
 ('Addition Roof Tie-In', 'number', 1, '0 = none (detached); 1 = simple shed or gable against the house; 2 = cross-gable or valley'),
 ('Addition Electrical', 'number', 1, '1 = wired: outlets, lights, switches. 0 = shell only.'),
 ('Addition Drywall', 'number', 1, '1 = insulated, drywalled and painted (rooms, finished garages). 0 = shell or three-season porch.'),
 ('Addition Living Space', 'number', 1, '1 = finished living space: flooring, trim and more coordination. 0 = garage, porch or shell.'),
 ('Addition Windows', 'number', 3, 'New windows in the addition'),
 ('Addition Exterior Doors', 'number', 0, 'New entry or service doors'),
 ('Addition Patio Doors', 'number', 0, 'New sliding or hinged patio doors'),
 ('Addition Garage Doors', 'number', 0, 'Overhead garage doors'),
 ('Addition Interior Doors', 'number', 0, 'Interior doors, including closet and bathroom doors'),
 ('Addition Wall Openings', 'number', 1, 'Openings cut into the existing house wall (a doorway or wider, with a header)'),
 ('Addition Plumbing Fixtures', 'number', 0, 'Fixtures that need new drain and supply run into the addition. Their finish is priced by the bath or kitchen template.'),
 ('Addition HVAC Extend', 'number', 0, '1 = extend the existing ductwork into the addition'),
 ('Addition HVAC New Unit', 'number', 0, '1 = new mini-split or dedicated system for the addition'),
 ('Addition Extra Siding Squares', 'number', 0, "Squares of the house's own siding to replace so it matches (100 SF = 1 square)"),
 ('Addition Structure Removed', 'number', 0, 'SF of existing porch, deck, sunroom or room torn down first'),
 ('Addition Utility Trench', 'number', 0, 'Feet of trench to feed power to a detached building'),
 ('Addition Dumpster Loads', 'number', 1, 'Haul-away loads (1 for most additions; 2–3 with a tear-down)'),
 ('Addition Service Zone', 'number', 1, 'Service Zone from the job in JobTread: 1 (within ~15 mi), 2 (~15-30 mi), 3 (~30-50 mi). Zone 1 adds no travel. Extended (over 50 mi) is quoted by hand: enter 4 as a floor and flag it.'),
 ('Addition Contingency Rate', 'number', 10, 'Contingency as a % of the tier total, set by the estimator: 10 for additions and structural work'),
 ('Addition Permit Fee', 'number', 200, 'Permit fee DB pays the city or township, in dollars (cost), from the permit table on the Rates tab. The estimator sets it from the job address.'),
]

W, D, S, H, X = ('{Addition Width}', '{Addition Depth}', '{Addition Stories}',
                 '{Addition Wall Height}', '{Addition Detached}')
FP = f'{W}*{D}'                               # footprint SF
A = f'{W}*{D}*{S}'                            # floor area SF
PW = f'({W} + 2*{D} + {X}*{W})'               # new exterior wall, LF (three walls attached, four detached)
LIV, DRY, ELEC = '{Addition Living Space}', '{Addition Drywall}', '{Addition Electrical}'
WIN, EXT, PAT = '{Addition Windows}', '{Addition Exterior Doors}', '{Addition Patio Doors}'
OPEN, TIE = '{Addition Wall Openings}', '{Addition Roof Tie-In}'
SQ = f'ceil({PW}*{H}*{S}*1.15/100) + {{Addition Extra Siding Squares}}'   # siding squares, gables and waste in the 1.15
RS = f'ceil({FP}*1.25/100) + 2*{TIE}'                                     # roof squares: pitch and overhang, plus tie-in rework
GUT = f'{W} + {D} + 20'                                                   # gutter and downspout LF

P1, P2, P3, P4 = ('Phase 1 - General Requirements', 'Phase 2 - Foundation & Framing',
                  'Phase 3 - Exterior & Rough-In', 'Phase 4 - Interior')

COMMON = [
 (P1, 'Permits', 'Permit', 'O', 'Lump Sum', '{Addition Permit Fee}', 1),
 (P1, 'Project/Site Management', 'Project Management (C)', 'L', 'Hours', f'6 + {LIV}*ceil({A}/30)', LAB),
 (P1, 'Site Preparation', 'Site Prep Material', 'M', 'Each', '1', 150),
 (P1, 'Site Preparation', 'Site Prep Labor', 'L', 'Hours', f'4 + ceil({A}/200)', LAB),
 (P1, 'Site Preparation', 'Rentals & Delivery', 'O', 'Each', f'1 + ceil({A}/400) + 3*{LIV}', 300),
 (P1, 'Demolition', 'Demolition', 'L', 'Hours',
  f'4*(1 - {X}) + ceil({{Addition Structure Removed}}/3) + 8*{OPEN}', LAB),
 (P1, 'Site Clean Up', 'Hauling & Disposal', 'L', 'Each', '{Addition Dumpster Loads}', 250),
 (P1, 'Site Clean Up', 'Final Clean', 'L', 'Hours', f'2 + 2*{LIV}', LAB),
 (P1, 'Travel', 'Travel', 'L', 'Hours', None, LAB),   # formula filled in from the labor lines below
 (P1, 'Utilities', 'Utility - Electric', 'O', 'Linear Feet', '{Addition Utility Trench}', 12),
 (P2, 'Site Work', 'Excavation & Grading', 'L', 'Hours', '16*{Addition Site Excavation}', LAB),
 (P2, 'Site Work', 'Rental - Mini Excavator', 'O', 'Day', '2*{Addition Site Excavation}', 195),
 (P2, 'Foundation', 'Concrete Foundation - Crawl', 'M', 'Square Foot', f'{{Addition Crawl Space}}*{FP}', 18.07),
 (P2, 'Foundation', 'Concrete Foundation - 6" Stem', 'M', 'Square Foot', f'{{Addition Slab}}*{FP}', 21),
 (P2, 'Foundation', 'Concrete Foundation - Basement', 'M', 'Square Foot', f'{{Addition Basement}}*{FP}', 33),
 (P2, 'Foundation', 'Concrete Piers', 'M', 'Each', '{Addition Piers}', 500),
 (P2, 'Foundation', 'Pier Labor', 'L', 'Hours', '3*{Addition Piers}', LAB),
 (P2, 'Framing', 'Framing/Sheathing Materials', 'M', 'Square Foot', A, 22.50),
 (P2, 'Framing', 'Header & Opening Material', 'M', 'Each', OPEN, 400),
 (P2, 'Framing', 'Framing/Sheathing Labor', 'L', 'Hours', f'ceil({A}/6) + 8*{OPEN} + 8*{TIE}', LAB),
 (P3, 'Roofing', 'Gutters & Downspouts', 'M', 'Linear Feet', GUT, 8.25),
 (P3, 'Roofing', 'Gutter Labor', 'U', 'Linear Feet', GUT, 3.50),
 (P3, 'Siding', 'Soffit & Fascia Material', 'M', 'Linear Feet', PW, 8.00),
 (P3, 'Siding', 'Fascia and Soffit Install', 'S', 'Linear Feet', PW, 4.50),
 (P3, 'Siding', 'House Wrap Labor', 'L', 'Hours', SQ, LAB),
 (P3, 'Siding', 'Siding Labor', 'U', 'Square', SQ, 160),
 (P3, 'Siding', 'Siding Labor for Flashing', 'U', 'Each', f'2*(1 - {X})', 150),
 (P3, 'Windows & Doors', 'Window Labor', 'L', 'Hours', f'ceil(2.5*{WIN})', LAB),
 (P3, 'Windows & Doors', 'Exterior Door & Lockset', 'M', 'Each', EXT, 1230),
 (P3, 'Windows & Doors', 'Garage Door', 'S', 'Each', '{Addition Garage Doors}', 1300),
 (P3, 'Windows & Doors', 'Garage Door Wrapping', 'U', 'Each', '{Addition Garage Doors}', 105),
 (P3, 'Windows & Doors', 'Door Labor', 'L', 'Hours', f'8*{EXT} + 8*{PAT} + 3*{{Addition Interior Doors}}', LAB),
 (P3, 'Plumbing & HVAC', 'Plumbing Materials', 'M', 'Each', '{Addition Plumbing Fixtures}', 250),
 (P3, 'Plumbing & HVAC', 'Plumbing Labor', 'L', 'Hours', '9*{Addition Plumbing Fixtures}', LAB),
 (P3, 'Plumbing & HVAC', 'HVAC Extension (sub)', 'S', 'Lump Sum', '{Addition HVAC Extend}', 1310),
 (P3, 'Plumbing & HVAC', 'HVAC New Unit (sub)', 'S', 'Lump Sum', '{Addition HVAC New Unit}', 7500),
 (P3, 'Electrical', 'Electrical Materials', 'M', 'Square Foot', f'{ELEC}*{A}', 2.61),
 (P3, 'Electrical', 'Electrical Labor', 'L', 'Hours', f'{ELEC}*(8 + ceil({A}/16))', LAB),
 (P4, 'Insulation', 'Insulation - Sub', 'S', 'Square Foot', f'{DRY}*{A}', 8.52),
 (P4, 'Drywall', 'Drywall Board - Mat', 'M', 'Square Foot', f'{DRY}*{A}', 1.02),
 (P4, 'Drywall', 'Drywall Mud - Mat', 'M', 'Square Foot', f'{DRY}*{A}', 1.31),
 (P4, 'Drywall', 'Drywall Labor', 'L', 'Hours', f'{DRY}*ceil({A}/12)', LAB),
 (P4, 'Paint', 'Paint', 'M', 'Gallons', f'{DRY}*ceil({A}/60)', 85),
 (P4, 'Paint', 'Paint Labor', 'L', 'Hours', f'{DRY}*ceil({A}/15)', LAB),
 (P4, 'Interior Doors', 'Interior Door', 'M', 'Each', '{Addition Interior Doors}', 400),
 (P4, 'Flooring', 'Flooring - Misc. Material', 'M', 'Square Foot', f'{LIV}*{A}', 0.75),
 (P4, 'Flooring', 'Flooring Labor', 'L', 'Hours', f'{LIV}*ceil({A}/25)', LAB),
 (P4, 'Interior Trims & Finishes', 'Trim - Baseboard', 'M', 'Each', f'{LIV}*ceil({PW}*{S}/12)', 45.49),
 (P4, 'Interior Trims & Finishes', 'Trim - Casing', 'M', 'Each', f'{LIV}*({WIN} + {EXT} + {PAT})', 37.11),
 (P4, 'Interior Trims & Finishes', 'Trim Labor', 'L', 'Hours',
  f'{LIV}*(4 + ceil({PW}*{S}/8) + {WIN} + {EXT} + {PAT})', LAB),
]

TIERS = [  # name, unit, formula, {tier: (unit_cost, cost_type)}, allowance?
 ('Roofing Material', 'Square', RS,
  {'Good': (210, 'M'), 'Better': (245, 'M'), 'Best': (313, 'M')}, True),
 ('Roofing Install', 'Square', RS,
  {'Good': (95, 'U'), 'Better': (95, 'U'), 'Best': (200, 'U')}, False),
 ('Siding Material', 'Square', SQ,
  {'Good': (230, 'M'), 'Better': (320, 'M'), 'Best': (495, 'M')}, True),
 ('Windows', 'Each', WIN,
  {'Good': (475, 'M'), 'Better': (700, 'M'), 'Best': (1100, 'M')}, True),
 ('Patio Door', 'Each', PAT,
  {'Good': (1750, 'M'), 'Better': (2500, 'M'), 'Best': (3000, 'M')}, True),
 ('Flooring Material', 'Square Foot', f'{LIV}*{A}',
  {'Good': (3.50, 'M'), 'Better': (5.00, 'M'), 'Best': (9.00, 'M')}, True),
]


COMMON = engine.with_travel(COMMON, TIERS, '{Addition Service Zone}')
CONT = 'Addition Contingency Rate'   # the contingency line's rate parameter


def price(P, tier, detail=False, contingency=False):
    return engine.price(__import__(__name__), P, tier, detail, contingency)
