"""Build the bathroom ballpark workbook: python3 build_bathroom.py, then recalculate."""
import model
from calib import INTAKE, TIER_OF, docs, structure_actual, structure_model
import workbook
from workbook import font, BOX, BOLD, H1, GREY, USD, HEAD, header
from openpyxl.styles import Alignment
from openpyxl.utils import get_column_letter as L

CODES={'Permit':'General Requirements','Project Management (C)':'Project Management','Site Prep Material':'Site Construction','Site Prep Labor':'Site Prep/Clean Up',
 'Demolition':'Demolition','Hauling & Disposal':'Hauling & Disposal (Direct)','Final Clean':'Site Prep/Clean Up','Travel':'Project Management',
 'Framing/Sheathing Materials':'Woods & Plastics','Framing/Sheathing Labor':'Framing/Sheeting','Plumbing Materials':'Mechanical (Plumbing & HVAC)','Plumbing Labor':'Mechanical (Plumbing & HVAC)',
 'HVAC Materials':'Mechanical (Plumbing & HVAC)','HVAC Labor':'Mechanical (Plumbing & HVAC)','Electrical Materials':'Electrical','Electrical Labor':'Electrical','Bathroom Fan Venting':'Electrical','Bathroom Fan Venting Labor':'Electrical',
 'Drywall Materials':'Finishes','Drywall Labor':'Drywall','Paint Materials':'Finishes','Paint Labor':'Painting','Flooring - Misc. Material':'Finishes',
 'Cabinetry Labor':'Cabinetry','Cabinet Knob/Pull':'Cabinetry','Toilet Set Materials (wax, bolts, supply)':'Mechanical (Plumbing & HVAC)','Interior Door':'Doors','Pocket Door Frame, Door & Handle':'Doors','Door Labor':'Doors',
 'Trim Materials':'Woods & Plastics','Trim Labor':'Interior Trim/Casing/Paneling','Grab Bar':'Specialites','Bath Accessory Labor':'Shower/Tub',
 'Walk-In Shower System':'Specialites','Shower Glass / Door':'Specialites','Tub & Surround':'Specialites','Tub Door':'Specialites','Shower Valve & Trim Kit':'Mechanical (Plumbing & HVAC)',
 'Shower/Tub Labor':'Shower/Tub','Tub Labor (Best)':'Shower/Tub','Vanity Cabinet':'Cabinetry','Vanity Top':'Cabinetry','Sink & Faucet':'Mechanical (Plumbing & HVAC)','Mirror / Medicine Cabinet':'Cabinetry',
 'Toilet':'Mechanical (Plumbing & HVAC)','Flooring Material':'Finishes','Flooring Labor':'Flooring','Bathroom Fan':'Electrical','Light Fixture':'Electrical','Recessed Light':'Electrical','Bath Accessories':'Specialites'}

NOTES={'Permit':'City permits in the 17 estimates ran $29–$435. Adjust per city.','Hauling & Disposal':'Uses DB\'s existing catalog item: $250 cost / $450 price per load.',
 'Travel':'Only for jobs past the standard service zone. One estimate carried 30 h.',
 'Walk-In Shower System':'Good = acrylic/fiberglass kit (DB installs, 12 h). Better = Onyx/Al-Co panel system (DB installs, 24 h). Best = subbed tile or large panel system, installed price.',
 'Shower Glass / Door':'Good = framed bypass. Better = semi-frameless. Best = frameless panels, installed.','Shower/Tub Labor':'One item per tier. Walk-in: Good 12 h, Better 24 h, Best subbed (0 DB hours). Tub combo 10 h at every tier.',
 'Flooring Material':'Good/Better = LVP installed by DB crew. Best = tile floor set by the tile sub, installed price per SF.','Flooring Labor':'Good and Better only. Best has no DB flooring labor because the tile sub installs.',
 'Vanity Cabinet':'Per linear foot of vanity. Good = stock, Better = semi-custom, Best = custom.','Vanity Top':'Per linear foot. Good = cultured marble, Better = quartz, Best = premium quartz/granite.',
 'Cabinetry Labor':'2 h setup plus 1 h per foot of vanity; zero when no vanity.','Plumbing Materials':'Relocations add $500 cost each (drain/supply moves).',
 'Drywall Labor':'Does not scale with room size in DB\'s estimates. Full gut adds 4 h.','Paint Labor':'Full gut adds 4 h.'}

README=[
 ('Bathroom Ballpark Template — DRAFT for review','h1'),
 ('Deitemeyer Brothers · General Construction · drafted 27 Sep 2026 · decisions applied 28 Sep 2026','g'),
 ('',None),
 ('What this is','b'),
 ('The build sheet for a formula-driven bathroom ballpark in JobTread, plus a working calculator so the numbers can be checked before anything is built.',None),
 ('It prices one bathroom at three finish levels (Good / Better / Best) from 22 site-visit measurements, using DB\'s own catalog rates and markup.',None),
 ('',None),
 ('How to use it','b'),
 ('1. Calculator tab: type the site-visit numbers into the yellow cells. The three totals and ±15% ranges update.',None),
 ('2. Template tab: every JobTread line, its cost group, cost code, unit, the exact quantity formula to paste into JobTread, and unit cost and price per tier.',None),
 ('3. Parameters tab: the 22 site-visit parameters plus the contingency rate, which the estimator sets. Names must match exactly, including spaces and capitals.',None),
 ('4. Rates tab: the markup by cost type. Change a rate there and every price follows.',None),
 ('5. Calibration tab: how the template compares with 17 bathroom estimates DB sent between Jan and Sep 2026.',None),
 ('',None),
 ('Legend','b'),
 ('Yellow fill, blue text: an input you can change.',None),
 ('Black text: a formula. Do not overwrite.',None),
 ('Grey text: notes and sources.',None),
 ('',None),
 ('How accurate it is (in-sample, 17 estimates)','b'),
 ('Structure (labor, rough-in, demo, drywall, general requirements): median error 10%, 13 of 17 within 15%, bias +2%.',None),
 ('Full price: all 17 actual prices fall inside the Good-to-Best band. The tier closest to the real price is within 15% on 15 of 17.',None),
 ('Guessing one tier for everyone ("Better") is within 15% on only 5 of 17. Always show all three tiers.',None),
 ('These rates were set from the same 17 estimates, so this is an in-sample check. The real test is the next 10 bathroom jobs: accept for live use when 8 of 10 land within ±15%.',None),
 ('',None),
 ('Decided 28 Sep 2026','b'),
 ('Contingency is its own line on each tier: 5% when everything stays in place, 8% when a fixture or wall moves. The estimator sets the Bath Contingency Rate. The calibration compares prices before contingency, because DB\'s past estimates carried none.',None),
 ('Allowances are stated as customer prices (JobTread allowance type: price). No total changes; an overage or a credit is simply the difference in price.',None),
 ('Products per tier: the estimator and the designer name one product per Good / Better / Best cell and lock the grid for six months (draft in the proposal, §9).',None),
 ('Still open: the permit amount. Drafted at $100 cost; DB\'s estimates ranged $29–$435 by city.',None),
 ('',None),
 ('Source for every rate: line items of 17 bathroom estimates read from DB\'s JobTread account (read-only) on 27 Sep 2026. See Calibration tab.','g'),
]


INPUTS = [p for p in model.PARAMS if p[0] != model.CONT]   # site-visit inputs; the estimator sets the contingency rate


def calibration(wb, ctx):
    cb=wb.create_sheet('Calibration')
    cb['A1']='Calibration against 17 bathroom estimates DB sent, Jan–Sep 2026'; cb['A1'].font=H1
    cb['A2']='Actual = the estimate total from JobTread, less any design-fee lines. Intake values were reconstructed from each estimate\'s own lines; room sizes are estimates where the estimate had no SF line. Model columns are values from the repo\'s Python model, which mirrors the Template tab.'; cb['A2'].font=GREY
    cb['A3']='Structure = everything except the finish selections (labor, rough-in, demo, drywall, general requirements). It tests the formulas; the selections are the customer\'s choice.'; cb['A3'].font=GREY
    hdr=['Job','Status','Actual total','Model Good','Model Better','Model Best','Inside Good−15% to Best+15%?','Structure actual','Structure model','Structure error','Absolute error','Shower tier used']+[n for n,_,_,_ in INPUTS]
    for j,h in enumerate(hdr,1):
        c=cb.cell(5,j,h); c.font=BOLD; c.fill=HEAD; c.border=BOX; c.alignment=Alignment(wrap_text=True,vertical='center')
    for i,(j,P) in enumerate(INTAKE.items(),6):
        d=docs[j]; design=sum(p for n,t,p,q in d['items'] if n.startswith('Designer')); a=d['price']-design
        _,struct_a=structure_actual(d); sel=a-struct_a
        sm=structure_model(j,P)
        tiers=[model.price(P,t) for t in model.T]
        vals=[j,d['status'],round(a,2)]+[round(x,2) for x in tiers]
        for k,v in enumerate(vals,1): cb.cell(i,k,v)
        cb.cell(i,7,f'=IF(AND(C{i}>=D{i}*(1-RangePct),C{i}<=F{i}*(1+RangePct)),"Yes","No")')
        cb.cell(i,8,round(a-sel,2)); cb.cell(i,9,round(sm,2)); cb.cell(i,10,f'=(I{i}-H{i})/H{i}')
        cb.cell(i,11,f'=ABS(J{i})')
        cb.cell(i,12,TIER_OF.get(j,{}).get('Shower/Tub Labor','Better'))
        for k,(n,_,_,_) in enumerate(INPUTS,13): cb.cell(i,k,P[n])
        for k in range(1,13+len(INPUTS)):
            c=cb.cell(i,k); c.border=BOX; c.font=font()
            if k in (3,4,5,6,8,9): c.number_format=USD
            if k==10: c.number_format='+0%;-0%;0%'
            if k==11: c.number_format='0%'
    lr=5+len(INTAKE)
    s=lr+2
    summ=[('Median absolute structure error',f'=MEDIAN(K6:K{lr})','0.0%'),
          ('Estimates with structure within ±15%',f'=SUMPRODUCT(--(ABS(J6:J{lr})<=0.15))&" of "&COUNT(J6:J{lr})',None),
          ('Average structure bias',f'=AVERAGE(J6:J{lr})','+0.0%;-0.0%'),
          ('Actual inside the Good-to-Best band',f'=COUNTIF(G6:G{lr},"Yes")&" of "&COUNTA(G6:G{lr})',None)]
    for k,(lab,f,fmt) in enumerate(summ):
        cb.cell(s+k,1,lab).font=BOLD; c=cb.cell(s+k,3,f); c.font=BOLD
        if fmt: c.number_format=fmt
    cb.cell(s+5,1,'Excluded: 258657 (two bathrooms priced as cost-group totals), 258797 (bathroom plus three exterior doors), 260097 (door job tagged as bathroom), 258668 (bedroom remodel tagged as bathroom).').font=GREY
    cb.column_dimensions['A'].width=10; cb.column_dimensions['B'].width=9
    for k in range(3,13): cb.column_dimensions[L(k)].width=12
    for k in range(13,13+len(INPUTS)): cb.column_dimensions[L(k)].width=9
    cb.freeze_panes='C6'


if __name__ == '__main__':
    print(workbook.build(dict(module=model, room='Bathroom', prefix='Bath ', codes=CODES, notes=NOTES, readme=README,
        example={'Bath Floor Area': 60, 'Bath New Flooring Area': 60, 'Bath Circuits Added': 1},
        example_desc='a typical 60 SF gutted bathroom',
        range_note='The range shown to the customer around each tier total. The proposal commits to ±15%.',
        calibration=calibration, filename='bathroom-ballpark-template.xlsx')))
