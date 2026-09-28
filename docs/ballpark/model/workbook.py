"""Shared workbook builder for the ballpark templates.

build(spec) writes Read Me, Calculator, Template, Parameters and Rates tabs from a template
module, then calls spec['calibration'](wb, ctx) for the room-specific Calibration tab.
Every price in the workbook is a live formula; recalculate after building.
"""
import re, pathlib
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.utils import get_column_letter as L
import engine

F = 'Arial'

# Permit fees DB paid by jurisdiction: vendor bills for the Permit item, last 6 months (from Carl, 28 Sep 2026)
PERMITS = [('Village of Convoy', '$10'),
           ('City of Van Wert', '$20 for the first $10K of project cost, plus $2 per additional $1K (paid $20–$122, average $36)'),
           ('City of Lima', '$63'),
           ('Lucas County', '$75.75'),
           ('Union Township', '$100'),
           ('Pleasant Township Trustees', '$300'),
           ('Deitemeyer Brothers internal', '$32–$40, average $36')]
PERMIT_NOTE = ("Quantity is the permit fee in dollars at $1.00 each, so it can follow the jurisdiction: the estimator enters "
               "the fee from the permit table on the Rates tab as the Permit Fee parameter. Marked up like other costs.")
ZONES = [('Zone 1 (within ~15 mi)', 1, 0), ('Zone 2 (~15–30 mi)', 2, 0.5), ('Zone 3 (~30–50 mi)', 3, 1.25),
         ('Extended (over 50 mi): quote by hand', 4, 2.25)]


def font(**k):
    k.setdefault('name', F); k.setdefault('size', 10); return Font(**k)


BLUE = font(color='0000FF'); BOLD = font(bold=True); H1 = font(bold=True, size=14); GREY = font(color='666666', size=9)
YEL = PatternFill('solid', fgColor='FFFF00'); HEAD = PatternFill('solid', fgColor='DCE6F1'); TOT = PatternFill('solid', fgColor='F2F2F2')
thin = Side(style='thin', color='BFBFBF'); BOX = Border(top=thin, bottom=thin, left=thin, right=thin)
WRAP = Alignment(wrap_text=True, vertical='top')
USD = '$#,##0;($#,##0);-'; USD2 = '$#,##0.00;($#,##0.00);-'; NUM = '#,##0.##;-#,##0.##;-'
MONO = dict(name='Courier New', size=9)


def header(ws, row, labels):
    for j, h in enumerate(labels, 1):
        c = ws.cell(row, j, h); c.font = BOLD; c.fill = HEAD; c.border = BOX
        c.alignment = Alignment(wrap_text=True, vertical='center')


def build(spec):
    m = spec['module']; room = spec['room']; T = engine.T
    wb = Workbook()

    # ---------- Read Me ----------
    rm = wb.active; rm.title = 'Read Me'
    for i, (t, f) in enumerate(spec['readme'], 1):
        c = rm.cell(i, 1, t); c.font = {'h1': H1, 'b': BOLD, 'g': GREY}.get(f, font()); c.alignment = WRAP
    rm.column_dimensions['A'].width = 120

    # ---------- Rates ----------
    ra = wb.create_sheet('Rates')
    ra['A1'] = 'Markup by cost type'; ra['A1'].font = H1
    header(ra, 3, ['Cost type code', 'Cost type', 'Price ÷ cost', 'Note'])
    rates = [('L', 'Labor', '=C12/C11', "DB catalog labor: $55 cost / $100 price per hour (a 45% margin)."),
             ('M', 'Materials', 1.45, 'DB catalog materials: ×1.45 with zero variance across the catalog (field notes §9).'),
             ('S', 'Subcontractor', 1.30, "Countertop, tile and flooring subs in DB's estimates were marked up ×1.30."),
             ('O', 'Other', 1.45, 'Permits and misc. fees: ×1.45.'),
             ('U', 'Labor, per unit', 1.45, "Labor the catalog prices per square or foot (siding, roofing, gutters). JobTread cost type Labor, marked up ×1.45 like the catalog."),
             ('C', 'Contingency', 1.00, "Its own line, carried at cost so it can be reported and credited. JobTread cost type Other with the markup set to 0, cost code Contingency.")]
    for i, (code, name, v, note) in enumerate(rates, 4):
        ra.cell(i, 1, code).font = font(); ra.cell(i, 2, name).font = font()
        c = ra.cell(i, 3, v); c.number_format = '0.000'
        if not str(v).startswith('='): c.font = BLUE; c.fill = YEL
        ra.cell(i, 4, note).font = GREY
        for j in range(1, 5): ra.cell(i, j).border = BOX
    for cell, lab, v, fmt in (('11', 'Labor cost per hour', 55, USD2), ('12', 'Labor price per hour', 100, USD2),
                              ('14', 'Budget range accuracy (±)', spec.get('range', 0.15), '0%')):
        ra['A' + cell] = lab; ra['C' + cell] = v; ra['C' + cell].font = BLUE; ra['C' + cell].fill = YEL; ra['C' + cell].number_format = fmt
    ra['D11'] = 'Used as the unit cost of every labor line on the Template tab.'; ra['D11'].font = GREY
    ra['D14'] = spec.get('range_note', 'The range shown to the customer around each tier total.'); ra['D14'].font = GREY
    r = 16
    ra.cell(r, 1, 'Permit fees by jurisdiction').font = BOLD
    ra.cell(r, 4, "DB's vendor bills for permits, last 6 months. Enter the job's fee as the Permit Fee parameter.").font = GREY
    header(ra, r + 1, ['Jurisdiction', '', '', 'Fee DB pays'])
    for i, (j, fee) in enumerate(PERMITS, r + 2):
        ra.cell(i, 1, j).font = font(); ra.cell(i, 4, fee).font = font()
        for k in (1, 4): ra.cell(i, k).border = BOX
    r = r + 3 + len(PERMITS)
    ra.cell(r, 1, 'Travel by service zone').font = BOLD
    ra.cell(r, 4, engine.ZONE_NOTE).font = GREY
    header(ra, r + 1, ['Service Zone', 'Enter', 'Hours per person-day', ''])
    for i, (z, v, h) in enumerate(ZONES, r + 2):
        for k, val in enumerate((z, v, h), 1):
            c = ra.cell(i, k, val); c.font = font(); c.border = BOX
    for col, w in zip('ABCD', (34, 16, 20, 100)): ra.column_dimensions[col].width = w
    for nm, ref in (('MarkupCodes', 'Rates!$A$4:$A$9'), ('MarkupVals', 'Rates!$C$4:$C$9'),
                    ('LaborCost', 'Rates!$C$11'), ('RangePct', 'Rates!$C$14')):
        wb.defined_names[nm] = DefinedName(nm, attr_text=ref)

    # ---------- Calculator inputs ----------
    ca = wb.create_sheet('Calculator', 1)
    ca['A1'] = f'{room} Ballpark Calculator'; ca['A1'].font = H1
    ca['A2'] = f"Type the site-visit numbers into the yellow cells. Example values below are {spec['example_desc']}, not a real customer."; ca['A2'].font = GREY
    header(ca, 4, ['Site-visit measurement', 'Value', 'What to enter', 'JobTread parameter name'])
    NAMES = {}
    for i, (n, typ, d, help_) in enumerate(m.PARAMS, 5):
        nm = 'p_' + re.sub(r'[^A-Za-z0-9]+', '_', n).strip('_'); NAMES[n] = nm
        ca.cell(i, 1, n).font = font()
        c = ca.cell(i, 2, spec['example'].get(n, d)); c.font = BLUE; c.fill = YEL; c.border = BOX; c.number_format = NUM
        ca.cell(i, 3, help_).font = GREY
        ca.cell(i, 4, '{' + n + '}').font = font(**MONO)
        wb.defined_names[nm] = DefinedName(nm, attr_text=f"Calculator!$B${i}")
    for col, w in zip('ABCDF', (28, 10, 70, 32, 30)): ca.column_dimensions[col].width = w
    for k in 'GHI': ca.column_dimensions[k].width = 14

    def xl(f):
        f = re.sub(r'\{([^}]+)\}', lambda mm: NAMES[mm.group(1)], f)
        out = ''; i = 0
        while i < len(f):
            mm = re.match(r'(ceil|round)\(', f[i:])
            if mm:
                fn = mm.group(1); j = i + len(mm.group(0)); depth = 1; k = j
                while depth:
                    depth += {'(': 1, ')': -1}.get(f[k], 0); k += 1
                out += ('ROUNDUP(' if fn == 'ceil' else 'ROUND(') + xl(f[j:k - 1]) + ',0)'; i = k
            else:
                out += f[i]; i += 1
        return out

    # ---------- Template ----------
    tp = wb.create_sheet('Template', 2)
    root = f'BALLPARK — {room}'
    tp['A1'] = f'JobTread build sheet: cost group "{root}"'; tp['A1'].font = H1
    tp['A2'] = ("One row per JobTread line. Paste the quantity formula exactly as written into the catalog item. "
                "Rows marked [each tier] become one item in each of the Good, Better and Best option groups, at that tier's cost. "
                "Rows marked with a single tier go only in that option. All other rows are common scope."); tp['A2'].font = GREY
    header(tp, 4, ['#', 'JobTread cost group path', 'Line item', 'Cost code', 'Unit', 'JobTread quantity formula', 'Qty (live)']
           + [f'{t} {x}' for t in T for x in ('cost', 'type', 'unit price', 'total')] + ['Allowance type', 'Note'])
    st = {'r': 5, 'n': 0}

    def add(path, name, unit, f, costs, types, allow, note=None):
        r = st['r']; st['n'] += 1; base_name = name.split(' — ')[0]
        vals = [st['n'], path, name, spec['codes'].get(base_name, 'Contingency' if base_name == 'Contingency' else ''), unit]
        for j, v in enumerate(vals, 1): tp.cell(r, j, v).font = font()
        tp.cell(r, 6, f).font = font(**MONO)
        tp.cell(r, 7, '=' + xl(f)).number_format = NUM
        for k, t in enumerate(T):
            b = 8 + 4 * k; cst = costs[t]
            cv = '=LaborCost' if types[t] == 'L' and cst == engine.LAB else cst
            c = tp.cell(r, b, cv); c.number_format = USD2
            if not str(cv).startswith('='): c.font = BLUE; c.fill = YEL
            tp.cell(r, b + 1, types[t]).alignment = Alignment(horizontal='center')
            if base_name in engine.PRICE_OVERRIDE:
                up = tp.cell(r, b + 2, engine.PRICE_OVERRIDE[base_name]); up.font = BLUE; up.fill = YEL
            else:
                tp.cell(r, b + 2, f'={L(b)}{r}*INDEX(MarkupVals,MATCH({L(b + 1)}{r},MarkupCodes,0))')
            tp.cell(r, b + 2).number_format = USD2
            tp.cell(r, b + 3, f'=G{r}*{L(b + 2)}{r}').number_format = USD
        tp.cell(r, 20, 'Price' if allow else '')
        tp.cell(r, 21, note or spec['notes'].get(base_name, '')).font = GREY
        for j in range(1, 22): tp.cell(r, j).border = BOX
        st['r'] += 1

    for g, sg, n, t, u, f, c in m.COMMON:
        add(f'{root} > {g} > {sg}', n, u, f, {x: c for x in T}, {x: t for x in T}, False)
    first_sel = st['r']
    for n, u, f, cs, al in m.TIERS:
        if isinstance(f, str):
            add(f'{root} > Finish Level (select one) > [each tier]', n, u, f,
                {t: cs[t][0] for t in T}, {t: cs[t][1] for t in T}, al)
        else:
            for t, ft in f.items():
                add(f'{root} > Finish Level (select one) > {t}', f'{n} — {t}', u, ft,
                    {x: (cs[t][0] if x == t else 0) for x in T}, {x: cs[t][1] for x in T}, al)
    last_sel = st['r'] - 1
    cont_note = ("Contingency: the rate times this tier's whole price before contingency. JobTread formulas cannot reference "
                 "other lines, so the subtotal is spelled out; regenerate this formula (run the build script) after any rate change. "
                 "Unit price $1.00, cost type Other with markup 0, cost code Contingency.")
    for t in T:
        add(f'{root} > Finish Level (select one) > {t}', f'Contingency — {t}', 'Lump Sum', engine.contingency_formula(m, t),
            {x: (1.0 if x == t else 0) for x in T}, {x: 'C' for x in T}, False, cont_note)
        tp.cell(st['r'] - 1, 6).alignment = Alignment(wrap_text=True, vertical='top')
    last_row = st['r'] - 1; tot_row = st['r']
    tp.cell(tot_row, 3, 'TOTAL').font = BOLD
    for k in range(3):
        col = L(11 + 4 * k); c = tp.cell(tot_row, 11 + 4 * k, f'=SUM({col}5:{col}{last_row})')
        c.font = BOLD; c.number_format = USD; c.fill = TOT
    for k, v in {'A': 4, 'B': 46, 'C': 30, 'D': 24, 'E': 11, 'F': 56, 'G': 8, 'U': 70}.items(): tp.column_dimensions[k].width = v
    for k in range(8, 20): tp.column_dimensions[L(k)].width = 11
    tp.freeze_panes = 'D5'

    # ---------- Calculator outputs ----------
    ca['F4'] = 'Ballpark'; ca['F4'].font = BOLD; ca['F4'].fill = HEAD
    for j, t in enumerate(T):
        c = ca.cell(4, 7 + j, t); c.font = BOLD; c.fill = HEAD; c.alignment = Alignment(horizontal='center')
    phases = spec.get('phases', ('Phase 1 - General Requirements', 'Phase 2 - Rough-In', 'Phase 3 - Interior', 'Phase 4 - Finishes'))
    rowsout = [(p, p.split(' -')[0]) for p in phases] + [('Finish selections (tier)', None), (f"Contingency (the {spec['prefix'].strip()} Contingency Rate)", 'C')]
    for i, (label, ph) in enumerate(rowsout, 5):
        ca.cell(i, 6, label).font = font()
        for k in range(3):
            col = L(11 + 4 * k)
            f = (f'=SUM(Template!{col}{first_sel}:{col}{last_sel})' if ph is None else
                 f'=SUM(Template!{col}{last_sel + 1}:{col}{last_row})' if ph == 'C' else
                 f'=SUMIFS(Template!{col}5:{col}{first_sel - 1},Template!B5:B{first_sel - 1},"*{ph} -*")')
            ca.cell(i, 7 + k, f).number_format = USD
    tr = 5 + len(rowsout)
    ca.cell(tr, 6, 'Ballpark total').font = BOLD
    for k in range(3):
        c = ca.cell(tr, 7 + k, f'=SUM({L(7 + k)}5:{L(7 + k)}{tr - 1})'); c.font = BOLD; c.number_format = USD; c.fill = TOT
    ca.cell(tr + 1, 6, 'Check: equals Template total').font = GREY
    for k in range(3):
        c = ca.cell(tr + 1, 7 + k, f'=IF(ABS({L(7 + k)}{tr}-Template!{L(11 + 4 * k)}{tot_row})<0.01,"OK","MISMATCH")')
        c.font = GREY; c.alignment = Alignment(horizontal='center')
    ca.cell(tr + 3, 6, 'Budget range shown to customer').font = BOLD
    ca.cell(tr + 4, 6, 'Low').font = font(); ca.cell(tr + 5, 6, 'High').font = font()
    for k in range(3):
        ca.cell(tr + 4, 7 + k, f'=ROUND({L(7 + k)}{tr}*(1-RangePct),-2)').number_format = USD
        ca.cell(tr + 5, 7 + k, f'=ROUND({L(7 + k)}{tr}*(1+RangePct),-2)').number_format = USD
    ca.cell(tr + 7, 6, 'Totals exclude sales tax and the design agreement fee.').font = GREY
    ca.cell(tr + 8, 6, 'The ± band is set on the Rates tab.').font = GREY

    # ---------- Parameters ----------
    pa = wb.create_sheet('Parameters', 3)
    pa['A1'] = 'JobTread job parameters used by the formulas'; pa['A1'].font = H1
    pa['A2'] = ("Verified 27 Sep 2026: formula variables are job parameters (job.parameters), the same mechanism DB's roofing "
                f"formulas use. Names must match exactly. Every name starts with '{spec['prefix']}' so a job carrying more than one "
                "ballpark template never shares a parameter between rooms."); pa['A2'].font = GREY
    header(pa, 4, ['JobTread parameter', 'Type', 'Default', 'How to measure / count', 'Used by (line items)'])
    allf = [(n, f) for g, sg, n, t, u, f, c in m.COMMON]
    for n, u, f, cs, al in m.TIERS:
        allf += [(n, f)] if isinstance(f, str) else [(n, x) for x in f.values()]
    for i, (n, typ, d, h) in enumerate(m.PARAMS, 5):
        used = ', '.join(sorted({ln for ln, f in allf if '{' + n + '}' in f}))
        for j, v in enumerate([n, 'Number', d, h, used], 1):
            c = pa.cell(i, j, v); c.border = BOX; c.alignment = WRAP; c.font = font(**MONO) if j == 1 else font()
    for col, w in zip('ABCDE', (30, 9, 8, 60, 70)): pa.column_dimensions[col].width = w

    # ---------- Calibration (room-specific) ----------
    spec['calibration'](wb, dict(font=font, BOX=BOX, BOLD=BOLD, H1=H1, GREY=GREY, USD=USD, header=header, L=L))

    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if c.font is not None and c.font.name not in (F, 'Courier New'):
                    c.font = Font(name=F, size=c.font.size or 10, bold=c.font.bold, color=c.font.color)
    out = pathlib.Path(__file__).resolve().parents[1] / spec['filename']
    wb.save(out)
    return out
