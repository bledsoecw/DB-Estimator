"""Bathroom ballpark template: every line is (group, name, type, unit, formula, unit_cost).
Formulas use only what DB's live JobTread formulas use: + - * / ( ) round() ceil() and {Parameters}."""
import math, re
MARK={'L':100/55,'M':1.45,'S':1.30,'O':1.45}   # DB catalog: labor $55->$100, materials x1.45, subs x1.30
LAB=55.0
PARAMS=[ # name, type, default, help
 ('Bath Floor Area','number',50,'Floor area of the bathroom in SF, wall to wall'),
 ('Full Gut','number',1,'1 = whole room to studs; 0 = shower/tub area only'),
 ('Walk-In Shower','number',1,'1 = new walk-in shower system (includes tub-to-shower); else 0'),
 ('Tub Shower Combo','number',0,'1 = new tub with shower surround; else 0'),
 ('Fixtures Replaced','number',3,'Count of plumbing fixtures replaced in the same spot (shower valve, each sink, toilet)'),
 ('Fixtures Relocated','number',0,'Count of fixtures moving to a new location (drain or supply moves)'),
 ('Vanity Length','number',3,'Vanity width in feet (0 if keeping the vanity)'),
 ('Vanity Sinks','number',1,'Number of sinks in the new vanity'),
 ('Toilets','number',1,'New toilets (0 if resetting the existing one)'),
 ('New Flooring Area','number',50,'SF of new flooring, including any beyond the bathroom'),
 ('Exhaust Fan','number',1,'1 = new or replaced fan with venting'),
 ('Light Fixtures','number',1,'Vanity lights or ceiling fixtures being replaced'),
 ('Recessed Lights','number',0,'New recessed can lights'),
 ('Circuits Added','number',0,'New circuits, GFCI runs or outlets needing new wire'),
 ('Walls Moved','number',0,'Walls framed, removed or moved (count)'),
 ('Subfloor Repair Area','number',0,'SF of subfloor or joist repair observed'),
 ('Interior Doors','number',0,'Swing doors replaced'),
 ('Pocket Doors','number',0,'Pocket doors added'),
 ('Grab Bars','number',0,'Grab bars'),
 ('HVAC Work','number',0,'1 = register move or duct extension'),
 ('Dumpster Loads','number',1,'Haul-away loads (1 for most baths)'),
 ('Travel Hours','number',0,'Crew travel hours for jobs past the standard service zone'),
]
# Common scope: in every tier
COMMON=[
 # Phase 1 - General Requirements
 ('Phase 1 - General Requirements','Permits','Permit','O','Lump Sum','1',100),
 ('Phase 1 - General Requirements','Project/Site Management','Project Management (C)','L','Hours','4 + 2*{Full Gut}',LAB),
 ('Phase 1 - General Requirements','Site Preparation','Site Prep Material','M','Each','1',150),
 ('Phase 1 - General Requirements','Site Preparation','Site Prep Labor','L','Hours','2',LAB),
 ('Phase 1 - General Requirements','Demolition','Demolition','L','Hours','6 + 10*{Full Gut}',LAB),
 ('Phase 1 - General Requirements','Site Clean Up','Hauling & Disposal','L','Each','{Dumpster Loads}',250),
 ('Phase 1 - General Requirements','Site Clean Up','Final Clean','L','Hours','2 + {Full Gut}',LAB),
 ('Phase 1 - General Requirements','Travel','Travel','L','Hours','{Travel Hours}',LAB),
 # Phase 2 - Rough-In
 ('Phase 2 - Rough-In','Framing Materials','Framing/Sheathing Materials','M','Lump Sum','{Walk-In Shower} + 2*{Walls Moved} + ceil({Subfloor Repair Area}/32)',100),
 ('Phase 2 - Rough-In','Framing Materials','Framing/Sheathing Labor','L','Hours','4*{Walk-In Shower} + 6*{Walls Moved} + ceil({Subfloor Repair Area}/8)',LAB),
 ('Phase 2 - Rough-In','Plumbing - Rough-In','Plumbing Materials','M','Lump Sum','1 + {Fixtures Replaced} + 5*{Fixtures Relocated}',100),
 ('Phase 2 - Rough-In','Plumbing - Rough-In','Plumbing Labor','L','Hours','3 + round(2.5*{Fixtures Replaced}) + 4*{Fixtures Relocated}',LAB),
 ('Phase 2 - Rough-In','Plumbing - Rough-In','HVAC Materials','M','Lump Sum','{HVAC Work}',100),
 ('Phase 2 - Rough-In','Plumbing - Rough-In','HVAC Labor','L','Hours','2*{HVAC Work}',LAB),
 ('Phase 2 - Rough-In','Electrical - Rough-In','Electrical Materials','M','Lump Sum','1 + {Circuits Added} + 0.5*{Recessed Lights}',60),
 ('Phase 2 - Rough-In','Electrical - Rough-In','Electrical Labor','L','Hours','3 + {Light Fixtures} + {Recessed Lights} + 3*{Circuits Added}',LAB),
 ('Phase 2 - Rough-In','Electrical - Rough-In','Bathroom Fan Venting','M','Each','{Exhaust Fan}',50),
 ('Phase 2 - Rough-In','Electrical - Rough-In','Bathroom Fan Venting Labor','L','Hours','3*{Exhaust Fan}',LAB),
 # Phase 3 - Interior
 ('Phase 3 - Interior','Drywall','Drywall Materials','M','Lump Sum','1 + {Full Gut}',80),
 ('Phase 3 - Interior','Drywall','Drywall Labor','L','Hours','6 + 4*{Full Gut}',LAB),
 ('Phase 3 - Interior','Paint','Paint Materials','M','Lump Sum','1 + {Full Gut}',120),
 ('Phase 3 - Interior','Paint','Paint Labor','L','Hours','3 + 4*{Full Gut}',LAB),
 ('Phase 3 - Interior','Flooring','Flooring - Misc. Material','M','Square Foot','{New Flooring Area}',0.75),
 # Phase 4 - Finishes
 ('Phase 4 - Finishes','Cabinetry','Cabinetry Labor','L','Hours','2*ceil({Vanity Length}/100) + {Vanity Length}',LAB),
 ('Phase 4 - Finishes','Cabinetry','Cabinet Knob/Pull','M','Each','ceil(1.5*{Vanity Length})',10),
 ('Phase 4 - Finishes','Toilet','Toilet Set Materials (wax, bolts, supply)','M','Each','{Full Gut}',20),
 ('Phase 4 - Finishes','Interior Doors','Interior Door','M','Each','{Interior Doors}',400),
 ('Phase 4 - Finishes','Interior Doors','Pocket Door Frame, Door & Handle','M','Each','{Pocket Doors}',500),
 ('Phase 4 - Finishes','Interior Doors','Door Labor','L','Hours','3*{Interior Doors} + 8*{Pocket Doors}',LAB),
 ('Phase 4 - Finishes','Interior Trims & Finishes','Trim Materials','M','Lump Sum','1 + {Interior Doors} + {Pocket Doors} + {Full Gut}*ceil({Bath Floor Area}/30)',40),
 ('Phase 4 - Finishes','Interior Trims & Finishes','Trim Labor','L','Hours','1 + 3*{Full Gut} + {Interior Doors} + {Pocket Doors}',LAB),
 ('Phase 4 - Finishes','Accessories','Grab Bar','M','Each','{Grab Bars}',120),
 ('Phase 4 - Finishes','Accessories','Bath Accessory Labor','L','Hours','2 + {Grab Bars}',LAB),
]
# Tiered selections: one option group per tier; customer picks one (JobTread simple selection)
T=('Good','Better','Best')
TIERS=[ # name, unit, formula, {tier: (unit_cost, cost_type)}, allowance?
 ('Walk-In Shower System','Each','{Walk-In Shower}',{'Good':(1390,'M'),'Better':(3380,'M'),'Best':(8800,'S')},True),
 ('Shower Glass / Door','Each','{Walk-In Shower}',{'Good':(480,'M'),'Better':(1860,'M'),'Best':(3080,'S')},True),
 ('Tub & Surround','Each','{Tub Shower Combo}',{'Good':(1140,'M'),'Better':(1725,'M'),'Best':(2760,'M')},True),
 ('Tub Door','Each','{Tub Shower Combo}',{'Good':(345,'M'),'Better':(760,'M'),'Best':(1100,'M')},True),
 ('Shower Valve & Trim Kit','Each','{Walk-In Shower} + {Tub Shower Combo}',{'Good':(345,'M'),'Better':(620,'M'),'Best':(1000,'M')},True),
 ('Shower/Tub Labor','Hours',{'Good':'12*{Walk-In Shower} + 10*{Tub Shower Combo}','Better':'24*{Walk-In Shower} + 10*{Tub Shower Combo}','Best':'10*{Tub Shower Combo}'},{'Good':(LAB,'L'),'Better':(LAB,'L'),'Best':(LAB,'L')},False),
 ('Vanity Cabinet','Linear Feet','{Vanity Length}',{'Good':(200,'M'),'Better':(450,'M'),'Best':(950,'M')},True),
 ('Vanity Top','Linear Feet','{Vanity Length}',{'Good':(100,'M'),'Better':(200,'M'),'Best':(450,'M')},True),
 ('Sink & Faucet','Each','{Vanity Sinks}',{'Good':(210,'M'),'Better':(380,'M'),'Best':(690,'M')},True),
 ('Mirror / Medicine Cabinet','Each','{Vanity Sinks}',{'Good':(150,'M'),'Better':(280,'M'),'Best':(600,'M')},True),
 ('Toilet','Each','{Toilets}',{'Good':(240,'M'),'Better':(345,'M'),'Best':(620,'M')},True),
 ('Flooring Material','Square Foot','{New Flooring Area}',{'Good':(4.00,'M'),'Better':(5.00,'M'),'Best':(15.00,'S')},True),
 ('Flooring Labor','Hours',{'Good':'ceil({New Flooring Area}/20) + ceil({New Flooring Area}/10000)','Better':'ceil({New Flooring Area}/20) + ceil({New Flooring Area}/10000)'},{'Good':(LAB,'L'),'Better':(LAB,'L'),'Best':(0,'L')},False),
 ('Bathroom Fan','Each','{Exhaust Fan}',{'Good':(150,'M'),'Better':(230,'M'),'Best':(420,'M')},True),
 ('Light Fixture','Each','{Light Fixtures}',{'Good':(60,'M'),'Better':(140,'M'),'Best':(300,'M')},True),
 ('Recessed Light','Each','{Recessed Lights}',{'Good':(25,'M'),'Better':(35,'M'),'Best':(60,'M')},True),
 ('Bath Accessories','Lump Sum','1',{'Good':(100,'M'),'Better':(300,'M'),'Best':(620,'M')},True),
]
def ev(expr,P):
    e=re.sub(r'\{([^}]+)\}', lambda m: repr(float(P[m.group(1)])), expr)
    return eval(e,{'ceil':math.ceil,'round':lambda x: math.floor(x+0.5)})
def price(P, tier, detail=False):
    rows=[]
    for g,sg,n,t,u,f,c in COMMON:
        q=ev(f,P); up=450 if n=='Hauling & Disposal' else c*MARK[t]; rows.append((g,n,t,q,c,q*up))
    for n,u,f,cs,al in TIERS:
        tt=tier if isinstance(tier,str) else tier.get(n,tier['*'])
        ff=f if isinstance(f,str) else f.get(tt,'0')
        q=ev(ff,P); c,t=cs[tt]; rows.append(('Selections',n,t,q,c,q*c*MARK[t]))
    return rows if detail else sum(r[5] for r in rows)
