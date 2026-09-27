"""Build the kitchen ballpark workbook: python3 build_kitchen.py, then recalculate."""
import engine, kitchen_model as km, workbook
from kitchen_calib import INTAKE, TIER_OF, docs, split, structure_model, components

GR, ME, EL, FN, CA = 'General Requirements', 'Mechanical (Plumbing & HVAC)', 'Electrical', 'Finishes', 'Cabinetry'
CODES = {'Permit': GR, 'Project Management (C)': 'Project Management', 'Site Prep Material': 'Site Construction',
         'Site Prep Labor': 'Site Prep/Clean Up', 'Demolition': 'Demolition', 'Hauling & Disposal': 'Hauling & Disposal (Direct)',
         'Final Clean': 'Site Prep/Clean Up', 'Travel': 'Travel Related Costs',
         'Framing/Sheathing Materials': 'Woods & Plastics', 'Framing/Sheathing Labor': 'Framing/Sheeting',
         'Plumbing Materials': ME, 'Plumbing Labor': ME, 'HVAC Materials': ME, 'HVAC Labor': ME,
         'Electrical Materials': EL, 'Electrical Labor': EL, 'Drywall Materials': FN, 'Drywall Labor': 'Drywall',
         'Paint Materials': FN, 'Paint Labor': 'Painting', 'Flooring - Misc. Material': FN,
         'Cabinet Knob/Pull': CA, 'Appliance Labor': 'Appliances', 'Interior Door': 'Doors',
         'Exterior Door & Lockset': 'Doors', 'Door Labor': 'Doors', 'Trim Materials': 'Woods & Plastics',
         'Trim Labor': 'Interior Trim/Casing/Paneling', 'Cabinets': CA, 'Cabinetry Labor': CA, 'Countertops': CA,
         'Backsplash': 'Tiling', 'Sink, Faucet & Disposal': ME, 'Appliance Allowance': 'Appliances',
         'Flooring Material': FN, 'Flooring Labor': 'Flooring', 'Light Fixture': EL, 'Recessed Light': EL,
         'Under-Cabinet Lighting': EL}

NOTES = {
 'Permit': "Kitchen permits on DB's two full kitchens were $275 and $287 price. Adjust per city.",
 'Hauling & Disposal': "Uses DB's existing catalog item: $250 cost / $450 price per load.",
 'Demolition': '8 h setup, plus 1 h per 15 SF when gutted, plus 6 h per wall moved.',
 'Electrical Materials': "DB prices kitchen electrical material per SF of floor: $2.61 cost ($3.78 price) on both full kitchens.",
 'Drywall Materials': "About $2.30 cost per SF of floor when gutted, from DB's two full kitchens.",
 'Cabinets': ("Per linear foot of base-cabinet run, uppers and towers included (DB's own convention). Good = stock builder line "
              "($270 price per LF on DB's apartment kitchens). Better = $600 cost, DB's standard cabinet allowance. "
              "Best = premium line such as KraftMaid plywood or painted; DB's kitchen addition bid $1,178 price per LF."),
 'Cabinetry Labor': 'One item per tier: 4 h plus 1.1 / 1.3 / 1.5 h per foot of run. Premium lines take longer to set.',
 'Countertops': ("SF = 2 per foot of run plus 1.5 per foot of island. Good = laminate ($33.75 price per SF on DB's apartment kitchens). "
                 "Better = entry quartz. Best = 3 cm premium quartz; DB's other bids priced it at $117–$120 cost per SF."),
 'Backsplash': ("SF = 1.5 ft high along the wall run. Good/Better = tile set by the tile sub. Best = quartz slab to match the counters. "
                "A full-height slab can cost twice this (one kitchen's ran $12,604)."),
 'Appliance Allowance': 'Only appliances DB buys. Many customers supply their own; they still count toward install hours.',
 'Appliance Labor': "2 h per appliance set. DB carried 8 h for four appliances.",
 'Flooring Material': 'Good/Better = LVP installed by DB crew. Best = tile set by the tile sub, installed price per SF.',
 'Flooring Labor': 'Good and Better only. Best has no DB flooring labor because the tile sub installs.',
 'Plumbing Materials': 'Relocations (island sink, moved range gas line) add $500 cost each.',
 'Exterior Door & Lockset': "Matches the exterior door DB priced on its full kitchen: $1,675 door plus $109 lockset, price.",
}

README = [
 ('Kitchen Ballpark Template — DRAFT for review', 'h1'),
 ('Deitemeyer Brothers · General Construction · drafted 27 Sep 2026', 'g'),
 ('', None),
 ('What this is', 'b'),
 ('The build sheet for a formula-driven kitchen ballpark in JobTread, plus a working calculator so the numbers can be checked before anything is built.', None),
 ("It prices one kitchen at Good / Better / Best from 21 site-visit measurements, using DB's catalog rates and markup. It runs on the same engine as the bathroom template.", None),
 ('', None),
 ('How to use it', 'b'),
 ('1. Calculator tab: type the site-visit numbers into the yellow cells. The three totals and ranges update.', None),
 ('2. Template tab: every JobTread line with its cost group, cost code, unit, exact quantity formula, and unit cost and price per tier.', None),
 ("3. Parameters tab: the 21 JobTread job parameters. Each starts with 'Kitchen ' so a job with a kitchen and a bath never shares one.", None),
 ('4. Rates tab: markup by cost type, and the ± band. It is set to ±20% for kitchens.', None),
 ('5. Calibration tab: how the template compares with every kitchen DB has estimated.', None),
 ('', None),
 ('Legend', 'b'),
 ('Yellow fill, blue text: an input you can change. Black text: a formula. Grey text: notes and sources.', None),
 ('', None),
 ('How much to trust it', 'b'),
 ('DB has not signed a kitchen since the move to JobTread. Two full kitchens have been estimated (both pending, both premium) and a few larger bids contain kitchen lines.', None),
 ('Both full kitchens reproduce within 5% at the tier each was quoted, and their labor and rough-in within 2%. That shows the template can express how DB prices a kitchen. It is not a forecast: the inputs were rebuilt from those same estimates.', None),
 ('The Good tier rests on one source, DB\'s apartment-kitchen bid. Better cabinets use DB\'s standard $600-per-foot allowance.', None),
 ('So the ballpark is quoted at ±20%, as the proposal planned, until three kitchens have closed. Then re-run the calibration and tighten it to ±15%.', None),
 ('', None),
 ('Decisions still open (for Carl)', 'b'),
 ('Allowance type on the selection lines: cost (marked up like other materials, as drafted), price, or cost plus fee.', None),
 ('Name the cabinet line, countertop material and backsplash for each tier so sales can show them.', None),
 ('Whether DB supplies appliances by default or only on request.', None),
 ('', None),
 ("Source for every rate: kitchen estimates read from DB's JobTread account (read-only) on 27 Sep 2026. See Calibration tab.", 'g'),
]


def calibration(wb, ctx):
    font, BOX, BOLD, H1, GREY, USD, header, L = (ctx[k] for k in ('font', 'BOX', 'BOLD', 'H1', 'GREY', 'USD', 'header', 'L'))
    cb = wb.create_sheet('Calibration')
    cb['A1'] = "Checks against every kitchen DB has estimated since the move to JobTread"; cb['A1'].font = H1
    cb['A2'] = ("Full kitchens: actual = JobTread estimate total less design-fee lines. Intake was rebuilt from each estimate's own lines, and "
                "the tier from its products, so this checks that the template reproduces DB's pricing. It is not an out-of-sample test."); cb['A2'].font = GREY
    cb['A3'] = "Structure = everything except the finish selections (labor, rough-in, demo, drywall, general requirements)."; cb['A3'].font = GREY
    cb['A5'] = 'Full kitchen estimates'; cb['A5'].font = BOLD
    hdr = ['Job', 'Status', 'Actual total', 'Model Good', 'Model Better', 'Model Best', 'Model at the tier quoted', 'Error at tier',
           'Structure actual', 'Structure model', 'Structure error'] + [n for n, _, _, _ in km.PARAMS]
    header(cb, 6, hdr)
    r = 7
    for j, P in INTAKE.items():
        d = docs[j]; a, sa = split(d); sm = structure_model(P, TIER_OF[j])
        vals = [j, d['status'], round(a, 2)] + [round(km.price(P, t), 2) for t in engine.T] + [round(km.price(P, TIER_OF[j]), 2)]
        for k, v in enumerate(vals, 1): cb.cell(r, k, v)
        cb.cell(r, 8, f'=(G{r}-C{r})/C{r}'); cb.cell(r, 9, round(sa, 2)); cb.cell(r, 10, round(sm, 2)); cb.cell(r, 11, f'=(J{r}-I{r})/I{r}')
        for k, (n, _, _, _) in enumerate(km.PARAMS, 12): cb.cell(r, k, P[n])
        for k in range(1, 12 + len(km.PARAMS)):
            c = cb.cell(r, k); c.border = BOX; c.font = font()
            if k in (3, 4, 5, 6, 7, 9, 10): c.number_format = USD
            if k in (8, 11): c.number_format = '+0%;-0%;0%'
        r += 1
    r += 1
    cb.cell(r, 1, 'Component checks against kitchen lines inside larger bids').font = BOLD; r += 1
    header(cb, r, ['Source estimate', 'What', 'Actual', 'Model', 'Error']); cb.column_dimensions['B'].width = 40
    for src, what, a, m in components():
        r += 1
        for k, v in enumerate([src, what, round(a, 2), round(m, 2)], 1):
            c = cb.cell(r, k, v); c.border = BOX; c.font = font()
            if k in (3, 4): c.number_format = '#,##0.00'
        c = cb.cell(r, 5, f'=(D{r}-C{r})/C{r}'); c.number_format = '+0%;-0%;0%'; c.border = BOX
    r += 2
    for t in ("Sources: 261384 and 261062 (full kitchens, pending); 261268 (whole-house remodel, 28 LF kitchen); 258551 (kitchen addition, lost); "
              "258811 (three apartment kitchens, lost).",
              "Not used: 260599 (countertop-only bids), 260887 (kitchen lines too small to separate from the bathroom), "
              "258781 and 260128 (a few kitchen items inside other work). The Kay Oss kitchen job is a test job."):
        cb.cell(r, 1, t).font = GREY; r += 1
    cb.column_dimensions['A'].width = 26
    for k in range(3, 12): cb.column_dimensions[L(k)].width = 12
    cb.freeze_panes = 'B7'


EXAMPLE = {'Kitchen Floor Area': 180, 'Kitchen Full Gut': 1, 'Kitchen Cabinet Run': 26, 'Kitchen Island Length': 6,
           'Kitchen Backsplash': 1, 'Kitchen Appliances Supplied': 0, 'Kitchen Appliances Installed': 4,
           'Kitchen Fixtures Replaced': 2, 'Kitchen New Flooring Area': 180, 'Kitchen Light Fixtures': 2,
           'Kitchen Recessed Lights': 6, 'Kitchen Circuits Added': 3, 'Kitchen Under-Cabinet Lighting': 1}

if __name__ == '__main__':
    print(workbook.build(dict(module=km, room='Kitchen', prefix='Kitchen ', codes=CODES, notes=NOTES, readme=README,
        example=EXAMPLE, example_desc='a typical 180 SF gutted kitchen with a 26 ft cabinet run and a 6 ft island',
        range=0.20, range_note='Kitchens are quoted at ±20% until three have closed and the calibration is re-run (then ±15%).',
        calibration=calibration, filename='kitchen-ballpark-template.xlsx')))
