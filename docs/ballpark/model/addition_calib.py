'''Check the addition template against DB's addition estimates.

Eight estimates: six signed, one pending, one lost. Each is compared like for like:
  - actual = estimate total less work another template or an add-on prices (design fee,
    decks, the bathroom or kitchen finishes inside the addition), listed in EXCLUDE;
  - model = template total less any line the estimate carried at $0 or left to the
    customer (NOT_PRICED), so a line nobody priced is not counted as template error.
Intake was reconstructed from each estimate's own lines and descriptions, so this checks
that the template can express DB's pricing. It is not an out-of-sample test.
Line totals live in local/addition-estimates.txt (DB pricing data, never committed).'''
import pathlib, statistics as st
import engine, addition_model as am

ROOT = pathlib.Path(__file__).resolve().parents[3]
docs = {d['job']: d for d in engine.load_estimates(ROOT / 'local' / 'addition-estimates.txt')}


def I(**kw):
    P = {k: 0 for k in engine.defaults(am)}
    P.update({'Addition Stories': 1, 'Addition Wall Height': 8, 'Addition Dumpster Loads': 1,
              'Addition Service Zone': 1, 'Addition Permit Fee': 200})
    for k, v in kw.items():
        name = 'Addition ' + k.replace('__', '-').replace('_', ' ')
        if name not in P:
            raise KeyError(f'{name!r} is not an addition parameter')
        P[name] = v
    return P


# Intake reconstructed from each estimate's lines and scope description.
INTAKE = {
 '258410': I(Width=20, Depth=21, Crawl_Space=1, Site_Excavation=1, Roof_Tie__In=1, Electrical=1, Drywall=1,
             Living_Space=1, Windows=5, Exterior_Doors=1, Interior_Doors=4, Wall_Openings=1, Plumbing_Fixtures=4,
             HVAC_New_Unit=1, Extra_Siding_Squares=21),
 '25-8197': I(Width=22, Depth=36, Crawl_Space=1, Roof_Tie__In=1, Patio_Doors=1, Wall_Openings=1,
              Electrical=0, Drywall=0, Living_Space=0),
 '261040': I(Width=13, Depth=22, Piers=3, Roof_Tie__In=1, Electrical=1, Drywall=0, Living_Space=0, Wall_Openings=0),
 '261094': I(Width=24, Depth=24, Detached=1, Slab=1, Site_Excavation=1, Roof_Tie__In=0, Electrical=1, Drywall=1,
             Living_Space=0, Exterior_Doors=1, Garage_Doors=2, Wall_Openings=0, HVAC_New_Unit=1, Utility_Trench=80),
 '260109': I(Width=14, Depth=24, Detached=1, Slab=1, Roof_Tie__In=0, Electrical=1, Drywall=1, Living_Space=0,
             Windows=2, Exterior_Doors=1, Wall_Openings=0, Utility_Trench=50),
 '246466': I(Width=18, Depth=20, Crawl_Space=1, Roof_Tie__In=1, Electrical=1, Drywall=1, Living_Space=1,
             Windows=10, Exterior_Doors=1, Patio_Doors=1, Wall_Openings=1, HVAC_New_Unit=1, Structure_Removed=130),
 '258551': I(Width=21, Depth=13, Crawl_Space=1, Roof_Tie__In=1, Electrical=1, Drywall=1, Living_Space=1,
             Windows=1, Exterior_Doors=2, Wall_Openings=1, Plumbing_Fixtures=2, HVAC_New_Unit=1, Structure_Removed=114),
 '258684': I(Width=21, Depth=16, Crawl_Space=1, Roof_Tie__In=1, Electrical=1, Drywall=1, Living_Space=1,
             Windows=8, Patio_Doors=1, Wall_Openings=0, HVAC_Extend=1, Structure_Removed=333, Dumpster_Loads=2),
}
WHAT = {
 '258410': 'Finished 420 SF room on a crawl, with a bathroom; re-sided the house to match',
 '25-8197': '795 SF shell on a crawl, framed and dried in; customer finishes the inside',
 '261040': '286 SF porch-type room on piers; wired, not insulated',
 '261094': 'Detached 24x24 garage on a footed slab, drywalled, heated',
 '260109': 'Detached 14x24 garage on a footed slab, drywalled',
 '246466': 'About 360 SF sunroom on a crawl, with a stone-coated steel roof',
 '258551': '273 SF kitchen addition on a crawl',
 '258684': 'Tear-down and rebuild of a 333 SF sunroom, with a PVC roof deck and deck work',
}
# Tier each estimate used, read from its products (shingle line, siding line, window and door prices)
TIER_OF = {j: {'*': 'Good'} for j in INTAKE}
TIER_OF['258410'] = {'*': 'Good', 'Siding Material': 'Better'}   # its siding ran about $510 a square, price
TIER_OF['246466'] = {'*': 'Better', 'Roofing Material': 'Best', 'Roofing Install': 'Best', 'Patio Door': 'Good'}
TIER_OF['258684'] = {'*': 'Best'}

# Work in the estimate that this template does not price (dollars, price): cost codes, then named lines.
EXCLUDE_CODES = ('Design', 'Cabinetry', 'Shower/Tub', 'Closet Organization', 'Specialites', 'Deck', 'Appliances')
EXCLUDE_LINES = {
 '258410': [('Bathroom fixtures and trim (toilet, faucets, shower trim)', 3037.39 - 130.15)],
 '246466': [('Composite deck, 196 SF', 8500.52)],
}
# Template lines the estimate carried at $0 or left to the customer.
NOT_PRICED = {
 '260109': ['Insulation - Sub'],
 '261094': ['Insulation - Sub', 'Siding Material', 'Siding Labor', 'House Wrap Labor', 'Siding Labor for Flashing', 'Roofing Material',
            'Roofing Install', 'Gutters & Downspouts', 'Gutter Labor', 'Soffit & Fascia Material',
            'Fascia and Soffit Install', 'Garage Door', 'Garage Door Wrapping', 'Exterior Door & Lockset', 'Door Labor'],
}
OUTLIER = {'258684'}   # a rebuild with deck work and a PVC roof deck: shown, not counted
RANGE = 0.20           # the budget band quoted for additions

# Blocks for the line-level check: DB cost codes on the estimate, and template line-name prefixes.
BLOCKS = [
 ('Foundation & site', ('Concrete', 'Excavation', 'Masonry'), ('Concrete', 'Pier', 'Excavation', 'Rental - Mini')),
 ('Framing', ('Framing/Sheeting', 'Woods & Plastics'), ('Framing', 'Header')),
 ('Roofing & gutters', ('Roofing', 'Uncategorized'), ('Roofing', 'Gutter')),
 ('Siding, soffit & fascia', ('Siding',), ('Siding', 'Soffit', 'Fascia', 'House Wrap')),
 ('Windows & doors', ('Windows', 'Doors'), ('Window', 'Door', 'Patio', 'Garage', 'Exterior', 'Interior Door')),
 ('Insulation, drywall, paint, floor, trim', ('Drywall', 'Painting', 'Finishes', 'Flooring', 'Interior Trim/Casing/Paneling'),
  ('Insulation', 'Drywall', 'Paint', 'Flooring', 'Trim')),
 ('Electrical, plumbing & HVAC', ('Electrical', 'Mechanical (Plumbing & HVAC)'), ('Electrical', 'Plumbing', 'HVAC')),
 ('Demolition & general', ('Demolition', 'Permits', 'Project Management', 'Site Prep/Clean Up', 'Site Construction',
   'Hauling & Disposal (Direct)', 'General Requirements', 'Utility Connection'),
  ('Demolition', 'Permit', 'Project', 'Site Prep', 'Rentals', 'Hauling', 'Final', 'Travel', 'Utility')),
]


def excluded(j):
    d = docs[j]
    codes = [(n, p) for n, t, p, q in d['items'] if n in EXCLUDE_CODES and p]
    out = {}
    for n, p in codes: out[n] = out.get(n, 0) + p
    return list(out.items()) + EXCLUDE_LINES.get(j, [])


def actual(j):
    return docs[j]['price'] - sum(p for n, p in excluded(j))


def model(j, tier=None):
    rows = am.price(INTAKE[j], tier or TIER_OF[j], True)
    return sum(r[5] for r in rows if r[1] not in NOT_PRICED.get(j, ()))


def results():
    out = []
    for j in INTAKE:
        a = actual(j); m = model(j)
        band = {t: model(j, t) for t in engine.T}
        out.append(dict(job=j, status=docs[j]['status'], what=WHAT[j], actual=a, model=m, err=(m - a) / a,
                        sf=INTAKE[j]['Addition Width'] * INTAKE[j]['Addition Depth'] * INTAKE[j]['Addition Stories'],
                        in_band=band['Good'] * (1 - RANGE) <= a <= band['Best'] * (1 + RANGE), **band))
    return out


def blocks(j):
    '''Actual and model dollars by block. DB filed the insulation sub under Siding on some
    estimates; it is moved to the interior block here. Excluded work is left out of both.'''
    a = {b: 0.0 for b, _, _ in BLOCKS}; m = dict(a)
    code = {c: b for b, cs, _ in BLOCKS for c in cs}
    for n, t, p, q in docs[j]['items']:
        if n in code:
            b = BLOCKS[5][0] if (n, t) == ('Siding', 'Subcontractor') else code[n]
            a[b] += p
    for n, p in EXCLUDE_LINES.get(j, []):
        a[BLOCKS[6][0] if 'Bathroom' in n else BLOCKS[1][0]] -= p
    for r in am.price(INTAKE[j], TIER_OF[j], True):
        if r[1] in NOT_PRICED.get(j, ()): continue
        b = next(b for b, _, ps in BLOCKS if r[1].startswith(ps))
        m[b] += r[5]
    return a, m


def block_err(ab, b):
    '''Formatted block error; '-' when the estimate had under $500 there or left the block unpriced.'''
    a, m = ab[0][b], ab[1][b]
    return '-' if a < 500 or m == 0 else f'{(m - a) / a:+.0%}'


def report():
    R = results()
    print(f"{'job':8} {'status':8} {'SF':>4} {'actual':>9} {'model':>9} {'err':>6} {'$/SF':>5} | {'Good':>9} {'Better':>9} {'Best':>9}")
    for r in R:
        flag = ' (outlier, not counted)' if r['job'] in OUTLIER else ''
        print(f"{r['job']:8} {r['status']:8} {r['sf']:>4} {r['actual']:>9,.0f} {r['model']:>9,.0f} {r['err']:>+6.0%} "
              f"{r['actual']/r['sf']:>5.0f} | {r['Good']:>9,.0f} {r['Better']:>9,.0f} {r['Best']:>9,.0f}{flag}")
    C = [r for r in R if r['job'] not in OUTLIER]
    e = [abs(r['err']) for r in C]
    print(f"\ncounted: {len(C)}  median |err| {st.median(e):.0%}  bias {st.median([r['err'] for r in C]):+.0%}  "
          f"within 15%: {sum(x <= .15 for x in e)}  within 20%: {sum(x <= .20 for x in e)}  within 25%: {sum(x <= .25 for x in e)}")
    print(f"in the Good-to-Best band (±{RANGE:.0%}): {sum(r['in_band'] for r in C)} of {len(C)}\n")
    print(f"{'block':40}" + ''.join(f"{j:>10}" for j in INTAKE))
    B = {j: blocks(j) for j in INTAKE}
    for b, _, _ in BLOCKS:
        print(f"{b:40}" + ''.join(f"{block_err(B[j], b):>10}" for j in INTAKE))
    for j in INTAKE:
        x = excluded(j)
        if x: print(f"  {j} excluded: " + '; '.join(f'{n} ${p:,.0f}' for n, p in x))


if __name__ == '__main__':
    report()
