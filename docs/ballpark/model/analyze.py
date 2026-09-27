'''Parse the bathroom estimate line items and bucket each line into a scope module.
The raw line items are DB pricing data and are NOT committed (see .gitignore). They live in
local/bathroom-estimates.txt; re-pull them from JobTread with the grouped costItems query in
docs/ballpark/bathroom.md.'''
import re, statistics as st, json, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[3]
DATA=ROOT/'local'/'bathroom-estimates.txt'
OUT=ROOT/'local'/'bathroom-estimates.json'
docs=[]; cur=None
for line in open(DATA):
    line=line.rstrip('\n')
    if line.startswith('## '):
        job,status,price,desc=[s.strip() for s in line[3:].split('|',3)]
        cur=dict(job=job,status=status,price=float(price),desc=desc,items=[]); docs.append(cur)
    elif '|' in line and cur:
        n,t,p,q=line.split('|'); cur['items'].append((n,t,float(p),float(q)))
RULES=[ # order matters
 ('design', r'^Designer'),
 ('travel', r'^Travel'),
 ('gen_req', r'^(Permit|Project Management|Site Prep|Final Clean|Hauling|Sales On-Site|GR |Misc\. Labor)'),
 ('demo', r'^Demolition'),
 ('shower', r'(Walk-In Shower|Bathtub|Shower|Glass|Tile Surround|Onyx|Tile Sub$|^Tile$|Stone Mortar|Valve|Handheld|MAIN shower|UPSTAIRS tub)'),
 ('vanity', r'(Vanity|Countertop|Sink|Cabinet|Cabinetry|Faucet/Kit - Vanity|Mirror)'),
 ('toilet', r'^(Toilet|Bowl|Tank|Seat|Wax Seal|Bolts|Flex Connection)$'),
 ('fixture_faucets', r'^Faucet/Kit$'),
 ('framing', r'(Framing|2x4|Lumber|Fastener|Sheathing|House Wrap|Corner Bead)'),
 ('plumbing', r'^(Plumbing|HVAC)'),
 ('electrical', r'(Electrical|Lighting|Outlet|Switch|Can Lights|Bathroom Fan)'),
 ('drywall_paint', r'(Drywall|Paint|Primer|Prime and Paint)'),
 ('flooring', r'(Flooring|LVT|Tile Sub - Flooring)'),
 ('doors_trim', r'(Door|Trim|Handle|Lockset|Jamb|Quarter Round|Casing|Window Labor|Miscellaneous MAT|Siding)'),
 ('accessories', r'(Accessor|Grab Bar)'),
 ('other', r'.'),
]
def bucket(n):
    for b,rx in RULES:
        if re.search(rx,n): return b
out=[]
VERBOSE=__name__=='__main__'
for d in docs:
    B={}
    for n,t,p,q in d['items']:
        b=bucket(n)
        # Faucet/Kit (plain) -> shower valve kit if no separate vanity faucet; treat as fixtures
        B[b]=B.get(b,0)+p
    tot=sum(B.values()); d['buckets']=B; d['sum']=tot
    if VERBOSE: print(f"{d['job']:8} {d['status']:8} doc ${d['price']:>9,.0f} sum ${tot:>9,.0f} diff {d['price']-tot:>7.2f}")
    if VERBOSE: print('   ', ', '.join(f"{k} {v:,.0f}" for k,v in sorted(B.items(), key=lambda x:-x[1])))
json.dump(docs, open(OUT,'w'), indent=1)
