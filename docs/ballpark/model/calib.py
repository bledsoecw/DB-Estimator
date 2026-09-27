'''Calibrate the template against DB's bathroom estimates. Run analyze.py first.'''
import json, re, statistics as st, model
from analyze import OUT
docs={d['job']:d for d in json.load(open(OUT))}
D=dict(model.PARAMS and {k:d for k,_,d,_ in model.PARAMS})
def I(**kw):
    P={k:0 for k in D}; P.update({'Dumpster Loads':1}); P.update(kw); return P
# Intake reconstructed from each estimate's own lines (room sizes estimated where the estimate has no SF line)
INTAKE={
 '261049': I(**{'Bath Floor Area':80,'Full Gut':1,'Walk-In Shower':1,'Fixtures Replaced':3,'Vanity Length':6,'Vanity Sinks':1,'Toilets':1,'New Flooring Area':80,'Exhaust Fan':1,'Light Fixtures':1,'Circuits Added':1,'Interior Doors':1,'Pocket Doors':1,'HVAC Work':1}),
 '260014': I(**{'Bath Floor Area':70,'Full Gut':1,'Walk-In Shower':1,'Fixtures Replaced':3,'Vanity Length':3,'Vanity Sinks':1,'New Flooring Area':120,'Exhaust Fan':1,'Recessed Lights':3,'Circuits Added':2,'Grab Bars':2}),
 '25-8341': I(**{'Bath Floor Area':50,'Full Gut':0,'Walk-In Shower':1,'Fixtures Replaced':2}),
 '260036': I(**{'Bath Floor Area':60,'Full Gut':1,'Walk-In Shower':1,'Fixtures Replaced':3,'Vanity Length':3,'Vanity Sinks':1,'Toilets':1,'New Flooring Area':72,'Exhaust Fan':1,'Light Fixtures':4,'Circuits Added':1}),
 '261076': I(**{'Bath Floor Area':60,'Full Gut':0,'Walk-In Shower':1,'Fixtures Replaced':1}),
 '261209': I(**{'Bath Floor Area':45,'Full Gut':1,'Walk-In Shower':1,'Fixtures Replaced':3,'Vanity Length':2,'Vanity Sinks':1,'Toilets':1,'New Flooring Area':40,'Exhaust Fan':1,'Interior Doors':1}),
 '261277': I(**{'Bath Floor Area':100,'Full Gut':1,'Walk-In Shower':1,'Fixtures Replaced':4,'Fixtures Relocated':2,'Vanity Length':6,'Vanity Sinks':2,'New Flooring Area':100,'Exhaust Fan':1,'Light Fixtures':2,'Circuits Added':2,'Walls Moved':1,'HVAC Work':1}),
 '260105': I(**{'Bath Floor Area':50,'Full Gut':1,'Walk-In Shower':1,'Fixtures Replaced':3,'Vanity Length':3,'Vanity Sinks':1,'Toilets':1,'New Flooring Area':40,'Exhaust Fan':1,'Light Fixtures':2,'Circuits Added':1,'Subfloor Repair Area':35,'HVAC Work':1}),
 '260192': I(**{'Bath Floor Area':70,'Full Gut':1,'Walk-In Shower':0,'Fixtures Replaced':2,'Toilets':1,'New Flooring Area':70,'Circuits Added':1,'Walls Moved':1,'Subfloor Repair Area':66}),
 '260681': I(**{'Bath Floor Area':50,'Full Gut':1,'Tub Shower Combo':1,'Walk-In Shower':0,'Fixtures Replaced':1,'New Flooring Area':50,'Exhaust Fan':1,'Light Fixtures':2,'HVAC Work':1}),
 '260877': I(**{'Bath Floor Area':90,'Full Gut':1,'Walk-In Shower':1,'Fixtures Replaced':3,'Fixtures Relocated':1,'Vanity Length':6,'Vanity Sinks':1,'New Flooring Area':66,'Exhaust Fan':1,'Light Fixtures':1,'Circuits Added':1,'Interior Doors':3,'HVAC Work':1}),
 '260955': I(**{'Bath Floor Area':120,'Full Gut':1,'Walk-In Shower':1,'Fixtures Replaced':4,'Fixtures Relocated':0,'Vanity Length':7,'Vanity Sinks':2,'New Flooring Area':80,'Exhaust Fan':2,'Light Fixtures':2,'Circuits Added':2,'Walls Moved':1,'HVAC Work':1}),
 '261165': I(**{'Bath Floor Area':60,'Full Gut':1,'Walk-In Shower':1,'Fixtures Replaced':3,'Fixtures Relocated':1,'Vanity Length':4,'Vanity Sinks':1,'New Flooring Area':465,'Light Fixtures':1,'Circuits Added':1,'HVAC Work':1,'Dumpster Loads':2}),
 '261280': I(**{'Bath Floor Area':150,'Full Gut':1,'Walk-In Shower':1,'Fixtures Replaced':4,'Fixtures Relocated':1,'Vanity Length':8,'Vanity Sinks':2,'New Flooring Area':150,'Light Fixtures':6,'Interior Doors':1,'Travel Hours':30}),
 '261335': I(**{'Bath Floor Area':50,'Full Gut':0,'Walk-In Shower':1,'Fixtures Replaced':1}),
 '261346': I(**{'Bath Floor Area':50,'Full Gut':0,'Walk-In Shower':1,'Fixtures Replaced':1,'Recessed Lights':4,'Exhaust Fan':1,'Circuits Added':1,'Grab Bars':2}),
 '261396': I(**{'Bath Floor Area':60,'Full Gut':1,'Walk-In Shower':1,'Fixtures Replaced':3,'Vanity Length':3,'Vanity Sinks':1,'Exhaust Fan':1,'Light Fixtures':2,'Circuits Added':1,'Pocket Doors':1}),
}
# Tier each estimate actually used, read from its own lines (shower labor 12h = Good kit, 24h = Better panel, 0h = subbed Best; flooring sub = Best)
SH='Shower/Tub Labor'; FL='Flooring Labor'
TIER_OF={'25-8341':{SH:'Good'},'261209':{SH:'Good'},'260105':{SH:'Good'},'261165':{SH:'Good'},'261335':{SH:'Good'},'260681':{SH:'Good',FL:'Best'},
 '260877':{SH:'Best'},'260955':{SH:'Best',FL:'Best'},'261280':{SH:'Best',FL:'Best'},'261346':{SH:'Best'}}
SEL=r'^(Walk-In Shower( SUB)?|Bathtub Shower Combo|Tile Surround|Onyx or Tile Shower Base|Tile Sub|Tile|Stone Mortar Mix|Shower Door( SUB)?|Shower/Tub Door|Glass Panels and Door|Glass|Shower Kit|Shower/Kit|Shower Valve|Shower Valave|Valve Trim|Shower Head|Shower Arm|Shower Arm Flange|Handheld Shower|Faucet/Kit - Shower|Shower Seat|Shower Shelf|Vanity|Vanity/Cabinetry|Vanity Cabinetry|Vanity SUB|Cabinetry|Countertop|Countertop Sub|Countertop SUB|Sink|Sink Faucet|Faucet/Kit|Faucet/Kit - Vanity|Vanity Mirror|Mirror|Vanity Medicine Cabinet|Toilet|Bowl|Tank|Seat|Flooring|LVT Flooring|Flooring - Sub|Flooring Sub|Tile Sub - Flooring|Bathroom Fan|Lighting|Lighting - Can Lights|Can Lights|Bath Accessories|Grab Bar)$'
def structure_actual(d):
    """Actual price less design fees and less the finish selections (the customer's choices)."""
    design=sum(p for n,t,p,q in d['items'] if n.startswith('Designer'))
    sel=sum(p for n,t,p,q in d['items'] if re.match(SEL,n))
    return d['price']-design, d['price']-design-sel

def structure_model(j,P):
    tsel=dict(TIER_OF.get(j,{})); tsel.setdefault('*','Better')
    # grab bars sit in the selections on DB's estimates, so leave them out of structure
    return sum(r[5] for r in model.price(P,tsel,True) if r[0]!='Selections' or r[2]=='L')-P['Grab Bars']*120*1.45

def report():
    print(f"{'job':8} {'status':8} {'actual':>8} | {'struct act':>10} {'struct mdl':>10} {'err':>6} | {'Good':>7} {'Better':>7} {'Best':>7}")
    errs=[]; inside=0
    for j,P in INTAKE.items():
        d=docs[j]; a,sa=structure_actual(d); sm=structure_model(j,P)
        t={x:model.price(P,x) for x in model.T}
        e=(sm-sa)/sa; errs.append(e)
        ok=t['Good']*0.85<=a<=t['Best']*1.15; inside+=ok
        print(f"{j:8} {d['status']:8} {a:>8,.0f} | {sa:>10,.0f} {sm:>10,.0f} {e:>+6.0%} | {t['Good']:>7,.0f} {t['Better']:>7,.0f} {t['Best']:>7,.0f}  {'in range' if ok else 'OUT'}")
    ae=[abs(x) for x in errs]
    print(f"\nstructural error: median |e| {st.median(ae):.1%}, within 15%: {sum(x<=.15 for x in ae)}/{len(ae)}, bias {st.mean(errs):+.1%}")
    print(f"actual inside [Good-15%, Best+15%]: {inside}/{len(errs)}")

if __name__=='__main__':
    report()
