"""Bathroom ballpark template: every line is (group, name, type, unit, formula, unit_cost).
Formulas use only what DB's live JobTread formulas use: + - * / ( ) round() ceil() and {Parameters}."""
import engine
from engine import LAB, MARK, T
PARAMS=[ # name, type, default, help
 ('Bath Floor Area','number',50,'Floor area of the bathroom in SF, wall to wall'),
 ('Bath Full Gut','number',1,'1 = whole room to studs; 0 = shower/tub area only'),
 ('Bath Walk-In Shower','number',1,'1 = new walk-in shower system (includes tub-to-shower); else 0'),
 ('Bath Tub Shower Combo','number',0,'1 = new tub with shower surround; else 0'),
 ('Bath Fixtures Replaced','number',3,'Count of plumbing fixtures replaced in the same spot (shower valve, each sink, toilet)'),
 ('Bath Fixtures Relocated','number',0,'Count of fixtures moving to a new location (drain or supply moves)'),
 ('Bath Vanity Length','number',3,'Vanity width in feet (0 if keeping the vanity)'),
 ('Bath Vanity Sinks','number',1,'Number of sinks in the new vanity'),
 ('Bath Toilets','number',1,'New toilets (0 if resetting the existing one)'),
 ('Bath New Flooring Area','number',50,'SF of new flooring, including any beyond the bathroom'),
 ('Bath Exhaust Fan','number',1,'1 = new or replaced fan with venting'),
 ('Bath Light Fixtures','number',1,'Vanity lights or ceiling fixtures being replaced'),
 ('Bath Recessed Lights','number',0,'New recessed can lights'),
 ('Bath Circuits Added','number',0,'New circuits, GFCI runs or outlets needing new wire'),
 ('Bath Walls Moved','number',0,'Walls framed, removed or moved (count)'),
 ('Bath Subfloor Repair Area','number',0,'SF of subfloor or joist repair observed'),
 ('Bath Interior Doors','number',0,'Swing doors replaced'),
 ('Bath Pocket Doors','number',0,'Pocket doors added'),
 ('Bath Grab Bars','number',0,'Grab bars'),
 ('Bath HVAC Work','number',0,'1 = register move or duct extension'),
 ('Bath Dumpster Loads','number',1,'Haul-away loads (1 for most baths)'),
 ('Bath Travel Hours','number',0,'Crew travel hours for jobs past the standard service zone'),
 ('Bath Contingency Rate','number',5,'Contingency as a % of the tier total, set by the estimator: 5 when everything stays in place, 8 when a fixture or wall moves'),
]
# Common scope: in every tier
COMMON=[
 # Phase 1 - General Requirements
 ('Phase 1 - General Requirements','Permits','Permit','O','Lump Sum','1',100),
 ('Phase 1 - General Requirements','Project/Site Management','Project Management (C)','L','Hours','4 + 2*{Bath Full Gut}',LAB),
 ('Phase 1 - General Requirements','Site Preparation','Site Prep Material','M','Each','1',150),
 ('Phase 1 - General Requirements','Site Preparation','Site Prep Labor','L','Hours','2',LAB),
 ('Phase 1 - General Requirements','Demolition','Demolition','L','Hours','6 + 10*{Bath Full Gut}',LAB),
 ('Phase 1 - General Requirements','Site Clean Up','Hauling & Disposal','L','Each','{Bath Dumpster Loads}',250),
 ('Phase 1 - General Requirements','Site Clean Up','Final Clean','L','Hours','2 + {Bath Full Gut}',LAB),
 ('Phase 1 - General Requirements','Travel','Travel','L','Hours','{Bath Travel Hours}',LAB),
 # Phase 2 - Rough-In
 ('Phase 2 - Rough-In','Framing Materials','Framing/Sheathing Materials','M','Lump Sum','{Bath Walk-In Shower} + 2*{Bath Walls Moved} + ceil({Bath Subfloor Repair Area}/32)',100),
 ('Phase 2 - Rough-In','Framing Materials','Framing/Sheathing Labor','L','Hours','4*{Bath Walk-In Shower} + 6*{Bath Walls Moved} + ceil({Bath Subfloor Repair Area}/8)',LAB),
 ('Phase 2 - Rough-In','Plumbing - Rough-In','Plumbing Materials','M','Lump Sum','1 + {Bath Fixtures Replaced} + 5*{Bath Fixtures Relocated}',100),
 ('Phase 2 - Rough-In','Plumbing - Rough-In','Plumbing Labor','L','Hours','3 + round(2.5*{Bath Fixtures Replaced}) + 4*{Bath Fixtures Relocated}',LAB),
 ('Phase 2 - Rough-In','Plumbing - Rough-In','HVAC Materials','M','Lump Sum','{Bath HVAC Work}',100),
 ('Phase 2 - Rough-In','Plumbing - Rough-In','HVAC Labor','L','Hours','2*{Bath HVAC Work}',LAB),
 ('Phase 2 - Rough-In','Electrical - Rough-In','Electrical Materials','M','Lump Sum','1 + {Bath Circuits Added} + 0.5*{Bath Recessed Lights}',60),
 ('Phase 2 - Rough-In','Electrical - Rough-In','Electrical Labor','L','Hours','3 + {Bath Light Fixtures} + {Bath Recessed Lights} + 3*{Bath Circuits Added}',LAB),
 ('Phase 2 - Rough-In','Electrical - Rough-In','Bathroom Fan Venting','M','Each','{Bath Exhaust Fan}',50),
 ('Phase 2 - Rough-In','Electrical - Rough-In','Bathroom Fan Venting Labor','L','Hours','3*{Bath Exhaust Fan}',LAB),
 # Phase 3 - Interior
 ('Phase 3 - Interior','Drywall','Drywall Materials','M','Lump Sum','1 + {Bath Full Gut}',80),
 ('Phase 3 - Interior','Drywall','Drywall Labor','L','Hours','6 + 4*{Bath Full Gut}',LAB),
 ('Phase 3 - Interior','Paint','Paint Materials','M','Lump Sum','1 + {Bath Full Gut}',120),
 ('Phase 3 - Interior','Paint','Paint Labor','L','Hours','3 + 4*{Bath Full Gut}',LAB),
 ('Phase 3 - Interior','Flooring','Flooring - Misc. Material','M','Square Foot','{Bath New Flooring Area}',0.75),
 # Phase 4 - Finishes
 ('Phase 4 - Finishes','Cabinetry','Cabinetry Labor','L','Hours','2*ceil({Bath Vanity Length}/100) + {Bath Vanity Length}',LAB),
 ('Phase 4 - Finishes','Cabinetry','Cabinet Knob/Pull','M','Each','ceil(1.5*{Bath Vanity Length})',10),
 ('Phase 4 - Finishes','Toilet','Toilet Set Materials (wax, bolts, supply)','M','Each','{Bath Full Gut}',20),
 ('Phase 4 - Finishes','Interior Doors','Interior Door','M','Each','{Bath Interior Doors}',400),
 ('Phase 4 - Finishes','Interior Doors','Pocket Door Frame, Door & Handle','M','Each','{Bath Pocket Doors}',500),
 ('Phase 4 - Finishes','Interior Doors','Door Labor','L','Hours','3*{Bath Interior Doors} + 8*{Bath Pocket Doors}',LAB),
 ('Phase 4 - Finishes','Interior Trims & Finishes','Trim Materials','M','Lump Sum','1 + {Bath Interior Doors} + {Bath Pocket Doors} + {Bath Full Gut}*ceil({Bath Floor Area}/30)',40),
 ('Phase 4 - Finishes','Interior Trims & Finishes','Trim Labor','L','Hours','1 + 3*{Bath Full Gut} + {Bath Interior Doors} + {Bath Pocket Doors}',LAB),
 ('Phase 4 - Finishes','Accessories','Grab Bar','M','Each','{Bath Grab Bars}',120),
 ('Phase 4 - Finishes','Accessories','Bath Accessory Labor','L','Hours','2 + {Bath Grab Bars}',LAB),
]
# Tiered selections: one option group per tier; customer picks one (JobTread simple selection)
TIERS=[ # name, unit, formula, {tier: (unit_cost, cost_type)}, allowance?
 ('Walk-In Shower System','Each','{Bath Walk-In Shower}',{'Good':(1390,'M'),'Better':(3380,'M'),'Best':(8800,'S')},True),
 ('Shower Glass / Door','Each','{Bath Walk-In Shower}',{'Good':(480,'M'),'Better':(1860,'M'),'Best':(3080,'S')},True),
 ('Tub & Surround','Each','{Bath Tub Shower Combo}',{'Good':(1140,'M'),'Better':(1725,'M'),'Best':(2760,'M')},True),
 ('Tub Door','Each','{Bath Tub Shower Combo}',{'Good':(345,'M'),'Better':(760,'M'),'Best':(1100,'M')},True),
 ('Shower Valve & Trim Kit','Each','{Bath Walk-In Shower} + {Bath Tub Shower Combo}',{'Good':(345,'M'),'Better':(620,'M'),'Best':(1000,'M')},True),
 ('Shower/Tub Labor','Hours',{'Good':'12*{Bath Walk-In Shower} + 10*{Bath Tub Shower Combo}','Better':'24*{Bath Walk-In Shower} + 10*{Bath Tub Shower Combo}','Best':'10*{Bath Tub Shower Combo}'},{'Good':(LAB,'L'),'Better':(LAB,'L'),'Best':(LAB,'L')},False),
 ('Vanity Cabinet','Linear Feet','{Bath Vanity Length}',{'Good':(200,'M'),'Better':(450,'M'),'Best':(950,'M')},True),
 ('Vanity Top','Linear Feet','{Bath Vanity Length}',{'Good':(100,'M'),'Better':(200,'M'),'Best':(450,'M')},True),
 ('Sink & Faucet','Each','{Bath Vanity Sinks}',{'Good':(210,'M'),'Better':(380,'M'),'Best':(690,'M')},True),
 ('Mirror / Medicine Cabinet','Each','{Bath Vanity Sinks}',{'Good':(150,'M'),'Better':(280,'M'),'Best':(600,'M')},True),
 ('Toilet','Each','{Bath Toilets}',{'Good':(240,'M'),'Better':(345,'M'),'Best':(620,'M')},True),
 ('Flooring Material','Square Foot','{Bath New Flooring Area}',{'Good':(4.00,'M'),'Better':(5.00,'M'),'Best':(15.00,'S')},True),
 ('Flooring Labor','Hours',{'Good':'ceil({Bath New Flooring Area}/20) + ceil({Bath New Flooring Area}/10000)','Better':'ceil({Bath New Flooring Area}/20) + ceil({Bath New Flooring Area}/10000)'},{'Good':(LAB,'L'),'Better':(LAB,'L'),'Best':(0,'L')},False),
 ('Bathroom Fan','Each','{Bath Exhaust Fan}',{'Good':(150,'M'),'Better':(230,'M'),'Best':(420,'M')},True),
 ('Light Fixture','Each','{Bath Light Fixtures}',{'Good':(60,'M'),'Better':(140,'M'),'Best':(300,'M')},True),
 ('Recessed Light','Each','{Bath Recessed Lights}',{'Good':(25,'M'),'Better':(35,'M'),'Best':(60,'M')},True),
 ('Bath Accessories','Lump Sum','1',{'Good':(100,'M'),'Better':(300,'M'),'Best':(620,'M')},True),
]
CONT = 'Bath Contingency Rate'   # the contingency line's rate parameter


def price(P, tier, detail=False, contingency=False):
    return engine.price(__import__(__name__), P, tier, detail, contingency)
