# Pre-Construction Redesign — Budget First, Design Second, Documents After Contract

**Deitemeyer Brothers · General Construction · 2026-09-27**

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
   runs a formula-driven assembly engine for roofing (`ROADMAP.md` §1.2). Authoring three
   ballpark assemblies for bathrooms, kitchens and additions, driven by a one-page scope
   intake, gives a Good/Better/Best range in an afternoon of setup per type, and can be
   calibrated against DB's own signed contracts.
5. **Replace the PBA with a small, fixed, fully credited Design & Pricing Agreement** that is
   offered only *after* the customer has accepted a ±15% budget range, caps designer hours,
   and delivers a fixed-price proposal. Construction documents move into the construction
   contract.

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
cost of the PBA is lost customers, not lost hours.** If Carl believes the hours are real, the
first fix is to make the designers log every hour against the job, so the next version of
this table is trustworthy.

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
| 2. Site visit → **Budget Range Estimate (BRE)** | Sales, estimator | A Good / Better / Best range at **±15%**, on the existing Ballpark template, within 3 business days | $0 | 0 |
| 3. **Design & Pricing Agreement (DPA)** | Sales, designer, estimator | Existing-conditions measure, up to two concept layouts, a selections and allowance schedule, and a **fixed-price proposal** | Small fixed fee by type, **100% credited at contract** | Capped by type |
| 4. Construction Agreement | Sales, CGM | Fixed price + allowance schedule + named contingency; DD and CDs listed as Phase 1 deliverables | 10% deposit per existing schedule | DD + CDs, funded by the deposit |
| 5. Pre-production and build | PM | Confirmation measurements, CDs, selections finalized, kickoff | Per existing schedule | As needed |

### 3.1 What changes versus today

| Today | Proposed |
|---|---|
| Verbal ROM ±30–50% | Written BRE ±15%, Good/Better/Best, delivered in 3 days |
| PBA before any credible number | DPA only after the customer accepts the BRE |
| PBA fee = designer hours (median $3,500), 10%/90% terms | DPA fee fixed by type, paid in full at signing, fully credited |
| SD + DD + CDs + rendering before contract | Concepts only before contract; DD and CDs after |
| "Not-to-exceed" price seen as requiring full design | Fixed price with allowances and contingency at concept stage |
| Feasibility & Budget Study ($350, "do not use yet") | Retired; the free BRE does its job |
| Tier by dollar band ($20K / $200K) | Track by estimating drivers (§3.3) |
| PBA statuses in CRM unused | Four statuses: BRE Out, DPA Out, DPA Signed, Proposal Out |

### 3.2 The Design & Pricing Agreement

- **Fee.** Fixed per project type, not hourly. Proposed starting points, for Carl to set:
  bathroom $500, kitchen $950, addition or new structure $1,500, whole-house or new home
  quoted individually. As a sanity check these are roughly 1–2% of the median contract in
  each type, well under the 3–5% design fees that are common in design-build. They are low
  enough that a customer who accepted the BRE has no reason to balk, and high enough to
  filter people who were never going to build.
- **Paid in full at signing.** No 10/90. No deliverables held hostage. The customer keeps
  the concepts and the proposal whether or not they build with DB.
- **Credited 100% at contract signing**, as a line on the construction estimate. DB already
  does this today via a negative change order (VERIFIED on two won bathrooms); make it a
  standard line instead.
- **Time-boxed.** Two concept layouts, one revision round, and a hard cap on designer hours
  by type (proposed: bathroom 6, kitchen 10, addition 16). Past the cap, the customer buys
  more hours at $125 or moves to contract. The cap is what protects the designer.
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

The one open question from the roadmap still applies: **where variable values are entered**
is not visible through the API. Whoever configured the roofing library answers it in five
minutes. It is the first item in §7.

### 4.2 The Scope Intake sheet

One page per project type, completed by the sales rep at the site visit alongside the photos
and measurements the handbook already requires. These are the variables the ballpark
assembly consumes.

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
pricing where a real item exists and a stated allowance where it does not:

```
Demolition labor         round({Bath SF} / 8.5)                     Hours   (the existing stub, priced)
Tile shower              {Tile Shower} * 1                          EA      allowance, tier-dependent
Onyx / Al-Co shower      {Panel Shower} * 1                         EA      catalog item
Fixture relocation       {Fixtures Relocated} * <hrs each>          Hours   plumbing labor
Vanity                   {Vanity LF}                                LF      allowance by tier
Floor tile               ceil({Bath SF} * 1.10)                     SF      allowance by tier
Drywall / paint          {Bath SF} * <factor>                       SF
Electrical circuits      {Circuits Added}                           EA
General requirements     (duration-driven)                          Weeks
Contingency              named line, 10% at ballpark stage          LS
```

Good / Better / Best is a native JobTread selection group (`isSimpleSelection`, min/max
selections), so the customer sees three totals on one document. The output lands on the
existing **Ballpark** template (`22PHqjjFH3XC`), whose description and footer already say
the right things: non-binding, includes typical design, permits, labor, materials and
standard contingencies, excludes atypical structural work and unforeseen conditions, valid
15 days. Change one word in it: "an early ballpark number" becomes "a budget range."

Allowance lines must carry an explicit `allowanceType` (`cost`, `costAndFee` or `price`).
`ROADMAP.md` §9.3 and Question 20 explain why: a $4,500 allowance stated as a cost budget and
the same figure stated as a customer price differ by DB's full markup, invisibly. Decide the
policy once, in the catalog, before the first ballpark goes out.

### 4.4 Calibrate before trusting it

Run each ballpark assembly against the signed contracts in §1.4 using the intake values that
job would have had (the sales rep or PM can reconstruct them from the photo report in an
hour per job). Accept the assembly for live use when at least 8 of 10 land within ±15% of
the signed price. Bathrooms have nine calibration points today, additions eight, kitchens
none. For kitchens, calibrate against the two pending estimates and a published regional
benchmark, state the range as ±20% until three kitchens have closed, and re-run.

### 4.5 Keep it honest

Add two job custom fields: `BRE Mid` and `BRE Date`. When a contract is approved, the
estimator records the variance. Review the variance table monthly. Any type drifting past
±15% on more than a third of its jobs gets its assembly re-priced. This is the same
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
   dollar figure and as a percentage of contract.
4. **Named contingency** as its own line, not buried in markup. Proposed defaults, for Carl
   to set: 5% replacement-in-place, 8% remodel with relocation, 10% additions and structural.
   Customer-visible or internal is a policy choice; `ROADMAP.md` §9.7 gives the mechanics.
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

**With the BRE.** "This is your budget range: Good $X, Better $Y, Best $Z. It's ±15%, it
includes permits, labor, materials and a contingency, and it's good for 15 days. If one of
these fits, our Design & Pricing Agreement is $500. That buys the concept layout and a fixed
price, and the $500 comes off your contract."

**When asked why design costs money.** "The $500 covers the hours our designer spends
turning your ideas into a layout we can price to the dollar. You keep the layout and the
price either way. If you build with us, it's credited in full."

**When asked about the fixed price.** "The price is fixed for the scope on this proposal.
The things you haven't picked yet, like tile and fixtures, are carried as allowances with the
amount shown. Pick under, you get a credit; pick over, you pay the difference. Anything we
find inside a wall that nobody could have seen is covered by the unforeseen-conditions
clause at the rates in the contract."

---

## 7. Implementation — four weeks, no developer

| Week | Work | Who |
|---|---|---|
| 1 | Answer the variable-entry question with whoever built the roofing library. Set DPA fees, hour caps, contingency defaults, and the allowance-type policy. Draft the three intake sheets. | Carl, estimator, designer |
| 2 | Author `BALLPARK — Bathroom / Kitchen / Addition` in the catalog with Good/Better/Best selection groups. Rename catalog group `22PPB363cpwn` to `Design & Pricing Agreement`, replace its four hourly lines with fixed-fee items by type, and move `Designer – Con Docs` to a construction-phase catalog item. Retire the `PAR` template. Rewrite the PBA template as the DPA (paid in full, credited, no 10/90). | Estimator, designer, CGM |
| 3 | Calibrate each assembly against the §1.4 contracts. Adjust. Add `BRE Mid` / `BRE Date` custom fields. Replace the four unused PBA statuses with BRE Out / DPA Out / DPA Signed / Proposal Out. | Estimator, Carl |
| 4 | Train sales on the driver screen, the intake sheets and the scripts in §6. Go live on all new construction leads. Keep the current PBA only for the 8 signed ones already in progress. | Sales, Carl |

**Measure from day one**, in JobTread, monthly:

| Metric | Baseline (VERIFIED) | Target |
|---|---|---|
| Prospects who accept the paid design step | 46% signed a PBA | > 65% sign a DPA |
| Paid design step → contract | 64% | ≥ 65% (hold it while doubling the top of the funnel) |
| Designer hours per lost prospect | ~3.6 h logged (under-logged) | < 2 h, fully logged |
| Ballpark within ±15% of signed price | not measured | ≥ 80% of jobs |
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
- **Client communication.** Replace the ROM disclaimer (±30–50%) with the BRE language (±15%,
  15-day validity, three tiers).

---

## 9. Questions only Carl can answer

1. DPA fee levels and designer hour caps by type. The proposal's numbers are starting points.
2. Contingency: customer-visible line, or internal? And the default rate by type.
3. Allowance type policy: are stated allowances cost budgets, customer prices, or cost plus
   fee? This one question decides the margin on every selection (`ROADMAP.md` Q20).
4. Are designers logging every hour against the job? If not, the §1.3 table understates the
   loss and needs a month of clean data before it can be used in a decision.
5. Publish the Price Guide ranges on the website, or keep them for the discovery call only?
   Publishing reduces unqualified site visits and pre-empts the sticker shock that the PBA
   currently absorbs.
6. For the 8 signed PBAs in progress: finish them under the old terms, or offer the DPA
   terms retroactively? The latter costs nothing and buys goodwill on jobs like the $278K
   remodel currently out for decision.
7. Who owns the BRE turnaround commitment of three business days: the sales rep or the
   estimator?

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
- Designer time: `organization.timeEntries` where `costItem.costCode.name = "Design"`.
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
