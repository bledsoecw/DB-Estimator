"""Build the addition ballpark workbook: python3 build_addition.py, then recalculate."""
import engine, addition_model as am, workbook
import addition_calib as ac

GR, WP, SI, DO, ME, FN = ('General Requirements', 'Woods & Plastics', 'Siding', 'Doors',
                          'Mechanical (Plumbing & HVAC)', 'Finishes')
CODES = {'Permit': GR, 'Project Management (C)': 'Project Management', 'Site Prep Material': 'Site Construction',
         'Site Prep Labor': 'Site Prep/Clean Up', 'Rentals & Delivery': GR, 'Demolition': 'Demolition',
         'Hauling & Disposal': 'Hauling & Disposal (Direct)', 'Final Clean': 'Site Prep/Clean Up',
         'Travel': 'Travel Related Costs', 'Utility - Electric': 'Utility Connection',
         'Excavation & Grading': 'Excavation', 'Rental - Mini Excavator': 'Excavation',
         'Concrete Foundation - Crawl': 'Concrete', 'Concrete Foundation - 6" Stem': 'Concrete',
         'Concrete Foundation - Basement': 'Concrete', 'Concrete Piers': 'Concrete', 'Pier Labor': 'Concrete',
         'Framing/Sheathing Materials': WP, 'Header & Opening Material': WP, 'Framing/Sheathing Labor': 'Framing/Sheeting',
         'Gutters & Downspouts': 'Roofing', 'Gutter Labor': 'Roofing', 'Roofing Material': 'Roofing', 'Roofing Install': 'Roofing',
         'Soffit & Fascia Material': SI, 'Fascia and Soffit Install': SI, 'House Wrap Labor': SI, 'Siding Labor': SI,
         'Siding Labor for Flashing': SI, 'Siding Material': SI, 'Window Labor': 'Windows', 'Windows': 'Windows',
         'Exterior Door & Lockset': DO, 'Garage Door': DO, 'Garage Door Wrapping': DO, 'Door Labor': DO,
         'Patio Door': DO, 'Interior Door': DO, 'Plumbing Materials': ME, 'Plumbing Labor': ME,
         'HVAC Extension (sub)': ME, 'HVAC New Unit (sub)': ME, 'Electrical Materials': 'Electrical',
         'Electrical Labor': 'Electrical', 'Insulation - Sub': FN, 'Drywall Board - Mat': FN, 'Drywall Mud - Mat': FN,
         'Drywall Labor': 'Drywall', 'Paint': FN, 'Paint Labor': 'Painting', 'Flooring - Misc. Material': FN,
         'Flooring Material': FN, 'Flooring Labor': 'Flooring', 'Trim - Baseboard': WP, 'Trim - Casing': WP,
         'Trim Labor': 'Interior Trim/Casing/Paneling'}

NOTES = {
 'Permit': "DB's addition permits ran $58 to $1,595 price depending on the city. Adjust per jurisdiction.",
 'Rentals & Delivery': 'P-Pod, dumpster buggy and deliveries. A finished room runs longer and carries about three more rental weeks.',
 'Demolition': '4 h to open up an attached addition, 1 h per 3 SF of structure torn down, and 8 h per opening cut into the house.',
 'Hauling & Disposal': "Uses DB's existing catalog item: $250 cost / $450 price per load.",
 'Utility - Electric': 'Catalog item, per foot of trench to a detached building. Matched both garage estimates.',
 'Excavation & Grading': 'Only when DB digs or grades. Most concrete subs include excavation in their price.',
 'Concrete Foundation - Crawl': "DB catalog item. Matched 258410's crawl-space sub to within 1% ($26.30 against $26.20 price per SF).",
 'Concrete Foundation - 6" Stem': 'DB catalog item: 3 ft footing, 6 in stem wall, 4 in slab. The 14x24 garage\'s sub ran $45.60 per SF; small slabs cost more per foot.',
 'Concrete Foundation - Basement': 'DB catalog item. No basement addition in the data; this line is untested.',
 'Concrete Piers': 'Per pier or post, with the labor line beside it. From the porch-type addition on three piers.',
 'Framing/Sheathing Materials': ("DB catalog item, updated to $22.50 cost per SF of floor (from $17.65) to match DB's two most recent "
                                 "lumber quotes ($22.8 and $22.4). Check it against the latest quote every quarter."),
 'Framing/Sheathing Labor': ("1 h per 6 SF of floor, plus 8 h per wall opening and per tie-in level. Matched DB's hours on "
                             "258410 (84 against 86) and 258551 (60 against 62). A framing sub costs about the same: $19 per SF price."),
 'Roofing Material': ("Per square, including underlayment, ice and water, starter, ridge and drip edge. Good matches OC Duration "
                      "($203–$240 cost per square with accessories on 258410 and 25-8197). Stone-coated steel or PVC roofs "
                      "cost 2–3 times Best; price those by hand."),
 'Roofing Install': 'Good/Better: catalog roofing labor, $95 per square. Best: catalog standing-seam install, $200 per square ($290 price).',
 'Gutters & Downspouts': 'Width + depth + 20 ft of downspout. Matched the 25-8197 and 260109 gutter lines within 10%.',
 'Siding Material': ('Per square with trim, J-channel, corners and house wrap. Good = Norandex Cedar Knolls ($165 catalog), '
                     'Better = catalog Siding - Horizontal ($255), Best = vinyl shake or board and batten ($311–$430).'),
 'Siding Labor': 'Catalog $160 per square ($232 price). One garage estimate charged $326 per square.',
 'House Wrap Labor': 'One hour per square, as on 25-8197, 258410 and 260109.',
 'Windows': "Good = catalog Polaris double-hung ($475). 258410's casements ran $579 cost each.",
 'Patio Door': 'Good = catalog Sliding Door ($1,750). Better = catalog Patio Door ($2,500).',
 'Exterior Door & Lockset': "Same as the kitchen template. 258410's entry door and lockset were $1,834 price.",
 'Garage Door': 'Catalog Garage Door, installed by the sub. Neither garage estimate priced its overhead doors; if the owner supplies them, keep the line at $0 and name it (by owner).',
 'Interior Door': 'Same as the kitchen template: $400 plus 3 h each.',
 'Plumbing Materials': ("Rough-in only: $250 and 9 h per fixture, from 258410's bathroom (37 h and $914 for four fixtures). "
                        "The fixtures and finishes come from the bathroom or kitchen template."),
 'HVAC Extension (sub)': 'Matches the $1,703 duct extension on 258684.',
 'HVAC New Unit (sub)': "Median of DB's four addition HVAC subs, $7,979 to $13,000 price.",
 'Electrical Materials': "DB catalog: $2.61 cost per SF of floor, the same as the kitchen template.",
 'Electrical Labor': '8 h plus 1 h per 16 SF. DB ranged 22–41 h on 273–420 SF rooms.',
 'Insulation - Sub': 'DB catalog: $8.52 cost per SF of floor, covering walls, attic and crawl.',
 'Drywall Board - Mat': 'DB prices drywall board and mud per SF of floor (catalog items), not per SF of board.',
 'Flooring Material': 'Good and Better are LVP; Best is engineered hardwood or premium LVP. All installed by the DB crew.',
}

README = [
 ('Addition Ballpark Template — DRAFT for review', 'h1'),
 ('Deitemeyer Brothers · General Construction · drafted 27 Sep 2026 · decisions applied 28 Sep 2026', 'g'),
 ('', None),
 ('What this is', 'b'),
 ('The build sheet for a formula-driven addition ballpark in JobTread, plus a working calculator so the numbers can be checked before anything is built.', None),
 ("It prices a room addition, sunroom or detached garage at Good / Better / Best from 28 site-visit measurements, using DB's catalog rates and markup. It runs on the same engine as the bathroom and kitchen templates.", None),
 ('A bathroom or kitchen inside the addition is priced by that room\'s own template on the same job. This template prices only the plumbing rough-in to reach it.', None),
 ('', None),
 ('How to use it', 'b'),
 ('1. Calculator tab: type the site-visit numbers into the yellow cells. The three totals and ranges update.', None),
 ('2. Template tab: every JobTread line with its cost group, cost code, unit, exact quantity formula, and unit cost and price per tier.', None),
 ("3. Parameters tab: the 28 site-visit parameters plus the contingency rate, which the estimator sets. Each starts with 'Addition ' so it never collides with a bath or kitchen on the same job.", None),
 ('4. Rates tab: markup by cost type, and the ± band. It is set to ±20% for additions.', None),
 ('5. Calibration tab: how the template compares with DB\'s addition estimates, total and block by block.', None),
 ('', None),
 ('Legend', 'b'),
 ('Yellow fill, blue text: an input you can change. Black text: a formula. Grey text: notes and sources.', None),
 ("Cost type U is labor the catalog prices per square, foot or piece (siding, roofing, gutters). It is JobTread's Labor type, marked up ×1.45 as the catalog does.", None),
 ('', None),
 ('How much to trust it', 'b'),
 ('Checked against eight addition estimates: six signed, one pending, one lost. Seven land within 15% of DB\'s price for the same scope (median 9%, no bias). The eighth, a sunroom tear-down with deck work and a PVC roof deck, is 41% under; it is outside what this template prices.', None),
 ('This is an in-sample check. The inputs were rebuilt from those same estimates, and three rates were set against them. Block by block the errors are much larger (often 30–60% either way) and cancel in the total.', None),
 ('Additions also vary more than bathrooms: foundation, roof and siding choices move the price more than the finish tier does. So the ballpark is quoted at ±20%, and every addition goes on to the Design & Pricing Agreement.', None),
 ('', None),
 ('Decided 28 Sep 2026', 'b'),
 ("Contingency is its own line on each tier at 10%. The estimator sets the Addition Contingency Rate. The checks compare prices before contingency, because DB's past estimates carried none.", None),
 ('Allowances are stated as customer prices (JobTread allowance type: price). No total changes; an overage or a credit is simply the difference in price.', None),
 ('Products per tier: the estimator and the designer name one product per Good / Better / Best cell and lock the grid for six months (draft in the proposal, §9).', None),
 ("Framing lumber: the catalog item Framing/Sheathing Materials is updated to $22.50 per SF (from $17.65), so this template uses the catalog rate.", None),
 ('Every $0 line on an estimate names who supplies it: (by owner), (by others) or (not included).', None),
 ('', None),
 ("Source for every rate: DB's catalog and addition estimates, read from JobTread (read-only) on 27 Sep 2026. See Calibration tab.", 'g'),
]


NOTES['Permit'] = workbook.PERMIT_NOTE
NOTES['Travel'] = engine.ZONE_NOTE
INPUTS = [p for p in am.PARAMS if p[0] != am.CONT]   # site-visit inputs; the estimator sets the contingency rate


def calibration(wb, ctx):
    font, BOX, BOLD, H1, GREY, USD, header, L = (ctx[k] for k in ('font', 'BOX', 'BOLD', 'H1', 'GREY', 'USD', 'header', 'L'))
    cb = wb.create_sheet('Calibration')
    cb['A1'] = "Checks against DB's addition estimates since the move to JobTread"; cb['A1'].font = H1
    cb['A2'] = ("Like for like: actual = estimate total less work another template or an add-on prices (listed below); model = template "
                "total less lines the estimate carried at $0. Intake was rebuilt from each estimate's own lines, so this is not an "
                "out-of-sample test."); cb['A2'].font = GREY
    cb['A3'] = "258684 is shown but not counted: a tear-down and rebuild with deck work, stone and a PVC roof deck."; cb['A3'].font = GREY
    cb['A5'] = 'Totals'; cb['A5'].font = BOLD
    hdr = (['Job', 'Status', 'What it is', 'Floor SF', 'Actual (same scope)', 'Model at its tier', 'Error', 'Actual $/SF',
            'Model Good', 'Model Better', 'Model Best', '|Error|'] + [n for n, _, _, _ in INPUTS])
    header(cb, 6, hdr)
    r = 7
    for x in ac.results():
        j = x['job']
        vals = [j, x['status'], x['what'], x['sf'], round(x['actual'], 2), round(x['model'], 2), None, None,
                round(x['Good'], 2), round(x['Better'], 2), round(x['Best'], 2)]
        for k, v in enumerate(vals, 1):
            if v is not None: cb.cell(r, k, v)
        cb.cell(r, 7, f'=(F{r}-E{r})/E{r}'); cb.cell(r, 8, f'=E{r}/D{r}'); cb.cell(r, 12, f'=ABS(G{r})')
        for k, (n, _, _, _) in enumerate(INPUTS, 13): cb.cell(r, k, ac.INTAKE[j][n])
        for k in range(1, 13 + len(INPUTS)):
            c = cb.cell(r, k); c.border = BOX; c.font = font(color='808080' if j in ac.OUTLIER else None)
            if k in (5, 6, 8, 9, 10, 11): c.number_format = USD
            if k == 7: c.number_format = '+0%;-0%;0%'
            if k == 12: c.number_format = '0%'
        r += 1
    lc = r - 1 - sum(1 for j in ac.INTAKE if j in ac.OUTLIER)   # the outlier is listed last
    r += 1
    for lab, f, fmt in (('Median absolute error (counted estimates)', f'=MEDIAN(L7:L{lc})', '0%'),
                        ('Median error (bias)', f'=MEDIAN(G7:G{lc})', '+0%;-0%;0%'),
                        ('Counted estimates within ±15%', f'=SUMPRODUCT(--(L7:L{lc}<=0.15))&" of "&COUNT(L7:L{lc})', None)):
        cb.cell(r, 1, lab).font = BOLD
        c = cb.cell(r, 5, f); c.font = BOLD
        if fmt: c.number_format = fmt
        r += 1
    r += 1
    cb.cell(r, 1, 'Block by block (model against actual, same scope)').font = BOLD; r += 1
    cb.cell(r, 1, "Large offsets cancel in the totals. '-' = under $500 in the estimate, or left unpriced by it.").font = GREY; r += 1
    header(cb, r, ['Block', '', ''] + list(ac.INTAKE))
    B = {j: ac.blocks(j) for j in ac.INTAKE}
    for b, _, _ in ac.BLOCKS:
        r += 1
        cb.cell(r, 1, b).font = font()
        for k, j in enumerate(ac.INTAKE, 4):
            c = cb.cell(r, k, ac.block_err(B[j], b)); c.border = BOX; c.font = font()
    r += 2
    cb.cell(r, 1, 'Left out of the actual (priced by another template or an add-on)').font = BOLD; r += 1
    for j in ac.INTAKE:
        x = ac.excluded(j)
        if x:
            cb.cell(r, 1, j).font = font(); cb.cell(r, 3, '; '.join(f'{n} ${p:,.0f}' for n, p in x)).font = font(); r += 1
    cb.cell(r, 1, 'Left out of the model (the estimate carried these at $0)').font = BOLD; r += 1
    for j, lines in ac.NOT_PRICED.items():
        cb.cell(r, 1, j).font = font(); cb.cell(r, 3, ', '.join(lines)).font = font(); r += 1
    r += 1
    for t in ("Rebuilt inputs to note: 246466 and 258551 carry the SF torn down that matches their demolition hours; 258410 carries "
              "21 extra siding squares from its house-wrap line (28 squares against 7 for the addition).",
              "260109's framing package bundled its roof, siding and window materials, so its blocks shift while its total holds.",
              "Not used: 260820 (porch repair), 261340 (garage conversion), 261265 (pole building), 261377 (siding only), "
              "261089 and 260056 (remodels). Kay Oss jobs are test jobs."):
        cb.cell(r, 1, t).font = GREY; r += 1
    cb.column_dimensions['A'].width = 16; cb.column_dimensions['C'].width = 44
    for k in range(4, 12): cb.column_dimensions[L(k)].width = 12
    cb.freeze_panes = 'B7'


EXAMPLE = {'Addition Width': 20, 'Addition Depth': 16, 'Addition Crawl Space': 1, 'Addition Roof Tie-In': 1,
           'Addition Electrical': 1, 'Addition Drywall': 1, 'Addition Living Space': 1, 'Addition Windows': 4,
           'Addition Patio Doors': 1, 'Addition Wall Openings': 1, 'Addition HVAC Extend': 1}

if __name__ == '__main__':
    print(workbook.build(dict(module=am, room='Addition', prefix='Addition ', codes=CODES, notes=NOTES, readme=README,
        example=EXAMPLE, example_desc='a 16 x 20 family room on a crawl space with four windows and a patio door',
        range=0.20, range_note='Additions are quoted at ±20% and always go on to the Design & Pricing Agreement.',
        phases=(am.P1, am.P2, am.P3, am.P4), calibration=calibration, filename='addition-ballpark-template.xlsx')))
