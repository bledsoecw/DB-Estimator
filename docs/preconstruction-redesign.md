# Pre-Construction Redesign — Budget First, Design Second, Documents After Contract

**Deitemeyer Brothers · General Construction · 2026-09-27 · decisions recorded 2026-09-28 (§9)**

> A proposal to replace the Preliminary Building Agreement (PBA) with a budget-first path
> that gives customers a tight number *before* asking them to pay for design, and that
> stops spending designer hours on prospects who have not yet decided to build.
> Every number tagged **VERIFIED** was read directly from JobTread organization
> `22PBAjem8SSC` on 2026-09-27. Customer names are omitted; jobs are referenced by
> JobTread job number only, per this repository's no-customer-data rule.

Companions: `ROADMAP.md` (the estimator build plan; §1.2 and §2.7 are the parts this
document leans on) and `jobtread-api-field-notes.md`.

---

## 0. The short version

1. **The PBA is losing prospects at the ask, not after it.** VERIFIED: of 48 general-construction
   prospects presented a PBA since January, 26 never signed it and 19 of those are already
   marked Lost or Dead Lead. Of the 22 who did sign, DB has won 9 contracts worth $765K and
   lost 5, with 8 still in design or estimating. Once a customer signs, DB converts about
   two in three. The leak is the 54% who walk before signing.
2. **The PBA asks customers to pre-pay for construction documents.** The fee is designer
   hours at $125, and the largest block of hours on every PBA is the Construction Document
   phase, which is needed to *build* the job, not to *price* it. A customer deciding whether
   to spend $60K is being asked for $3,500 to fund drawings for a project they have not
   agreed to.
3. **The belief that a firm price needs a full design is wrong for most of DB's work.**
   A fixed price needs a defined scope, quantities, an allowance schedule, a named contingency
   and the unforeseen-conditions clause DB's contract already carries. It does not need
   construction documents. Bathrooms, kitchens and additions can be priced at concept level
   with allowances, and construction documents produced after signing, paid for by the deposit.
4. **A tighter ballpark is achievable inside JobTread today, without a developer.** DB already
   runs a formula-driven assembly engine for roofing (`ROADMAP.md` §1.2). The three ballpark
   templates for bathrooms, kitchens and additions are drafted (`ballpark/`), each with a
   two-page intake sheet, and checked against DB's own estimates (§4.4).
5. **Replace the PBA with a small, fixed, fully credited Design & Pricing Agreement** that is
   offered only *after* the customer has accepted a budget range (±15% for bathrooms, ±20% for
   kitchens and additions to start), caps designer hours, and delivers a fixed-price proposal.
   Construction documents move into the construction contract.
6. **Carl made the ten open decisions on 28 Sep 2026** (§9): fees and hour caps, a visible
   contingency, allowances at customer price, a published price guide including kitchens, and
   new terms for the eight PBAs in progress.

---

## 1. What JobTread says today

### 1.1 The PBA funnel — VERIFIED

Every general-construction job that has a customer order named "PBA" (59 documents across
53 jobs; 4 roofing jobs and 1 test job excluded):

| Stage | Count | Notes |
|---|---|---|
| Prospects presented a PBA | 48 | Jan 15 – Sep 1, 2026 |
| Signed the PBA | 22 (46%) | Fee median $3,500; range $840–$8,000; total $82,340 |
| Did not sign | 26 (54%) | 5 explicitly declined, 21 left pending or in draft. Fee median $3,500; range $1,000–$12,500 |
| Of the 26 who did not sign: Lost / Dead Lead | 19 | Zero contracts |
| Of the 26 who did not sign: still open | 7 | 3 currently "PBA Out" |
| Of the 22 who signed: contract approved | 9 | $764,884 of construction contracts |
| Of the 22 who signed: Lost / Dead Lead | 5 | Three of these had an estimate delivered or drafted |
| Of the 22 who signed: still in design / estimating | 8 | Includes one $278K estimate out for decision |

Read together: **signed PBA → contract converts at 64% (9 of 14 resolved).** Unsigned PBA
converts at 0%. The fee level is not what separates the two groups (medians are identical at
$3,500). What separates them is whether the customer believed the number enough to pay for
the next step.

By project type the pattern is the same:

| Project type | PBAs presented | Signed | Signed rate |
|---|---|---|---|
| Bathrooms | 17 | 7 | 41% |
| Additions (incl. garages) | 15 | 7 | 47% |
| Interior remodel / other | 16 | 8 | 50% |

Ten bathroom prospects were asked for a $1,000–$8,346 PBA and walked. VERIFIED: the nine
bathrooms DB actually signed this year range from $10K to $42K with a median of $23.5K. A
$1,000 design gate in front of a $23K bathroom is friction the current classification
imposes because the job crosses the $20,001 "Medium" line, not because a bathroom with fixed
plumbing locations needs drawings to price.

### 1.2 What the PBA fee is actually buying — VERIFIED

Every PBA is priced from the catalog group `PBA (Preliminary Building Agreement)`
(`22PPB363cpwn`): four labor lines, cost $100/h, price $125/h, no formulas, no defaults.

| Line | What it covers | Typical hours quoted |
|---|---|---|
| Designer – Schematic | Scope meeting, site inspection, photo report, 2-D preliminary plans, one revision, **a preliminary ballpark estimate** | 4–16 |
| Designer – Developmental | Selections meetings, refined plans with MEP siting, one revision, a finalized quoted estimate | 2–16 |
| Designer – Con Docs | Full construction document set, fully dimensioned | 4–60 |
| Designer – 3D Rendering (optional) | One rendered view | 4–40 |

On the two largest signed PBAs, Construction Documents were 20 of 40 hours and 32 of 96
hours. Under the PBA footer, the customer owes 90% of that fee before receiving any
deliverable if they do not build with DB. The customer is being asked to fund the
drawing set a crew would build from, before they have decided to build.

Note also that the Schematic line already promises "a preliminary ballpark estimate." So the
process today is: verbal ROM at ±30–50% → pay for a PBA → receive a ballpark. The thing the
customer needs in order to decide whether to pay is delivered *after* they pay.

### 1.3 Designer time on lost work — VERIFIED, with a caveat

Time entries against the `Design` cost code: 69 entries, 142 hours, four people.

| Where the hours went | Hours |
|---|---|
| Jobs that became contracts | 109 |
| Signed PBAs still open | 20 |
| Signed PBAs that were lost | 11 |
| Other | 3 |

The logged data does not show large designer losses on lost prospects: 11 hours across three
jobs. Either design time on lost jobs is not being logged (one $8,000 signed-and-lost PBA has
zero logged hours), or the real loss is smaller than it feels. **Either way, the measurable
cost of the PBA is lost customers, not lost hours.**

**Update 28 Sep 2026: the designer's own hours — VERIFIED.** Carl confirmed that every hour
DB's designer logs is design work, so all of the designer's time entries were pulled regardless
of cost code: 142 hours from 16 January to 22 September, of which 48 are PTO. That leaves
**94 design hours on 11 jobs**, and the entry notes name the phase of each one:

| Job | Concept and selections | Construction drawings | Total |
|---|---|---|---|
| 25-8538 pool house, won $190.8K | 6.8 h | 13.2 h | 20.0 h |
| 258410 addition, won $155.8K | 8.0 h | 8.2 h | 16.3 h |
| 258684 addition, won $186.1K | 5.5 h | 8.8 h | 14.2 h |
| 261040 addition, won $30.7K | 4.0 h | 6.5 h | 10.5 h |
| 258442 deck, won $59.2K | 3.0 h | 6.5 h | 9.5 h |
| 260503 addition, PBA signed, open | 7.0 h | – | 7.0 h |
| 260014 bathroom, won $38.9K | 4.4 h | 1.0 h | 5.4 h |
| 260032 remodel, PBA signed, lost | 5.0 h | – | 5.0 h |
| Three other jobs | 2.0 h | 4.0 h | 6.0 h |
| **Total** | **45.7 h** | **48.2 h** | **94 h** |

- **Half the logged time is construction drawings,** which the new process moves after the
  contract, funded by the deposit.
- **Concept work is small:** 3–8 hours a job. This sets the DPA hour caps (§3.2).
- **The logging is incomplete.** 94 hours in eight months is about 2.6 hours a week, and 14 of
  the 22 signed PBAs, including four $7,000 ones, show no hours from the designer. The fix
  (§9, decision 4) is to log every design session against the job from now on.

### 1.4 The size of the general-construction business this is for — VERIFIED

Approved construction "Estimate" documents of $6,000 or more, since the JobNimbus migration
(Nov 2025), excluding test data, change orders and mixed roofing jobs:

| Project type | Contracts | Min | P25 | Median | P75 | Max |
|---|---|---|---|---|---|---|
| Additions and new structures (additions, sunroom, garage, deck, porch) | 8 | $22.7K | $49.6K | $78.7K | $134.5K | $186.1K |
| Bathrooms | 9 | $10.0K | $16.1K | $23.5K | $38.0K | $41.9K |
| Interior remodel / other | 18 | $6.6K | $13.4K | $18.1K | $22.9K | $190.8K |
| Windows / doors | 7 | $6.1K | $7.5K | $11.6K | $21.8K | $29.1K |
| **Kitchens** | **0** | | | | | |

Forty-two contracts, $1.59M, ten months. Five of them, all additions or new structures,
are over $90K. Kitchens have **no approved history at all**: 19 kitchen-tagged jobs exist,
two kitchen estimates are out at $91K and $99K, none has closed. Any kitchen ballpark has to
start from a parametric template and outside benchmarks, and be calibrated as the first
kitchens close.

Two more facts frame the pipeline. VERIFIED: 555 customer orders sit in `pending` against
795 approved and 332 denied, so a large share of estimates go out and never get a decision.
And VERIFIED: 1,247 jobs carry the Status "Lost" and 107 "Dead Lead" against 14 in "Design",
3 in "PBA Out" and 0 in "PBA Sold" (the last three statuses are barely used, which means the
handbook's PBA statuses are not being worked in the CRM).

---

## 2. Why the PBA fails

**It asks for money before confidence.** The handbook's verbal range is ±30–50%. A customer
told "$60K to $120K" cannot judge whether a $3,500 fee is worth paying, so the rational
answer is no. Design-build firms that charge design fees successfully do it *after* the
customer has accepted a budget they believe.

**It bundles pricing design with building design.** Only the first few hours of the
Schematic line are needed to produce a fixed price. Developmental design and Construction
Documents exist to build the job. Bundling them into one pre-contract fee makes the fee
three to five times larger than it needs to be and makes every unsigned PBA look like a
design loss.

**The payment terms read as a trap.** "10% now, 90% due if you don't hire us, and no
deliverables until paid" is legally sensible and commercially hostile. Customers hear it as
a penalty for shopping.

**It is classified by dollar size, not by estimating uncertainty.** A $30K bathroom with
fixtures in place and a $30K bathroom with the shower moved are different estimating
problems; the $20,001 line does not see the difference. What actually forces design before
pricing is a short list of drivers: structural wall changes, fixture relocation, foundation
and roof tie-in, and mechanical relocation. The handbook's "typical examples" list already
knows this; the dollar bands contradict it.

**It confuses design with scope definition.** "We cannot give a not-to-exceed price without
designs" is true if the price must be drawing-bounded. A fixed price in residential remodeling
is scope-bounded: a written scope narrative, quantities off a dimensioned sketch, an allowance
for every selection not yet made, a named contingency, and the unforeseen-conditions and
material-escalation clauses DB's contract already has (§4.4 at $2.00/SF sheeting and $10.00/LF
lumber; §5.2 above 5%). That is exactly what "fixed price plus allowances" means in the
industry, and it is signed every day at concept stage.

---

## 3. The proposed path

Five stages. The customer pays nothing until they have a number they trust, and the designer
draws nothing until the customer has paid for it.

| Stage | Owner | Customer gets | Customer pays | Designer hours |
|---|---|---|---|---|
| 1. Discovery call | Sales | A **Price Guide range** for their project type (from §1.4 and the intake screen) | $0 | 0 |
| 2. Site visit → **Budget Range Estimate (BRE)** | Sales rep owns the 3-day clock; estimator reviews the number | A Good / Better / Best range at **±15%** (bathrooms) or **±20%** (kitchens, additions), on the existing Ballpark template, within 3 business days | $0 | 0 |
| 3. **Design & Pricing Agreement (DPA)** | Sales, designer, estimator | Existing-conditions measure, up to two concept layouts, a selections and allowance schedule, and a **fixed-price proposal** | Small fixed fee by type, **100% credited at contract** | Capped by type |
| 4. Construction Agreement | Sales, CGM | Fixed price + allowance schedule + named contingency; DD and CDs listed as Phase 1 deliverables | 10% deposit per existing schedule | DD + CDs, funded by the deposit |
| 5. Pre-production and build | PM | Confirmation measurements, CDs, selections finalized, kickoff | Per existing schedule | As needed |

### 3.1 What changes versus today

| Today | Proposed |
|---|---|
| Verbal ROM ±30–50% | Written BRE ±15–20%, Good/Better/Best, delivered in 3 days |
| PBA before any credible number | DPA only after the customer accepts the BRE |
| PBA fee = designer hours (median $3,500), 10%/90% terms | DPA fee fixed by type, paid in full at signing, fully credited |
| SD + DD + CDs + rendering before contract | Concepts only before contract; DD and CDs after |
| "Not-to-exceed" price seen as requiring full design | Fixed price with allowances and contingency at concept stage |
| Feasibility & Budget Study ($350, "do not use yet") | Retired; the free BRE does its job |
| Tier by dollar band ($20K / $200K) | Track by estimating drivers (§3.3) |
| PBA statuses in CRM unused | Four statuses: BRE Out, DPA Out, DPA Signed, Proposal Out |

### 3.2 The Design & Pricing Agreement

- **Fee.** Fixed per project type, not hourly. Set by Carl on 28 Sep 2026: bathroom $500,
  kitchen $950, addition or new structure $1,500, whole-house or new home quoted individually
  with a $2,500 minimum. These are roughly 1–2% of the median contract in each type, well
  under the 3–5% design fees that are common in design-build. They are low enough that a
  customer who accepted the BRE has no reason to balk, and high enough to filter people who
  were never going to build.
- **Paid in full at signing.** No 10/90. No deliverables held hostage. The customer keeps
  the concepts and the proposal whether or not they build with DB.
- **Credited 100% at contract signing**, as a line on the construction estimate. DB already
  does this today via a negative change order (VERIFIED on two won bathrooms); make it a
  standard line instead.
- **Time-boxed.** Two concept layouts, one revision round, and a hard cap on designer hours
  by type: bathroom 6, kitchen 10, addition 12. The designer's logged concept work ran 3–8
  hours a job (§1.3); the caps add room for a site measure and the revision. At $125 an hour
  the addition fee covers its full cap. Past the cap, the customer buys more hours at $125 or
  moves to contract. The cap is what protects the designer.
- **Deliverables.** Existing-conditions measure and photo report, concept plan(s) with
  dimensions sufficient to quantify, a selections list with allowance amounts and the
  allowance type shown, and a fixed-price proposal on the Const-Med or Const-Large template
  with a validity date.
- **Renderings** are not in the DPA. They are an optional add-on after contract.

### 3.3 Which track a project takes

Replace the dollar bands with a driver screen the sales rep completes at the site visit.
A project needs a DPA if **any** of these is true; otherwise it goes straight from BRE to a
fixed-price proposal.

| Driver | Needs a DPA |
|---|---|
| Any structural wall removed or opened | Yes |
| Plumbing fixtures relocated (not replaced in place) | Yes |
| New foundation, footing, or roof tie-in | Yes |
| Mechanical (HVAC) extended or relocated beyond a register move | Yes |
| Cabinet layout changed (kitchen) or room footprint changed | Yes |
| Replacement in place: shower, tub, vanity, countertop, flooring, windows, doors, siding | No |
| Full gut with fixtures in place | No |

This is the handbook's own "typical examples" list, promoted from illustration to rule.
Every addition has a new foundation and a roof tie-in, so every addition takes the DPA. The
addition intake sheet asks a different screen instead: whether the job belongs on the
exception track below.

### 3.4 Exceptions

New homes, additions with structural unknowns, and commercial work keep a two-step:
a larger DPA (quoted, still credited), then a construction agreement with a **design-to-budget
clause**: if pricing at CD completion exceeds the contract by more than a stated percentage
for reasons other than customer-requested changes or unforeseen conditions, the customer may
cancel and keep the documents, and DB absorbs its own estimating miss. That is the risk-sharing
that makes signing at concept stage fair on the customer side and disciplined on DB's.

---

## 4. How to get a ±15% ballpark without a designer

### 4.1 The mechanism already exists

`ROADMAP.md` §1.2 established (VERIFIED) that DB runs a working parametric estimating engine
inside JobTread: 101 catalog items carry a `quantityFormula`, 4,684 job-budget lines resolve
to a real quantity from it, across 185 jobs, and the computed quantity and price flow through
to the customer document automatically. It is in daily use on roofing, driven by HOVER
measurement variables. The general-construction side has six unpriced stubs. The ballpark
assemblies proposed here are the first three real general-construction entries in that
library.

The roadmap's open question is now answered (VERIFIED 2026-09-27): **the variable values are
JobTread job parameters** (`job.parameters`), the same mechanism roofing uses. The templates
built on it, each with its intake sheet and checks, are in
[`ballpark/bathroom.md`](ballpark/bathroom.md), [`ballpark/kitchen.md`](ballpark/kitchen.md) and
[`ballpark/addition.md`](ballpark/addition.md).

### 4.2 The Scope Intake sheet

Two pages per project type, completed by the sales rep at the site visit alongside the photos
and measurements the handbook already requires. The drafted sheets are in `ballpark/`: the
bathroom sheet has 22 measurements, the kitchen 21 and the addition 28, each printed beside
its JobTread parameter name. This was the starting outline:

**Bathroom.** Floor area (SF). Fixture count. Fixtures relocated (count). Tub-to-shower
conversion (Y/N). Shower type (Onyx or Al-Co panel / tile). Vanity length (LF). Walls moved
(count). Window or door changes (count). Exhaust fan new or replaced. Electrical circuits
added. Supply piping type (copper, PEX, galvanized). Subfloor condition observed. Tier
(Good / Better / Best).

**Kitchen.** Floor area (SF). Base cabinet LF, upper cabinet LF, island (Y/N, LF).
Layout change (Y/N) and fixtures relocated (count). Walls removed (count, structural Y/N).
Countertop LF and material class. Appliance package (existing / new, allowance tier). Flooring
SF and whether contiguous with adjoining rooms. Lighting fixtures (count). Electrical service
adequate (Y/N). Window or door changes (count). Tier.

**Addition or new structure.** Footprint SF and stories. Foundation type (slab / crawl /
basement). Roof tie-in complexity (none / simple gable / cross-gable or valley). Wet (Y/N)
and fixture count. HVAC (extend existing / new unit). Exterior match (siding / brick / stone).
Windows and exterior doors (count). Interior finish level. Site: excavation, utility
relocation, access. Tier.

### 4.3 The Ballpark assembly in JobTread

For each type, a catalog cost group (for example `BALLPARK — Bathroom`) whose lines are
formula-driven off the intake variables, using the existing 709-item catalog for unit
pricing where a real item exists and a stated allowance where it does not. A few real lines
from the drafted bathroom template:

```
Demolition               6 + 10*{Bath Full Gut}                          Hours   $55 / $100
Plumbing Labor           3 + round(2.5*{Bath Fixtures Replaced})         Hours   $55 / $100
                           + 4*{Bath Fixtures Relocated}
Hauling & Disposal       {Bath Dumpster Loads}                           Each    $250 / $450
Walk-In Shower System    {Bath Walk-In Shower}                           Each    Good $1,390 · Better $3,380 · Best $8,800 (sub)
Contingency — Good       {Bath Contingency Rate}/100*( ...the tier's subtotal... )   $1.00 at cost
```

Each tier carries its own **Contingency** line (§9, decision 2). JobTread formulas can
reference job parameters but not other lines, so its formula spells out the tier's subtotal;
the build scripts generate it.

Good / Better / Best is a native JobTread selection group (`isSimpleSelection`, min/max
selections), so the customer sees three totals on one document. The output lands on the
existing **Ballpark** template (`22PHqjjFH3XC`), whose description and footer already say
the right things: non-binding, includes typical design, permits, labor, materials and
standard contingencies, excludes atypical structural work and unforeseen conditions, valid
15 days. Change one word in it: "an early ballpark number" becomes "a budget range."

Allowance lines must carry an explicit `allowanceType` (`cost`, `costAndFee` or `price`).
`ROADMAP.md` §9.3 and Question 20 explain why: a $4,500 allowance stated as a cost budget and
the same figure stated as a customer price differ by DB's full markup, invisibly. **Decided
28 Sep 2026: `price`** (§9, decision 3).

### 4.4 Calibrate before trusting it

Done for all three templates, against DB's own estimates, with the intake values rebuilt
from each estimate's lines:

| | Checked against | Result (before contingency) | Band |
|---|---|---|---|
| Bathroom | 17 bathroom estimates, Jan–Sep 2026 | 17 of 17 inside the Good-to-Best band; everything but the finish selections within ±15% on 13 of 17 | ±15% |
| Kitchen | 2 full kitchens (both pending), plus kitchen lines in 3 larger bids | Both within 5% at the tier quoted | ±20% |
| Addition | 8 addition estimates, 6 signed | 7 of 7 within ±15%, median 9%; a sunroom tear-down is outside the template's scope | ±20% |

All three checks are **in-sample**: the inputs were rebuilt from the same estimates, and some
rates were set from them. Accept a template for live use when at least 8 of its next 10 jobs
land within its band of the signed price. Re-run the kitchen check once three kitchens have
closed.

### 4.5 Keep it honest

Add two job custom fields: `BRE Mid` and `BRE Date`. When a contract is approved, the
estimator records the variance. Review the variance table monthly. Any type drifting past
its band on more than a third of its jobs gets its assembly re-priced. This is the same
feedback loop the roadmap's Phase 8 automates; doing it by hand for three project types
costs an hour a month and produces the calibration data that phase would otherwise wait
two years for.

---

## 5. Pricing firm at concept stage — the checklist

A fixed-price proposal issued from a DPA must contain all of the following. This is what
replaces "we need the full design first."

1. **Scope narrative** written from the concept plan, room by room, with explicit inclusions
   and exclusions. The Const-Med template's client note already sets up the 10–20% buffer
   conversation; keep it.
2. **Quantities** taken off the dimensioned concept sketch and the intake sheet, through the
   same assembly used for the ballpark, now at concept resolution.
3. **Allowance schedule** for every selection not yet made, each with amount, allowance type,
   what it includes (material only versus installed), and a selection deadline. Every
   material-only allowance has a labor line beside it. Total allowance exposure is shown as a
   dollar figure and as a percentage of contract. Allowances are stated as **customer prices**.
4. **Named contingency** as its own line, not buried in markup, and shown to the customer: 5%
   replacement-in-place, 8% remodel with relocation, 10% additions and structural.
   Unforeseen conditions draw on it first; any unused balance is credited at closeout. The
   same line is on the ballpark, so the two never differ by a hidden 5–10%.
5. **Unforeseen conditions** per contract §4.4, unchanged.
6. **Material escalation** per contract §5.2, unchanged.
7. **Change orders** for any customer-driven change after signing, unchanged.
8. **Validity date** on the proposal (30 days) and on the ballpark (15 days, already there).
9. **Construction documents as a deliverable of the contract**, listed in Phase 1 General
   Requirements with its hours, paid for by the 10% deposit, produced before material
   ordering.

Item 9 is the one that moves the designer's largest block of hours to the far side of a
signed contract. Item 3 and item 4 are what make item 9 safe.

---

## 6. What the customer hears

**Discovery call.** "Based on the bathrooms we've done this year, most land between
$16K and $38K depending on tile versus panel showers and whether anything moves. If that
neighborhood works, the next step is a free site visit, and within three days you'll have a
written range with three options."

For kitchens: "A full kitchen remodel usually runs $45K to $85K. A refresh that keeps the
layout is more like $25K to $55K, and moving the sink or a wall pushes it to $55K to $105K."
For additions: "Most of the additions we've built this year ran $50K to $135K. Finished rooms
come in around $250 to $325 a square foot, garages $140 to $165."

**With the BRE.** "This is your budget range: Good $X, Better $Y, Best $Z. It's within 15%,
it includes permits, labor, materials and a 5% contingency shown as its own line, and it's
good for 15 days. If one of these fits, our Design & Pricing Agreement is $500. That buys the
concept layout and a fixed price, and the $500 comes off your contract."

**When asked why design costs money.** "The $500 covers the hours our designer spends
turning your ideas into a layout we can price to the dollar. You keep the layout and the
price either way. If you build with us, it's credited in full."

**When asked about the fixed price.** "The price is fixed for the scope on this proposal.
The things you haven't picked yet, like tile and fixtures, are carried as allowances with the
amount shown. Pick under, you get a credit; pick over, you pay the difference. Anything we
find inside a wall that nobody could have seen comes out of the contingency first, and
whatever contingency is left at the end comes back to you."

---

## 7. Implementation — four weeks, no developer

| Week | Work | Who |
|---|---|---|
| 1 | ~~Answer the variable-entry question~~ (answered: job parameters). ~~Set fees, caps, contingency and allowance policy~~ (decided, §9). ~~Draft the three intake sheets and templates~~ (done, `ballpark/`). Fill in the tier-product grid in one sitting (§9, decision 8). Start logging every design session. Offer the 8 signed PBAs the new terms. | Carl, estimator, designer |
| 2 | Author `BALLPARK — Bathroom / Kitchen / Addition` in the catalog from the build workbooks, and check each reproduces its example to the dollar on a test job. Add a `Contingency` cost code, the `Design – Concept` and `Design – Construction Drawings` items, and update `Framing/Sheathing Materials` to $22.50 per SF. Rename catalog group `22PPB363cpwn` to `Design & Pricing Agreement`, replace its four hourly lines with fixed-fee items by type, and move `Designer – Con Docs` to a construction-phase catalog item. Retire the `PAR` template. Rewrite the PBA template as the DPA (paid in full, credited, no 10/90). | Estimator, designer, CGM |
| 3 | Price live site visits with the templates alongside the current process. Add `BRE Mid` / `BRE Date` custom fields. Replace the four unused PBA statuses with BRE Out / DPA Out / DPA Signed / Proposal Out. Publish the price guide (§9, decision 5). | Estimator, Carl |
| 4 | Train sales on the driver screen, the intake sheets and the scripts in §6. Go live on all new construction leads. | Sales, Carl |

**Measure from day one**, in JobTread, monthly:

| Metric | Baseline (VERIFIED) | Target |
|---|---|---|
| Prospects who accept the paid design step | 46% signed a PBA | > 65% sign a DPA |
| Paid design step → contract | 64% | ≥ 65% (hold it while doubling the top of the funnel) |
| Designer hours per lost prospect | ~3.6 h logged (under-logged) | < 2 h, fully logged |
| Ballpark within its band of the signed price (±15% bathroom, ±20% kitchen and addition) | not measured | ≥ 80% of jobs |
| Lead to contract, calendar days | not measured | measure, then cut |

Cost: 30–50 hours of Carl's, an estimator's and a designer's time. No software, no
subscription. This is the same work `ROADMAP.md` §2.7 recommends as the two-week option; the
ballpark assemblies are the two "highest-volume scopes" that section asks for, chosen here by
where the pipeline is leaking rather than by volume alone.

---

## 8. Handbook edits

Changes to `Construction Project Pipeline – 2026 – Rev 1` and the July revision:

- **Classification section.** Replace the $20K / $200K bands with the driver screen in §3.3.
  Keep the typical-examples lists; they become the definition.
- **Qualified path.** After the verbal range, insert the site visit and the written BRE.
  Move "sell the PBA" to after the BRE is accepted and rename it DPA. Delete the Feasibility &
  Budget Study and the $350 PAR.
- **Phase 2 (Medium/Large).** Schematic Design and the Design Approval Meeting stay inside
  the DPA. Design Development moves after Contract Agreement. Construction Documents already
  sit after contract in the July revision; keep that.
- **Payment schedule.** Delete the PBA 10% / 90% terms. Add "DPA fee paid in full at signing,
  credited on the construction contract." Construction schedules by tier are unchanged.
- **Glossary.** Retire PBA and FB Study; add BRE and DPA.
- **Client communication.** Replace the ROM disclaimer (±30–50%) with the BRE language (±15%
  for bathrooms, ±20% for kitchens and additions, 15-day validity, three tiers, contingency
  shown as its own line).
- **Estimating standards.** Allowances are stated as customer prices. Every $0 line names who
  supplies it: "(by owner)", "(by others)" or "(not included)". Designers log every session
  against the job under `Design – Concept` or `Design – Construction Drawings`.

---

## 9. Decisions — made 28 Sep 2026

Carl accepted all ten recommendations and asked for a kitchen price guide as well.

**1. DPA fees and designer hour caps.**

| Project type | Fee | Designer cap |
|---|---|---|
| Bathroom | $500 | 6 h |
| Kitchen | $950 | 10 h |
| Addition or new structure | $1,500 | 12 h |
| Whole-house or new home | Quoted, $2,500 minimum | Quoted |

The designer's logged concept work ran 3–8 hours a job (§1.3). The fee's job is to filter out
people who won't build and be credited to those who do, so it need not cover every hour.

**2. Contingency is a visible line, on the ballpark and the proposal.** 5% for replacement in
place, 8% for a remodel where anything moves, 10% for additions and structural work.
Unforeseen conditions draw on it first, and any unused balance is credited at closeout. A
hidden contingency with the unforeseen-conditions clause on top would look like charging
twice. The ballpark templates now carry it as one line per tier, with the rate as a job
parameter the estimator sets.

**3. Allowances are stated as customer prices** (JobTread allowance type `price`). "Tile
allowance $4,500: spend less and you get a credit, spend more and you pay the difference."
No total changes, only how overages and credits are figured (`ROADMAP.md` Q20).

**4. Designer logging.** Not every hour is logged today (§1.3). From now on the designer logs
every session against the job under two catalog items, `Design – Concept` and
`Design – Construction Drawings`, and keeps writing the phase notes. Review after one month.
This does not hold up the launch; the caps are set from the hours already logged.

**5. Publish the price guide** on the website, and use the same numbers on the discovery
call. Refresh it from JobTread every quarter.

| Project | Price guide | Basis |
|---|---|---|
| Bathroom | $16K–$38K | Middle half of the 9 bathrooms signed since November 2025 |
| Kitchen, full remodel | $45K–$85K | Kitchen template, Good to Best: 180 SF gutted, 26 ft run with a 6 ft island, 8% contingency |
| Kitchen, refresh that keeps the layout | $25K–$55K | Template: 150 SF, 20 ft of new cabinets and counters, walls stay, 5% contingency |
| Kitchen, sink or a wall moves | $55K–$105K | Template: 210 SF, 32 ft run with an 8 ft island, 8% contingency |
| Addition or new structure | $50K–$135K | Middle half of the 8 signed since November 2025 |
| Finished room addition | $250–$325 per SF | DB's three finished-room estimates |
| Detached garage | $140–$165 per SF | DB's two garage estimates |

DB has no signed kitchen, so the kitchen guide comes from the kitchen template, rounded outward
to the nearest $5K. Replace it with DB's own signed-contract ranges once three kitchens close.
DB's two pending premium kitchens, at $91K and $99K, sit at the top of the layout-change
range. The bathroom and addition guides are DB's past prices, before the new contingency
line; expect them to drift up 5–10% as contracts with contingency close.

**6. The eight signed PBAs get the new terms now:** 260503, 261050, 261081, 261089, 261107,
261211, 261268 and 261269. Credit what each has paid in full at contract, drop the
90%-if-you-don't-build balance, and give a written Good / Better / Best range to any without
an estimate. Carl calls the $278K remodel (261268) himself.

**7. Three-day turnaround: the sales rep owns the clock, the estimator owns the number.** The
rep enters the intake sheet into JobTread the same day, the estimator reviews within one
business day, and the rep delivers by day three. Once bathrooms pass 8 of their next 10 jobs,
a bathroom with an all-No design screen skips the review.

**8. Tier products.** The estimator and the designer fill in this grid in one sitting and lock
it for six months, one real product and a photo per cell. The starting grid is what DB's own
estimates used; cells marked *name it* are open.

| Template | Line | Good | Better | Best |
|---|---|---|---|---|
| Bathroom | Walk-in shower | Acrylic or fiberglass kit | Onyx / Al-Co panel system | Tile or large panel, set by the sub |
| Bathroom | Glass | Framed bypass | Semi-frameless | Frameless |
| Bathroom | Vanity | Stock, cultured-marble top | Semi-custom, quartz top | Custom, premium top: *name it* |
| Bathroom | Floor | LVP | Upgraded LVP: *name it* | Tile, set by the sub |
| Kitchen | Cabinets | Stock builder line: *name it* | DB's $600-per-foot line: *name it* | KraftMaid plywood or painted |
| Kitchen | Countertops | Laminate | Entry quartz: *name it* | 3 cm premium quartz |
| Kitchen | Backsplash | Standard tile: *name it* | Upgraded tile: *name it* | Quartz slab to match |
| Addition | Roofing | OC Duration | OC Duration FLEX | Standing-seam steel |
| Addition | Siding | Norandex Cedar Knolls | Horizontal lap (catalog) | Vinyl shake or board and batten: *name it* |
| Addition | Windows | Polaris double-hung | Upgraded vinyl or casement: *name it* | Fiberglass or wood-clad: *name it* |
| Addition | Patio door | Catalog sliding door | Catalog patio door | Premium patio door: *name it* |

**9. Framing lumber.** The estimator updates the catalog's `Framing/Sheathing Materials` from
$17.65 to $22.50 per SF, matching DB's two latest lumber quotes, and checks it against the
latest quote every quarter. The addition template uses the catalog rate. The contract's
escalation clause (§5.2) protects DB only if the starting rate is current.

**10. Every $0 line names who supplies it:** "(by owner)", "(by others)" or "(not included)",
ideally in one *Owner-supplied / not included* group on the estimate. It prevents "who's
buying the garage door" disputes, and it tells the next calibration what was excluded rather
than forgotten. The pending garage 261094 carries its siding, roofing, garage doors and entry
door at $0 with no note; confirm those with the customer now.

**Still open:** the permit allowance by city (bathroom and addition templates), the rule for
when travel hours apply, and whether DB supplies kitchen appliances by default.

---

## Appendix A — PBA ledger (job numbers only)

Signed = a PBA document with status `approved`. Outcome reflects job Status and the job's
other customer orders on 2026-09-27. Fee = highest PBA presented on the job.

| Job | Type | Fee | Signed | Outcome |
|---|---|---|---|---|
| 258410 | Additions | $5,000 | yes | won, $155,764 |
| 258684 | Additions | $7,000 | yes | won, $186,054 |
| 25-8538 | Remodel/Interior | $3,500 | yes | won, $190,777 |
| 258442 | Deck | $3,500 | yes | won, $59,246 |
| 261049 | Bathrooms | $1,000 | yes | won, $41,941 |
| 260014 | Bathrooms | $1,000 | yes | won, $38,939 |
| 261277 | Bathrooms | $1,000 | yes | won, $38,030 |
| 261040 | Additions | $3,500 | yes | won, $30,651 |
| 260036 | Bathrooms | $1,250 | yes | won, $23,483 |
| 260032 | Remodel/Interior | $4,250 | yes | lost (estimate $60K delivered) |
| 260072 | Additions | $8,000 | yes | lost (no estimate produced) |
| 260192 | Bathrooms | $2,000 | yes | lost (estimate $12.7K delivered) |
| 260884 | Bathrooms | $840 | yes | lost (estimate drafted) |
| 261028 | Porch | $1,000 | yes | lost |
| 260503 | Additions | $3,500 | yes | open (a $7,000 PBA was declined first) |
| 261050 | Remodel/Interior | $3,500 | yes | open |
| 261081 | Remodel/Interior | $7,000 | yes | open (estimate $31.7K out) |
| 261089 | Additions/Remodel | $7,000 | yes | open (estimates to $40K out) |
| 261107 | Foundation | $3,500 | yes | open |
| 261211 | Bathrooms | $1,000 | yes | open |
| 261268 | Remodel/Interior | $7,000 | yes | open (estimate $278K out) |
| 261269 | Additions | $7,000 | yes | open |
| 260053 | Bathrooms | $2,000 | declined | lost |
| 260646 | Additions | $3,500 | declined | lost |
| 261143 | Additions | $3,500 | declined | lost |
| 261148 | Garage | $4,000 | declined | lost |
| 260079 | Additions | $3,500 | declined twice | open |
| 258794 | Bathrooms | $1,000 | no | lost |
| 260016 | Bathrooms | $1,500 | no | lost |
| 258796 | Bathrooms | $8,346 | no | lost |
| 260069 | Bathrooms | $2,000 | no | lost |
| 260077 | Bathrooms | $1,000 | no | lost |
| 260893 | Bathrooms | $1,000 | no | lost |
| 261078 | Bathrooms | $1,000 | no | lost |
| 260152 | New Homes | $12,500 | no (draft) | lost |
| 260214 | Commercial/Remodel | $4,250 | no | lost |
| 260210 | Remodel/Interior | $3,750 | no | lost |
| 260819 | Remodel/Interior | $3,500 | no (draft) | lost |
| 260721 | Misc | $7,000 | no | lost |
| 260743 | Barn | $11,500 | no | lost |
| 261299 | Additions | $7,000 | no | lost |
| 261362 | Additions | $7,000 | no | lost |
| 260631 | Garage | $2,500 | no | open |
| 261079 | Bathrooms | $1,000 | no | open |
| 261377 | Additions | $3,500 | no | open (estimates produced anyway) |
| 260623 | Bathrooms | $1,000 | no | open, PBA Out |
| 261416 | Basement | $3,000 | no | open, PBA Out |
| 261436 | Additions | $3,000 | no | open, PBA Out |

Excluded: 260103, 260127, 260878, 261344 (roofing jobs given a PBA) and the Kay Oss test
jobs.

## Appendix B — How the numbers were pulled

All reads were against the Pave API with read-only queries; no mutation was executed.

- PBA documents: `organization.documents` where `type = customerOrder` and `name = "PBA"`,
  with each job's `Status` and `Project Type` custom field values and its other customer
  orders.
- Approved contracts: `organization.documents` where `type = customerOrder` and
  `status = approved`, sorted by price, joined to the job's `Project Type`
  (custom field `22PC7idvhRzp`). Documents under $6,000 were not classified.
- Designer time: `organization.timeEntries` where `costItem.costCode.name = "Design"`, and
  (28 Sep) all of the designer's time entries grouped by job and cost code, with each entry's notes.
- Pipeline statuses: counts of `customFieldValues` on the job `Status` field (`22PBAjfWVVv9`).
- Templates: `documentTemplate` for Ballpark (`22PHqjjFH3XC`), PBA (`22PNaehdnUPp`),
  PAR (`22PXfJenFSwM`) and Const-Med (`22PBz28funCv`).

## References

Design agreements with a fee that is credited against the construction contract are
standard practice in residential design-build; two accessible discussions of how firms set
and credit them:

- Markup and Profit, "Design Agreement Fees":
  https://www.markupandprofit.com/articles/design-agreement-fees/
- JLC, "Design Fees: To Charge or Not To Charge":
  https://www.jlconline.com/remodeling/design-fees-to-charge-or-not-to-charge/
