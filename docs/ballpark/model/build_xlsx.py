import re, json, model
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.comments import Comment
from openpyxl.utils import get_column_letter as L

F='Arial'
def font(**k): k.setdefault('name',F); k.setdefault('size',10); return Font(**k)
BLUE=font(color='0000FF'); BOLD=font(bold=True); H1=font(bold=True,size=14); GREY=font(color='666666',size=9)
YEL=PatternFill('solid',fgColor='FFFF00'); HEAD=PatternFill('solid',fgColor='DCE6F1'); TOT=PatternFill('solid',fgColor='F2F2F2')
thin=Side(style='thin',color='BFBFBF'); BOX=Border(top=thin,bottom=thin,left=thin,right=thin)
WRAP=Alignment(wrap_text=True,vertical='top')
USD='$#,##0;($#,##0);-'; USD2='$#,##0.00;($#,##0.00);-'; NUM='#,##0.##;-#,##0.##;-'

wb=Workbook()
# ---------- Read Me ----------
rm=wb.active; rm.title='Read Me'
lines=[
 ('Bathroom Ballpark Template — DRAFT for review',H1),
 ('Deitemeyer Brothers · General Construction · drafted 27 Sep 2026',GREY),
 ('',None),
 ('What this is',BOLD),
 ('The build sheet for a formula-driven bathroom ballpark in JobTread, plus a working calculator so the numbers can be checked before anything is built.',None),
 ('It prices one bathroom at three finish levels (Good / Better / Best) from 22 site-visit measurements, using DB\'s own catalog rates and markup.',None),
 ('',None),
 ('How to use it',BOLD),
 ('1. Calculator tab: type the site-visit numbers into the yellow cells. The three totals and ±15% ranges update.',None),
 ('2. Template tab: every JobTread line, its cost group, cost code, unit, the exact quantity formula to paste into JobTread, and unit cost and price per tier.',None),
 ('3. Parameters tab: the 22 JobTread job parameters the formulas read. Names must match exactly, including spaces and capitals.',None),
 ('4. Rates tab: the markup by cost type. Change a rate there and every price follows.',None),
 ('5. Calibration tab: how the template compares with 17 bathroom estimates DB sent between Jan and Sep 2026.',None),
 ('',None),
 ('Legend',BOLD),
 ('Yellow fill, blue text: an input you can change.',None),
 ('Black text: a formula. Do not overwrite.',None),
 ('Grey text: notes and sources.',None),
 ('',None),
 ('How accurate it is (in-sample, 17 estimates)',BOLD),
 ('Structure (labor, rough-in, demo, drywall, general requirements): median error 10%, 13 of 17 within 15%, bias +2%.',None),
 ('Full price: all 17 actual prices fall inside the Good-to-Best band. The tier closest to the real price is within 15% on 15 of 17.',None),
 ('Guessing one tier for everyone ("Better") is within 15% on only 5 of 17. Always show all three tiers.',None),
 ('These rates were set from the same 17 estimates, so this is an in-sample check. The real test is the next 10 bathroom jobs: accept for live use when 8 of 10 land within ±15%.',None),
 ('',None),
 ('Decisions still open (for Carl)',BOLD),
 ('Allowance type on the selection lines: cost (marked up ×1.45 like every other material, as drafted), price, or cost plus fee.',None),
 ('Tier allowance amounts: the drafted values are medians of what DB actually priced. Adjust to the products DB wants to sell at each level.',None),
 ('Permit: drafted at $100 cost. DB\'s estimates ranged $29–$435 by city.',None),
 ('',None),
 ('Source for every rate: line items of 17 bathroom estimates read from DB\'s JobTread account (read-only) on 27 Sep 2026. See Calibration tab.',GREY),
]
for i,(t,f) in enumerate(lines,1):
    c=rm.cell(i,1,t); c.font=f or font(); c.alignment=Alignment(wrap_text=True,vertical='top')
rm.column_dimensions['A'].width=120

# ---------- Rates ----------
ra=wb.create_sheet('Rates')
ra['A1']='Markup by cost type'; ra['A1'].font=H1
hdr=['Cost type code','Cost type','Price ÷ cost','Note']
for j,h in enumerate(hdr,1):
    c=ra.cell(3,j,h); c.font=BOLD; c.fill=HEAD; c.border=BOX
rates=[('L','Labor','=100/55','DB catalog labor: $55 cost / $100 price per hour (a 45% margin). Every labor line in the 17 estimates used $100/h or a small discount from it.'),
       ('M','Materials',1.45,'DB catalog materials: ×1.45 with zero variance across the catalog (field notes §9).'),
       ('S','Subcontractor',1.30,'Countertop, tile and flooring subs in the 17 estimates were marked up ×1.30.'),
       ('O','Other',1.45,'Permits and misc. fees: ×1.45.')]
for i,(code,name,v,note) in enumerate(rates,4):
    ra.cell(i,1,code).font=font(); ra.cell(i,2,name).font=font()
    c=ra.cell(i,3,v); c.font=BLUE if not str(v).startswith('=') else font(); c.fill=YEL if not str(v).startswith('=') else PatternFill(); c.number_format='0.000'
    ra.cell(i,4,note).font=GREY
    for j in range(1,5): ra.cell(i,j).border=BOX
ra['A9']='Labor cost per hour'; ra['C9']=55; ra['C9'].font=BLUE; ra['C9'].fill=YEL; ra['C9'].number_format=USD2
ra['A10']='Labor price per hour'; ra['C10']=100; ra['C10'].font=BLUE; ra['C10'].fill=YEL; ra['C10'].number_format=USD2
ra['C4']='=C10/C9'
ra['D9']='Used as the unit cost of every labor line on the Template tab.'; ra['D9'].font=GREY
ra['A12']='Budget range accuracy (±)'; ra['C12']=0.15; ra['C12'].font=BLUE; ra['C12'].fill=YEL; ra['C12'].number_format='0%'
ra['D12']='The range shown to the customer around each tier total. The proposal commits to ±15%.'; ra['D12'].font=GREY
for col,w in zip('ABCD',(26,16,14,100)): ra.column_dimensions[col].width=w
wb.defined_names['MarkupCodes']=DefinedName('MarkupCodes',attr_text="Rates!$A$4:$A$7")
wb.defined_names['MarkupVals']=DefinedName('MarkupVals',attr_text="Rates!$C$4:$C$7")
wb.defined_names['LaborCost']=DefinedName('LaborCost',attr_text="Rates!$C$9")
wb.defined_names['RangePct']=DefinedName('RangePct',attr_text="Rates!$C$12")

# ---------- Calculator ----------
ca=wb.create_sheet('Calculator',1)
ca['A1']='Bathroom Ballpark Calculator'; ca['A1'].font=H1
ca['A2']='Type the site-visit numbers into the yellow cells. Example values below are a typical 60 SF gutted bathroom, not a real customer.'; ca['A2'].font=GREY
for j,h in enumerate(['Site-visit measurement','Value','What to enter','JobTread parameter name'],1):
    c=ca.cell(4,j,h); c.font=BOLD; c.fill=HEAD; c.border=BOX
EX={'Bath Floor Area':60,'New Flooring Area':60,'Circuits Added':1}
NAMES={}
for i,(n,typ,d,help_) in enumerate(model.PARAMS,5):
    nm='p_'+re.sub(r'[^A-Za-z0-9]+','_',n).strip('_'); NAMES[n]=nm
    ca.cell(i,1,n).font=font()
    c=ca.cell(i,2,EX.get(n,d)); c.font=BLUE; c.fill=YEL; c.border=BOX; c.number_format=NUM
    ca.cell(i,3,help_).font=GREY
    ca.cell(i,4,'{'+n+'}').font=font(name='Courier New',size=9)
    wb.defined_names[nm]=DefinedName(nm,attr_text=f"Calculator!$B${i}")
last=4+len(model.PARAMS)
ca.column_dimensions['A'].width=24; ca.column_dimensions['B'].width=10; ca.column_dimensions['C'].width=70; ca.column_dimensions['D'].width=28
# outputs
ca['F4']='Ballpark'; ca['F4'].font=BOLD; ca['F4'].fill=HEAD
for j,t in enumerate(model.T): 
    c=ca.cell(4,7+j,t); c.font=BOLD; c.fill=HEAD; c.alignment=Alignment(horizontal='center')
rowsout=[('Phase 1 - General Requirements','p1'),('Phase 2 - Rough-In','p2'),('Phase 3 - Interior','p3'),('Phase 4 - Finishes','p4'),('Finish selections (tier)','sel')]
ca.column_dimensions['F'].width=30
for k in 'GHI': ca.column_dimensions[k].width=14

# ---------- Template ----------
tp=wb.create_sheet('Template',2)
tp['A1']='JobTread build sheet: cost group "BALLPARK — Bathroom"'; tp['A1'].font=H1
tp['A2']='One row per JobTread line. Paste the quantity formula exactly as written into the catalog item. Rows marked [each tier] become one item in each of the Good, Better and Best option groups, at that tier\'s cost. Rows marked with a single tier go only in that option. All other rows are common scope.'; tp['A2'].font=GREY
cols=['#','JobTread cost group path','Line item','Cost code','Unit','JobTread quantity formula','Qty (live)',
      'Good cost','Good type','Good unit price','Good total',
      'Better cost','Better type','Better unit price','Better total',
      'Best cost','Best type','Best unit price','Best total','Allowance line?','Note']
for j,h in enumerate(cols,1):
    c=tp.cell(4,j,h); c.font=BOLD; c.fill=HEAD; c.border=BOX; c.alignment=Alignment(wrap_text=True,vertical='center')
CODE={'Permit':'General Requirements','Project Management (C)':'Project Management','Site Prep Material':'Site Construction','Site Prep Labor':'Site Prep/Clean Up',
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
r=5; line_no=0
def add(path,name,unit,f,costs,types,allow):
    global r,line_no
    line_no+=1
    tp.cell(r,1,line_no); tp.cell(r,2,path); tp.cell(r,3,name); tp.cell(r,4,CODE.get(name.split(' — ')[0],'')); tp.cell(r,5,unit)
    tp.cell(r,6,f).font=font(name='Courier New',size=9)
    tp.cell(r,7,'='+xl(f)).number_format=NUM
    for k,t in enumerate(model.T):
        base=8+4*k
        cst=costs[t]
        if types[t]=='L' and cst in (model.LAB,2*model.LAB):
            cv='=LaborCost' if cst==model.LAB else '=2*LaborCost'
        else: cv=cst
        c=tp.cell(r,base,cv); c.number_format=USD2
        if not str(cv).startswith('='): c.font=BLUE; c.fill=YEL
        tp.cell(r,base+1,types[t]).alignment=Alignment(horizontal='center')
        cl=L(base); tl=L(base+1)
        if name=='Hauling & Disposal':
            up=tp.cell(r,base+2,450); up.font=BLUE; up.fill=YEL
        else:
            tp.cell(r,base+2,f'={cl}{r}*INDEX(MarkupVals,MATCH({tl}{r},MarkupCodes,0))')
        tp.cell(r,base+2).number_format=USD2
        tp.cell(r,base+3,f'=G{r}*{L(base+2)}{r}').number_format=USD
    tp.cell(r,20,'Yes' if allow else '')
    tp.cell(r,21,NOTES.get(name.split(' — ')[0],'')).font=GREY
    for j in range(1,22): tp.cell(r,j).border=BOX
    for j in (1,2,3,4,5,9,13,17,20):
        if tp.cell(r,j).font.color is None or tp.cell(r,j).font.name!='Courier New': tp.cell(r,j).font=tp.cell(r,j).font if tp.cell(r,j).font.name=='Courier New' else font(**({'color':'666666','size':9} if j==21 else {}))
    r+=1
def xl(f):
    f=re.sub(r'\{([^}]+)\}',lambda m: NAMES[m.group(1)],f)
    out='';i=0
    while i<len(f):
        m=re.match(r'(ceil|round)\(',f[i:])
        if m:
            fn=m.group(1); j=i+len(m.group(0)); depth=1; k=j
            while depth:
                depth+= {'(':1,')':-1}.get(f[k],0); k+=1
            inner=xl_inner(f[j:k-1]); out+=('ROUNDUP(' if fn=='ceil' else 'ROUND(')+inner+',0)'; i=k
        else: out+=f[i]; i+=1
    return out
def xl_inner(s): return xl(s) if ('ceil(' in s or 'round(' in s) else s

ROOT='BALLPARK — Bathroom'
for g,sg,n,t,u,f,c in model.COMMON:
    add(f'{ROOT} > {g} > {sg}',n,u,f,{x:c for x in model.T},{x:t for x in model.T},False)
first_sel=r
for n,u,f,cs,al in model.TIERS:
    if isinstance(f,str):
        add(f'{ROOT} > Finish Level (select one) > [each tier]',n,u,f,{t:cs[t][0] for t in model.T},{t:cs[t][1] for t in model.T},al)
    else:
        for t,ft in f.items():
            add(f'{ROOT} > Finish Level (select one) > {t}',f'{n} — {t}',u,ft,{x:(cs[t][0] if x==t else 0) for x in model.T},{x:cs[t][1] for x in model.T},al)
last_row=r-1
tp.cell(r,3,'TOTAL').font=BOLD
for k in range(3):
    col=L(11+4*k); c=tp.cell(r,11+4*k,f'=SUM({col}5:{col}{last_row})'); c.font=BOLD; c.number_format=USD; c.fill=TOT
widths={'A':4,'B':46,'C':30,'D':24,'E':11,'F':52,'G':8,'U':70}
for k,v in widths.items(): tp.column_dimensions[k].width=v
for k in range(8,20): tp.column_dimensions[L(k)].width=11
tp.freeze_panes='D5'

# Calculator outputs referencing Template
for i,(label,key) in enumerate(rowsout,5):
    ca.cell(i,6,label).font=font()
    for k,t in enumerate(model.T):
        col=L(11+4*k)
        if key=='sel':
            f=f'=SUM(Template!{col}{first_sel}:{col}{last_row})'
        else:
            ph={'p1':'Phase 1','p2':'Phase 2','p3':'Phase 3','p4':'Phase 4'}[key]
            f=f'=SUMIFS(Template!{col}5:{col}{first_sel-1},Template!B5:B{first_sel-1},"*{ph} -*")'
        c=ca.cell(i,7+k,f); c.number_format=USD
tr=5+len(rowsout)
ca.cell(tr,6,'Ballpark total').font=BOLD
for k in range(3):
    c=ca.cell(tr,7+k,f'=SUM({L(7+k)}5:{L(7+k)}{tr-1})'); c.font=BOLD; c.number_format=USD; c.fill=TOT
ca.cell(tr+1,6,'Check: equals Template total').font=GREY
for k in range(3):
    c=ca.cell(tr+1,7+k,f'=IF(ABS({L(7+k)}{tr}-Template!{L(11+4*k)}{r})<0.01,"OK","MISMATCH")'); c.font=GREY; c.alignment=Alignment(horizontal='center')
ca.cell(tr+3,6,'Budget range shown to customer').font=BOLD
ca.cell(tr+4,6,'Low').font=font(); ca.cell(tr+5,6,'High').font=font()
for k in range(3):
    ca.cell(tr+4,7+k,f'=ROUND({L(7+k)}{tr}*(1-RangePct),-2)').number_format=USD
    ca.cell(tr+5,7+k,f'=ROUND({L(7+k)}{tr}*(1+RangePct),-2)').number_format=USD
ca.cell(tr+7,6,'Totals exclude sales tax and the design agreement fee.').font=GREY
ca.cell(tr+8,6,'The ±15% band is set on the Rates tab.').font=GREY

# ---------- Parameters ----------
pa=wb.create_sheet('Parameters',3)
pa['A1']='JobTread job parameters used by the formulas'; pa['A1'].font=H1
pa['A2']='Verified 27 Sep 2026: formula variables are job parameters (job.parameters), the same mechanism DB\'s roofing formulas use. Names must match the formulas exactly.'; pa['A2'].font=GREY
for j,h in enumerate(['JobTread parameter','Type','Default','How to measure / count','Used by (line items)'],1):
    c=pa.cell(4,j,h); c.font=BOLD; c.fill=HEAD; c.border=BOX
allf=[(n,f) for g,sg,n,t,u,f,c in model.COMMON]+[(n,f) for n,u,f,cs,al in model.TIERS]
for i,(n,typ,d,h) in enumerate(model.PARAMS,5):
    used=', '.join(sorted({ln for ln,f in allf if '{'+n+'}' in f}))
    for j,v in enumerate([n,'Number',d,h,used],1):
        c=pa.cell(i,j,v); c.border=BOX; c.alignment=WRAP; c.font=font(name='Courier New',size=9) if j==1 else font()
for col,w in zip('ABCDE',(26,9,8,60,70)): pa.column_dimensions[col].width=w

# ---------- Calibration ----------
cb=wb.create_sheet('Calibration')
cb['A1']='Calibration against 17 bathroom estimates DB sent, Jan–Sep 2026'; cb['A1'].font=H1
cb['A2']='Actual = the estimate total from JobTread, less any design-fee lines. Intake values were reconstructed from each estimate\'s own lines; room sizes are estimates where the estimate had no SF line. Model columns are values from the repo\'s Python model, which mirrors the Template tab.'; cb['A2'].font=GREY
cb['A3']='Structure = everything except the finish selections (labor, rough-in, demo, drywall, general requirements). It tests the formulas; the selections are the customer\'s choice.'; cb['A3'].font=GREY
from calib import INTAKE, TIER_OF, docs, SEL
import statistics as st
hdr=['Job','Status','Actual total','Model Good','Model Better','Model Best','Inside Good−15% to Best+15%?','Structure actual','Structure model','Structure error','Absolute error','Shower tier used']+[n for n,_,_,_ in model.PARAMS]
for j,h in enumerate(hdr,1):
    c=cb.cell(5,j,h); c.font=BOLD; c.fill=HEAD; c.border=BOX; c.alignment=Alignment(wrap_text=True,vertical='center')
for i,(j,P) in enumerate(INTAKE.items(),6):
    d=docs[j]; design=sum(p for n,t,p,q in d['items'] if n.startswith('Designer')); a=d['price']-design
    from calib import structure_actual, structure_model
    _,struct_a=structure_actual(d); sel=a-struct_a
    sm=structure_model(j,P)
    tiers=[model.price(P,t) for t in model.T]
    vals=[j,d['status'],round(a,2)]+[round(x,2) for x in tiers]
    for k,v in enumerate(vals,1): cb.cell(i,k,v)
    cb.cell(i,7,f'=IF(AND(C{i}>=D{i}*(1-RangePct),C{i}<=F{i}*(1+RangePct)),"Yes","No")')
    cb.cell(i,8,round(a-sel,2)); cb.cell(i,9,round(sm,2)); cb.cell(i,10,f'=(I{i}-H{i})/H{i}')
    cb.cell(i,11,f'=ABS(J{i})')
    cb.cell(i,12,TIER_OF.get(j,{}).get('Shower/Tub Labor','Better'))
    for k,(n,_,_,_) in enumerate(model.PARAMS,13): cb.cell(i,k,P[n])
    for k in range(1,13+len(model.PARAMS)):
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
for k in range(13,13+len(model.PARAMS)): cb.column_dimensions[L(k)].width=9
cb.freeze_panes='C6'
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for c in row:
            if c.font is None or c.font.name!=F and c.font.name!='Courier New': c.font=Font(name=F,size=c.font.size or 10,bold=c.font.bold,color=c.font.color)
import pathlib; wb.save(pathlib.Path(__file__).resolve().parents[1]/'bathroom-ballpark-template.xlsx'); print('saved', r)
