"""Shared pricing engine for the ballpark templates.

A template module defines PARAMS, COMMON and TIERS. Formulas use only the grammar DB's live
JobTread formulas use: + - * / ( ) round() ceil() and {Parameter Name}.
"""
import math, re

LAB = 55.0                                        # DB catalog labor cost per hour ($100 price)
MARK = {'L': 100/55, 'M': 1.45, 'S': 1.30, 'O': 1.45}   # price / cost by cost type
T = ('Good', 'Better', 'Best')
PRICE_OVERRIDE = {'Hauling & Disposal': 450}      # DB's existing catalog item: $250 cost / $450 price


def ev(expr, P):
    e = re.sub(r'\{([^}]+)\}', lambda m: repr(float(P[m.group(1)])), expr)
    return eval(e, {'ceil': math.ceil, 'round': lambda x: math.floor(x + 0.5)})


def price(m, P, tier, detail=False):
    """Price template module m for parameters P.

    tier is 'Good' | 'Better' | 'Best', or a dict {line name: tier, '*': default tier}
    so calibration can mix tiers the way a real estimate does."""
    rows = []
    for g, sg, n, t, u, f, c in m.COMMON:
        q = ev(f, P)
        up = PRICE_OVERRIDE.get(n, c * MARK[t])
        rows.append((g, n, t, q, c, q * up))
    for n, u, f, cs, al in m.TIERS:
        tt = tier if isinstance(tier, str) else tier.get(n, tier['*'])
        ff = f if isinstance(f, str) else f.get(tt, '0')
        q = ev(ff, P)
        c, t = cs[tt]
        rows.append(('Selections', n, t, q, c, q * c * MARK[t]))
    return rows if detail else sum(r[5] for r in rows)


def defaults(m):
    return {k: d for k, _, d, _ in m.PARAMS}


def load_estimates(path):
    """Read a line-item file: '## job | status | price | description' headers, then
    'name|type|price|qty' lines. Raw files live in local/ and are never committed."""
    docs, cur = [], None
    for line in open(path):
        line = line.rstrip('\n')
        if line.startswith('## '):
            job, status, price, desc = [s.strip() for s in line[3:].split('|', 3)]
            cur = dict(job=job, status=status, price=float(price), desc=desc, items=[])
            docs.append(cur)
        elif '|' in line and cur:
            n, t, p, q = line.split('|')
            cur['items'].append((n, t, float(p), float(q)))
    return docs
