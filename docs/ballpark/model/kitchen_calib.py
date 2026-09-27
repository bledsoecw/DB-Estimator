'''Check the kitchen template against DB's kitchen estimates.

Only two full kitchens have been estimated (both pending, both premium), so this is a
sanity check, not a calibration. Component rates are also checked against the kitchen
lines inside three larger bids.'''
import re, pathlib, statistics as st
import engine, kitchen_model as km

ROOT = pathlib.Path(__file__).resolve().parents[3]
docs = {d['job']: d for d in engine.load_estimates(ROOT / 'local' / 'kitchen-estimates.txt')}


def I(**kw):
    P = {k: 0 for k in engine.defaults(km)}
    P.update({'Kitchen Dumpster Loads': 1})
    for k, v in kw.items():
        name = 'Kitchen ' + k.replace('__', '-').replace('_', ' ')
        if name not in P:
            raise KeyError(f'{name!r} is not a kitchen parameter')
        P[name] = v
    return P


# Intake reconstructed from each estimate's own lines (quantities, hours, descriptions)
INTAKE = {
 '261384': I(Floor_Area=181, Full_Gut=1, Cabinet_Run=34, Island_Length=8, Backsplash=1,
             Appliances_Supplied=1, Appliances_Installed=4, Fixtures_Replaced=2, Fixtures_Relocated=1,
             Light_Fixtures=1, Recessed_Lights=4, Circuits_Added=3, Subfloor_Repair_Area=80, Exterior_Doors=1),
 '261062': I(Floor_Area=200, Full_Gut=1, Cabinet_Run=28, Island_Length=6, Backsplash=1,
             Appliances_Supplied=2, Appliances_Installed=4, Fixtures_Replaced=3, Fixtures_Relocated=1,
             New_Flooring_Area=460, Light_Fixtures=2, Recessed_Lights=6, Circuits_Added=4,
             Under__Cabinet_Lighting=1, Walls_Moved=2, Interior_Doors=1, Dumpster_Loads=3),
}
# Tier each estimate used, read from its own products
TIER_OF = {'261384': {'*': 'Best'}, '261062': {'*': 'Best', 'Flooring Material': 'Better', 'Flooring Labor': 'Better', 'Backsplash': 'Better'}}
SEL = r'^(Cabinetry|Countertop Sub|Backsplash|Tile Sub|Faucet/Kit|Sink|Garbage Disposal|Cooking Hood|Refrigerator|Microwave|Flooring|Lighting|Undercabinet Lighting)$'


def split(d):
    design = sum(p for n, t, p, q in d['items'] if n.startswith('Designer'))
    sel = sum(p for n, t, p, q in d['items'] if re.match(SEL, n))
    return d['price'] - design, d['price'] - design - sel


def structure_model(P, tiers):
    return sum(r[5] for r in km.price(P, tiers, True) if r[0] != 'Selections' or r[2] == 'L')


# Component checks: (source, what, actual $, model $)
def components():
    L = engine.LAB; M = engine.MARK
    out = []
    cab = {t: c * M[ty] for t, (c, ty) in dict((n, cs) for n, u, f, cs, al in km.TIERS)['Cabinets'].items()}
    top = {t: c * M[ty] for t, (c, ty) in dict((n, cs) for n, u, f, cs, al in km.TIERS)['Countertops'].items()}
    out += [('261268 whole-house remodel', 'Cabinets $/LF (Better)', 24360 / 28, cab['Better']),
            ('258551 kitchen addition', 'Cabinets $/LF (Best)', 35340 / 30, cab['Best']),
            ('258811 apartment kitchens', 'Countertop $/SF (Good, laminate)', 590.63 / 17.5, top['Good']),
            ('261268 whole-house remodel', 'Countertop $/SF (Best, quartz)', 9744 / 56, top['Best']),
            ('258551 kitchen addition', 'Countertop $/SF (Best, quartz)', 10160.25 / 60, top['Best']),
            ('261268 whole-house remodel', 'Cabinet install hours, 28 LF (Better)', 40, 4 + -(-1.3 * 28 // 1)),
            ('258551 kitchen addition', 'Cabinet install hours, 30 LF (Best)', 72, 4 + -(-1.5 * 30 // 1))]
    return out


def report():
    print(f"{'job':7} {'actual':>8} | {'struct act':>10} {'struct mdl':>10} {'err':>6} | {'Good':>8} {'Better':>8} {'Best':>8} | {'at its tier':>11} {'err':>6}")
    for j, P in INTAKE.items():
        a, sa = split(docs[j])
        sm = structure_model(P, TIER_OF[j])
        t = {x: km.price(P, x) for x in engine.T}
        mt = km.price(P, TIER_OF[j])
        print(f"{j:7} {a:>8,.0f} | {sa:>10,.0f} {sm:>10,.0f} {(sm-sa)/sa:>+6.0%} | {t['Good']:>8,.0f} {t['Better']:>8,.0f} {t['Best']:>8,.0f} | {mt:>11,.0f} {(mt-a)/a:>+6.0%}")
    print()
    for src, what, a, m in components():
        print(f"{src:28} {what:40} actual {a:>8,.1f} model {m:>8,.1f} {(m-a)/a:+.0%}")


if __name__ == '__main__':
    report()
