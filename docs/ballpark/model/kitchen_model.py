"""Kitchen ballpark template: every line is (phase, group, name, cost type, unit, formula, unit cost).

Rates come from DB's own estimates (JobTread, read 2026-09-27):
  full kitchens 261384 and 261062, and the kitchen lines inside 261268, 258551 and 258811.
DB prices cabinets per linear foot of base-cabinet run (the countertop run), uppers included,
and countertops at about 2 SF per foot of run. Both conventions are kept here.
Formulas use only what DB's live JobTread formulas use: + - * / ( ) round() ceil() {Params}.
"""
import engine
from engine import LAB, MARK, T

PARAMS = [  # name, type, default, help
 ('Kitchen Floor Area', 'number', 180, 'Floor area of the kitchen in SF, wall to wall, including any eat-in area being remodeled'),
 ('Kitchen Full Gut', 'number', 1, '1 = walls opened and all cabinets out; 0 = cabinets and counters swapped with walls left intact'),
 ('Kitchen Cabinet Run', 'number', 24, 'Linear feet of base cabinets, including the island and the width of any pantry or oven towers. Uppers are priced in.'),
 ('Kitchen Island Length', 'number', 0, 'Linear feet of island (already counted in the cabinet run)'),
 ('Kitchen Backsplash', 'number', 1, '1 = new backsplash along the wall run; 0 = none'),
 ('Kitchen Appliances Supplied', 'number', 0, 'Appliances DB buys for the customer'),
 ('Kitchen Appliances Installed', 'number', 4, 'All appliances DB sets, including ones the customer buys'),
 ('Kitchen Fixtures Replaced', 'number', 2, 'Plumbing fixtures in the same spot: sink, dishwasher, fridge water line, pot filler'),
 ('Kitchen Fixtures Relocated', 'number', 0, 'Fixtures whose drain, supply or gas line moves (an island sink counts)'),
 ('Kitchen New Flooring Area', 'number', 0, 'SF of new flooring, including any beyond the kitchen'),
 ('Kitchen Light Fixtures', 'number', 1, 'Pendants or ceiling fixtures replaced'),
 ('Kitchen Recessed Lights', 'number', 4, 'New recessed cans'),
 ('Kitchen Circuits Added', 'number', 2, 'New appliance circuits, GFCI runs, island outlets'),
 ('Kitchen Under-Cabinet Lighting', 'number', 0, '1 = add under-cabinet lighting'),
 ('Kitchen Walls Moved', 'number', 0, 'Walls framed, removed or relocated'),
 ('Kitchen Subfloor Repair Area', 'number', 0, 'SF of subfloor or sheathing repair observed'),
 ('Kitchen Interior Doors', 'number', 0, 'Interior doors replaced'),
 ('Kitchen Exterior Doors', 'number', 0, 'Exterior doors replaced'),
 ('Kitchen HVAC Work', 'number', 0, '1 = register or duct moved'),
 ('Kitchen Dumpster Loads', 'number', 1, 'Haul-away loads (1 for most kitchens; 2-3 when walls come out)'),
 ('Kitchen Travel Hours', 'number', 0, 'Crew travel hours for jobs past the standard service zone'),
]

A, G, R = '{Kitchen Floor Area}', '{Kitchen Full Gut}', '{Kitchen Cabinet Run}'
P1, P2, P3, P4 = ('Phase 1 - General Requirements', 'Phase 2 - Rough-In',
                  'Phase 3 - Interior', 'Phase 4 - Finishes')

COMMON = [
 (P1, 'Permits', 'Permit', 'O', 'Lump Sum', '1', 190),
 (P1, 'Project/Site Management', 'Project Management (C)', 'L', 'Hours', f'4 + 4*{G}', LAB),
 (P1, 'Site Preparation', 'Site Prep Material', 'M', 'Each', '1', 150),
 (P1, 'Site Preparation', 'Site Prep Labor', 'L', 'Hours', '2', LAB),
 (P1, 'Demolition', 'Demolition', 'L', 'Hours', f'8 + {G}*ceil({A}/15) + 6*{{Kitchen Walls Moved}}', LAB),
 (P1, 'Site Clean Up', 'Hauling & Disposal', 'L', 'Each', '{Kitchen Dumpster Loads}', 250),
 (P1, 'Site Clean Up', 'Final Clean', 'L', 'Hours', f'2 + 2*{G}', LAB),
 (P1, 'Travel', 'Travel', 'L', 'Hours', '{Kitchen Travel Hours}', LAB),
 (P2, 'Framing Materials', 'Framing/Sheathing Materials', 'M', 'Lump Sum',
  f'{G} + 3*{{Kitchen Walls Moved}} + ceil({{Kitchen Subfloor Repair Area}}/32)', 150),
 (P2, 'Framing Materials', 'Framing/Sheathing Labor', 'L', 'Hours',
  f'4*{G} + 8*{{Kitchen Walls Moved}} + ceil({{Kitchen Subfloor Repair Area}}/8)', LAB),
 (P2, 'Plumbing - Rough-In', 'Plumbing Materials', 'M', 'Lump Sum',
  '1 + {Kitchen Fixtures Replaced} + 5*{Kitchen Fixtures Relocated}', 100),
 (P2, 'Plumbing - Rough-In', 'Plumbing Labor', 'L', 'Hours',
  '3 + round(2.5*{Kitchen Fixtures Replaced}) + 4*{Kitchen Fixtures Relocated}', LAB),
 (P2, 'Plumbing - Rough-In', 'HVAC Materials', 'M', 'Lump Sum', '{Kitchen HVAC Work}', 100),
 (P2, 'Plumbing - Rough-In', 'HVAC Labor', 'L', 'Hours', '2*{Kitchen HVAC Work}', LAB),
 (P2, 'Electrical - Rough-In', 'Electrical Materials', 'M', 'Square Foot', A, 2.61),
 (P2, 'Electrical - Rough-In', 'Electrical Labor', 'L', 'Hours',
  '4 + {Kitchen Light Fixtures} + {Kitchen Recessed Lights} + 3*{Kitchen Circuits Added} + 3*{Kitchen Under-Cabinet Lighting}', LAB),
 (P3, 'Drywall', 'Drywall Materials', 'M', 'Lump Sum', f'1 + {G}*ceil({A}/10)', 23),
 (P3, 'Drywall', 'Drywall Labor', 'L', 'Hours', f'6 + {G}*ceil({A}/15)', LAB),
 (P3, 'Paint', 'Paint Materials', 'M', 'Lump Sum', f'1 + {G}', 115),
 (P3, 'Paint', 'Paint Labor', 'L', 'Hours', f'3 + ceil({A}/20)', LAB),
 (P3, 'Flooring', 'Flooring - Misc. Material', 'M', 'Square Foot', '{Kitchen New Flooring Area}', 0.75),
 (P4, 'Cabinetry', 'Cabinet Knob/Pull', 'M', 'Each', f'ceil(2.5*{R})', 10),
 (P4, 'Appliances', 'Appliance Labor', 'L', 'Hours', '2*{Kitchen Appliances Installed}', LAB),
 (P4, 'Interior Doors', 'Interior Door', 'M', 'Each', '{Kitchen Interior Doors}', 400),
 (P4, 'Exterior Doors', 'Exterior Door & Lockset', 'M', 'Each', '{Kitchen Exterior Doors}', 1230),
 (P4, 'Interior Doors', 'Door Labor', 'L', 'Hours', '3*{Kitchen Interior Doors} + 8*{Kitchen Exterior Doors}', LAB),
 (P4, 'Interior Trims & Finishes', 'Trim Materials', 'M', 'Lump Sum', f'1 + {G}*ceil({A}/10)', 20),
 (P4, 'Interior Trims & Finishes', 'Trim Labor', 'L', 'Hours',
  f'2 + {G}*ceil({A}/12) + {{Kitchen Interior Doors}} + 2*{{Kitchen Exterior Doors}}', LAB),
]

# Countertop SF: 2 SF per foot of run, plus 1.5 SF per foot of island for the deeper top.
CT = f'2*{R} + ceil(1.5*{{Kitchen Island Length}})'
# Backsplash SF: 1.5 ft high along the wall run (run less island).
BS = f'{{Kitchen Backsplash}}*ceil(1.5*({R} - {{Kitchen Island Length}}))'

TIERS = [  # name, unit, formula (or per-tier formulas), {tier: (unit_cost, cost_type)}, allowance?
 ('Cabinets', 'Linear Feet', R,
  {'Good': (400, 'M'), 'Better': (600, 'M'), 'Best': (900, 'M')}, True),
 ('Cabinetry Labor', 'Hours',
  {'Good': f'4 + ceil(1.1*{R})',
   'Better': f'4 + ceil(1.3*{R})',
   'Best': f'4 + ceil(1.5*{R})'},
  {'Good': (LAB, 'L'), 'Better': (LAB, 'L'), 'Best': (LAB, 'L')}, False),
 ('Countertops', 'Square Foot', CT,
  {'Good': (23, 'M'), 'Better': (80, 'S'), 'Best': (123, 'S')}, True),
 ('Backsplash', 'Square Foot', BS,
  {'Good': (20, 'S'), 'Better': (35, 'S'), 'Best': (120, 'S')}, True),
 ('Sink, Faucet & Disposal', 'Each', '1',
  {'Good': (300, 'M'), 'Better': (600, 'M'), 'Best': (1000, 'M')}, True),
 ('Appliance Allowance', 'Each', '{Kitchen Appliances Supplied}',
  {'Good': (700, 'M'), 'Better': (1400, 'M'), 'Best': (2300, 'M')}, True),
 ('Flooring Material', 'Square Foot', '{Kitchen New Flooring Area}',
  {'Good': (4.00, 'M'), 'Better': (5.00, 'M'), 'Best': (15.00, 'S')}, True),
 ('Flooring Labor', 'Hours',
  {'Good': 'ceil({Kitchen New Flooring Area}/20) + ceil({Kitchen New Flooring Area}/10000)',
   'Better': 'ceil({Kitchen New Flooring Area}/20) + ceil({Kitchen New Flooring Area}/10000)'},
  {'Good': (LAB, 'L'), 'Better': (LAB, 'L'), 'Best': (0, 'L')}, False),
 ('Light Fixture', 'Each', '{Kitchen Light Fixtures}',
  {'Good': (80, 'M'), 'Better': (180, 'M'), 'Best': (350, 'M')}, True),
 ('Recessed Light', 'Each', '{Kitchen Recessed Lights}',
  {'Good': (25, 'M'), 'Better': (35, 'M'), 'Best': (60, 'M')}, True),
 ('Under-Cabinet Lighting', 'Lump Sum', '{Kitchen Under-Cabinet Lighting}',
  {'Good': (300, 'M'), 'Better': (500, 'M'), 'Best': (770, 'M')}, True),
]


def price(P, tier, detail=False):
    return engine.price(__import__(__name__), P, tier, detail)
