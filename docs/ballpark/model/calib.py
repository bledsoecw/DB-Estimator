'''Calibrate the template against DB's bathroom estimates. Run analyze.py first.'''
import json, re, statistics as st, model
from analyze import OUT
docs={d['job']:d for d in json.load(open(OUT))}
D=dict(model.PARAMS and {k:d for k,_,d,_ in model.PARAMS})
def I(**kw):
    P={k:0 for k in D}; P.update({'Bath Dumpster Loads':1})
    bad=set(kw)-set(D)
    if bad: raise KeyError(f'not bathroom parameters: {sorted(bad)}')
    P.update(kw); return P
# Intake reconstructed from each estimate's own lines (room sizes estimated where the estimate has no SF line)
INTAKE={
 '261049': I(**{'Bath Floor Area':80,'Bath Full Gut':1,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':3,'Bath Vanity Length':6,'Bath Vanity Sinks':1,'Bath Toilets':1,'Bath New Flooring Area':80,'Bath Exhaust Fan':1,'Bath Light Fixtures':1,'Bath Circuits Added':1,'Bath Interior Doors':1,'Bath Pocket Doors':1,'Bath HVAC Work':1}),
 '260014': I(**{'Bath Floor Area':70,'Bath Full Gut':1,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':3,'Bath Vanity Length':3,'Bath Vanity Sinks':1,'Bath New Flooring Area':120,'Bath Exhaust Fan':1,'Bath Recessed Lights':3,'Bath Circuits Added':2,'Bath Grab Bars':2}),
 '25-8341': I(**{'Bath Floor Area':50,'Bath Full Gut':0,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':2}),
 '260036': I(**{'Bath Floor Area':60,'Bath Full Gut':1,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':3,'Bath Vanity Length':3,'Bath Vanity Sinks':1,'Bath Toilets':1,'Bath New Flooring Area':72,'Bath Exhaust Fan':1,'Bath Light Fixtures':4,'Bath Circuits Added':1}),
 '261076': I(**{'Bath Floor Area':60,'Bath Full Gut':0,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':1}),
 '261209': I(**{'Bath Floor Area':45,'Bath Full Gut':1,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':3,'Bath Vanity Length':2,'Bath Vanity Sinks':1,'Bath Toilets':1,'Bath New Flooring Area':40,'Bath Exhaust Fan':1,'Bath Interior Doors':1}),
 '261277': I(**{'Bath Floor Area':100,'Bath Full Gut':1,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':4,'Bath Fixtures Relocated':2,'Bath Vanity Length':6,'Bath Vanity Sinks':2,'Bath New Flooring Area':100,'Bath Exhaust Fan':1,'Bath Light Fixtures':2,'Bath Circuits Added':2,'Bath Walls Moved':1,'Bath HVAC Work':1}),
 '260105': I(**{'Bath Floor Area':50,'Bath Full Gut':1,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':3,'Bath Vanity Length':3,'Bath Vanity Sinks':1,'Bath Toilets':1,'Bath New Flooring Area':40,'Bath Exhaust Fan':1,'Bath Light Fixtures':2,'Bath Circuits Added':1,'Bath Subfloor Repair Area':35,'Bath HVAC Work':1}),
 '260192': I(**{'Bath Floor Area':70,'Bath Full Gut':1,'Bath Walk-In Shower':0,'Bath Fixtures Replaced':2,'Bath Toilets':1,'Bath New Flooring Area':70,'Bath Circuits Added':1,'Bath Walls Moved':1,'Bath Subfloor Repair Area':66}),
 '260681': I(**{'Bath Floor Area':50,'Bath Full Gut':1,'Bath Tub Shower Combo':1,'Bath Walk-In Shower':0,'Bath Fixtures Replaced':1,'Bath New Flooring Area':50,'Bath Exhaust Fan':1,'Bath Light Fixtures':2,'Bath HVAC Work':1}),
 '260877': I(**{'Bath Floor Area':90,'Bath Full Gut':1,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':3,'Bath Fixtures Relocated':1,'Bath Vanity Length':6,'Bath Vanity Sinks':1,'Bath New Flooring Area':66,'Bath Exhaust Fan':1,'Bath Light Fixtures':1,'Bath Circuits Added':1,'Bath Interior Doors':3,'Bath HVAC Work':1}),
 '260955': I(**{'Bath Floor Area':120,'Bath Full Gut':1,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':4,'Bath Fixtures Relocated':0,'Bath Vanity Length':7,'Bath Vanity Sinks':2,'Bath New Flooring Area':80,'Bath Exhaust Fan':2,'Bath Light Fixtures':2,'Bath Circuits Added':2,'Bath Walls Moved':1,'Bath HVAC Work':1}),
 '261165': I(**{'Bath Floor Area':60,'Bath Full Gut':1,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':3,'Bath Fixtures Relocated':1,'Bath Vanity Length':4,'Bath Vanity Sinks':1,'Bath New Flooring Area':465,'Bath Light Fixtures':1,'Bath Circuits Added':1,'Bath HVAC Work':1,'Bath Dumpster Loads':2}),
 '261280': I(**{'Bath Floor Area':150,'Bath Full Gut':1,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':4,'Bath Fixtures Relocated':1,'Bath Vanity Length':8,'Bath Vanity Sinks':2,'Bath New Flooring Area':150,'Bath Light Fixtures':6,'Bath Interior Doors':1,'Bath Travel Hours':30}),
 '261335': I(**{'Bath Floor Area':50,'Bath Full Gut':0,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':1}),
 '261346': I(**{'Bath Floor Area':50,'Bath Full Gut':0,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':1,'Bath Recessed Lights':4,'Bath Exhaust Fan':1,'Bath Circuits Added':1,'Bath Grab Bars':2}),
 '261396': I(**{'Bath Floor Area':60,'Bath Full Gut':1,'Bath Walk-In Shower':1,'Bath Fixtures Replaced':3,'Bath Vanity Length':3,'Bath Vanity Sinks':1,'Bath Exhaust Fan':1,'Bath Light Fixtures':2,'Bath Circuits Added':1,'Bath Pocket Doors':1}),
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
    return sum(r[5] for r in model.price(P,tsel,True) if r[0]!='Selections' or r[2]=='L')-P['Bath Grab Bars']*120*1.45

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
