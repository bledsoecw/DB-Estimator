# DB Estimator — Build Roadmap

**Deitemeyer Brothers · General Construction First · 2026-09-18**

> The founding document for DB Estimator. Every decision, gate, cost table and schema
> needed to start building — or to decide not to. Companion: `jobtread-api-field-notes.md`,
> the API facts this plan is built on, each verified by direct query against the live
> organization.

---

## 0. Headline recommendation

> ### ⚠ Superseded — read §17 first
>
> This section and the entire phase plan in §6 describe a **build** of a takeoff and
> estimating application. On 2026-09-28 that approach was set aside. DB is building an
> **agent-driven estimating assistant on Claude Managed Agents**, with JobTread keeping
> both the system of record *and* the assembly engine it already runs.
>
> The reasoning below is kept because it is how the decision was reached, and because its
> verified facts (§1.1, §1.2), the JobTread subsystem design (§7), the money and markup
> rules (§8.2), and the build-vs-buy analysis (§2) all still hold. **The phase plan, the
> costs and the timeline do not.** §17 gives the disposition of every phase.

**Approve Phase 0 only — 10 weeks, ~$50K — and make the real decision at Gate 0 on 2026-11-30.**

Phase 0 is a decision phase: eight ranked spikes, a 30-day STACK trial as the control arm, and a Togal trial on DB's own plan sets. It ends with a costed three-way memo — full build, hybrid, or buy — that Carl signs. It commits ~$50K and forecloses nothing.

Behind Gate 0 sits a costed option: **Phases 1–3 at 13–15 calendar months and $250–290K of engineering** (P50 at contract rates; **budget the P80 at ~$370K**). That delivers cost intelligence mined from DB's own history, an estimating engine reproducing DB's markup schedule to the cent, change orders and allowances, and an atomic idempotent push into JobTread. The takeoff canvas is decided separately at Gate 3.

**What you are approving contains none of the features you named.** Of STACK's takeoff, its $899 FloorPlan AI, Togal's auto-detection of spaces off PDFs, and natural-language plan querying — **none is in the scope behind Gate 0.** Takeoff off PDFs begins at month ~14 and is re-decided at Gate 3. Togal-style automatic room detection is **deliberately never built**; the honest substitute is reading the area the architect already printed in the room tag, which is exact and free (§10). Natural-language plan query arrives with Phase 6, ~2.5 years out. **Roofing, on this sequence, is a 2029 deliverable** — with one exception worth taking early (§11).

What $250–290K and 13–15 months buys instead: pricing intelligence from 3,987 real jobs, an engine matching DB's markup schedule exactly, first-class change orders and allowances, and an estimate that lands in JobTread as a nested phase tree without anyone retyping it.

Three reasons this ordering is right and the vendor ordering is wrong:

1. **The canvas is 60–70% of the engineering risk and the least AI-assistable code in the project.** If it goes first, nothing is usable for months, estimators watch demos instead of doing bids, and the project enters the zone where it is quietly abandoned. That is the failure mode to design against.
2. **The pain that costs money every week is not measuring.** It is the triple-entered quantity: measured somewhere, priced in Excel, retyped into JobTread. That leg has zero canvas risk, it is the half reviewers say STACK is weakest at, and no vendor will ever build it, because it is specific to DB's JobTread instance.
3. **The defensible asset is data, not AI.** 709 curated priced catalog items and ~175,000 historically priced instances across 3,987 jobs. Togal has training data DB will never have; DB has *pricing* data Togal will never have. Build against your asset.

**The uncomfortable part, up front:** on cost avoidance alone, building never pays back. Buying is cheaper in every scenario, by 2.3–5.2x over five years (§2.3). The build is justified by three things not for sale — the JobTread bridge, the historical cost corpus, full audit provenance — plus one that must be measured before it can be claimed: **margin improvement.** On a business running 3,987 jobs, a half-point of realized margin plausibly dwarfs every engineering number here. Neither the re-keying hours nor the margin variance is known; both are measured in Spike 1. **If they come back low, buy STACK, keep Phase 1, and build only the push.** That is a legitimate and much smaller project, and this document is structured so you can take it at any gate without waste.

---

## 1. Provenance discipline

Three tiers, enforced throughout:

| Tag | Meaning |
|---|---|
| **VERIFIED** | Confirmed by direct query against organization `22PBAjem8SSC`, recorded in ADR 0001. |
| **REPORTED** | Asserted in research, not confirmed by query. A hypothesis with a spike attached. |
| **UNVERIFIED** | Explicitly unknown. No design may depend on an assumed answer. |

### 1.1 Verified facts that overturn common assumptions

Each was re-checked by live query on 2026-09-18, and each would have produced a defect if taken on faith.

**`externalId` is not empty org-wide — but it is clean where we write.** VERIFIED: **2,156 of 8,463 documents carry a non-null `externalId`** (2,155 `vendorBill`, one `vendorOrder`) — values like `69420400`, `H26957`, `355057`, `355057_2`. These are not document numbers (`document.number` is a separate integer, `8` on the reference estimate), and the `_2` suffix suggests a human worked around a collision. **But zero of 2,181 `customerOrder` documents carry one.** The `DBE1.` scheme is safe, and the Layer-0 namespace guard must be **scoped to `customerOrder`** — an org-wide "externalId is null everywhere" assertion fails on its first run.

**The JobTread plan room is real, writable, and a genuine differentiator.** VERIFIED: `createPlan`, `updatePlan`, `deletePlan`, `createPlanTask`, `updatePlanTask` all exist. `updatePlan.$.annotations` is an array (max 1000) of a `oneOf` over `{path, text, point, meta}`; `path` carries `isNegative`, `isClosed`, `strokeWidth`, `strokeColor`, `fillColor`, `fillOpacity`, `points` (freedraw up to 1000 xy pairs, or bezier chains). `plan.previousFilePages` gives native page-revision lineage. **`createUploadRequest` accepts the same payload**, so a cost item's `annotatedUploadRequestId` carries **structured vector geometry, not a flattened image.** "The PM opens the plan in JobTread and sees the takeoff, deductions drawn as negative regions" is achievable and should be promised. Spike 11 covers coordinate space and scale calibration, which remain unknown.

**The markup schedule was measured on n = 46, not 709.** Any gate phrased as "reproduce all 709 catalog rows byte-exact" tests a rule set inferred from a 6% sample. §8.4 replaces it.

**Tax is not zero — the most expensive assumption to get wrong.** VERIFIED: **80,462 of 176,156 cost items have `isTaxable = true`** (46%), **18,602 on `customerOrder` lines.** **60 documents carry `taxRate` > 0**, including `customerOrder` documents named "Estimate" at **0.0725** (Ohio 7.25%). Hardcoding `isTaxable: false` / `taxRate: 0` is not mirroring DB's data; it under-bills tax on a real subset of work. Also VERIFIED: `taxRate` is constrained **`gte 0, lte 1` — a fraction.** Writing `7.25` for `0.0725` is a 100× error the type system accepts silently. CPA sign-off is a blocking MRC item.

**JobTread has a live formula evaluator, and DB already uses it.** VERIFIED: **`quantityFormula` is populated on 5,451 cost items** — 101 catalog rows, ~5,350 job-budget lines, **zero on `customerOrder` lines.** Live syntax: `round({Area}/8.5)`, `round(({Area}*{Depth})/27)`. `unitCostFormula` and `unitPriceFormula` are null everywhere (0 of 176,156), as is `costGroup.quantityFormula`. So **those 101 catalog formulas are DB's own assembly logic, written down** — read them before mining 46,248 cost groups statistically; and Decision 13 is reinforced, because DB's convention keeps formulas off customer-facing documents.

**Template hydration is verified, and the subsystem it justifies is necessary.** VERIFIED: `documentTemplate` is readable; `footer` ≤65,536 chars (`description` ≤32,768); and **the footer of `22PBz2nQunqm` is the Deitemeyer Brothers contract verbatim** — formation and three-day rescission with a 20% restocking fee, the change-order clause, §4.4 Unforeseen Circumstances at $2.00/SF sheeting and $10.00/LF dimensional lumber, §5.2 material escalation above 5%, the six-stage 10/25/20/20/15/10 payment schedule with `$XXX,XXX.XX` and `$XX,XXX.XX` placeholders, Ohio governing law and Van Wert County venue, the five-year workmanship warranty, the photo release. `createDocument` accepts **no `templateId`**. VERIFIED: **six** templates are named "Estimate", and `templateName` distinguishes them — `Const - Small`, `Const - Med`, `Const - Large`, `Ballpark`, and two roofing variants. **`22PBz2nQunqm` / "Const - Large" is the general-construction template.**

**`createdByGrantId` is populated for human UI edits.** It is tempting to assume it is null for UI actions and populated only for grant writes, making echo suppression a clean binary test. VERIFIED against the live per-document event feed: **it is populated on every event observed, including human UI edits** — `documentUpdated` by Kristin Holt carries grant `22PcWa26R9rb`, `documentCreated` by the Operations Account carries `22PdTim6CFBz`, and **both display the name "JobTread App."** Building on the null assumption would classify every human edit as our own write and silently swallow it — the exact failure §7.7 exists to prevent. **Match on our own specific grant id, retain historical grant ids across rotations, never match on grant name.**

ADR 0001 is the living verified-facts record with a nightly read-only assertion suite behind it (§7.9). Every spike appends its written verdict there.

---

## 1.2 The finding that most changes this plan — VERIFIED 2026-09-27

**DB already runs a working parametric assembly engine inside JobTread. It is in production on roofing, and the general-construction side of it is empty.**

This was missed by every earlier revision, which treated formula-driven assemblies as net-new capability to be built in Phase 2a. They are not. The capability exists, DB's own people configured it, and it works end to end.

What the live data shows:

| Measure | Value |
|---|---|
| Catalog items carrying a `quantityFormula` | 101 |
| — of those, **roofing/exterior assemblies with real unit costs** | **~95** |
| — of those, **general-construction stubs, all `unitCost: null`** | **~6** |
| Job-budget lines carrying a formula | 5,360 |
| Formula lines **resolving to a real quantity** | **4,684** |
| Distinct jobs using them | **185** |
| Formula lines resolving to 0 (unbound variables) | 771 |

The roofing library is not a toy. It is a parametric takeoff-to-price system with option tiers:

```
OC Duration Shingles      ceil({Roof Facets Area} * {Waste Factor} / 100)        Square    $123.99
OC Ridge Cap              ceil({Roof Ridges Hips Length} * 1.1 / 33)             Bundle    $72.00
OC Starter Shingles       ceil(({Roof Rakes Length}+{Roof Gutters Eaves Length})*1.1/100)  Bundle  $59.45
RhinoRoof Underlayment    ceil(({Roof Facets Area}+{3/12 Slopes})*{Waste Factor}/1000)     Roll    $78.00
Rhino I&W-G               ceil((({Roof Valleys Length}+({Roof Gutters Eaves Length}*{Rows of IWS})
                                +(({Roof Flashing Length}+{Roof Step Flashing Length})/2))/65))    $79.00
Drip Edge                 ceil(({Roof Rakes Length}+{Roof Gutters Eaves Length})*1.1/10)   Piece    $8.50
SS Clips                  ceil({Roof Facets Area} * {Waste Factor} / 1000)        Box      $155.00
```

Those variable names — `{Roof Facets Area}`, `{Roof Ridges Hips Length}`, `{Roof Gutters Eaves Length}`, `{Roof Rakes Length}`, `{Roof Valleys Length}`, `{Roof Flashing Length}`, `{Roof Step Flashing Length}`, `{Vented Ridges}`, `{Rows of IWS}`, `{3/12 Slopes}`, `{Waste Factor}` — are the field list of a **HOVER report**. DB buys the measurement for $58.99–112.61, feeds it in, and the estimate computes itself. Option groups (`OC Duration Shingle System`, `— Premium Color`, `Class 4 Upgrade`, `Upgrades`, warranty tiers) are modelled as sibling cost groups.

**And it flows through to the customer document automatically.** Verified on job `22PTvB2JUpdz` (260369 Bibler_Storm Damage):

| | quantity | `quantityFormula` | price |
|---|---|---|---|
| Job budget line | 35 Square | `ceil({Roof Facets Area}*{Waste Factor}/100)` | $6,585.31 |
| Customer estimate line | 35 Square | *(null — resolved snapshot)* | $6,585.31 |

Same quantity, same price, formula stripped on the document. That job carries a live estimate created **2026-09-25** for $24,586.12. This is current daily practice, not an experiment.

### What this means for the plan

1. **There is no retyping problem on roofing.** The budget→document flow-through is native and automatic. Any part of the build case that rests on "eliminating the triple-entered quantity" must be re-argued for general construction specifically, and measured there (Spike 1), because the mechanism that would eliminate it already exists and is in use.

2. **Phase 2a's assembly engine is now substantially harder to justify.** Building a second assembly engine, outside the system of record, to do what the system of record already does for 185 jobs, is a weak proposition. The defensible remainder is what JobTread's engine does *not* do: dimensional unit typing, cost distributions mined from history, audit provenance, and measurement capture.

3. **The general-construction gap is real, and it is a configuration gap, not a software gap.** Six unpriced stubs — `round({Area}/8.5)` for demolition hours, `round(({Area}*{Depth})/27)` for excavation yards, `round(({Area}/5.5)/3)` for framing labor — duplicated across `round()` and `ceil()` variants by someone experimenting. Nobody finished the work or priced it.

4. **The fastest path to value is therefore not this project.** It is authoring general-construction assemblies in JobTread the way the roofing ones already exist. That needs Carl, an estimator, and whoever configured the roofing library — not a developer, not $250K, and not 15 months. See §2.7.

5. **Roofing is far closer to done than §11 assumes.** §11 treats roofing as a 2029 deliverable. On the assembly side it is already built and running. That should be re-read before any roofing scope is planned.

**One thing is not yet known.** Where the variable *values* are entered is not exposed through the Pave API — job `areas` is a plain label list, cost groups carry no variable store, and no custom field matches the roof variable names. The mechanism demonstrably works, so the answer is a five-minute question for whoever configured the roofing library, or for JobTread support. **It must be answered before anything in §2.7 is scheduled**, because it determines whether general-construction variables can be defined the same way.

---

## 2. The build-vs-buy reckoning

### 2.1 What buying costs (the weakest number here — must be re-quoted)

| Option | Structure | 6 seats | 3 production seats + viewers |
|---|---|---|---|
| STACK, as Carl was quoted | $249–299/user/mo + $899/user FloorPlan AI | **$26,900/yr** | $13,500/yr |
| STACK, per independent research | Annual tiers ~$1,999 / ~$4,999 (3 full + 6 viewers) / custom; AI gated at ~$2,999/yr | $12–18K/yr | **$8,000/yr** |
| Togal.AI | ~$299/user/mo, **quantities only** — no pricing, no proposal, no JobTread | $21,500/yr | $10,800/yr |
| Beam AI | $8–25K/yr **per trade**, done-for-you, 24–72h turnaround | n/a | n/a |
| HOVER + CANVAS | $58.99–112.61/report; $0.40/SF | *continues under every scenario* | *continues* |

A **2.5–3x spread on the most important cost number in the decision.** Two phone calls close it (Spike 1b). Do not approve or reject this project against a number no vendor has put in writing. Togal produces quantities only — under "buy Togal," DB still needs Phase 1 + Phase 2 to price them and land them in JobTread.

**Honest working figure for what DB needs (2–3 production takeoff seats, viewers, AI): $8,000–15,000/yr.**

### 2.2 What building costs

A dev-day is **7.6 hours** (38 productive hours / 5 days), stated explicitly because effort tables that quietly use a 5.8-hour day are how impossible calendars hide.

AI assistance is priced unevenly and deliberately: **~2.2x on CRUD, API clients, schema, reports and tests; ~1.25x on canvas, viewport, geometry and PDF plumbing**, where the corpus for "build a CAD viewport with exact coordinate fidelity" is thin. Anyone scheduling Phase 4 at CRUD velocity misses by two months.

| Phase | Dev-weeks | Hours | Cumulative | @ $150/hr contract | @ $106/hr salaried |
|---|---|---|---|---|---|
| 0 · Decide & Prove (core spikes) | 6.2 | 236 | 236 | $35K | $25K |
| 0b · Deferred spikes *(inside Phase 1)* | 4.6 | 175 | 411 | $62K | $44K |
| 1 · Cost Intelligence | 11 | 418 | 829 | $124K | $88K |
| 2a · Estimate Core *(no writes)* | 10 | 380 | 1,209 | $181K | $128K |
| 2b · Bridge, COs & Allowances | 10 | 380 | 1,589 | $238K | $168K |
| 3 · Parallel Run & Cutover | 9 | 342 | 1,931 | **$290K** | **$205K** |
| 4 · Takeoff *(4a+4b+4c)* | 24 | 912 | 2,843 | $426K | $301K |
| 5 · Change Under Pressure | 8 | 304 | 3,147 | $472K | $334K |
| 6 · Deterministic Extraction | 16 | 608 | 3,755 | $563K | $398K |
| 8 · Actuals Loop | 6 | 228 | 3,983 | $597K | $422K |
| 9 · Roofing | 8 | 304 | 4,287 | $643K | $454K |

**There is no Phase 7.** Gated ML is cut (Decision 22): its useful parts move into Phase 6, the rest is a buy decision or a non-goal.

**These are P50 point estimates. Carry a 25–30% contingency reserve** — Phases 0–3 at P80 is **~$370K** contract, ~$265K salaried. **Budget the P80.** Funding only the P50 funds a project you will have to stop mid-phase.

| Also unavoidable | Cost |
|---|---|
| Run cost (Postgres w/ PITR, API + workers, object storage + CDN, Sentry, ~$60/mo model API) | $500–700/mo → **$6–8.4K/yr** |
| Maintenance from Gate 3 onward | **0.2 FTE (no canvas) → $43K/yr** · **0.3–0.35 FTE (with canvas) → $64–75K/yr** |
| **Reactive integration reserve** — one JobTread breaking change is 40–80 hours | **$10–15K/yr** |
| Specialist help (§14.2) | **~$22K one-time** |
| Carl's time | **130 hours** (§14.3), at his own loaded rate — he must supply it |
| Estimator time | **454 hours ≈ $34K** at $75/hr loaded; **314 hrs ≈ $23.6K** through Gate 3 |

**Storage.** The tile pyramid is pre-generated for every page of every plan set: at ~60 pages/set, ~40 tiles/page across levels 0–2, ~120KB/tile, a set is ~290MB plus the original. At 150 sets/yr that is ~45GB/yr — trivial in cost, not in lifecycle. **A retention policy is required:** tiles for closed jobs to cold storage at 90 days, purged at the limit set by the plan-licensing answer (§10.4); originals follow the restoration retention obligation (§8.6).

**Maintenance is 0.2 FTE, not 0.15, and its scope is named** so it cannot be quietly re-cut: mandated drills (quarterly grant rotation, monthly single-estimate restore, quarterly full off-provider restore, annual abandonment drill), dependency upgrades, alert and drift triage. It **excludes** reactive API work — hence the separate reserve. One hazard is budgeted here: **the vector harvest depends on pdf.js `getOperatorList`, not a stable public contract, which changes between releases.** The version is pinned and an operator-list golden test fails the build on upgrade.

### 2.3 Five-year TCO — with the benefits on the same page

A cost-only comparison is not decision-grade. Re-keying is carried in every scenario that does not eliminate it; client time in every scenario that consumes it. Re-keying = H hours/bid × N bids/yr × $75 × 5 years, with H and N **UNVERIFIED** until Spike 1.

| Scenario | Build | Maint. | Run + reserve | Subscription | Client time | 5-yr direct | **+ re-keying @$15K/yr** | **+ re-keying @$45K/yr** |
|---|---|---|---|---|---|---|---|---|
| **Buy only** (STACK 3 seats + AI) | — | — | — | $45K | — | **$45K** | **$120K** | **$270K** |
| **Hybrid** — build to Gate 3, rent takeoff | $290K | $172K | $76K | $45K | $43K | **$626K** | **$626K** | **$626K** |
| **Full build** through Phase 6 | $563K | $245K | $92K | — | $51K | **$951K** | **$951K** | **$951K** |
| **Everything** through Phase 9 | $643K | $280K | $100K | — | $54K | **$1.08M** | **$1.08M** | **$1.08M** |

At the low end of re-keying, **buy-only is ~5.2x cheaper than the hybrid.** At the high end, **~2.3x cheaper.** Neither ratio is close. Anyone presenting this project as "cheaper than STACK" is selling.

**The build does not clear on cost avoidance. It can only clear on margin** (§2.5).

**Cash flow** is front-loaded against benefits starting week ~24: Phase 0 ~$17K/mo; **Phase 1 + 0b ~$46K/mo, the peak** (hire plus contractor on retainer); Phases 2a/2b ~$25K/mo; Phase 3 ~$28K/mo plus 130 estimator hours. Ask the CPA whether this capitalizes under **ASC 350-40** — and if so, the useful life and **the impairment consequence of stopping at a gate, which this plan explicitly invites** — and how **§174** treatment compares after tax against an immediately-deductible subscription.

### 2.4 What the premium buys

| Value | Certainty | Annual value | Purchasable? |
|---|---|---|---|
| **Recovered re-keying hours** — estimate lands in JobTread as a nested phase tree, no retyping | High; size unknown | $5–45K | No vendor will integrate with JobTread |
| **Margin improvement from better pricing** — distributions with n and spread replacing a stale spreadsheet rate | Plausible, unmeasured | **Potentially the largest item here** | No. Nobody else has DB's reconciled job costs |
| **Historical cost corpus as live pricing intelligence** — median, spread, n, productivity from DB's `timeEntries` | High | Compounding | No |
| **Margin protection from auditability** — markup ambiguity forced open, stale-takeoff blocking, hard approval gate, provenance from every dollar to its source | Real, hard to quantify | One $278K job mispriced 3% = $8.3K | Partly — a *gap* in STACK, not a strength |
| **Availability control** — no vendor's deploy window landing on bid day | Real | Insurance, not revenue | No |

### 2.5 Break-even, and the margin case

Recovered hours, H hours/bid × N bids/yr at $75 loaded:

| H | N = 45 | N = 80 | N = 150 |
|---|---|---|---|
| 1.5 h | $5.1K | $9.0K | $16.9K |
| 2.5 h | $8.4K | $15.0K | $28.1K |
| 4.0 h | $13.5K | $24.0K | **$45.0K** |

At the low end, recovered hours do not cover the subscription. At the high end they cover subscription plus most of maintenance — **never the build.**

**The margin case is the half that decides it. It has now been partly measured — VERIFIED 2026-09-26.**

| Measure | Value | Source |
|---|---|---|
| Approved `customerOrder` value | **$7,597,852** across **795** documents | live query |
| Period covered | 2025-11-25 → 2026-09-24 (**~10 months**) | oldest/newest approved |
| **Annualized approved volume** | **≈ $9.1M** | extrapolated from the above |
| Cost on approved work | $4,828,221 | live query |
| **Estimated gross margin, approved work** | **36.5%** | derived |
| Estimated gross margin, all 1,949 priced orders | 33.2% ($34.67M price / $23.16M cost) | live query |
| **Win rate by count** | **70.5%** (795 approved vs 332 denied) | live query |
| **Win rate by value** | **53.8%** ($7.60M won vs $6.51M lost) | live query |

Two readings matter. **At R ≈ $9M, this lands squarely in the row where the decision is genuinely close** — +0.5 pt of margin is ~$45K/yr, which over five years roughly covers the Gate-3 build. It is not the R = $4M case where the answer is obviously buy.

And DB **wins 70% of decisions but only 54% of the dollars** — meaning it loses disproportionately on large jobs. Whether that is pricing, speed, or selection is unknown, but large-job win rate is a lever worth more than the entire re-keying case, and the estimator plausibly moves it.

**Three caveats before this number is used.** It spans all `customerOrder` types (estimates, change orders, warranty, punchlist, service, restoration), not general construction alone — the GC-only slice is smaller and must be separated by `Job Type` / `Project Type`. The JobTread history begins 2025-11-25, consistent with the JobNimbus migration, so ~10 months is the whole record and seasonality is not yet visible. And these are *estimated* margins from document price and cost, not realized ones.

> **Correction to an assumption this plan made.** Earlier drafts stated that margin variance across "the last 40 reconciled jobs" was available from the `job` reconciliation fields. **It is not.** VERIFIED: **only 18 jobs carry a `Final Margin %`**, `Reconciled Est Margin` has **2** values, and `Lost Reason` has **0**. Worse, the 18 are the wrong population — all small service and repair work (Soffit, Bath Fan, Sliding Door, Subpanels), averaging **$7,777** of revenue, with margins scattered **21.3%–82.3%** (mean 50.5%). Nothing resembling the $278K remodels the estimator is being built for.
>
> So the realized-margin baseline **does not exist yet and cannot be produced from history.** Spike 1 must either reconcile 15–20 *general-construction* jobs retrospectively — real work Carl has to schedule, not a query — or the baseline shifts to estimated margin at Gate 1 with realized margin arriving only in Phase 8. **This weakens the margin case, because the thing that would prove it is the thing DB does not currently measure.** It also makes retrospective reconciliation of a GC sample one of the highest-value items in Phase 0.

| Realized margin improvement | R = $4M | R = $8M | R = $15M |
|---|---|---|---|
| +0.25 pt | $10K/yr | $20K/yr | $37.5K/yr |
| +0.50 pt | $20K/yr | $40K/yr | $75K/yr |
| +1.00 pt | $40K/yr | $80K/yr | **$150K/yr** |

| Win-rate gain from faster turnaround (at 10% avg gross margin) | R = $4M | R = $8M | R = $15M |
|---|---|---|---|
| +2 pts | $8K/yr | $16K/yr | $30K/yr |
| +5 pts | $20K/yr | $40K/yr | $75K/yr |

**Read this both ways.** At R = $8M and +0.5 pt, the build returns $40K/yr — $200K over five years — closing roughly half the hybrid's gap to buy-only and making the decision genuinely close. At R = $4M and +0.25 pt, it returns $50K over five years and the decision is not close: **buy.**

This is the least certain claim in the document and the most vulnerable to wishful arithmetic, so three disciplines bind it. It must be **attributable** — Phase 8's variance decomposition makes it measurable rather than assertable. The **baseline is measured before Gate 1** from a retrospectively reconciled sample of 15-20 **general-construction** jobs and published (§8.5 needs it too) — the 18 existing reconciliations are small service work and cannot serve. And it is **re-tested at Gate 3** against real tool-priced jobs: if realized margin is not measurably better, the margin case is dead and only the re-keying and audit cases remain — which do not clear.

### 2.6 The recommendation

| If Phase 0 finds… | Then |
|---|---|
| STACK's takeoff feels good on DB's real plan sets **and** its export can be scripted into a nested JobTread `customerOrder` (Spike 0) | **Buy STACK. Keep Phase 1. Build only the push.** ~$8–15K/yr + ~14 dev-weeks. The most likely correct answer, and a better outcome than the full build |
| **Togal clears the §10.3 thresholds on DB's own sheets (Spike 2b)** | **Build Phases 1–5, license the detection layer, never build Phase 6 extraction.** eTakeoff already ships Togal as an embedded OEM engine, so detection is licensable separately. A ~$300 trial settles a ~$91K question |
| H × N < ~$15K/yr **and** margin sensitivity < ~$25K/yr | **Buy.** Neither case clears; the remainder is insurance |
| Vector sheets < 30% of GC work, **or** machine-readable dimension strings < 50% of sheets (Spike 2) | **Stop at Gate 3.** The exactness thesis does not apply to DB's inputs, and DB cannot out-train Togal |
| No senior developer signed, or no year-3 maintenance owner | **Buy.** A half-built system the business bills through is worse than a subscription |
| Markup rules cannot be formalized (Spike 6) | **Pause.** Fix the pricing model with Carl before software encodes it |
| **A markup basis turns out to be an accident, not a policy (Spike 6 / Q6)** | **Split the gate.** Reproduce history *and* reproduce intent, in shadow, with the dollar delta per project type reported to Carl before he chooses a go-forward rule set (§8.4). A historical-fidelity gate must never silently become pricing policy |
| Carl's roofing appetite is near-term | **Take seam 8 early** — the vendor-measurement adapter moves into Phase 2b (§11) |
| All of the above come back favorably | **Approve Phases 1–3. Re-decide the canvas at Gate 3.** |

### 2.7 The two-week option

Carl asked whether anything useful can exist in a couple of weeks. It can — and it is not this project.

**Finish the general-construction half of the assembly library DB already owns** (§1.2). The roofing side proves the pattern works in production on 185 jobs. The general-construction side has six unpriced stubs.

| Week | Work | Who |
|---|---|---|
| 0 (2 days) | Answer the one open question: where variable values are entered. Ask whoever built the roofing library, or JobTread support | Carl |
| 1 | Pick the two highest-volume GC scopes from the last 12 months. For each, write the driver variables (floor area, wall length, ceiling height, opening counts) and the line items each drives, using the existing 709-item catalog for pricing | Carl + estimator |
| 2 | Author them as formula catalog items, exactly like the roofing ones. Bind variables on one real job. Compare the computed estimate against one already priced by hand | Estimator + whoever configured roofing |
| 3–4 (optional) | Two more scopes, then run it live on real bids | Estimator |

**Cost:** no developer, no subscription, no code. Perhaps 30–50 hours of Carl's and an estimator's time.

**What it delivers:** for the covered scopes, an estimator types a handful of driver numbers and the line items, quantities, waste and pricing compute — then flow to the customer estimate automatically, the way roofing already does.

**What it does not deliver**, and these are the honest limits:

- **It does not measure anything.** Roofing works because HOVER supplies the measurements for $58.99–112.61. For general-construction interiors there is no equivalent, so someone still walks the job or scales the plans and types the drivers in. That is the gap a takeoff tool would eventually fill, and it remains unfilled.
- **Pricing is only as good as the catalog**, which has the known hygiene problems — wrong cost codes, `Each` used as a catch-all, one item at three prices, pervasive duplicates (§10).
- **No dimensional type safety.** Nothing stops a square-foot value reaching a linear-foot slot; JobTread's evaluator does not type units.
- **No cost distributions.** Unit costs are whatever the catalog says today, not mined from the ~175k historical instances.
- **No audit provenance** beyond what JobTread records natively.

**Why do it first regardless of the Gate 0 decision.** It is the cheapest possible test of the central premise of this whole plan: that assembly-driven estimating is faster and more consistent for DB's general-construction work. If two scopes go in and estimators use them, the premise holds and the larger build has evidence behind it. If the assemblies sit unused, that is the most valuable negative result available — bought for 40 hours instead of $250K — and Gate 0 should be a decision to buy.

This does not replace Phase 0; it runs inside it, needs no developer, and should start before the contractor engagement is posted.

---

---

## 3. What "all the best features" should actually mean

STACK is a decade of engineering across two stapled-together products plus three AI layers, sold to thousands of contractors across every trade and input condition. Togal is a floor-plan segmentation engine producing quantities, not prices. Beam is not software at all — ~526 people doing a QA pass on every output.

**Roughly a third of that surface exists to sell seats to strangers**, and for six people with one system of record it is irrelevant or worse than the DB-specific answer: a 10,000-item generic catalog (DB's 709 with real distributions beat it), licensed BNi regional cost data (DB's closed-job actuals are better data for DB's market), a sub bid-leveling network, unlimited viewer tiers, Procore/Sage connectors, mobile takeoff.

**One thing is genuinely out of reach:** Togal-class segmentation on arbitrary raster input. But the useful line is not vector versus raster — **it is what the file asserts versus what must be deduced.**

Architect-issued PDFs *state* an enormous amount outright: room areas printed inside room tags, wall types in a legend, dimension strings, door and window schedules, sheet indexes, title-block metadata. Where the file states a number, reading it has **zero model error**, and it is the *same number the architect will cite in a dispute* — a stronger position than a number DB recomputed, however exactly. Where the number must be deduced — segmenting a room from wall linework, classifying a wall run from a nearby tag — DB is doing what Togal does with less data and less tuning.

**The rule: prefer the architect's assertion over our own reconstruction, everywhere the assertion exists.** This is the most valuable design principle in the document, and it is why automatic room segmentation is never built.

Two census questions gate all of it, because four subsystems depend on them:

- **Text encoding.** AutoCAD exports using SHX fonts store lettering as **stroked vector geometry with no text layer at all** — which is why Autodesk ships `PDFSHXTEXT` to convert it back. On such a sheet there is no dimension string to extract, no room-tag area to read, no title block to parse, nothing to full-text search. Revit exports TrueType and is fine. A one-afternoon measurement gating weeks of Phase 4 and 6 work.
- **Layer metadata (PDF Optional Content Groups).** AutoCAD, Revit and MicroStation map drawing layers to OCGs. Where "Include layer information" was enabled, **every path carries its originating layer** — `A-WALL-EXTR`, `A-DOOR`, `A-ANNO-DIMS`. Exact metadata, not inference. It classifies walls, doors, windows, dimensions and annotation for free; it works on poché walls where stroke-width clustering fails outright; and it directly solves the error source the one independent AI-takeoff study identified — dimension lines, leaders and notes measured as construction geometry. **If OCGs survive in DB's sets, several Phase 6 designs simplify substantially.**

**The two things reviewers complain about most in the market leader are the two a private build wins outright:** slow plan loading and lag during takeoff (solved by pre-generated tiles and a hard perf budget), and an estimating module weaker than the takeoff module with insufficient customization (exactly the half this plan is built around). Chasing parity on the other twenty-five features is what would prevent winning on these two.

**The accounting: 23 capabilities built, 6 of those better than the incumbent, 10 deliberately absent, 4 honestly weaker without a text layer, 4 that no subscription provides.** Every "better" verdict is conditional on the census above unless marked unconditional.

### 3.1 Feature coverage vs STACK / Togal / Beam

| Feature | Source | Our approach | Phase | Verdict |
|---|---|---|---|---|
| PDF upload, multi-page sheet burst | STACK | Content-addressed originals (sha256 dedupe), server-side tile pre-rasterization of levels 0–2, per-page **vector/raster/hybrid + text-encoding + layer** classification **stored as a permission** governing which methods may produce a billable number | 4a | **better** |
| Large-plan-set rendering performance | STACK's #1 complaint | Tile pyramid pre-generated on upload, never on demand; byte-budgeted LRU `ImageBitmap` cache sized **from measured device ceilings**; geometry on its own layer; CI perf budget per device class | 4a | **better** |
| Sheet auto-naming, plan index, full-text search | STACK | Title-block parsing into a correctable register, autocomplete from DB's historical sheet titles, natural sort (A2.1 < A2.10), full-text search over the text layer | 4a | **better with a text layer; unavailable without one** |
| **Sheet-index integrity diff → missing-sheets RFI** | nobody does this well | Set arithmetic over extracted sheet numbers. Near-exact, nearly free | **4a** | **better — unconditional where text exists** |
| Per-sheet scale calibration | STACK, Togal | Per-**viewport** state machine, up to 5 ranked sources, 7 named cross-checks, database-enforced confirmed-only gate (§8.3) | 4b | **materially better** |
| 9 measurement types w/ derived secondaries | STACK | Measurement carries a *dimension*, never a commercial unit; one polygon feeds LF of plate, SF of drywall, EA of studs via typed `QuantityBinding`s | 4b | **better architecture** |
| **Snap-assisted tracing over harvested geometry** | *neither vendor exposes this* | Snap to the architect's own vector coordinates. The measurement **is** the drawing's geometry — exact, free per sheet | **4b** | **better — the largest single time saving in the plan** |
| Linear takeoff with vertical drops | STACK | Drops as individually selectable, individually deletable children of a vertex, with a per-drop height | 5 | **better interaction** |
| Labels, grouping, colour coding, layers | STACK (top-3 loved) | Colour **and** hatch locked per cost code; count markers by shape; no cap; labels tied to cost codes, so label structure doubles as the JobTread mapping key | 4b | **better** — colour alone fails in print, on a projector, and for colourblind estimators |
| Autocount symbol recognition | STACK | User-seeded counting: Form XObject `Do`+CTM walking for exact counts **where the exporter instanced**, rotation/mirror-invariant geometry hashing otherwise | 6 | **parity at best** — instancing premise unverified |
| Floor Plan AI (walls/doors/windows/rooms) | STACK $899 add-on, Togal core | **Read the printed room-tag area and the legend**; wall-graph reconstruction only as a drafting aid with broken-enclosure markers | 6 | **better on stated data; worse on inferred data** |
| Natural-language plan query | Togal, STACK IQ | RAG with mandatory click-through citations **carrying sheet id and coordinate**; numeric questions route to SQL over extracted tables; backend rejects any model number not byte-matching a tool result | 6 | **better** — we control the schema |
| Items catalog (10,000+) | STACK | DB's own 709 reconciled items with effective-dated history and mined distributions (median, p25/p75, n) | 1 | **deliberately different, better substance** |
| Assemblies with formulas, waste, auto-quantity | STACK | Versioned, golden-tested, dimensionally-typed, seeded from **DB's own 101 live `quantityFormula` rows**, the workbook spec, and discovery over 46,248 cost groups | 2a | **better** — seeded from history, collapsing the learning curve |
| Labor rates and productivity | STACK | Burdened crew rate modelled **separately** from production rate; hours alongside dollars; rates mined from DB's `timeEntries` | 1 / 2a / 8 | **better** |
| Markup, margin, overhead, tax, waste | STACK | Explicit `markupBasis` discriminated union, canonical decimal multiplier, all three readings displayed together (§8.2) | 1 / 2a | **materially better** — forced, because DB's data contains both readings of "45%" |
| **Contingency, price adjustment, duration, escalation, contract type** | *gaps in all three* | Five first-class entities: reportable/releasable contingency; the only sanctioned way to move a bottom line; per-phase duration driving general conditions; required `valid_until` plus separately-reported escalation; `contract_type` with only `lump_sum` implemented (§9.7–9.9) | **2a** | **gaps repaired** |
| Branded proposal generation | STACK (limited customization) | **JobTread renders the contract.** We hydrate the verified template footer and **compute** the six-stage payment schedule (§7.6) | 2b | **better** |
| Templates, libraries, project cloning | STACK | Versioned phase-tree templates matching DB's real skeleton, each paired with a scope checklist that gates approval | 2a | **better** — forgotten scope, not arithmetic, is the common loss |
| Reports + Excel/PDF export | STACK, Togal | Three core reports, cost code in every export row, on every screen, **permanently** | 2a | parity — and never removed |
| **Change orders** | all three | Baseline reference, gapless per-job numbering, CO-specific markup selector, cumulative contract value reconciled against JobTread (§9.2) | **2b** | **gap repaired** |
| **Allowances & selections** | residential remodel table stakes | Mapped to JobTread's **native three-value `allowanceType`**; material-only allowances blocked without a sibling labor line (§9.3) | **2b** | **gap repaired** |
| **Lead-stage (unbound) estimates** | daily GC workflow | Legal with `jobtread_job_id IS NULL`; push blocked until bound; lost bids marked with a reason (§9.1) | **2a** | **gap repaired** |
| **Vendor-measurement ingest (HOVER/CANVAS)** | *nobody offers this* | A $59 report ingests as measurements with full provenance and prices through the same assemblies, gate and push (§11 seam 8) | **2b** | **better — buy the geometry, own the pricing** |
| Supplier price-list import | STACK (no live feeds either) | CSV/XLSX importer per supplier, column mapping, effective date, diff-review before applying | 5 | **gap repaired** |
| Concurrent multi-user editing | STACK | Per-estimate soft lease with visible holder; per-sheet locks on canvas; optimistic concurrency, **hard rejection**, never last-write-wins | 2a / 4c | safe subset, not parity |
| Granular roles, viewer seats, private projects | STACK | 4 roles (Admin / Estimator / Sales-PM price-only / Viewer) + separate push privilege + four-eyes threshold; cost stripped **server-side** | 2a | **deliberately skipped** |
| Plan markup & annotation | STACK (clunky) | Annotations strictly separate from measurement geometry, **pushed to JobTread's native plan room as vector paths** (§7.11), plus assumption/exclusion pins that auto-populate proposal clarifications | 5 | **better** |
| Plan overlay & revision differencing | STACK (prevents missed-revision COs) | Registration → vector + raster diff → **dollar-ranked Impact Report** + hard approval block on unreviewed stale takeoffs | 5 | **candidate list, precision measured** |
| Mobile / tablet takeoff | STACK (poor in practice) | iPad: plan view, photo + voice capture, scratch ruler, phone-quote entry, proposal presentation, approval review. **No measurement creation.** | 4a | **deliberately skipped** |
| Bid management, sub network, leveling | STACK's own gap | One sliver: per-scope "sub bid / allowance / self-perform" status with dollar exposure at the gate, plus `bidRequest` Pricing Requests | 5 | **deliberately skipped** |
| Integrations (Procore, QBO, Sage, Excel) | STACK | One integration, done deeply: **JobTread** (§7) | 2b | **far better — the reason to build** |
| Regional cost data (BNi, 600 regions) | STACK | None. DB's own actuals are better data for DB's market; the blocker is licensing, not code | never | **deliberately skipped** |
| Done-for-you takeoff, ±1% guarantee | Beam AI | None — and read what it is: a *consistency* guarantee against the client's own conventions, achievable because ~526 people enforce it. **DB already owns that half.** | never | **already owned** |
| Generative estimate from a description | Handoff | Safe subset only: model-drafted scope narrative, exclusions, assumptions prose. The schema makes it **structurally impossible** for a model to populate a quantity field | 5 (prose) / never (quantities) | **deliberately skipped** |
| **Estimate versioning, audit trail, locked sent proposals** | *gap in all three* | Hash-chained append-only log, `UPDATE`/`DELETE` revoked at the DB grant; immutable revisions pinning every dependency version; takeoffs bound to plan revision + confirmed calibration | 2a / 4b | **capability none of them sells** |
| **Controlled availability** | *gap in all three* | Deploys never in bid hours; degraded read-only mode; exportable snapshots; rehearsed manual fallback (§8.10) | 3 | **better** |
| **Estimate→actuals feedback loop** | *nobody can do this for DB* | Variance decomposed into quantity, price, **duration** and scope, attributed to the exact assembly output alias via our own `globalId` | 8 | **the compounding asset** |

---

## 4. Resolving the three-way tension

Ship-fast, prove-correct and AI-first are not in conflict about **order** — all three agree the canvas is late. They conflict about what the first shippable thing is and what gates it.

**AI-first wins the first phase and loses its own name.** Its real contribution is mining the cost corpus, which involves no machine learning. That goes first because it is **read-only** (zero possibility of a wrong number reaching a customer), because it front-loads the long-lead domain work blocking everything downstream (catalog reconciliation, unit normalization, markup formalization, the margin baseline), and because it ships user-visible value at ~week 24. Phase 1 is a SQL-and-aggregation phase, not an AI phase.

**Ship-fast wins the sequence and loses on schedule.** The engine and push land before the canvas, because the re-keying is the pain and typed quantities are enough to eliminate it. But eleven weeks to a real pushed bid was 2–3x optimistic; the first real push is realistically **month 11**.

**Prove-correct wins the gates and loses its sequencing instinct.** The parallel run is a **funded, named phase with numeric exit criteria** (Phase 3), not a soft pilot — without a measured gate, "it feels right" becomes the trust criterion and the first wrong contract is found by a customer. But wanting the full reliability apparatus before anything ships delays first value past month 12 and maximizes the adoption risk it names as a project killer. The repair is the **Minimum Reliability Core** (§8.1): a named, non-negotiable subset hard-blocking push #1, with the rest arriving in Phase 3. When a phase slips, the reliability property Carl asked for cannot be quietly negotiated away while the feature list stays intact.

**AI-first loses the sequence outright, and loses its headline capability permanently.** The extraction that matters needs the geometry harvest, which needs the canvas's coordinate model. And the capability most associated with "AI estimator" — automatic room segmentation — is **not built**, because the architect already printed the area in the tag.

**One thesis holds across every phase:** text from the model, numbers from geometry and the cost database. Enforced in the schema, not in a prompt.

---

## 5. Decision log

| # | Decision | Choice | Rejected | Why it lost |
|---|---|---|---|---|
| 1 | Build order | Cost intelligence → engine + push → parallel run → canvas | Canvas first (how every vendor is organized) | Canvas-first means nothing usable for months and a worse canvas than you can rent. Each boundary here is a stopping point with standalone value |
| 2 | Assembly formulas in v1 | **Hard-coded, unit-tested TypeScript** in `packages/assemblies` | A dimensionally-typed expression DSL with a persisted AST | 100–200 hours for a capability that, at 16 assemblies authored by the developer, buys nothing. It earns its place when a non-developer must author one without a deploy, or the count exceeds ~40 |
| 3 | Worksheet in v1 | Plain grid + saved column sets + Excel keyboard model | Pivot selector with nested saved views | 150–300 hours for a reporting convenience. Grouping is a view over a flat line pool either way |
| 4 | Offline posture | **Offline-tolerant, not offline-first.** Server-authoritative through Phase 3 | "Local-first client keeps working when the server does not" | Cannot coexist with a concurrency design that rejects CRDTs and has no local store or sync layer. An IndexedDB WAL arrives in Phase 4c for the in-flight takeoff gesture, where it earns its keep |
| 5 | Direction of truth | JobTread owns jobs, customers, actuals, the signed document. We own takeoff, assemblies, rates, the draft. One-way explicit push | Bidirectional line-item sync | **VERIFIED:** no `costItem`/`costGroup` event of any kind, and the `event` type carries no such relation. Line-item edits inside JobTread are invisible by construction. Two-master financial sync across a boundary you cannot observe loses money quietly |
| 6 | Money representation | Decimal, scale 4 for unit costs, 2dp extensions, sum-of-rounded aggregation, one rounding boundary | Floats (matching the wire) or integer cents | **VERIFIED:** every money field is a plain `number`; no decimal type exists. Observed: `8.206999999999999`, `869.9999999999999`. Floats drift or raise phantom alarms, and alarm fatigue disables every other control. Cents throw away real sub-cent unit costs |
| 7 | Markup representation | Discriminated union `{MARKUP_ON_COST \| MARGIN_ON_PRICE \| MULTIPLIER}`, canonical decimal multiplier, all three readings shown | A percentage field plus a documented convention | **VERIFIED:** DB's data contains both readings of "45%" simultaneously — Materials ×1.450 (45% markup, 31.03% margin), Labor ×1.818 (45% margin, 81.8% markup). One field reproduces one and corrupts the other, invisibly until close-out |
| 8 | Measurement vs Quantity | Four separate entities; `Measurement` has **no** unit, waste or rounding field | The computed quantity stored on the shape | Conflation breaks six things: one wall cannot feed LF + SF + EA without duplicate traces that drift; waste compounds silently for the second consumer; rounding destroys the evidence; revision triage becomes impossible; re-pricing requires re-measuring; the audit question becomes unanswerable |
| 9 | Scale | Per-**viewport** state machine, database-enforced confirmed-only view | Auto-detect from the title block with a dismissible warning | A wrong scale multiplies every length by k and every area by k² with no symptom — a ¼″ plan read as 3⁄16″ makes every area 78% of truth. Warnings get clicked through under deadline, and one clicked-through warning becomes a contract |
| 10 | Queue / outbox | pg-boss on the same Postgres, own schema, JobTread writes at concurrency 1 | Redis-backed BullMQ | Sealing a revision and enqueuing its push must be **one transaction.** Redis needs a two-phase dance to recover what Postgres gives free, plus a second stateful system that can be lost |
| 11 | Concurrency | Single-writer soft lease, version-checked writes, hard rejection | CRDTs (Yjs / Automerge) | CRDTs guarantee convergence, not correctness — and a converges-to-a-line-nobody-priced outcome goes into a signed contract. Per-field last-write-wins on money is a policy about whose number wins, disguised as a data structure. Also 4–8 weeks plus a permanent complexity tax, and it breaks the audit requirement that every customer-facing number has exactly one named author |
| 12 | Customer proposal | **JobTread renders the contract.** We hydrate the template and compute the payment schedule | Our own branded proposal generator with immutable archival | **VERIFIED:** `createDocument` accepts no `templateId`, and the footer of `22PBz2nQunqm` *is* the DB contract, where customers already sign. Rebuilding it duplicates a legal instrument for no gain and creates divergence between two copies. Immutable archival still comes from the revision snapshot + payload + read-back |
| 13 | Formula mirroring | Push a **resolved, variable-free derivation string** into `quantityFormula` | Push live executable formulas so JobTread can recalc | **VERIFIED:** JobTread has a working evaluator — 5,451 live formulas — but **zero on `customerOrder` lines.** DB's convention keeps formulas off customer-facing documents. A second calculation engine co-authoring contract numbers, where no webhook would report it, is worse than a cosmetic gain |
| 14 | Extraction strategy | **Read the architect's assertions first; reconstruct only what is not stated. Deterministic before any model** | Train or fine-tune a segmentation model | A read tag area or legend row has **zero model error** and is the number the architect will defend. CubiCasa5K is ~5,000 Finnish apartments and will not transfer; labelling DB's sheets means 500–2,000 sheets of skilled annotation |
| 15 | AI output location | A separate proposals store keyed to `(sheet, plan_revision, model_version)`, **schema-incapable** of feeding a line item | Auto-accept above a confidence threshold | Automation bias is the failure mechanism: the more often it is right, the less it gets checked. Model confidence is not calibrated, so a threshold is a false control. The accept action is the only moment a human is forced to look at the drawing — the feature, not the friction |
| 16 | AI feature priority | **Features whose failures are VISIBLE before features with higher headline accuracy.** Counting and schedule extraction before anything producing an area | Rank by accuracy or demo impact | A wrong count mark sits on the sheet where an estimator sees it. A fused polygon or skipped opening back-out produces a clean, plausible, professional number nobody catches until the job loses money. **This is why gated ML is cut** |
| 17 | PDF engine | **Decided by measurement in Spike 3, on the *tiling* criterion**, not raw page render | Commit up front, or license Apryse immediately | pdf.js has **no canvas tiling support** — one canvas per page, memory w×h×4 bytes, multiplied again on high-DPI. The spike must measure clipped sub-rectangle rendering, in browser *and* Node. Apryse loses here because licensing it means it owns the viewer and the annotation model |
| 18 | Geometry storage | PDF user space (points), per page, `Float64Array`, forever. Derived quantities persisted once at commit with the kernel version recorded | Screen space; or recompute at read time | Screen space makes every measurement depend on zoom and DPR. Recomputing at read time means a kernel upgrade changes the price of a signed estimate. Float32 drifts visibly on a 3024×2160pt sheet |
| 19 | Roofing | Deferred to Phase 9 — **honestly, 2029** — except seam 8, the vendor-measurement adapter, which moves into Phase 2b | Build both together | **VERIFIED:** DB already pays HOVER $58.99–112.61/job and CANVAS $0.40/SF. Exteriors have a working answer; interiors have none. Roofing's markup structure (×2.33–2.65 warranty adders vs ×1.450 materials) would make the Phase 3 parallel run unreadable. But the adapter needs no canvas, geometry or AI, so parking it in Phase 9 was arbitrary |
| 20 | Hosting | Managed Postgres w/ PITR + API + separate workers + object storage/CDN. Single US region. **No GPU** | AWS ECS/RDS fully Terraformed; or Kubernetes | The dominant risk is running out of hours, not cloud reliability. The failure mode that matters is a wrong number, not a slow page. A GPU mostly idle is waste: the work that matters is geometric, not neural. Exit criteria to AWS are written down (§13) |
| 21 | **What "exact" means** | "Zero measurement error **against the drawing**, with residual error bounded by **drafting fidelity — which we measure, not assume**" | "A vector-derived area has zero model error" | Those are the *drawing's* coordinates, not the building's. Dimension strings govern and override graphics, details are drawn NTS, remodel existing-conditions walls are drawn schematically. Spike 4 measures the disagreement distribution between extracted geometry and printed dimensions; it becomes the published accuracy floor **and** the §8.3 cross-check (iv) tolerance, rather than an arbitrary 2% |
| 22 | **Gated ML as a phase** | **Cut.** Wall-graph reconstruction and NL query move to Phase 6; scanned-sheet OCR and table extraction become a **purchased** adapter; room segmentation becomes a non-goal | A conditional 12-week ML phase that "may never be built" | A conditional phase with a budget line is a phase that gets attempted. Research-grade room segmentation is ~0.50–0.77 mean IoU cross-domain — not contract-grade — and its failures are exactly the silent class the human gate does not catch (Decision 16). Cutting it removes 12 dev-weeks, ~60 estimator hours of ground-truth labelling, and the plan's worst risk |

---

## 6. The phase plan

### 6.1 Summary

| # | Phase | Cal. wks | Dev-wks | Carl hrs | Est. hrs | Ships? | Gate |
|---|---|---|---|---|---|---|---|
| −1 | **Hire** (parallel) | 10 | — | 20 | — | no | Signed candidate |
| 0 | **Decide & Prove** | 10 | 6.2 | 24 | 34 | no | **Gate 0: go/no-go, in writing** |
| 0b | **Deferred spikes** (inside Phase 1) | — | 4.6 | 4 | 6 | no | Verdicts in ADR 0001 |
| C | **Catalog reconciliation** (parallel, no dev) | 6 | 0 | 16 | 40 | no | Signed mapping table |
| 1 | **Cost Intelligence** (read-only) | 13 | 11 | 20 | 30 | **yes — wk ~24** | Gate 1: replay + measured usage |
| 2a | **Estimate Core** (no writes) | 11 | 10 | 24 | 50 | **internally** | Gate 2a: engine correctness |
| 2b | **Bridge, COs & Allowances** | 11 | 10 | 12 | 24 | **yes — first push ~wk 48** | **Gate 2: MRC green** |
| 3 | **Parallel Run & Cutover** | **f(N)** | 9 | 10 | 130 | authoritative ~wk 60 | **Gate 3: canvas go/no-go** |
| 4a | **Plan ingest + viewer** | 9 | 8 | — | 8 | yes | Perf budget per device class |
| 4b | **Scale + measurement + snapping** | 12 | 11 | — | 24 | yes | Geometry goldens + timed head-to-head |
| 4c | **Guards + WAL + locks** | 6 | 5 | — | 8 | yes | Crash-recovery drill |
| 5 | **Change Under Pressure** | 8 | 8 | — | 20 | yes | Addendum drill |
| 6 | **Deterministic Extraction** | 18 | 16 | — | 50 | yes | ≥35% on the vector subset |
| 8 | **Actuals Loop** | 6 | 6 | — | 10 | yes | 3 reconciled jobs |
| 9 | **Roofing** | 8 | 8 | — | 20 | yes | Seam test |

Phase 4 is three independently shippable slices; **stopping after 4a or 4b is a legitimate outcome** with the rented canvas still in place.

### 6.2 Calendar

Dates after Gate 0 are **derived, not committed** — Phase 3's duration is a function of N (bids/yr), which Spike 1 measures, so every date past Gate 2 moves with that measurement.

| Phase | Start | End | Note |
|---|---|---|---|
| −1 Hire search | Mon 2026-09-21 | Fri 2026-11-27 | Parallel to Phase 0 |
| 0 Decide & Prove | Mon 2026-09-21 | Fri 2026-11-27 | **Short-term senior contractor** — a 10-week engagement is far easier to buy than a 15-month hire, and it is a working interview. Contains a calendar-bound 30-day STACK trial |
| **Gate 0** | | **Mon 2026-11-30** | Carl signs one of three paths |
| C Catalog reconciliation | Mon 2026-11-30 | Fri 2027-01-08 | Carl + estimator on Phase 0 tooling; fills the hiring gap productively |
| 1 Cost Intelligence (+ 0b) | Mon 2026-11-30 | Fri 2027-02-26 | 13 cal wks / 11 dev-wks, holidays absorbed. 0b on contractor retainer |
| **Gate 1** | | **Mon 2027-03-01** | |
| 2a Estimate Core | Mon 2027-03-01 | Fri 2027-05-14 | |
| **Gate 2a** | | **Mon 2027-05-17** | Engine correct before it may write |
| 2b Bridge, COs & Allowances | Mon 2027-05-17 | Fri 2027-07-30 | |
| **Gate 2 — MRC** | | **Mon 2027-08-02** | First push to a real customer job |
| 3 Parallel Run & Cutover | Mon 2027-08-02 | **f(N)** | 12 cal wks at N≥80; longer below |
| **Gate 3 — canvas decision** | | ~**Mon 2027-10-25** | Re-quote STACK/Togal the same week |
| 4a–4c Takeoff | Mon 2027-11-01 | ~Fri 2028-05-19 | 24 dev-wks + slack, three gated slices |
| 5, 6, 8, 9 | 2028 → **2029** | | Re-decided at each gate. **Phase 9 roofing lands in 2029** |

**Named owners** are filled in before Gate 0: *Developer* (all code), *Carl* (gate decisions, markup ratification, cost-code adjudication, approval / contingency / price-adjustment policy), *Named Estimator* (assembly authorship, parallel run, timed comparisons), *Maintenance Owner* (year-3 continuity).

### 6.3 Phase 0 — Decide & Prove (10 cal weeks, 6.2 dev-weeks core)

Ten calendar weeks, which the 30-day STACK trial requires anyway, carrying a **must-answer core of 31 dev-days**, with six spikes deferred to **Phase 0b** inside Phase 1's calendar on contractor retainer. Every spike ends with a **written verdict** in ADR 0001. No spike may end "pending." A template-introspection spike is *not* on this list: it was executed during the preparation of this document and the answer is in §1.1 — the shape every spike should take.

#### Core — must answer before Gate 0 (31 dev-days)

| # | Spike | Days | Kill criterion |
|---|---|---|---|
| **0** | **The cheap competitor.** 30-day STACK trial, two real bids, then a throwaway ~200-line script reading STACK's export and creating a nested JobTread `customerOrder`. Includes verifying the export carries structure the Phase 2 engine can ingest — fidelity, cost tier, API vs CSV | 5 | **If it works and the estimators would use it daily: buy, keep Phase 1, build only the push.** Most likely correct answer |
| **1** | **Measure today — cost AND revenue.** Time three real bids end to end, split takeoff / pricing / re-keying. Count GC estimates/yr. **Revenue, win rate and estimated margin are now MEASURED (§2.5): ~$9.1M annualized approved, 70.5% win by count / 53.8% by value, 36.5% estimated margin. What remains: split those by `Job Type`/`Project Type` to isolate general construction, and reconcile 15–20 GC jobs retrospectively — only 18 jobs carry a realized margin and all are small service work.** Count the insurance-restoration share of interior work | 3 | H×N < ~$15K/yr **and** margin sensitivity < ~$25K/yr → buy. Restoration > ~40% of interior volume → Xactimate is the real incumbent; re-scope |
| **1b** | **Two phone calls.** Written quotes from STACK and Togal for DB's real seat count; confirm tier structure and where AI is gated. **Owner: Carl** | 0 (Carl, 1 hr) | Not a kill; a hard blocker on the Gate 0 memo |
| **2** | **Four-axis plan census** over the last 50 jobs' plan sets. Per page: (i) vector / raster / hybrid; (ii) wall representation — stroked linework with clusterable widths vs hatched / poché / filled; (iii) **text encoding** — real text objects with usable Unicode, per-glyph text needing reassembly, or stroked SHX geometry, reported as the share of sheets carrying machine-readable *dimension strings* and *room tags*; (iv) **layer metadata** — presence and semantic quality of PDF OCGs. Also count distinct Form XObjects invoked >5×/page | 5 | < 30% vector → **stop at Gate 3.** < 50% machine-readable dimension strings → §8.3 source (a) demotes, cross-check (iv) unavailable on most sheets, ~4–6 weeks of OCR work moves into Phase 6. OCGs present → several Phase 6 designs simplify. No instancing → autocount is not "better than STACK" |
| **2b** | **Togal on DB's own sheets.** Run five real plan sets plus one scanned remodel set through a Togal trial; hand-measure the same rooms and walls; publish MAE, max error and mean signed error **per category** — the exact metrics §10.3 gates on | 3 (+ est. time) | Togal clears the §10.3 thresholds → **build Phases 1–5, license detection, never build Phase 6 extraction** |
| **5** | **JobTread write-path harness** against ONE disposable test job (`DBE0.` prefix, compile-time allowlist). Answers: `updateDocument` lineItems replace-vs-merge; is `externalId`/`globalId` uniqueness server-enforced (probe by attempting a duplicate); behaviour on a `createDocument` that times out after succeeding; `customFieldValues` write key format. **Plus JobTread's own rounding policy:** push three fixtures (a 4dp `unitCost`; one engineered so round-per-line and sum-then-round differ by a cent; a half-cent extension) and read back `cost`, `price` and every line's `cost`/`price` | 6 | Full-replace `updateDocument` → the in-place path is **banned**; revisions-as-new-documents becomes the only strategy. **If JobTread sums-then-rounds, the reconciliation contract changes — not our rounding** |
| **6** | **Markup formalization.** Candidate rules vs the **46 measured** priced rows; then classify the **general-construction subset** of the 709 into rule-covered / named-exception / data-quality-artifact / undecided. **Must also answer Q6: is the Materials-markup / Labor-margin split deliberate or accidental?** | 5 | 46 rows not reproduced to the cent, or < 85% of C-scope rule-covered → pause. **Answer "accidental" → the replay gate splits in two (§8.4) and Carl chooses a go-forward rule set with an effective date** |
| **6b** | **Read the spreadsheet.** Collect every estimating workbook version in use, dump all formulas, reverse-engineer the implicit assemblies, waste factors, productivity rates, markup order-of-operations and any final-price adjustment step into a written specification. **Collection needs no developer — the estimator pulls the files in week 1.** The cheapest source of domain truth in the project: DB's actual estimating logic lives in the workbook this plan proposes to replace, and inferring markup rules from 46 catalog rows is guessing at something that may be written in a cell formula | 2 | Not a kill. **Its output — not the developer's reconstruction — is the input to Phase 2a's 16 assemblies, and a required cross-check on Spike 6** |
| **7** | **Historical replay** of 3 real estimates (incl. `22PejfgufCkY`, $277,971.02 / $177,437.36, 28 groups / 72 items) to the penny | 3 | Unexplainable discrepancy → the money model is wrong and must be fixed before anything is built on it |
| | **Core total** | **31 days ≈ 6.2 dev-weeks** | |

#### Phase 0b — deferred into Phase 1's calendar (23 dev-days)

| # | Spike | Days | Kill criterion |
|---|---|---|---|
| 3 | **PDF engine bake-off** on the 5 ugliest real sets, on the **tiling** criterion: can the engine render an arbitrary **clipped sub-rectangle** of the densest sheet at 8× in <120ms, in the browser *and* in Node, without full-page allocation? Plus peak memory over a 100-page scroll, render failures, visual diffs — desktop Chrome **and the actual field iPad, whose real `ImageBitmap`/canvas ceiling this spike measures rather than assuming** | 5 | Neither engine can tile → **the canvas is a buy decision; re-run build-vs-buy** |
| 4 | **Vector room polygonization AND drafting fidelity** on 3 real sheets: stroke-width (or OCG layer) wall filtering → node/snap-round → `polygonize_full` → doorway-gap bridging → face attribution. **Validated two ways: against printed room-tag areas, and by comparing extracted geometry against every printed dimension string on the sheet** | 7 | < 80% of tagged rooms within 2% → reconstruction is a drafting aid only, which is already the plan. **The fidelity distribution becomes the published accuracy floor and the §8.3 cross-check (iv) tolerance** |
| 8 | **Catalog triage + read DB's own formulas.** Over the C-scope rows: duplicate clusters, unit-normalization candidates, null-price placeholders, semantically-wrong cost codes. **Plus read the 101 catalog `quantityFormula` rows** | 3 | > ~250 rows needing Carl → Workstream C is re-cut by trade with named tranches |
| 9 | **Webhook + QBO audit.** Read every registered consumer's handler; confirm whether a `customerOrder` created via API propagates into QuickBooks Online | 3 | Not a kill; a **hard blocker on push #1.** Each consumer skips our namespace, or is patched |
| 10 | **Grant + rate limits.** Provision the least-privilege runtime grant (§7.8); rotation rehearsal (current grant expires **2026-12-17**); token-bucket calibration | 3 | Scoped grant impossible → the compile-time allowlist becomes safety-critical code with its own tests |
| 11 | **Plan-room coordinate calibration.** Existence is VERIFIED. This spike establishes **what `plan.scale` means (ratio or units-per-pixel), what coordinate space `annotations[].points` uses, and how `isNegative` composites** | 2 | Getting `scale` wrong silently corrupts every pushed quantity — **calibrate empirically, never infer.** A JobTread `plan` is ONE page with ONE scale, so §8.3's per-viewport model is **not natively representable**; a sheet with two scales pushes only its primary |
| | **0b total** | **23 days ≈ 4.6 dev-weeks** | |

**Also delivered in Phase 0:** the fixture corpus (40–60 scrubbed historical `customerOrder`s + 5 real plan sets + one scanned remodel set + a catalog snapshot); the repo skeleton with CI (typecheck, lint, no-float-in-money, machine-enforced package boundaries); ADRs 0001–0014; the catalog triage tooling; and a **costed three-way go/no-go memo** Carl signs.

**Gate 0 exit criteria** — each a document or a number, not a judgement:
- Every core spike has a written verdict with measured numbers in ADR 0001.
- The PDF engine is chosen on a tiling measurement; if neither tiles, that is written down and build-vs-buy is re-run.
- The four-axis plan census is published as four percentages from DB's own jobs.
- H, N, annual GC revenue, win rate and the 40-job margin variance are measured numbers.
- Togal's per-category MAE / max / mean-signed error on DB's own sheets is published.
- All ADR 0001 open questions resolved in writing, including JobTread's rounding policy.
- Every webhook consumer owner has confirmed or scheduled a namespace-skip patch.
- The estimating workbook specification exists and Carl has countersigned it as accurate.
- **A senior developer is signed with a start date.**
- **A named estimator has committed 4 hrs/week in writing, on a recurring calendar block.**
- **A year-3 maintenance owner is named.**
- **A signed contractor agreement covering IP assignment, confidentiality and data handling** (§14.2), dated before the contractor's first day.
- Carl has signed one of the three paths.

### 6.4 Phase 1 — Cost Intelligence (13 cal weeks, 11 dev-weeks) · READ-ONLY

Ships a usable tool at ~week 24 with **zero possibility of a wrong number reaching a customer**, because nothing writes to JobTread. The permanent parallel-run CI harness reproducing 40–60 historical documents to the cent is what makes this 11 dev-weeks rather than 8; replay harnesses eat weeks once real data-quality artifacts surface, and five classes of them are documented in ADR 0001.

**Modules:** `packages/db` (Drizzle schema + reviewable SQL migrations) · `packages/jobtread/taxonomy.ts` (62 cost codes / 5 cost types / 28 units / 30 templates / 70 custom fields, **keyed by id — never by name**, because `Specialites` is misspelled and load-bearing and six templates share the name "Estimate") · `packages/mining/{corpus,aggregate,distributions,productivity,duration,assembly-discovery}.ts` · `packages/catalog/{cluster,unit-normalize,mapping-table}.ts` · `packages/money/*` · `apps/web` (read-only).

**The corpus partition rule — the gap that would otherwise double-count.** VERIFIED: 176,156 cost items, of which **81,473 have `document = null`** (catalog + *job budget* lines) and **709** are the true priced catalog. Budget, `customerOrder`, `customerInvoice` and `vendorBill` lines are different animals: mining them together blends what DB *budgeted*, *quoted* and *actually paid*, and the same dollars appear two or three times.

```
CORPUS PARTITION (enforced in packages/mining/corpus.ts; every statistic
declares its partition, and the UI shows it next to the number)

  P0  catalog        document=null ∧ job=null ∧ prices>0   →   709   vocabulary
  P1  job_budget     document=null ∧ job≠null              → ~80,764 planned
  P2  quoted         document.type='customerOrder'         → ~?      what we quoted
  P3  invoiced       document.type='customerInvoice'       → ~?      what we billed
  P4  paid           document.type='vendorBill'            → ~?      what we PAID ← unit costs
  P5  committed      document.type='vendorOrder'           → ~?      earlier signal

  Unit-cost distributions   := P4, fallback P2
  Productivity (hrs/unit)   := costItem.timeEntries ÷ installed qty from P2
  Realized waste / yield    := purchased (P4/P5) ÷ theoretical (ours)
  Phase duration (weeks)    := timeEntries date span per job phase      → §9.9
  Margin baseline           := job Reconciled Revenue/Cost, Final Margin % → §2.5, §8.5
  NEVER union P1 with P2/P3.  NEVER union P2 with P3.
```

**Cohort tagging with visible exclusions** — insurance restoration, warranty, service repair, unreconciled jobs and `unitAmbiguous` rows are excluded from general-construction statistics **by default, with the reason shown beside every statistic.** A statistic whose population is a mystery does not get trusted, and correctly so.

**Mining uses server-side `group`/`aggs`** (VERIFIED: `count`, `sum`, `avg`, `min`, `max`, `values`, plus `group` taking `{by, firstIdBy, aggs, where}`) rather than paging 176k rows at 100/page. Pave offers **no median, no percentile, no stddev**, so `values` streams raw unit costs for high-n items and medians / IQR-trimmed means are computed client-side. **`values` is subject to the same 100-row page cap**, so a high-n item still needs cursor pagination. Every output is a **distribution with n and spread** — never a value: VERIFIED, `Drywall Board - Mat` appears three times in one group at $27.98, $26.18 and $21.68, all linked to the same `organizationCostItem`.

**Assembly discovery** starts with DB's own **101 live catalog `quantityFormula` rows** — explicit human-authored rules — and only then clusters 46,248 cost groups for co-occurrence sets and quantity ratios (a Drywall/Plaster group yields ~0.0358 hr/SF hang and ~0.0554 hr/SF mud from DB's completed work). Reading the written-down rules before mining statistically is cheaper and more accurate.

**Confidence grading:** every mined statistic lands `UNVERIFIED` and **invisible to estimators** until a senior estimator promotes it to HIGH/MEDIUM with a name and timestamp. Publishing produces an immutable `RateTableVersion`.

**Gate 1 exit criteria:**
- The parallel-run CI job reproduces **≥95% of line items within $0.01** across the fixtures, and **document cost and price to the cent on ≥40 of them.** Every unreproduced line carries one of four classifications plus a committed regression test if it is a tool bug. **Named exceptions capped at ≤5% of line items and ≤0.5% of aggregate document value** — above either cap the rule set has failed and the gate is not passed, whatever anyone signs.
- The **46 measured** priced catalog rows reproduce `unitPrice` from `unitCost` byte-exact under the correct per-cost-type reading. **Hard, no exceptions.**
- **The 709 are split by trade first** (a cost-code and name query, hours not days). Then **100% of the general-construction subset classified with zero undecided, ≥85% rule-covered.** The roofing/exterior subset is **explicitly parked as UNVERIFIED and invisible, with its count published.** A large share of the 709 are gutters, downspouts, step flashing and warranty products Phases 1–8 will never price; adjudicating them would burn Carl's hours outside the approved scope.
- ≥200 catalog items carry a promoted distribution with n ≥ 5, covering DB's top 30 cost codes by historical dollar volume.
- **The margin baseline is published:** mean and spread of |actual − estimated| as a % of contract value across a retrospectively reconciled sample of **15-20 general-construction jobs** (not the 18 existing service-work reconciliations, which are the wrong population). §8.5 stage 3 and §2.5 both require it to exist.
- **Nightly ingest runs unattended 14 consecutive days with a heartbeat.**
- **Measured usage, not inferred enthusiasm:** ≥8 distinct sessions by ≥2 estimators during live bids within a stated 3-week window, evidenced by application telemetry (session, bid id, queries run), with the estimator writing one sentence per session on what they were trying to learn.
- Zero writes to JobTread outside the disposable test job.

**Not in this phase:** any write to JobTread (enforced by a compile-time read-only client) · any PDF, canvas or takeoff · any model call · estimate creation · auto-applying any proposed correction · `updateCatalog` in any runtime grant.

### 6.5 Phase 2 — split into 2a and 2b (22 cal weeks, 20 dev-weeks)

The split puts a gate between "the engine computes correctly" and "the engine is allowed to write," which is the right risk boundary. Two items move out of Phase 2 entirely because neither is on the critical path: the **MCP server** and the **LLM-drafted scope narrative**. Both go to Phase 5.

**Phase 2a — Estimate Core (11 cal weeks, 10 dev-weeks) · still no writes.** Modules: `packages/money/{markup,rounding,contingency,jobtread-boundary}.ts` · `packages/units/{dimensions,units,packaging}.ts` · `packages/assemblies/*` · `packages/estimate/{model,invariants,revision,approval,adjustment}.ts`

- **Money + units core:** decimal scale 4, one rounding boundary at the line extension, sum-of-rounded aggregation, dimensional typing where multiplying a quantity by an incompatible unit cost is a **compile error**, item-scoped `PackageSpec` so area→sheets is legal only through a specific catalog item.
- **16 assemblies** authored with the named estimator, seeded from **the Spike 6b workbook specification** and Phase 1 discovery: interior partition, room finish package, drywall, paint, exterior wall stackup, demolition + debris with rental-tier selection, flooring, interior trim run, window/door unit, tile wet area, insulation, cabinetry run, **general conditions** (duration-driven per §9.9, with the two %-of-price fee codes solved algebraically, not iteratively), concrete flatwork, deck, MEP sub-bid scaffold.
- Worksheet: flat line pool, plain grid with saved column sets, Excel keyboard model, paste-a-column, provenance chip on every quantity, visible rule chain on every price, grey "manual" rail on unsourced quantities, amber override badge with one-click Reconcile, persistent margin bar with target rail, **audience mode where Customer Preview structurally omits cost columns from the rendered document** (not hidden by CSS), with distinct window chrome and a persistent banner.
- **Contingency (§9.7), final-price adjustment (§9.8), duration, escalation and bid validity, contract type (§9.9)**, and **lead-stage unbound estimates (§9.1)**.
- Immutable revisions with content hashes and pinned dependency sets; append-only hash-chained event log with `UPDATE`/`DELETE` revoked at the DB grant.
- Approval gate with server-enforced blockers; named approver; four-eyes above a Carl-set threshold.
- **Authentication and identity (§8.9)** — Google Workspace SSO, MFA on push and Admin, session policy, login audit into the same append-only log.
- Proposal PDF and internal cost worksheet, rendered from the immutable approved snapshot.

*Gate 2a:* the engine reproduces the Phase 1 fixture corpus to the cent **from assemblies** rather than stored line values · 100% line and branch coverage on `packages/{money,units,assemblies,estimate}` · every §9.7–9.9 entity has one test proving its gate blocker **fires** on a crafted violation · three estimates produced in parallel with the spreadsheet agreeing within 1% on ≥95% of lines · **no unauthenticated path to any cost or customer data, proven by test.**

**Phase 2b — Bridge, Change Orders & Allowances (11 cal weeks, 10 dev-weeks).** Modules: `packages/jobtread/{payload,push,reconcile,template-hydrate,payment-schedule,plan-push}.ts` · `packages/estimate/{change-order,allowance}.ts` · `packages/vendor-measure/*` · `apps/worker` (pg-boss: `push`, `reconcile`, `mine`)

- **The JobTread bridge in full (§7)** — payload builder, outbox, five-state idempotency machine, three-tier reconciliation, template hydration, computed payment schedule, plan-room annotation push.
- **Change orders** (§9.2) and **allowances and selections** (§9.3), on JobTread's native primitives.
- **The vendor-measurement adapter** (§11 seam 8): a $59 HOVER or CANVAS report ingests as measurements with full provenance and prices through the same assemblies, gate and push. ~1–2 dev-weeks, no canvas, no geometry, no AI — and it makes exterior and roofing estimating usable **years** before Phase 9.

*Gate 2 = the Minimum Reliability Core (§8.1), all 17 items green, plus:* the computed payment-schedule footer reproducing a real historical estimate's figures to the cent · a senior estimator having pushed a real estimate to a real job after reading the pre-flight diff aloud, and that document having gone to a customer unchanged.

**Not in this phase:** any takeoff or PDF viewer · any AI-generated quantity · `updateDocument` on anything a human may have sent or signed · job budget sync, POs, sub packages · pivot worksheet · granular permissions beyond four roles · mobile.

### 6.6 Phase 3 — Parallel Run & Cutover (9 dev-weeks; calendar is f(N))

A fixed 10-week window requiring 15 bids done both ways assumes N ≥ 80. At N = 45, ten weeks yields ~8.6 bids. So duration and bid count are explicit functions of the N measured in Spike 1:

| Measured N | Phase 3 calendar | Qualifying parallel bids | Historical re-runs allowed |
|---|---|---|---|
| ~45 | **17 weeks** | 9 live | + 6 closed historical bids re-run, at **half evidentiary weight** |
| ~80 | **12 weeks** | 15 live | 0 |
| ~150 | **8 weeks** | 15 live | 0 |

**A qualifying parallel bid** is a real bid actually sent to a customer, produced independently both ways, ≥$15K in value, with the diff triaged and signed within 5 business days. A historical re-run is the same estimate rebuilt from its original inputs — it tests the engine but not the workflow, hence half weight, and it cannot exceed 40% of the total.

- **The diff harness first.** Line-by-line comparison matched on cost code + name + unit, unmatched lines called out, money at epsilon, every delta triaged into exactly one of: **tool bug** (fixed, with a regression test committed *before* the fix ships), **old-process error** (documented), **intentional methodology difference** (signed by Carl). **"Explained" requires a second named person to countersign** — otherwise it is adjudicated by the party who wants to pass.
- Shadow mode for every calculation change: compute both paths, display the old, log the delta with full inputs; a flag flips only after 10 real estimates with zero unexplained deltas.
- **Rollout beyond one estimator:** a one-page printed keyboard cheat sheet; two 90-minute sessions per estimator; a written cutover plan for in-flight estimates (any bid >50% complete in Excel finishes in Excel); named buddy pairing for the first three bids each.
- **Maintained user documentation** — a cheat sheet covers the people present at cutover and nobody hired afterwards. Required: a short written guide per workflow (new estimate, assemblies, allowances, change orders, approval, push), a screen recording of each, and a documented "new estimator day one" path.
- Operational hardening: zero-downtime deploys **never in bid hours** (path-based CI rule refusing to promote money/geometry/push changes Friday afternoon or on a weekend); read-only degraded mode instead of a hard outage; eight named alert conditions; 7am digest; heartbeats on every scheduled job; **monthly** single-estimate PITR drill and **quarterly** full off-provider restore drill, with a rule that a full restore older than 100 days blocks feature deploys.
- **The coverage procedure and abandonment drill** (§8.10, §13.1) are built and rehearsed here, not written down and hoped for.
- **Bootstrap the actuals loop now**, from historical closed jobs — waiting for new-tool jobs to close is a 6–18 month calendar wait.

**Gate 3 exit criteria** — every one a count, a measurement or a dated artifact:
- The qualifying bid count for the measured N, per the table.
- ≥95% of lines within 1%; **zero deltas > $100 or > 0.5% of total lacking a countersigned classification.**
- **100% of triaged deltas classified, with the count of old-process-error deltas published — whatever it is, including zero.** Requiring "at least one case where the tool caught an old-process error" depends on the old process having erred during the window, is not achievable by effort, and creates a live incentive to inflate one to pass a gate. Zero is legitimate and informative.
- Zero lost-work incidents, zero duplicate documents.
- Canary + nightly recompute audit green 30 consecutive days.
- Quarterly full restore drill passed inside the 4-hour RTO, with a timed written log committed to the repo.
- **Abandonment drill passed** (§13.1): app disabled for one business day, one complete bid produced the old way, timed and recorded.
- **A person who has never seen the tool produces a correct bid from the written guide alone, observed.**
- **Every estimator trained, not just the design partner.**
- **The margin re-test (§2.5):** realized margin on tool-priced jobs vs the Phase 1 baseline. If not measurably better, the margin case is dead and the Gate 3 memo says so.
- The spreadsheet formally retired for general construction, with Excel export one click away on every screen.

**Gate 3 is also the canvas decision.** Re-quote STACK and Togal the same week, with real velocity data from three completed phases.

### 6.7 Phases 4–9

**Phase 4 · Takeoff — 24 dev-weeks in three shippable slices.** The tile pyramid is the hidden line item: **pdf.js has no canvas tiling support**, so the pyramid means driving it with per-tile clipped transforms in the browser *and* in Node, against a library not designed for it — 3–5 weeks on its own, with Spike 3 as its gate.

- **4a · Plan ingest + viewer (8 dev-weeks).** Four-axis page classification stored as a permission; tile pyramid (levels 0–2 server-side with the *same* engine binary the browser uses, so client and server can never disagree about coordinates); **Sheet Register with title-block parsing and the sheet-index integrity diff**; full-text search; iPad plan view, photo and voice capture, proposal presentation. Useful alone the day it ships, and the highest-value slice for a PM. *Exit:* perf budget met **per named device class** — 60fps pan/zoom and <100ms commit on the densest real sheet on desktop Chrome, with a separately stated and **permitted-to-be-lower** iPad target derived from the ceiling Spike 3 measured.
- **4b · Scale, measurement and snapping (11 dev-weeks).** The scale interlock (§8.3); vector geometry harvest (**OCG layers where present, stroke-width clustering where not**); viewport as one affine matrix with geometry in PDF user space `Float64Array` forever; Canvas2D overlay + DOM/SVG layer for active-edit handles only; Flatbush (static) + RBush (live) hit-testing; conditions as the unit of work with colour **and** hatch; first-class deductions; **Measurement → MeasurementSet → QuantityBinding → Quantity** as four persisted entities; **and snap-assisted tracing over the harvested geometry.** Snapping belongs here, not in Phase 6: it is the largest single time saving in the plan, the harvest is already a 4b deliverable, and Gate 4's speed criterion is unpassable without it. *Exit:* geometry goldens ≤0.25% on every fixture variant (rotated / cropped / non-standard size / `UserUnit` / scanned) · the scale property (k → k, k², k³ and nothing else) · screen→user→screen round-trip within 0.5px on every commit · **timed head-to-head measured properly: 6 real jobs, alternating which method goes first, an independent timekeeper, the first two new-tool jobs excluded as training, and a pre-registered protocol defining where the clock starts and stops.** If Spike 2 returned below 30% vector, snapping does not apply and this criterion is renegotiated **before** Phase 4 starts, not failed at its end.
- **4c · Guards, recovery and locks (5 dev-weeks).** Overlap Guard (Primary / Reference / Linked + method-conflict flag); IndexedDB write-ahead log; per-sheet soft locks; the conflict recovery screen (§9.6). *Exit:* force-kill the browser mid-polygon, 20 times, and lose nothing.

**Phase 5 · Change Under Pressure (8 dev-weeks).** Ship the cheap half first and separately — the sheet-index diff and unmatched-NEW-sheet task list is set arithmetic over extracted sheet numbers, near-exact and nearly free, and it catches *added scope*, the failure nobody detects because nothing looks stale. It ships in 4a. **Then** the expensive half: plan revisions with sheet lineage matching (seeded from JobTread's native `plan.previousFilePages`); registration by title-block corners refined with matched vector content (a naive diff of unregistered sheets lights up the whole page and is worthless); vector + raster diff + revision-cloud signals; per-measurement staleness verdicts with **no "probably fine" state**; **Impact Report ranked by dollars, not drawing order**; the stale-walker with a running "remaining stale exposure: $X of $Y" counter. **The gate is precision, not recall**, measured on DB's own revision pairs — the hard problem is suppressing noise, not detecting change. Also: sub bid board with `bidRequest` Pricing Requests and a 15-second phone-quote widget; **options/alternates on JobTread's native selection groups** (§7.11) over one shared line pool, never three copies; supplier price-list import with diff-review; draft POs; job budget sync; the read-only **MCP server** and the **LLM-drafted scope narrative**.

**Phase 6 · Deterministic Extraction (18 cal weeks, 16 dev-weeks).** Three subsystems, each with its own per-architect tuning surface.
- **Schedule / legend / tag extraction first, because its failures are visible.** On text-bearing vector sheets this is a **spatial join between two exact datasets** — ruling lines are real vector rectangles with exact coordinates, cell contents are real text with exact coordinates. Near-exact, not a recognition problem. **Including wall-TYPE legend reading**, which neither Togal (position-inferred) nor STACK (interior/exterior only) does, and which is precisely where a GC's cost error lives.
- **A source crop image stored with every extracted row**, so verification is a two-second glance rather than a hunt through 200 sheets. The best verification design in the plan: checking a value against a crop is a task an estimator will actually do under deadline.
- **User-seeded symbol counting** via XObject instancing with geometry-hash fallback — scheduled **only after Spike 2's instancing census returns**, because many Revit and AutoCAD export paths flatten repeated symbols, in which case the exact mechanism yields nothing.
- **Wall-graph reconstruction and NL query.**
- **Scanned-sheet OCR and table extraction: purchased, not built.** One swappable adapter chosen by a 20-sheet bake-off on DB's real sheets, with a named annual cost line.

*Exit:* **≥35% takeoff time reduction measured on the vector-sheet subset, reported alongside the unimproved scanned-sheet number and the blended number weighted by DB's actual input mix from Spike 2.** A single blended gate can be passed by cherry-picking three vector-heavy jobs, which is what happens under schedule pressure.

**Phase 8 · Actuals Loop (6 dev-weeks, continuous thereafter).** Variance decomposed into **quantity** `(Qa−Qe)×Pe` (takeoff, waste or formula wrong), **price** `(Pa−Pe)×Qa` (stale rate or market move), **duration** (general conditions, the largest indirect block, previously unattributable), and **scope** from approved COs — attributed to the exact assembly output alias because our `globalId` rides on every pushed line. **Final-price adjustments (§9.8) are excluded from variance attribution**, so a competitive discount never pollutes a learned rate. Four separately learned things: unit cost, productivity, realized waste/package yield, phase duration. Governed `PricingProposal` batches with an impact simulation ("23 assemblies affected; re-pricing the last 20 live estimates moves average price +1.4%, max +4.1%"), human-approved, published as an immutable `RateTableVersion`. **Nothing auto-updates. Never tune the geometry engine — geometry is deterministic and its errors are bugs, so "tuning" one hides it.**

**Phase 9 · Roofing (8 dev-weeks) — a 2029 deliverable.** See §11. Seams declared early; seam 8 taken in Phase 2b; the rest waits.

---

## 7. The JobTread integration as a subsystem

Not an integration — a first-class subsystem with its own state machine, test harness and failure budget. JobTread explicitly does not support or debug customer-built integrations, so DB owns this code, and §7.10 says what happens when they change it.

### 7.1 Direction of truth

| Owned by JobTread | Owned by DB Estimator |
|---|---|
| Jobs (3,988), job numbers, 70 job custom fields, the Status pipeline | Plan ingest, sheet inventory, per-viewport scale calibration |
| Accounts (3,550) — customers, vendors, contacts | Takeoff geometry, measurements, derivation DAG |
| Cost-code / cost-type / unit vocabularies | Assemblies, formulas, waste factors, rounding rules |
| The 709-item organization catalog | Rate-table versions and mined distributions |
| Documents, status, signatures, recipients, budgets | The pre-commit draft and its revision history |
| The 30 templates (which carry the legal contract text) | Mapping tables and provenance chains |
| Files, and the native plan room | CO baselines, allowance reconciliation state |
| **Cumulative contract value** (§9.2) | Contingency, price adjustments, escalation, duration |

**The estimate document is the only shared object.** Everything upstream is ours; the document and everything downstream is theirs. `costItem` has no geometry field and there is no assembly primitive, so round-tripping geometry through line items would mean encoding it in `description` text — which is how integrations rot. Geometry does go to JobTread, but to the **plan room**, as vector annotations (§7.11).

### 7.2 Identity and idempotency

VERIFIED: `document.externalId` is nullable, ≤32 chars, **filterable**, **null on all 2,181 `customerOrder` documents** (non-null on 2,156 `vendorBill`/`vendorOrder`). `costItem.globalId` is nullable, ≤100 chars, **filterable**, **null across all 176,156 cost items**. Both namespaces are clean *where we write*. Server-side uniqueness is **UNVERIFIED** — assume it does not exist and enforce it ourselves, because assuming the server does it is the one assumption that could double-create a customer contract.

```
Document key (31 of 32 chars):  DBE1.01K5J7QX8ZN4M2VYB3TDCFGH9P
                                └┬─┘ └────────── ULID ──────────┘
                              namespace + schema version (a future DBE2 is
                              distinguishable, and a human in JobTread can
                              tell our document from AP's)

Line key (69 of 100 chars):     dbe1|<rev ULID 26>|<grpPathB32 10>|<line ULID 26>
Test artifacts:                 DBE0.<...>   ← permanently identifiable, filterable
```

ULID over UUID because a hyphenated UUID is 36 chars and an unhyphenated one leaves no room for a namespace; because it sorts lexicographically; and because its leading 48 bits are a millisecond timestamp, so an `externalId` is self-dating when you are debugging at 11pm.

**The ULID is generated at ENQUEUE time and persisted before any network call** — not at send time, not derived from content. That is what makes retries safe: the same outbox row presents the same key forever, across process restarts. Deliberately *not* a content hash: two revisions can be byte-identical and still be distinct business events.

`costGroup` has **no** `globalId` and no `externalId` (VERIFIED on the type and both group inputs), so group identity is not directly recoverable. A 10-char base32 digest of the group's materialized path is encoded into each child item's key and the tree is reconstructed from the leaves; `costGroup.descendentCostItems` makes that cheap.

### 7.3 The write path

One atomic `createDocument` builds the entire nested tree. VERIFIED: the `lineItems` cap is **1500 declared independently at each level**, so it is a **per-level cap, not a document-wide node budget.** The largest real DB estimate is 100 nodes. No partial-tree state is ever observable — the best reliability property in the integration, and the design leans on it completely: we never build an estimate incrementally with `createCostGroup`/`createCostItem`.

**The discriminator is the entity type, not the variant key.** VERIFIED: `createDocument.$.lineItems._on_newCostItem._type` is the constant **`"costItem"`**, and `_on_newCostGroup._type` is **`"costGroup"`**. New-versus-existing is discriminated by the **presence of `id`**. A payload using `"newCostItem"` as the `_type` string is rejected by validation — and this block is the artifact Phase 2b codes against.

```jsonc
// Request envelope. `notify` is a REQUEST-level input (root.$.notify, default
// TRUE). createDocument.$ has NO notify field. A payload builder that handles
// only per-mutation notify will email DB's customers on every create.
{ "$": { "notify": false },

  "createDocument": { "$": {
      "jobId": "22PaWqzecaPk",
      "type": "customerOrder",
      "name": "Estimate",
      "externalId": "DBE1.01K5J7QX8ZN4M2VYB3TDCFGH9P",
      "accountId": "22PaWqiYivDa",

      // taxRate is a FRACTION, gte 0 lte 1. 7.25% is 0.0725, NOT 7.25.
      // Resolved from TaxPolicy (§8.6) — never a create-time default, and
      // never assumed zero: 60 live documents carry 0.0725.
      "taxRate": 0.0725,

      "requireSignature": true,        // ← default FALSE; template says true
      "includeInBudget": false,        // ← DEFAULT IS TRUE. Always explicit.
      "showProfit": false,             // ← default false; still explicit
      "showQuantity": false,           // ← default TRUE, template says FALSE
      "showChildCosts": false,         // ← default TRUE, template says FALSE
      "showCostItemFiles": true,       // ← default true; still explicit

      "description": "<<from documentTemplate + provenance stamp>>",
      "footer":      "<<from documentTemplate, money placeholders substituted>>",
      "signatureDisclaimer": null,     // ← null on Const-Large; copy verbatim anyway

      "lineItems": [
        { "_type": "costGroup", "name": "LARGE RENOVATION",
          "description": "<<scope narrative>>",
          "showChildCosts": false, "showChildren": true,
          "lineItems": [
            { "_type": "costGroup", "name": "Phase 3 - Interiors", "lineItems": [
              { "_type": "costGroup", "name": "Drywall/Plaster", "lineItems": [
                { "_type": "costItem",
                  "organizationCostItemId": "22PCCE2cGYqw",  // OUR invariant, not the API's
                  "name": "Drywall Board - Mat",
                  "description": "1/2 x 54 x 12 ...",
                  "costCodeId": "22PC7gqjU8Am",   // INHERITED from the catalog item
                  "costTypeId": "22PBAjfWNQr7",   // never derived from our taxonomy
                  "unitId":     "22PCC8v89B9v",
                  "quantity": 120,
                  "quantityFormula": "6,120 SF net / 54 SF-per-sheet x 1.10 waste = 124.7 -> 120",
                  "unitCost": 27.98, "unitPrice": 40.571,
                  "isTaxable": false,             // ← DEFAULT IS TRUE. From TaxPolicy.
                  "showQuantity": true,           // ← default true; still explicit
                  "showDescription": true,        // ← default true; still explicit
                  "requireSpecificationApproval": false,  // ← default TRUE
                  "hasFinalActualCost": false,    // ← default false; still explicit
                  "isSelected": false,            // ← default false; still explicit
                  "isSpecification": false,       // ← default false; still explicit
                  "isEditable": false,            // ← default false; still explicit
                  "allowanceType": null,          // {cost|costAndFee|price} — §9.3
                  "globalId": "dbe1|01K5J7QX8ZN4M2VYB3TDCFGH9P|A7K2M9QX4P|01K5J7R0A0DWB0001",
                  "jobArea": "Whole House",
                  "files": [ { "existing": { "_type": "file",
                                             "id": "<FILE_ID_SHEET_A1_1>",
                                             "annotatedUploadRequestId": "<UR_ANNOT_DWBOARD>" } } ]
                }
              ] } ] } ] } ]
    },
    "createdDocument": {                 // read-back in the SAME request
      "id": {}, "externalId": {}, "status": {}, "price": {}, "cost": {},
      "costGroups": { "$": { "size": 100 }, "count": {} },
      "costItems":  { "$": { "size": 100 }, "count": {},
                      "nodes": { "id": {}, "globalId": {}, "isTaxable": {},
                                 "quantity": {}, "unitCost": {}, "unitPrice": {} } } } } }
```

**Key disciplines, each traceable to a VERIFIED fact:**

- **Cost codes are INHERITED from the resolved catalog item**, never derived from our taxonomy or the item's name. VERIFIED: `Insulation - Batt` is coded to *Siding*; `Fastener - Framing Nails` to *Roofing* inside a Framing Materials group; `Walk-In Shower` to `Specialites`. Their cost codes are financial-reporting buckets shaped by history, not a clean CSI tree. Reproduce them; do not correct them. Corrections are *proposed* to a human, applied in JobTread's catalog, then re-synced.
- **Every emitted cost item carries `organizationCostItemId` — OUR invariant, not the API's.** VERIFIED it is `{nullable: jobtreadId}`, so 100% presence in DB's data is convention, not constraint. Our preflight enforces it; a server-side rejection will not.
- **`showQuantity` and `showChildCosts` are traps in the opposite direction from `isTaxable`.** VERIFIED: `createDocument` defaults both **true**, while DB's Const-Large template sets both **false**. Inheriting the API default shows customers quantities and child costs they have never been shown. Every `show*` flag is copied from the template explicitly and asserted on read-back.
- **Name/description overrides are idiomatic, not a smell.** VERIFIED: one catalog item appears four times on one estimate with four different board specs, and a fifth time renamed while keeping the catalog link.
- **Ordering is by array index.** `positionAfter {type, id}` exists on `root.createCostItem.$` but is **absent from every `createDocument`/`updateDocument` lineItems variant** (VERIFIED). `position` *is* a lexicographic fractional index (`"j"`, `"k"`, `"l"`), so never write integers into it on the incremental-repair path.
- **Preflight asserts node count < 1200 per level** and refuses above it with a clear message rather than silently splitting.
- **`notify: false` in the request envelope on every sync-path write.**

### 7.3b JobTread field mapping

| DB Estimator concept | JobTread target | Type / limit | Notes |
|---|---|---|---|
| Revision identity | `document.externalId` | string ≤32, nullable, filterable | `DBE1.<ULID>`. Uniqueness enforced by us. Clean on `customerOrder` only |
| Line identity | `costItem.globalId` | string ≤100, nullable, filterable | `dbe1\|rev\|grpPath\|line`. Null across all 176,156 rows — a `dbe1\|` line is provably ours |
| Group identity | *(none)* | — | No `globalId`/`externalId`; encoded into child line keys, tree rebuilt from leaves |
| Phase tree | nested `costGroup.lineItems` | 1500 **per level** | Construction-sequence tree, 2–3 deep |
| Cost code | `costItem.costCodeId` | jobtreadId | **Inherited from catalog item.** Match by id — `Specialites` is misspelled |
| Cost type | `costItem.costTypeId` | jobtreadId | 5 values |
| Unit | `costItem.unitId` | jobtreadId | 28 values; `Square` = 100 ft² exactly (§11) |
| Catalog link | `costItem.organizationCostItemId` | jobtreadId, **nullable** | Our invariant, not the API's |
| Quantity derivation | `costItem.quantityFormula` | string, nullable | **Resolved, variable-free prose.** JobTread has a live evaluator but DB keeps formulas off customer documents (Decision 13) |
| Unit cost / price | `unitCost` / `unitPrice` | **IEEE float** | Decimal scale 4 internally; convert at exactly two boundary functions (§8.2) |
| Taxability | `costItem.isTaxable` | boolean, **default TRUE** | From `TaxPolicy` (§8.6) — not hardcoded false |
| Document tax | `document.taxRate` | number, **gte 0 lte 1** | A **fraction**. 60 live documents carry 0.0725 |
| Allowance | `costItem.allowanceType` | enum `{cost, costAndFee, price}` | **Three values, not a boolean** (§9.3) |
| Allowance reconciliation | `createDocument.$.allowanceCostItemId` | jobtreadId | Native allowance-reconciliation documents |
| Selections / alternates | `costGroup.isSimpleSelection`, `minSelectionsRequired`, `maxSelectionsAllowed`, `showChildDeltas` | int / boolean | Native options with customer-facing deltas |
| Contract terms | `document.footer` | string ≤65,536 | **Copied from `documentTemplate` — it IS the DB contract** (§7.6) |
| Scope narrative | `document.description` | string ≤**32,768** | Not 65,536 |
| CO → baseline link | `createDocument.$.references` | ≤1000 | Native document-to-document reference |
| Takeoff geometry | `plan.annotations[]` via `updatePlan` | ≤1000 annotations, ≤1000 xy pairs each | Vector paths with `isNegative` for deductions |
| Per-line plan markup | `costItem.files[].annotatedUploadRequestId` | ≤10 files/item | **Structured vector data, not a flattened image** |
| Room / area tag | `costItem.jobArea` | string, nullable | 6 live non-null values — 99.997% free, not empty. Do not assert null |
| Custom provenance | `costItem.customFieldValues` | connection | SKU, Supplier, Room, Specifications, Internal Notes already exist |
| *(not writable)* | `document.sourceId`, `sourceMetadata`, `sourceOrganization` | — | On the read type, **absent from create and update inputs** |

### 7.4 The push state machine

```
outbox row written in the SAME Postgres transaction that seals the revision.
payload FROZEN at enqueue — retry #4 sends bytes identical to attempt #1.

  PENDING ──┐
            │ 1. PREFLIGHT CLAIM: documents where externalId = key, size 2
            │      count 0  → proceed
            │      count 1  → ADOPT that id, mark SUCCEEDED, do NOT mutate
            │      count ≥2 → P1 HALT, page a human, never auto-delete
            ▼
         INFLIGHT ── 2. createDocument, read-back selected in the same request
            │
            │ 3. VALUE VERIFICATION, using the §8.2 epsilon policy — NOT `==`:
            │      moneyEquals(createdDocument.price, ours, DOC_EPSILON $0.01)
            │      moneyEquals(createdDocument.cost,  ours, DOC_EPSILON $0.01)
            │      costItems.count == expected leaf count         (exact)
            │      every globalId we sent came back               (exact)
            │      every line's isTaxable == as sent               (exact)
            │      costCodeId / costTypeId / unitId as sent        (exact)
            │      every show* flag as sent                        (exact)
            │    mismatch → FAILED_VERIFY, page a human, DO NOT RETRY
            ▼
        SUCCEEDED

  timeout / 5xx / connection reset ──▶ UNCERTAIN   (never straight to PENDING)
        UNCERTAIN cannot reach INFLIGHT without TWO consecutive count-0
        preflight probes, 5s apart, after ≥2s backoff
        (probing at 200ms reads count 0 and causes the duplicate you are preventing)
        backoff 2s, 5s, 15s, 60s, 5m with full jitter · 6 attempts → ABANDONED

  Stages: UPLOAD_FILES → CREATE_DOCUMENT → (CREATE_PLAN / UPDATE_PLAN_ANNOTATIONS)
  Uploads MUST precede the document: fileTargetType is {dailyLog, document, task,
  job, location, contact, account, organization} — it excludes BOTH costItem and
  costGroup, so per-item files travel only inside the document mutation.

  The runtime grant holds NO deleteDocument, deleteCostItem or deleteCostGroup,
  so the system is structurally incapable of "cleaning up" a contract a customer
  may have seen.
```

**Money verification uses an epsilon, deliberately.** We push 3–4 decimal unit prices into a system that VERIFIED stores IEEE floats, and exact equality also assumes JobTread rounds line extensions the way we do (round-per-line, sum-of-rounded) rather than sum-then-round. **If JobTread sums-then-rounds, exact comparison fails every multi-line push on day one**, and alarm fatigue then disables every other control. Spike 5 measures their policy. **If it differs from ours, the reconciliation contract changes — not our rounding**, because our rounding must reproduce DB's 709 catalog rows.

### 7.5 Reconciliation — three tiers, because there is no `costItem` webhook

VERIFIED: no `costItem`/`costGroup` event of any kind, and the `event` type carries relations to account, comment, contact, dailyLog, document, documentPayment, documentRecipient, file, form, formSubmission, job, location, payment, task and timeEntry — **and no `costItem` or `costGroup` relation at all.** Line-item edits inside JobTread are invisible to webhooks; `documentUpdated` is a hint, never a description.

| Tier | Cadence | Mechanism |
|---|---|---|
| **1 · Event tail** | 60s | **Primary: `document.events`** — VERIFIED, a per-document connection carrying `type`, `createdAt`, `createdByGrantId`, `createdByGrantName`, `createdByUser`, `createdByIpAddress`, `createdByUserAgent`. For open documents this beats sweeping `organization.events`: lower latency, and it names *who* and *when* even though it cannot name *which line*. `organization.events` remains the discovery channel for untracked documents, from a persisted `(createdAt, id)` cursor at 100/page. **Never select `event.data`** — untyped, and a `documentUpdated` can carry both copies of a 65,536-char footer; fetch on demand for one event when a human is looking at a diff. **Echo suppression matches our own grant ids**, because VERIFIED `createdByGrantId` is populated for human UI edits too and `createdByGrantName` is "JobTread App" for all of them. Retain historical grant ids across rotations |
| **2 · Content fingerprint** | 15 min for open documents, on demand from a Tier-1 hint | Re-read `costItems` and `costGroups` paged at 100 (or subtree-scoped via `descendentCostItems`), canonicalize (sort by `globalId`, money to 2dp, quantity to 4dp), hash, compare to the hash recorded at publish. Produces a **per-line diff** so the UI says "Drywall Board quantity 120 → 96" rather than "something changed." Ground truth, because VERIFIED `document` has **no `updatedAt`** — "documents changed since T" is not expressible |
| **3 · Nightly full sweep** | 02:00 | Orphan hunt over every `DBE1.`-prefixed `customerOrder` reconciled against the outbox **in both directions**: a JobTread document with no local row is adopted; a local SUCCEEDED row whose document is gone is marked orphaned and alerted. Plus **cumulative contract-value reconciliation** (§9.2), catalog content-hash refresh, taxonomy refresh, **template footer hash check** (a changed contract footer means published revisions were built on superseded terms — a legal-review alert, not a log line), job mirror refresh, grant-expiry alarm, webhook health |

**`documentDeleted` is a real event type** (VERIFIED, one of the 43), and `event.document` resolves to a `deletedDocument` stub carrying `id`, `createdAt` and `deletedEvent`. **Deletion is detectable in the 60-second Tier-1 tail, not up to 26 hours later** — which matters, because the deleted thing is a customer contract.

**Self-healing:** lost webhook → Tier 1 within 60s. Corrupted cursor → Tier 2 within 15 min. Lost outbox row → Tier 3 adopts by `externalId`. Lost entire local database → Tier 3 rebuilds the document mapping from `externalId` alone, because the `DBE1.` prefix makes our documents self-identifying. **The one thing deliberately not self-healing is a duplicate customer contract:** that always stops and asks a human.

### 7.6 Template hydration

VERIFIED: `createDocument` accepts **no `templateId`** — the only template reference is `scheduledDocuments[].createFromDocumentTemplateId`, for downstream documents. `documentTemplate` is readable and carries `footer` (≤65,536), `description` (≤32,768), `signatureDisclaimer`, `scheduledDocuments`, `profitBreakdown`, `requireSignature` and every `show*` flag. And **the footer of `22PBz2nQunqm` ("Const - Large") IS the Deitemeyer Brothers contract** (§1.1).

**A document created naively via API would be a signable contract with no terms in it.** So the push must, in the same transaction: read the chosen template in full; copy `footer`, `description`, `signatureDisclaimer`, `scheduledDocuments`, `requireSignature` and every `show*` flag **verbatim** (note `signatureDisclaimer` is null on Const-Large, and `showQuantity`/`showChildCosts` are false there against API defaults of true); substitute the money placeholders; and store a hash of the template used on the revision.

`documentTemplate` has **no `taxRate`** (only `taxName`), so tax cannot be inherited — it comes from `TaxPolicy` (§8.6).

The footer carries `$XXX,XXX.XX` for the total and six `$XX,XXX.XX` placeholders for payment stages. REPORTED and load-bearing: on a real estimate these were substituted **by hand** 38 minutes after creation. DB Estimator computes them — the biggest single automation win here, and a real obligation:

```
Unit-tested to the cent against the real historical footer; part of the MRC:
  total $277,971.02
  →  10%  $27,797.10      20%  $55,594.20      15%  $41,695.65
     25%  $69,492.76      20%  $55,594.20      10%  $27,797.11  ← remainder on the FINAL stage
  Σ == total exactly.  Assertion, not a comment.
```

**Carl pins the template id in config with its footer hash.** The document record stores no template reference (VERIFIED), so it cannot be recovered after the fact.

### 7.7 Conflict policy: JobTread always wins

**DB Estimator never overwrites a human edit. Not ever, not even when we are confident we are right.** Refusing to overwrite costs an estimator a retype — minutes. Overwriting means a deliberate human correction silently reverts and goes out as a signed contract. Not comparable. And DB's process actively invites downstream edits: the footer substitution happened 38 minutes after creation, and the live reference estimate shows four human `documentUpdated` events in its first 45 minutes.

Detection keys on `globalId` — VERIFIED null across all 176,156 cost items, so a `dbe1|`-shaped `globalId` is provably ours and a line without one is provably human-added. That makes the diff unambiguous rather than heuristic.

| Drift class | Action |
|---|---|
| Cosmetic (position, collapse state) | Absorb silently, update the fingerprint, log |
| **Enrichment** — human ADDED a line (null `globalId`), or edited description text | Accept as authoritative. Import as read-only "added in JobTread" so a later revision does not silently drop it. **Never delete a human-added line** |
| **Quantity or price edit on a line we own** | Freeze the revision, mark DIVERGED, surface before/after and who (from `document.events`). Three explicit choices, no default: **Accept theirs** (record as an override with attribution, and **flag the underlying takeoff for re-measurement** — a human overriding our number is the highest-quality signal we will ever get that our assembly is wrong, and it feeds Phase 8); **Supersede** (build revision N+1, publish as a new document, human marks the old denied); **Detach** (stop tracking — sometimes the right answer is to get out of the way) |
| Structural (groups renamed/moved/deleted, our lines deleted) | Treat as a fork. Detach automatically with a loud notification |
| **Lifecycle** — `status` leaves `draft`, a recipient appears, `documentSent` fires, `signedAt` non-null | **HARD LOCK.** Permanently read-only. Zero `updateDocument` calls, forever, regardless of drift. A sent or signed contract is a legal document and software does not edit it |

**`includeInBudget` is NOT a lifecycle trigger.** VERIFIED: it **defaults to TRUE** on `createDocument`, and the live in-flight estimate `22PejfgufCkY` has `includeInBudget: true` while `status` is still `pending`. It is DB's normal state for a working estimate; using it as a hard-lock trigger would permanently freeze essentially every document DB creates, immediately. The sound triggers are the four above. VERIFIED: `documentStatus` is exactly `{draft, pending, approved, denied}`.

`updateDocument` is called almost never, and only under **all** of: status still draft, zero recipients, `signedAt` null, fingerprint matches exactly what we published, and the estimator explicitly clicked "update in place." In practice that is one scenario — a typo caught 30 seconds after publishing. Every other path creates a new document. If Spike 5 shows `lineItems` is full-replace, the in-place path is banned outright. The schema hints but does not answer: `updateDocument.$.lineItems` is optional with the same 1500 cap and the same four variants, and **every field on `existingCostItem` is optional** — a sparse patch, implying the array defines the document's line-item *set* with per-item patch semantics. **The fate of an omitted item is exactly the unknown, and it is why Spike 5 is a hard gate.**

### 7.8 Grant scoping, secrets, blast radius

VERIFIED: the grant in use today is `22PXNFaV6ZW4` ("Access for claude.ai", user Carl Bledsoe), created 2026-05-15, **expiring 2026-12-17T23:23:51Z — inside Phase 1.** Root exposes only `grant` and `currentGrant`; there is **no `createGrant`/`updateGrant`/`deleteGrant`**, so rotation is a UI action.

**Create a dedicated service user** so machine writes are distinguishable. Not cosmetic: `event.createdByUser` is non-nullable, so a service user is what makes the audit trail readable. And because every grant displays the name "JobTread App" regardless of user (§1.1), **matching must be on grant `id`**, with historical grant ids retained or a post-rotation write is misread as a human edit.

**A live finding worth telling Carl immediately:** the grant currently in use is dramatically over-privileged. Its `allowedActions` include `updateCatalog`, `updateOrganization`, `updateCostCode`, `updateCostType`, `updateUnit`, `updateCustomField`, `updateDocumentTemplate`, `updateRole`, `updateMembership`, `updateUser`, `updateWebhook`, `updateWorkflow`. It holds **no delete action of any kind**, which is the good news. A read-only analytics grant should hold none of the above.

| Grant | Holds | Must NOT hold |
|---|---|---|
| **A · Estimator runtime** (the only one the backend holds) | read* on organization/job/document/costItem/costGroup/catalog/customField/account/file/plan/event, `createCustomerOrder`, `updateCustomerOrders`, `updateDocument`, `draftDocument`, `updateFile`, `createBidRequest` | **`updateCatalog`** — the most dangerous privilege here; 176,156 cost items depend on 709 catalog rows and a bug there is not cleanly reversible. **Plus `deleteCostItem` and `deleteCostGroup`**, which exist as real root mutations and could gut a pushed contract line by line *without* deleting the document — the "structurally incapable of cleaning up a contract" property fails unless both are excluded. Also no `deleteDocument`, `deleteDocumentPayment`, `deleteDocumentRecipient`, `deleteDocumentReference`, `deleteDocumentTemplate`, `createCostCode`, `updateCostCode`, `updateCostType`, `updateUnit`, `updateDocumentTemplate`, `updateOrganization`, `updateRole`, `updateMembership`, `updateUser`, `updateWebhook`, and nothing payment- or membership-related |
| **B · Catalog admin** | adds `updateCatalog`, `updateCustomField` | Human-operated admin tool only. Never the runtime service, never a background job. Every action logged locally with the operator's name before the call |
| **C · Read-only analytics** | read actions only | The grant a developer gets on a laptop. Makes "I was just poking around in production" structurally harmless |

VERIFIED: `readCatalogCosts` and `readCatalogPrices` are separate actions from `readCatalog`, so pricing visibility is independently gated and a price-blind viewer role is achievable at the grant level. VERIFIED: `root.whoCan` exposes per-action `oneOf` variants, so the **Layer-0 suite can programmatically prove Grant A's posture** rather than eyeballing an `allowedActions` list.

**The blast radius exceeds data exposure.** VERIFIED: `updateDocument.$` can write **`status`** and **`signaturePath`**. A grant holding `updateDocument` — which Grant A does by design — can flip a document to `approved` and write a signature path. The leak-response plan names **contract approval and signature forgery**, not just data.

**Secrets:** `grantKey` lives only in a managed secret store, fetched at process start, cached in memory. Never in source, a committed `.env`, a client bundle or a browser. Log middleware scrubs by value pattern, plus a pre-commit secret scan and a CI check. Log the grant **id**, never the key. Rotation is a rehearsed runbook: create new in the UI → load under a versioned key → deploy with dual-read for one release → verify with `currentGrant` → add the old id to the historical list → revoke. Quarterly, and immediately on any personnel change. **Alarms at 30/14/7 days.**

**If it leaks:** assume full organization read/write within `allowedActions` — 3,988 jobs, 3,550 accounts with contacts and emails, complete financials, every contract and price, insurance claim data including adjuster contacts, **plus document approval and signature-path writes.** Response: revoke in the UI first (revocation, not rotation), replace and redeploy, audit `organization.events` filtered by the leaked `createdByGrantId` across the exposure window, checking specifically for injected or duplicated `customerOrder`s *and status changes*, notify JobTread, and assess Ohio PII-breach notification obligations with counsel.

**`signQuery`** signs a query with the current grant and returns a reusable token — useful for handing a customer a read-only takeoff link without minting a grant, and also a delegated-capability leak vector. VERIFIED: **no expiry or scope parameter is visible on it**, so "keep tokens short-lived" may not be enforceable by the API. Scope narrowly, log every issuance, never sign a mutation.

### 7.9 Testing without a sandbox

- **Layer 0 · read-only assertion suite** (Grant C, nightly + CI). Asserts every premise this design rests on: the **stable** taxonomy counts (62 cost codes / 5 types / 28 units / 30 templates / 70 custom fields / 709 priced catalog) on equality; every hardcoded id still resolves to the expected name; `globalId` still null across `costItem`; **zero `customerOrder`s carry a non-`DBE` `externalId`** (scoped to `customerOrder`, because an org-wide assertion fails immediately); the measured markup pairs hold; Grant A's posture via `whoCan`; and a **schema-shape hash** over `createDocument`, its `lineItems` variants, `updateDocument`, `createUploadRequest`, `updatePlan`. **Counts that drift daily — jobs, documents, cost items — are asserted as monotonic lower bounds, never equality.** All three moved by one during the preparation of this document; a suite that fails nightly gets muted, and a muted suite is worse than none.
- **Layer 1 · golden fixtures** (offline, every PR). The 40–60 historical estimates; payload-builder round-trip fidelity; money arithmetic to the cent including the observed float artifacts; **the payment-schedule substitution**; template completeness (a payload with an empty footer **fails the build**); the idempotency state machine as a property test asserting UNCERTAIN can never reach INFLIGHT without an intervening count-0 probe.
- **Layer 2 · mock Pave server** (every PR). Injected faults: timeout mid-mutation, 500s, connection resets, duplicate webhook deliveries, out-of-order events, an echo of our own write, a document that already exists at preflight, two documents sharing one `externalId`. The timeout-that-actually-succeeded scenario runs a thousand times here — which you cannot do against production.
- **Layer 3 · one disposable test job** (nightly smoke). `ZZ TEST — DB Estimator (DO NOT USE)`, terminal status, excluded from dashboards. **Compile-time allowlist** in the non-prod build — a constant, not an env var, because an env-var typo is exactly how someone writes to a real customer's job at 4pm. Prod refuses the test job; all test writes carry `DBE0.`

**Teardown:** our grant holds no delete actions, so cleanup is not programmatic. Test artifacts are self-identifying; a human deletes from the UI, or the job stays parked as a permanent regression fixture — arguably better, since Layer 0 then has something stable to assert against. **Never build a programmatic mass-delete against their production org; the absence of that capability is a safety feature.**

### 7.10 When JobTread changes

Layer 0's schema-shape hash *detects* a breaking change; detection is not a response, and there will be no deprecation notice, no versioning guarantee and no support path.

- **The break fires a P1.** Pushing **auto-disables via a feature flag, not a code change** — a deploy is not available at 4pm on bid day.
- **Estimators fall back to the documented manual path:** export the approved revision to Excel/CSV and hand-enter into JobTread. That is today's process, and it must stay rehearsed (§8.10).
- **Stated RTO for a broken push path: 5 business days** — one developer, reverse-engineering someone else's undocumented change.
- **Named contact:** whoever owns the integration holds the **JobTread API Developer Certification**, and DB maintains a real support relationship before it is needed.
- **Budget:** one breaking change is 40–80 hours — the $10–15K/yr reactive reserve.

**The strategic version:** if JobTread ships its own takeoff and estimating module, or DB leaves JobTread, **the bridge value — the largest justification for building — goes to zero.** That is in the risk register with that answer stated plainly, and it argues for confining JobTread coupling to `packages/jobtread` behind an interface.

### 7.11 Native JobTread capabilities worth using

Each is VERIFIED, and each replaces something it would otherwise be tempting to build: **`document.events`** (per-document feed with actor, IP, user agent — replaces blind content-hash sweeps); **`documentDeleted`** (a real event type with a `deletedDocument` stub — orphan detection at 60s, not nightly); **`updatePlan.annotations`** (≤1000 vector annotations, `oneOf {path, text, point, meta}`, `isNegative` for deductions, `isClosed` for polygons, freedraw ≤1000 xy pairs or bezier chains — and `createUploadRequest` accepts the same payload, so a cost item's `annotatedUploadRequestId` carries structured vector geometry, not a flattened image); **`plan.previousFilePages`** (native page-revision lineage, with an `updatedAt` the `document` type lacks); **`allowanceType`** as `{cost, costAndFee, price}` plus `allowanceCostItemId` (native allowance modelling *and* reconciliation documents); **native selection groups** (`isSimpleSelection`, `minSelectionsRequired`, `maxSelectionsAllowed`, `showChildDeltas`, `updateSelectionAssignment` — Phase 5's options with customer-facing deltas); **`document.references`** ≤1000 with `referencedDocuments`/`referencedTimeEntries` (a CO links its baseline inside JobTread; a Phase 8 hook); **`costGroup.descendentCostItems`** (a subtree in one connection, making subtree-scoped diffing practical); **`documentTemplate.templateName`** (what actually distinguishes the six "Estimate" templates); **`createDocument.$.files`** ≤100 with `copyFromFileId` for server-side copies with no re-upload; **`createCostCodeMapping`** `{name, costCodeId}` (a name-to-id alias registry — too thin to replace our mapping tables, but it could hold supplier import column aliases); **`document.taxIsLocked`**; and **`root.$.viaUserId`** (request-level user scoping, worth a spike before hand-building the price-only role).

One thing that does **not** exist as assumed: **`createJob` is a three-step chain.** VERIFIED — "A location is required to create a job. A customer is required to create a location." So §9.1's job-creation path is `createCustomer` → `createLocation` → `createJob`, with **no atomicity**; a partial failure leaves an orphan, and it needs its own idempotency handling.

---

## 8. Reliability and the trust ladder

### 8.1 The Minimum Reliability Core — a hard blocker on push #1

When a phase slips — and Phase 2b or 4 will — reliability work is what gets cut, and the property Carl asked for disappears while the feature list stays intact. **All 17 items green before any estimate reaches a real customer.**

| # | Item | Evidence required |
|---|---|---|
| 1 | Decimal money end to end | 100% line + branch coverage on `packages/money`; a lint rule bans raw `number` in money positions; `fromJobTread` ingests the literal observed wire values (`8.206999999999999`, `121.78549999999998`, `869.9999999999999`, `28.999999999999996`) to exact decimals |
| 2 | One rounding boundary, sum-of-rounded aggregation | Property test over arbitrary nested trees: document total == exact sum of displayed line extensions == exact sum of group subtotals, at every depth. **The printed proposal adds up** |
| 3 | Historical replay | ≥40 fixtures reproduce document cost and price to the cent; **named exceptions ≤5% of line items and ≤0.5% of aggregate value**, each classified, each with a regression test if it is a tool bug |
| 4 | Markup basis | The 46 measured rows reproduce byte-exact; markup/margin/multiplier round-trip exactly and `margin == 1 − 1/multiplier` at 6dp |
| 5 | Exhaustive payload builder | Every dangerous-default field **required by the type system** — omission is a compile error. VERIFIED list: `isTaxable` (true), `requireSpecificationApproval` (true), `showDescription` (true), `showQuantity` (true), `showChildCosts` (true), `showCostItemFiles` (true), `includeInBudget` (**true**), `isEditable` (false), `hasFinalActualCost` (false), `isSelected` (false), `isSpecification` (false), `requireSignature` (false), plus `taxRate` (**a 0–1 fraction**). Payload snapshot tests so a dropped field is a reviewable diff |
| 6 | Idempotent push | 20 consecutive fault-injection runs — timeout-after-success, double-click, restart mid-flight, network partition, preflight-lookup failure — producing exactly one document every time |
| 7 | Round-trip assertion **against JobTread's measured rounding policy** | Catches an injected `isTaxable` flip, cost-code swap and `show*` flip; compares money with the §8.2 epsilon, **not `==`**; marks FAILED_VERIFY and pages; does **not** retry. **Blocked until Spike 5 records JobTread's rounding policy** |
| 8 | Template hydration | A payload with an empty footer fails the build; every `show*` flag copied from the template and asserted on read-back; payment-schedule figures unit-tested to the cent |
| 9 | Append-only event log | `UPDATE`/`DELETE` revoked from the app role **at the grant level**, proven by test; projection rebuild byte-identical for every fixture |
| 10 | Approval gate | One test per blocker proving it **fires** on a crafted violation. An invariant that cannot fail is not a test. Push requires an approved revision, server-enforced |
| 11 | Cost visibility | Server-side test that a price-only role cannot obtain unit costs, margins or vendor data through **any** path — list, detail, export, PDF render, error messages |
| 12 | Backups + one restore | PITR on; nightly off-**account** encrypted logical dump; weekly human-legible Drive bundle of every open estimate; **one single-estimate point-in-time restore performed, with a timed written log committed to the repo**; and the **wind-down export bundle (§13.1) generated once and verified readable** |
| 13 | Reconciliation live | Tier-1 event tail with self-write filtering by grant **id**; Tier-2 fingerprint diff; nightly sweep with a heartbeat; `documentDeleted` handled in the tail; orphaned-outbox detection both directions |
| 14 | Environment fence | Non-prod build provably cannot write outside the allowlist; prod refuses the test job |
| 15 | Canary + alerts | End-to-end canary estimate every 30 min in business hours, paging if its total moves by **one cent**; eight named alert conditions in a channel Carl sees; 7am digest |
| 16 | Human sign-offs | Webhook consumer audit signed by each owner · QBO propagation answered in writing · Grant A provisioned **without `updateCatalog`, `deleteCostItem` or `deleteCostGroup`** · grant-expiry alarms live · **lawyer sign-off on the generated contract, the computed payment schedule, and the plan-data licensing position** · **CPA sign-off on the tax position** · **Carl's written statement of the dollar exposure DB will absorb from a tool-caused pricing error** |
| 17 | **Authentication** | **No unauthenticated path to any cost or customer data, proven by test**; MFA enforced for the push privilege and Admin role; session and re-auth policy implemented; login and role-change events in the append-only log (§8.9) |

### 8.2 Money and markup specification

```
REPRESENTATION
  Money    = int64 in ten-thousandths of a dollar (scale 4). $55.00 → 550000.
             Scale 4, not cents: real unit costs are genuinely sub-cent
             ($0.40/SF CANVAS) and a 2dp unit cost × 3,000 SF throws away dollars.
  Quantity = decimal scale 6 + an attached unit with a dimension
  Rate     = decimal scale 6 (multipliers, markup, margin, waste, tax, escalation)
  Postgres : NUMERIC(19,4) money, NUMERIC(19,6) quantity. Never float8.
  Floats are BANNED in the domain layer. ESLint forbids `number` in domain type
  positions; the money module exports nothing taking/returning `number` except
  at one explicitly named serialization boundary.

ROUNDING — written once, applied at exactly one place
  Carry full precision through the entire calculation.
  Round to 2dp (half-up, away from zero) EXACTLY ONCE, at the line extension.
  Every aggregate = the EXACT SUM OF ROUNDED LINE EXTENSIONS. Never round-of-sum.
  Markup applies at the LINE (unitPrice = round4(unitCost × multiplier)), not to
  totals — because that is what DB's 709 catalog rows encode and our engine must
  reproduce those exact numbers.
  Waste applies to quantity BEFORE rounding, at scale 6. Exactly once per line.
  Rounding scope is declared per output: LINE | PROJECT_CONSOLIDATED | PO_TIME_ONLY.
    → PRICING SCOPE MUST EQUAL PROCUREMENT SCOPE. 20 rooms × 2.3 gal rounded per
      line is 60 gallons; consolidated and rounded once is 46. That 30% is a
      margin decision, not an arithmetic detail. The consolidation key includes
      phase and Material Drop Location so phase-1 and phase-3 drywall are not
      consolidated if they are ordered three months apart.
  Total rounding delta is reported in dollars by cost code at the gate;
  >2% of material cost requires explicit confirmation.

MARKUP — never a bare percentage
  Stored: { basis: MARKUP_ON_COST | MARGIN_ON_PRICE | MULTIPLIER,
            enteredValue, resolvedMultiplier }   ← multiplier is canonical
  k = 1 + m = 1/(1 − g);   m = g/(1 − g);   g = m/(1 + m)
  Branded TS types MarkupOnCost / MarginOnPrice / Multiplier do not interconvert
  implicitly. A function that multiplies cost accepts ONLY Multiplier — a compile
  error, not a code-review comment.
  Every UI surface renders all three from the stored multiplier, always:
      "×1.8182  ·  81.8% markup  ·  45.0% margin"
  Margin input clamped below 100% at the keystroke (someone typing 150 meaning
  markup is caught before it produces a nonsense price).
  A global rule change affecting >N lines or >X% of value requires a confirmation
  dialog showing total before/after and the dollar delta.
  CONTINGENCY IS NOT MARKUP (§9.7). PRICE ADJUSTMENT IS NOT MARKUP (§9.8).
  ESCALATION IS NOT MARKUP (§9.9). Each is stored, reported and released
  separately, because each answers to a different person.

JOBTREAD BOUNDARY — the only conversion sites
  fromJobTread(x):   stringify → parse to decimal → round half-up to 4dp
  toJobTread(m):     shortest round-tripping decimal string, 4dp
  toJobTreadRate(r): taxRate and friends are FRACTIONS in [0,1]. A rate > 1 is a
                     HARD ERROR, not a coercion — 7.25 vs 0.0725 is a 100x bug
                     the schema accepts silently.
  moneyEquals(a, b, tol) — LINE_EPSILON $0.005, DOC_EPSILON $0.01.
  `===` on Money is caught by lint. The unit-cost round-trip tolerance is a
  documented number set by Spike 5's measurement of JobTread's rounding.
```

### 8.3 Scale as a safety interlock

If only one thing here gets built carefully, it is this. A wrong scale multiplies every length by *k* and every area by *k²*, silently, with no symptom: a ¼″ plan misread as 3⁄16″ makes every area 78% of truth. A missed door is one line item; a wrong scale is the whole estimate.

**The number of available detection sources is a property of the page, not a constant.** On a sheet whose text was plotted as SHX geometry there is no dimension string and no room tag to read, so sources (a) and (c) plus cross-check (iv) do not exist. The UI displays how many sources were available, and **user two-point calibration is the assumed default path, not the last resort.**

1. **Per-viewport state machine, not a float on the sheet.** `unset → detected → confirmed`, persisted with the detecting source, the confirming user and a timestamp. Per *viewport* because one sheet routinely carries a ¼″ floor plan beside ¾″ wall sections; per-sheet scale is a guaranteed wrong-number bug the first week it ships. Note a JobTread `plan` is ONE page with ONE `scale`, so this model is **not natively representable** there; a pushed plan carries its primary viewport's scale and says so.
2. **Up to five detection sources, run in parallel, ranked.** (a) **Self-validating dimension string** — strongest where it exists: find a dimension line whose text was extracted exactly from the vector layer (12'-6"), measure the extension-tick endpoint distance, divide. The drawing told you both the pixels and the feet, so it validates itself; run on 5–20 strings and require agreement. **Requires a real text layer**, and demotes below (b) if Spike 2 shows a high SHX share. (b) Scale note text, associated to a viewport by proximity below the view title. (c) Known dimension from a schedule (a 3068 door leaf is 3'-0"). (d) Title-block scale field — frequently stale or "AS NOTED". (e) **User two-point calibration** — always available, final authority, and the default where (a)–(d) return nothing. **Do not trust PDF-native scale metadata:** ISO 32000 defines `/Measure` and `/UserUnit`, but Autodesk publishes its own articles stating AutoCAD and Revit PDF exports do not print to scale.
3. **Seven independent named cross-checks, each individually reported.** (i) Door leaf width in 2'-0"..3'-0". (ii) Wall thickness in 3.5"..8". (iii) Framing-plan stud/joist spacing quantizes to 16" or 24" o.c. (iv) **Computed room area vs the area printed in the room tag** — the best check available where tags carry areas, a direct comparison against the architect's own number; its **tolerance is set by Spike 4's measured drafting-fidelity distribution**, not an arbitrary 2%; requires extractable text. (v) Computed footprint vs gross SF in the title block. (vi) Sheet-geometry plausibility (¼″ on 24×36 spans ~96'×144'; a derived scale implying a 400' residence is rejected outright). (vii) **Cross-sheet consistency within 1%** — disagreement means one of two scales is wrong and you cannot tell which, so you stop and ask. **Checks (ii), (iii), (v) and (vi) are pure geometry and work with zero extractable text**, which is why the interlock survives a bad Spike 2 result even though sources (a)/(c) and check (iv) do not.
4. **Graded, named feedback — not a score.** Green <1% / amber <5% / red, per check, with failing items in plain language: "3 doors measure 4'-2" — expected 2'-0" to 3'-0"". A single aggregate confidence number teaches nothing and is ignored within a week; a named failing check gets investigated.
5. **Never auto-apply.** Detect, cross-check, propose, require a human click — one per viewport per revision. The alternative is a silent multiplier on every number in a signed contract.
6. **Database-enforced, not UI-enforced.** A view exposing only confirmed viewports plus a check constraint is the ONLY thing the quantity layer can read. **Re-confirm on every revision upload** — letting a Rev 3 set silently inherit a Rev 1 scale is how this fails in production.

### 8.4 Falsifiable gates

"Reproduce to the cent, with every unreproduced line explained in writing" always passes, because the explanation clause swallows the criterion. A "register signed by Carl" is not a criterion either: it can hold any number of exceptions and still be signed. Both are replaced with caps.

| Gate | Hard criterion | Band criterion | Register |
|---|---|---|---|
| Markup schedule | The **46 measured** rows reproduce `unitPrice` from `unitCost` byte-exact. Zero tolerance | ≥85% of **C-scope** rows rule-covered | 100% of C-scope classified; **zero undecided**; R-scope parked with its count published |
| Historical replay | Document cost and price to the cent on ≥40 of 40–60 fixtures | ≥95% of line items within $0.01 | **Named exceptions capped at ≤5% of line items AND ≤0.5% of aggregate document value.** Above either cap the rule set has failed |
| Parallel run | Zero deltas > $100 or > 0.5% of total lacking a **countersigned** classification | ≥95% of lines within 1% across the N-dependent bid count, ≥4 job types | 100% of deltas in one of three buckets; **old-process-error count published whatever it is, including zero** |
| **Markup intent** | If Spike 6 / Q6 finds a markup basis was accidental: **two suites** — "reproduces history" (must pass; the migration-trust artifact) and "reproduces intent" (corrected rules, in shadow) | Dollar delta per project type reported to Carl | Carl chooses a go-forward rule set with an effective date, published as a logged `markupRuleSetVersion` |
| AI per category | Mean signed error within ±0.5% (catches systematic bias — the dangerous kind) | **Dollar-weighted** MAE ≤2%, max ≤5%, n ≥30 on DB's own sheets | Rolling 20-sample MAE breach auto-demotes to proposal-only. **Count-weighted MAE is meaningless if the error sits in the largest room** |

### 8.5 The trust ladder

| Stage | The tool… | Entry evidence | Demotion trigger |
|---|---|---|---|
| **0 · Shadow** | Has no write credentials. Replays history | Gate 1 | — |
| **1 · Parallel** | Produces estimates; the spreadsheet is authoritative; writes only to the test job | MRC green | Any tool bug without a regression test |
| **2 · Authoritative, human verifies every number** | Is the source of truth; every push goes through a read-aloud pre-flight diff | Gate 3 | Any duplicate document; any tool-caused customer-visible error; any confirmed loss of committed work |
| **3 · Authoritative, human reviews exceptions** | Approval is a review of flagged exceptions, not a recheck of every number | 25 pushes with zero tool-caused customer-visible errors · recompute audit zero deltas 90 days · 2 quarterly restore drills passed · **≥3 jobs closed with reconciled actuals whose variance is no worse than the baseline published at Gate 1** | Any of the above |
| **4 · Unattended** | **Does not exist and will not.** A human approving every contract is a business control, not a software limitation | — | — |

**Demotion is cheap here** — the old process still exists and the estimators still know it — and that cheapness is what makes the whole plan safe. Every demotion requires a one-page written postmortem and a committed regression test before re-promotion.

### 8.6 Tax and the legal surface

VERIFIED (§1.1): **80,462 cost items are taxable, 18,602 on `customerOrder` lines, and 60 documents carry `taxRate` 0.0725 — including `customerOrder` documents named "Estimate."** Hardcoding zero under-bills Ohio sales tax on a real subset of work. `documentTemplate` carries no `taxRate`, so it cannot be inherited. Ohio taxes construction contracts differently by contract type and by the material-versus-service split, and this tool generates the document that gets signed.

Required once, before push #1, and in the MRC:

- **CPA sign-off** on the taxability model — a blocking decision: **which project types, contract types and cost types are taxable, and at what rate?** A `TaxPolicy` entity carries `materialTaxTreatment ∈ {embedded_in_unit_cost, separate_line}`, `purchaseTaxRate`, `customerTaxRate`, `nonRecoverableTax`, and **`defaultLineIsTaxable` set per project type rather than globally false** — versioned, so a change is a policy publication, not a code change. Every estimate pins a `tax_policy_version`. **Purchase tax under `embedded_in_unit_cost` must never also produce customer tax on the same line.** `document.taxIsLocked` is honoured; `taxRate` is validated as a fraction in [0,1] at the boundary.
- **Also ask the CPA:** **ASC 350-40** capitalization, useful life, and the impairment consequence at each gate this plan invites you to stop at; and **§174** / R&D-credit treatment versus a deductible subscription, as an after-tax five-year comparison. **Warn Carl in advance that asking about construction-contract sales tax may surface historical exposure.**
- **Lawyer sign-off (8 hours)** on four questions: (1) is a document created via API, with a programmatically copied footer and computed payment amounts, a valid contract? (2) **What happens when it is valid and wrong?** — review general liability and any E&O coverage for exclusions bearing on automated pricing, notify the carrier that pricing is now machine-generated, and **draft a clerical-error / mutual-mistake correction clause for the Estimate footer** before push #1. (3) **Plan-data licensing (§10.4).** (4) Insurance-restoration retention obligations, which drive the object-lock decision for plans and signed exports.
- **Carl states, in writing, the dollar exposure DB will absorb from a tool-caused pricing error, and the threshold at which the trust ladder auto-demotes.** One 3% mispricing on a $278K job is $8.3K; a systematic markup-basis bug across a quarter is an order of magnitude worse. An SLO with no stated consequence is a wish.
- **A rough-order-of-magnitude sanity gate:** block push when an estimate's total deviates more than X% from an assembly-independent ROM check (historical $/SF for that project type and size band). It catches the class of error that is arithmetically consistent and completely wrong.

### 8.7 Testing strategy

Deliberately lopsided: the calculation and geometry engines are pure, cheap to test, and where every catastrophic failure lives. **~70% of test effort on pure-function correctness, 20% on the JobTread boundary, 10% on E2E.** The enabling decision is that the engine is a pure library with zero I/O — `(measurements, calibration, catalog snapshot, markup rules, overrides, policies) → estimate tree with money`. No dates, no randomness, no network, no DB.

**CI gates to merge:** typecheck · lint (no-floats-in-domain, no-`===`-on-Money) · unit · property (~2,000 cases each, seeds recorded on failure, shrunk cases promoted to named tests permanently) · golden (incl. geometry from Phase 4) · recorded-cassette JobTread contract · **pdf.js operator-list golden** (fails the build on a pdf.js upgrade) · E2E (8–12 scenarios, not more — E2E suites rot and get muted, and a muted suite is worse than none) · projection-rebuild equality. **Coverage is reported but not a gate, except `packages/{money,units,assemblies,estimate}` and the payload builder, held at 100% line and branch.** A hard threshold on a small, pure, high-stakes surface is enforceable; a global number invites tests of getters.

**Observability at 6-user scale — deliberately minimal, because anything requiring a human to watch a dashboard will not work.** The canary estimate (every 30 min, pages on a one-cent move) covers the engine, geometry transforms, payload builder, JobTread contract, auth and network path in one check. Heartbeats on every scheduled job — a job that *fails to run* is the silent failure that kills small-team reliability. Eight alert conditions, each actionable or deleted; **an alert that fires twice without anyone acting gets removed or fixed next release.** A 7am digest that arrives whether or not anyone looks. Skipped: distributed tracing, a self-hosted metrics stack, custom SLO dashboards, escalation tiers.

### 8.8 SLOs — and which are commitments

| SLO | Target | Honesty note |
|---|---|---|
| Pushed document matches its approved revision field-for-field | 100% | **Commitment. Zero breaches/quarter.** One breach = postmortem in 48h + regression test + one-stage demotion if it reached a customer |
| Duplicate JobTread documents per revision | 0 | **Commitment. Zero** |
| Confirmed losses of committed work | 0 | **Commitment. Zero** |
| Nightly recompute audit deltas > $0.01 | 0 | **Commitment. Zero unexplained**, where "explained" requires a countersigned classification |
| Push first-attempt success | 99% | **Commitment** on the zero-silent-failures half; the 99% is a target |
| Committed edits durable server-side | p99 < 3s online | Target |
| p95 full recalc, 500-line estimate | < 300ms | Target. A tool that feels slow gets abandoned under deadline, converting a performance SLO into a correctness risk |
| Drift items triaged | within 1 business day | **Commitment during coverage hours (§8.10)** |
| Business-hours availability (Mon–Fri 06:00–19:00) | 99.5% | **A target, not a commitment — stated honestly.** One developer, no on-call rotation, and the only monitor described is an internal canary that **cannot observe an outage taking the whole system down.** Making this a commitment requires an external prober and a named owner reviewing the error budget monthly |

### 8.9 Authentication and identity

Rigorous JobTread grant scoping beside no answer for how humans log in is a hole under the words "professional grade," in a system holding DB's complete cost book, 3,550 customer records and insurance claim data.

- **Identity provider: Google Workspace SSO** (DB is already on Google). No local passwords.
- **MFA mandatory** for anyone holding the push privilege or the Admin role.
- **Session policy:** stated lifetime, and **re-authentication required for the approval and push actions specifically** — the two irreversible ones.
- **Device posture** for the field iPad: it holds plan data and customer pricing; managed-device enrollment or no authenticated session.
- **Login, logout, role change and privilege grant all land in the same append-only hash-chained log** as estimate events. `estimate_event.actor_id` is a FK to a real account table, not a free-floating id.
- **Documented offboarding checklist** — SSO revocation, session invalidation, JobTread grant rotation, device wipe.
- **MCP server authentication** named explicitly: a read-only surface holding the entire cost corpus, authenticating as a specific user with a scoped token, not as the application.
- The security review rises to **12 hours** to cover authentication, session handling and the MCP surface.

### 8.10 Coverage — who an estimator calls at 4pm on bid day

"Extremely reliable" promised against one developer, no rotation, and no answer for vacation, illness or resignation during bid week is not a plan. "Every phase boundary is a stopping point" is a project-level answer to an operational question.

- **A one-page, estimator-executable degraded procedure.** How to get the approved numbers out of the system and into JobTread by hand — today's process. Built in Phase 3, rehearsed at cutover, **re-rehearsed quarterly.** This is also the JobTread-breaking-change fallback (§7.10) and the abandonment-drill procedure (§13.1): one procedure, three uses.
- **A named secondary.** Most cheaply, a retainer with the Phase 0 contractor — a few hours a month with a stated response time. They will have written Phase 0 and 0b.
- **A leave blackout.** The developer does not take leave during the two weeks Carl names as the worst estimating period of the year.
- **Hypercare, defined.** A stated triage commitment for a named severity class during a named two-week window in which the developer takes no leave, with the degraded manual path as the fallback when it is not met.
- **Availability is measured by an external prober or it is not measured.**

---

## 9. Domain model

Eight entities daily GC workflow requires and that a first-pass design typically omits. All Phase 2a or 2b.

### 9.1 Lead-stage (unbound) estimates

```sql
create table estimate (
  id                   uuid primary key,
  kind                 text not null,        -- 'base' | 'change_order' | 'alternate_set'
  contract_type        text not null default 'lump_sum',
      -- 'lump_sum' | 'unit_price' | 'time_and_materials' | 'cost_plus_fee' | 'carrier_schedule'
      -- only lump_sum is implemented; see §9.9
  jobtread_job_id      text,                 -- NULL for a lead-stage estimate
  lead_ref             text,                 -- free-text opportunity handle while unbound
  baseline_revision_id uuid,                 -- change orders only; §9.2
  status               text not null,        -- lead|draft|internal_review|approved
                                             --   |pushed|won|lost|superseded
  lost_reason          text,
  project_type         text not null,        -- 'C-*' | 'R-*'  (roofing seam, §11)
  tax_policy_version   uuid not null,
  valid_until          date not null,        -- §9.9; default now()+30d
  expected_start_date  date,                 -- drives escalation, §9.9
  escalation_pct_month numeric(19,6) not null default 0,
  created_at           timestamptz not null default now(),

  constraint push_requires_job
    check (status not in ('pushed','won') or jobtread_job_id is not null),
  constraint only_lump_sum_implemented
    check (status not in ('approved','pushed','won') or contract_type = 'lump_sum')
);
```

GCs bid work that never becomes a job, and bid multiple times before a job record is justified. An estimate is legal and fully priceable while unbound: **approval is allowed; push is blocked** by the check constraint. Binding happens by selecting a real job (never by name matching — 3,550 accounts with known duplicates) or by creating one, **which VERIFIED is a three-step `createCustomer` → `createLocation` → `createJob` chain with no atomicity** (§7.11), Admin only. A lost bid is marked `lost` with a reason; if already pushed, a human marks the JobTread document denied. **We never delete.**

### 9.2 Change orders

```sql
create table change_order (
  id                   uuid primary key,
  estimate_id          uuid not null references estimate(id),  -- kind='change_order'
  job_id               text not null,
  baseline_revision_id uuid not null,   -- the accepted base this CO amends
  jt_reference_pushed  boolean not null default false,
      -- JobTread natively supports document->document references (§7.11); the CO
      -- links its baseline INSIDE JobTread so a PM sees what it amends
  co_number            int  not null,   -- sequential PER JOB, gapless, allocated at approval
  reason               text not null,   -- customer request | field condition
                                        --   | plan revision | allowance reconciliation
  markup_rule_set_id   uuid not null,   -- CO markup is often higher: explicit, recorded
  source_allowance_id  uuid,            -- set when drafted by allowance reconciliation
  unique (job_id, co_number)
);

-- Cumulative contract value is COMPUTED, never stored on the base:
--   contract_value(job) = accepted_base.price + Σ accepted_co.price
-- The base revision is NEVER mutated to "include" a CO.
--
-- BUT JobTread is AUTHORITATIVE for contract value, and we are not. Its document
-- statuses and job rollups move without us, and §7.7's lifecycle rule means a
-- signed base is permanently read-only to us while humans keep acting on it in
-- JobTread. So the nightly sweep (§7.5 Tier 3) reconciles our computed value
-- against JobTread's accepted customerOrder set and alerts above DOC_EPSILON.
-- DB Estimator DISPLAYS contract value as a mirror with a staleness stamp, never
-- as its own figure. Two systems showing two contract values with no stated
-- authority between them is the opposite of one direction of truth.
```

A CO is an `EstimateDraft` with `kind='change_order'` and a baseline reference, containing only the delta scope, priced under its own markup rule set, pushed as a `customerOrder` with the Change Order template and its own deterministic `externalId`. **Phase 2b — daily workflow, not an advanced feature.**

### 9.3 Allowances and selections

VERIFIED: `costItem` carries `isSelected`, `isSpecification` and `allowanceType`. DB's estimates are allowance-heavy — cabinetry at $600/LF, flooring at $5/SF, walk-in shower at $1,750 — and the root scope narrative explicitly warns that allowance lines will be repriced after selections.

**JobTread already models the central question, with more resolution than a boolean.** VERIFIED: `allowanceType` is a `oneOf` over **three** values, `{cost, costAndFee, price}`. A local `includes_markup boolean` is a lossy encoding that **silently drops `costAndFee`.**

```sql
create table allowance (
  id                   uuid primary key,
  line_item_id         uuid not null references line_item(id),

  -- THE question, in JobTread's own three-value vocabulary (§7.11):
  --   'cost'       = a cost budget, marked up to a customer price
  --   'price'      = the customer-facing price, margin already inside
  --   'costAndFee' = cost plus a stated fee — the case a boolean cannot express
  jt_allowance_type    text NOT NULL,        -- ← NO DEFAULT. Maps 1:1 to allowanceType.
  fee_pct              numeric(19,6),        -- required iff jt_allowance_type='costAndFee'

  kind                 text not null,        -- 'material_only' | 'installed_included'
  basis                text not null,        -- 'lump_sum' | 'per_unit'
  budget_amount        numeric(19,4),
  per_unit_amount      numeric(19,4),
  per_unit_id          text,
  customer_visible_cap numeric(19,2) not null,
  reconciliation_rule  text not null,        -- 'credit_if_under' | 'no_credit'
                                             --   | 'change_order_if_over'
  selection_deadline   date,
  status               text not null,        -- 'open' | 'selected' | 'reconciled'
  jt_is_specification  boolean not null default false,

  constraint fee_iff_cost_and_fee check (
    (jt_allowance_type = 'costAndFee') = (fee_pct is not null))
);
```

**`jt_allowance_type` has no default, deliberately.** If a stated $4,500 appliance allowance is a cost budget to be marked up, the customer's price is $6,525 at ×1.45. If it is the customer-facing price, the cost budget is $3,103. **Leaving it implicit leaks margin on every single selection, invisibly, because the number the customer remembers is the same either way.**

**Hard invariant at the approval gate:** a `material_only` allowance requires a sibling labor line in the same group that is *not* part of the allowance, or the gate blocks. This is the "tile allowance with no setter" failure — the customer picks $18/SF tile, assumes installation is covered, and the argument that follows costs more than the tile.

**Allowance reconciliation drafts a change order; it does not mint one.** Automatic generation of a priced customer-facing document contradicts the discipline that a human approves every number reaching a customer. Reconciliation **creates a task and a draft CO in `lead`/`draft` status** with the delta pre-populated and its derivation shown; it enters the same approval gate and **cannot be pushed without a named approver.** A test proves an allowance reconciliation cannot produce a pushed document without an approval event.

Every estimate reports **total allowance exposure in dollars and as a percentage of contract value.** A job that is 22% allowances is not a fixed-price job in any meaningful sense, and the estimator, the PM and the customer should all know that before signing.

### 9.4 Assemblies: hard-coded TypeScript in v1, DSL later

**Authoring inputs, in priority order:** (1) the Spike 6b workbook specification — DB's actual estimating logic; (2) DB's **101 live catalog `quantityFormula` rows**; (3) Phase 1's statistical discovery over 46,248 cost groups.

```ts
// packages/assemblies/src/defs/interior-partition-wall.ts
import { A, Assembly } from "../kit";   // A = dimensional arithmetic; compile-errors on mismatch

export const interiorPartitionWall: Assembly = {
  key: "int_wall_2x4_gwb_both",
  version: "1.3.0",                  // bumped on ANY numeric change; instances PIN this
  trade: "shell",
  projectTypes: ["C-*"],             // roofing seam: R-* assemblies are additive DATA
  sourceSpec: "ADR-0013 §4.2",       // traceable to the Spike 6b workbook spec
  inputs: {
    wallLength:   { dim: "LENGTH" },
    openingArea:  { dim: "AREA",  default: A.zero("AREA") },
    openingCount: { dim: "COUNT", default: A.zero("COUNT") },
  },
  params: {
    heightFt:    { type: "length", unit: "FT", default: 8,  min: 7, max: 14 },
    studSpacing: { type: "length", unit: "IN", default: 16, enum: [12, 16, 24] },
    finishLevel: { type: "enum", values: ["L3","L4","L5"], default: "L4" },
    paintCoats:  { type: "number", default: 2, min: 1, max: 3 },
  },
  outputs: (i, p, c) => {
    const faceArea = A.mul(i.wallLength, c.ft(p.heightFt));          // LENGTH×LENGTH → AREA
    const netArea  = A.sub(A.mul(faceArea, 2), A.mul(i.openingArea, 2));
    const studQty  = A.add(
      A.add(A.ceil(A.div(i.wallLength, c.inToFt(p.studSpacing))), A.count(1)),
      A.mul(i.openingCount, 3));
    return [
      { alias: "studs", catalog: "stud_2x4_kd",
        code: "FRAMING_SHEETING", type: "MATERIALS", unit: "EA",
        qty: studQty, waste: "waste.framing_lumber",
        rounding: { mode: "CEIL", multiple: 1, scope: "LINE" },
        phase: ["Phase 2 - Rough-In", "Framing Materials"],
        taxPolicy: "inherit" },        // ← NOT `isTaxable: false`. §8.6.

      { alias: "gwb", catalog: "drywall_12_4x12",
        code: "DRYWALL", type: "MATERIALS", unit: "SHEET",
        qty: c.packs(netArea, "drywall_12_4x12"),   // AREA→SHEET ONLY via item PackageSpec.
                                                    // c.convert(area,"SHEET") does not compile.
        waste: "waste.drywall",
        rounding: { mode: "CEIL", multiple: 1, scope: "PROJECT_CONSOLIDATED" },
        phase: ["Phase 3 - Interiors", "Drywall/Plaster"],
        taxPolicy: "inherit" },

      { alias: "lbr_hang",
        code: "DRYWALL", type: "LABOR", unit: "HOURS",
        qty: c.rate(netArea, "productivity.drywall_htf", { finishLevel: p.finishLevel }),
        crewRate: "crew.drywall_2man",
        waste: "waste.none",                        // NEVER waste labor. Use productivity.
        rounding: { mode: "ROUND", multiple: 0.25, scope: "LINE" },
        //  ROUND, not CEIL: ceiling every labor line on a 60-line estimate inflates
        //  labor 3-6%, and labor carries DB's highest markup (×1.818), so the price
        //  inflation exceeds the cost inflation.
        phase: ["Phase 3 - Interiors", "Drywall/Plaster"],
        pricingRule: "markup.labor", taxPolicy: "inherit" },
      // ...8 more outputs
    ];
  },
  golden: [
    { name: "120 LF · 8ft · 16in oc · L4 · 2 coats · 2 openings @ 20 SF",
      inputs: { wallLength: "120 LF", openingArea: "40 SF", openingCount: 2 },
      expect: { studs: "108 EA", gwb: "38 SHEET", lbr_hang: "20.75 HOURS" } },
  ],
};
```

**Build the DSL when — and only when — one of these is true:** a non-developer must author or edit an assembly without a deploy; the count exceeds ~40; or an assembly needs versioning independent of a release.

Three properties hold either way. **Outputs declare BOTH a phase path and a cost code**, because DB's estimates are a construction-sequence phase tree while cost codes carry the CSI-ish classification — orthogonal dimensions, and collapsing them would make our output unrecognizable to their estimators. **An output's `alias` is immutable forever**, because overrides, actuals matching and `globalId` generation all key on `(assemblyInstanceId, alias)` — the hinge the Phase 8 loop hangs on. And **taxability resolves from `TaxPolicy`, never hardcoded.**

### 9.5 The event log and revision pinning

```sql
-- Append-only. The app role has INSERT + SELECT only.
create table estimate_event (
  id           bigserial primary key,
  aggregate    text  not null,
  aggregate_id text  not null,
  seq          int   not null,
  actor_id     uuid  not null,       -- FK to our own account table (§8.9), never an email
  occurred_at  timestamptz not null default now(),
  type         text  not null,       -- includes auth events: login, role_change, grant
  field_path   text,
  before       jsonb, after jsonb,   -- money as decimal STRINGS, never floats
  reason_text  text,
  source       text  not null,       -- ui|assembly|recalc|planRevisionIngest|jobTreadSync
                                     --   |ratePublish|auth|vendorMeasureImport
  correlation_id uuid,
  prev_hash    bytea,
  hash         bytea not null,       -- sha256(prev_hash || canonical_json(row))
  unique (aggregate, aggregate_id, seq)
);
revoke update, delete on estimate_event from db_estimator_app;

create table estimate_revision (
  id            uuid primary key,
  estimate_id   uuid not null references estimate(id),
  revision_no   int  not null,
  snapshot      jsonb not null,      -- the COMPLETE serialized estimate
  pins          jsonb not null,      -- every dependency version, below
  totals        jsonb not null,      -- computed from STORED line values, never re-derived
  content_hash  bytea not null,
  sealed_at     timestamptz,
  sealed_by     uuid,
  status        text not null,       -- internal|issued|accepted|superseded|lost
  reason_for_revision text,
  unique (estimate_id, revision_no)
);
-- pins = { assemblyVersionIds[], rateTableVersionId, catalogSnapshotId,
--          markupRuleSetVersionId, unitTableVersionId, taxPolicyVersionId,
--          contingencyPolicyVersionId, escalationRate, planRevisionIds[],
--          engineVersion, geometryKernelVersion, pdfjsVersion,
--          templateId, templateFooterHash, validUntil }
```

A revision is a **full pinned snapshot**, not a diff. Consequence: publishing a new rate table, correcting an assembly or fixing a unit mapping can **never** retroactively change a number the customer already saw. A nightly replay test re-derives the last N revisions from their pins and asserts identical totals — **if replay diverges, something non-deterministic entered the engine and we learn it from CI, not from a customer.** That test is a release gate.

### 9.6 Crash and session recovery

- **Phases 2–3 (server-authoritative):** autosave per *intent*, not per keystroke — a completed field edit, a blur, a line edit, a drag-reorder. Free text debounces 400ms. Hard flush on `blur`, `visibilitychange`, `pagehide`. A visible "N unsaved changes / save now" indicator, always — estimators will not trust an invisible mechanism, and the indicator is the single best adoption feature in the durability story. Worst-case loss is the single in-progress edit.
- **Phase 4c (takeoff):** a real IndexedDB write-ahead log. Every user intent becomes an op with a client-generated ULID appended to the WAL **before** it touches React state; the server dedupes on op id so replay is idempotent. On load, unacked ops replay; a conflict with a newer server revision presents a **recovery screen listing the affected ops with their values** so the estimator applies or discards each — never silently discarded, never silently applied.
- **Lease loss with unsaved edits:** the write is rejected on a stale lease token and the same recovery screen appears.

### 9.7 Contingency — a first-class amount, not a hidden multiplier

A chief estimator carries a design or construction contingency as a **named, reportable, releasable** amount distinct from overhead and profit. A markup engine with only `MARKUP_ON_COST`, `MARGIN_ON_PRICE` and `MULTIPLIER` guarantees contingency gets buried inside a multiplier where it cannot be reported to Carl, released to the customer as a credit, or tracked against actuals in Phase 8.

```sql
create table contingency (
  id                  uuid primary key,
  estimate_id         uuid not null references estimate(id),
  scope               text not null,        -- 'project' | 'phase' | 'line'
  scope_ref           text,                 -- phase path or line_item_id when not project
  basis               text not null,        -- 'pct_of_cost' | 'pct_of_price' | 'lump_sum'
  rate                numeric(19,6),
  amount              numeric(19,4),
  customer_visible    boolean not null,     -- shown as a line, or carried internally
  release_rule        text not null,        -- 'credit_at_closeout'
                                            --   | 'change_order_on_consume' | 'absorbed'
  consumed_amount     numeric(19,4) not null default 0,
  constraint rate_or_amount check (num_nonnulls(rate, amount) = 1)
);
-- Reported SEPARATELY from markup on every screen, in every export, and at the
-- approval gate. EXCLUDED from §8.4's markup-reproduction gates -- it is not part
-- of the historical markup schedule and must not pollute it. Consuming contingency
-- drafts a change order or a credit per release_rule; it never silently disappears
-- into a margin number.
```

### 9.8 Final-price adjustment — the entity whose absence destroys the audit trail

Estimators adjust a bid's bottom line to hit a round number, a target margin, or a competitive figure. With no named place to record that, **the only way to do it is to nudge line quantities or unit prices** — precisely the behaviour the hash-chained event log, provenance chips and stale-takeoff blocking exist to prevent. A persistent margin bar with a target rail actively invites the adjustment while providing no legitimate mechanism for it. **Its absence makes audit-trail corruption near-certain in week one.**

```sql
create table price_adjustment (
  id              uuid primary key,
  estimate_id     uuid not null references estimate(id),
  mode            text not null,      -- 'delta_amount' | 'target_price'
  delta_amount    numeric(19,4),
  target_price    numeric(19,4),
  reason          text not null,      -- CLOSED LIST: 'competitive' | 'relationship'
                                      --   | 'round_number' | 'margin_target'
                                      --   | 'scope_confidence'
  reason_note     text,
  author_id       uuid not null,
  allocation      text not null,      -- 'unallocated_single_line'  (default, honest)
                                      --   | 'prorated_customer_view'
  created_at      timestamptz not null default now(),
  constraint mode_fields check (
    (mode='delta_amount') = (delta_amount is not null) and
    (mode='target_price') = (target_price  is not null))
);
-- THE ONLY sanctioned way to move a bottom line without changing scope.
-- Under 'prorated_customer_view' the customer sees the adjustment spread across
-- groups while the UNDERLYING LINES STAY UNTOUCHED -- the takeoff, the assemblies
-- and the provenance chain are never rewritten to hit a number.
-- Surfaced on the approval gate with its dollar AND margin impact.
-- EXCLUDED from Phase 8 variance attribution, so a competitive discount never
-- pollutes a learned unit cost or productivity rate.
```

### 9.9 Duration, escalation, bid validity, contract type

**Project duration.** A "general conditions (duration-driven)" assembly with no duration input means **the largest indirect-cost block is a typed-in guess with no provenance, no history and no variance attribution** — inside a system whose premise is that every dollar traces to a source. Supervision, PM time, dumpsters, portajohn, rentals, temp power and trailer are weeks-on-site costs, and DB's own estimate puts Project/Site Management and Rentals in Phase 1 General Requirements.

```sql
create table phase_duration (
  estimate_id     uuid not null references estimate(id),
  phase_path      text not null,
  weeks           numeric(19,2) not null,
  derivation      text not null,      -- 'entered' | 'from_labor_hours'
  crew_size       numeric(19,2),      -- required when derivation='from_labor_hours'
  primary key (estimate_id, phase_path)
);
-- Derived duration = Σ labor hours for the phase ÷ (crew_size × 40), shown as
-- provenance like any other quantity. Phase 1 mines ACTUAL durations from job
-- timeEntries date spans (§6.4) to seed crew-size assumptions. Phase 8 adds a
-- DURATION variance alongside quantity, price and scope.
```

**Escalation and bid validity.** Pinning a `rateTableVersionId` per revision freezes what the customer saw, but nothing warns when an estimate is approved against rates mined from jobs 18 months old, and nothing carries an escalation factor for a project starting six months out. DB's own contract footer already contains a §5.2 material-escalation clause above 5%, so this is their existing commercial position. So: **`valid_until` is required on every issued revision** (default 30 days) and **surfaced in the proposal alongside the payment schedule**; an **approval-gate blocker** fires when any pinned rate's source-data median age exceeds a Carl-set threshold; and **`escalation_pct_month`** applies from `expected_start_date` as an **explicit, separately reported adjustment** — never folded into markup, contingency or waste. Phase 1 mines the actual unit-cost trend per top-30 cost code so the number is evidence-based.

**Contract type.** Fixed-price lump sum only breaks on two lines of business DB already runs: service repair is T&M (Service Repair Labor $55→$125, emergency $85→$190), and insurance restoration is priced against carrier schedules, often cost-plus. `estimate.contract_type` is in the §9.1 DDL with **only `lump_sum` implemented and a check constraint refusing approval on any other value.** Where `carrier_schedule` is set, the markup engine must be **bypassable in favour of an external price source** — declared now, implemented when roofing and restoration are in scope. A near-free seam now; a migration across every consumer later.

---

## 10. AI strategy: the ladder, the gates, and what is deliberately not built

### 10.1 The rungs

Accuracy is **split by what the file contains**, because one blended number across two input classes oversells one and undersells the other.

| Rung | Capability | Method | Realistic accuracy | Phase |
|---|---|---|---|---|
| 1 | Vector **geometry** extraction | Deterministic (pdf.js operator list) | **Exact on every vector-authored page.** Residual error is drafting fidelity, not model error (Decision 21) | 4b |
| 1b | Vector **text** extraction | Deterministic | **Exact where the exporter emitted real text operators** (Revit/TrueType). **Zero where text was plotted as SHX stroked geometry** (common in AutoCAD) — no text layer exists to read. "~100% on vector PDFs" is true for one exporter and false for the other, with no runtime warning beyond an empty text layer | 4a |
| 1c | **Layer classification from PDF Optional Content Groups** | Deterministic metadata read | **Exact where OCGs survived export.** `A-WALL-EXTR`, `A-DOOR`, `A-ANNO-DIMS` classify walls, doors, dimensions and annotation with no inference — and it works on poché walls where stroke-width clustering fails outright | 4b |
| 2 | Sheet classification, title-block / index parsing | Text parsing + regex; model on extracted **text** only as fallback | **~99% on text-bearing sheets** — real text at known coordinates, not OCR. **80–90% on clean 300+DPI scans, materially worse degraded.** Failures benign and visible | 4a |
| 3 | Scale determination and verification | Up to 5 independent methods, cross-checked (§8.3) | **90–95% correct pre-filled proposal on text-bearing sheets; 50–70% on stroked-text sheets** using the four pure-geometry cross-checks. **100% require one human confirmation click** | 4b |
| **4** | **Snap-assisted manual takeoff on real extracted geometry** | Pure deterministic geometry | **Exact** — the measurement *is* the drawing's geometry. Zero model error, zero per-sheet cost, degrades to freehand | **4b** |
| 5 | **User-seeded** symbol counting | XObject `Do`+CTM instancing; geometry-hash fallback | **Exact where the exporter instanced; 85–95% recall with reviewable false positives where it did not.** Many Revit/AutoCAD paths flatten repeated symbols, in which case the exact mechanism yields nothing. False positives concentrate in dimension lines, leaders and notes overlapping the symbol — the same error source the one independent study identified. **Spike 2 counts instancing first** | 6 |
| 6 | Schedule / legend / tag extraction incl. **wall types** | Vector ruling-line grid reconstruction — **no ML** | **Near-exact on text-bearing vector sheets** — ruling lines are real vector rects, cell contents real text: a **spatial join between two exact datasets, not recognition.** **85–94% per field via a purchased OCR adapter on scans** | 6 |
| 7 | Assembly expansion to priced lines | Deterministic rules + DB's own data | Deterministic, auditable | 2a |
| 8 | JobTread integration | Deterministic | Deterministic; risk is operational | 2b |
| **9** | **Room area** | **READ THE PRINTED ROOM-TAG AREA** | **Exact where tags carry areas** — and it is the *same number the architect will cite in a dispute*, a stronger position than our own recomputed polygon. Requires extractable text | 6 |
| 9b | Room **perimeter**, area for **untagged** spaces | Wall-graph reconstruction as a **drafting aid** | **60–85% of rooms clean, failures concentrated in open-plan areas where the dollars are.** `polygonize_full` dangles and cut edges surface as "enclosure broken here" markers so the estimator fixes two walls instead of retracing a room. **No accuracy claim is promised to Carl** | 6 |
| 10 | Wall linear footage with **type** | Rung 9b graph + junction resolution + rung 6 legend | **No accuracy claim, because none is computable.** Junction resolution has no objective ground truth: two competent DB estimators differ by 2–5% on the same plan and both are correct by their own convention. Deliverable is the graph overlay plus broken-enclosure markers. **First, DB's junction convention is written down with the named estimator and encoded as the measurement rule** — internal consistency is the property that matters, and is exactly what Beam's ±1% guarantee measures | 6 |
| 11 | Model mapping of detected features to assemblies | Classification over extracted text, closed output set | **80–90% top-1 on familiar work.** Presented as **top-3 with rationale**, and the accept UI shows **the resulting line count and dollar value** — an estimator under deadline will accept "Interior Partition 2x4 GWB both sides" but not "11 lines, $14,280" on a closet | 6 |
| 12 | Natural-language plan/spec query | RAG with sheet **and coordinate** provenance | **85%+ useful for *locating*; unreliable for quantities.** Coverage, not accuracy, is the limit: on sheets with no text layer the honest answer is "I have nothing indexed here," engineered explicitly | 6 |
| 13a | **Sheet-index / addendum set diff** | Set arithmetic over extracted sheet numbers | **Near-exact, nearly free.** Catches *added scope*, the failure nobody detects because nothing looks stale | **4a** |
| 13b | Geometric revision comparison | Registration + geometric + table diff | 70–85% detection recall; **delta quantification much worse, and the number deciding whether it gets used is the false-positive rate.** Gated on measured **precision** against DB's own revision pairs | 5 |
| 14 | Plan-vs-spec conflict detection | Rules engine + model for candidates only | High precision on narrow rules; poor open-ended | later |
| **15** | **VLM reading a drawing image to produce a measurement** | — | **Unusable, and the 2026 benchmark record is not improving.** The best method places only ~31% of predictions within a 0–40% error margin while **over a third exceed 100% error**; frontier VLMs fall below 60% on structured scientific diagrams, with engineering diagrams strictly harder; 2026 studies across 37 VLMs find systematic egocentric bias and weak rotation comprehension. Distance, length and scale are their *weakest* categories — while text-only spatial reasoning scores ~93% | **never** |
| **16** | **Generative estimate with model-produced quantities** | — | **No defensible error bound.** Errors arrive as a tidy, confident, professional line-item list with no visible defect | **never for quantities** |
| **17** | **Unattended takeoff → signed contract** | — | Not achievable. Attentive.ai raised ~$48M, reached ~$58M revenue, and chose ~526 employees over closing the gap with models | **never** |

**Rung 15's asymmetry is the design principle:** models reason well about coordinates handed to them and badly about coordinates they must read off a picture. **And it is not narrowing** — so a future model release is not a reason to revisit rung 15, whereas a future *extraction* improvement is a reason to revisit rungs 1–6. Record that in ADR form now, because in month nine a vendor will demo a model measuring a plan and the argument will need to be re-had from evidence rather than memory.

### 10.2 The structural rule

```
The language model FINDS and CITES.  The geometry engine COUNTS and MEASURES.

Enforced in code, not in a prompt:
  • Numeric questions route to generated SQL over extracted quantity tables
  • The model gets TOOLS that return numbers; it may not emit a computed number
  • Structured output requires a source_id on EVERY numeric field
  • The backend VALIDATES that each source_id exists AND that the number matches
    the tool result byte-for-byte, and rejects-and-retries otherwise
  • The answer must render the SHEET ID and COORDINATE beside every number, with
    click-through. Byte-matching a tool result proves the number is real; it does
    NOT prove the right result was cited, so a model can return a true number
    from the wrong sheet. The coordinate closes that hole cheaply.
  • The estimate schema has no writable path from the model layer to a quantity field

A prompt instruction is not a control. This validation loop is the control.
```

### 10.3 Per-category gating

Each detection category is enabled independently, never globally, and only after: **n ≥ 30** instances benchmarked against human takeoff on DB's own sheets; **dollar-weighted MAE ≤ 2%**; **max error ≤ 5%**; **mean *signed* error within ±0.5%** (the one that catches systematic bias). A rolling 20-sample MAE breach **auto-demotes** to proposal-only. A new architect's drawing style is a new distribution and triggers re-benchmarking.

MAE is **dollar-weighted**, because 2% across twenty rooms is meaningless if the error sits in the largest one. And the **ground-truth budget is real**: n=30 per category, hand-measured purely to grade a model, is **8–12 estimator hours per category**, so ~50–70 hours per category benchmarked. **A category with no funded ground-truth budget does not ship.** That constraint is much of why gated ML is cut.

**Accept-time safety checks — built before the thing they check.** A coverage map shading regions no accepted measurement covers (how you notice the model missed the pantry); a per-room area band check against DB's own historical distribution for that room name and project type; a sum check of accepted room areas against the footprint from the exterior wall polygon. These fire **in the tray at accept time**, not at the approval gate three hours later, and they are **a precondition for shipping any area-producing proposal at all.**

**The proposals store is schema-incapable of contributing a quantity.** Suggestions render dashed in a reserved cyan no trade palette may use. Bulk accept shows a manifest first ("24 rooms, 11,430 SF, mean confidence 0.91 — 3 below threshold excluded and must be handled individually"), requires that the estimator has cycled the sheet, and is **one atomic undo.** Every accept records model version, confidence, the raw proposed geometry and the accepting human — permanently, and filterable so a reviewer can spot-check exactly the bulk-accepted set.

**The limit of the accept gate, stated plainly:** it catches **visible** failures — a wrong count mark, a misread schedule row — which is why Decision 16 sequences those first. It does **not** catch silent ones: a fused room polygon, a skipped opening back-out, or a plausible-but-wrong assembly mapping all render as clean professional output. The only controls for the silent class are the three accept-time checks above. **A category whose failures are silent and whose accept-time check is not built does not ship.** Applied honestly, that removes automatic room segmentation from the plan entirely — which is what rung 9 does by reading the tag instead.

### 10.4 Privacy — and plan-data licensing, a separate problem

**Plans MAY go to a model provider under zero-retention terms. DB's cost data NEVER does.** Unit costs, prices, margins and vendor names are stripped before any external call. Every external call is gated behind an explicit per-job toggle writing an audit event naming what was sent. A self-hosted OCR path stays alive for insurance-restoration sets carrying homeowner PII, and title-block stripping is a documented pre-upload step. Model spend is trivial — a sheet at 1568px is ~2,300 image tokens, so a fully-processed 100-sheet set is a few dollars and a realistic estimate is **under $2** — which makes the privacy discipline free rather than a trade-off.

**That is privacy. Licensing is a different question.** Architect-issued drawings are copyrighted works, normally licensed to the contractor **for construction of that project only**; AIA-family agreements restrict reproduction, derivative works and transmission to third parties. This plan permanently stores originals, **generates derivative works** (tile pyramids, harvested vector geometry, extracted schedules), **ships sheet images to an external model provider**, and **attaches annotated plan crops to JobTread cost items that go to customers.** Required: **`plan_set.license_terms` and `plan_set.external_processing_permitted`**, set at ingest in Phase 4a, **defaulting to false** so the external-model path is opt-in **per plan set**; a **documented retention and purge policy** for originals and derived tiles, tied to the lawyer's answer (§8.6); and an **indemnity / permission clause** in DB's own subcontract and owner agreements where drawings are supplied.

---

## 11. Roofing seams — and the honest date

**On this sequence, roofing estimating is a 2029 deliverable.** Phases 4–8 span 2028 and Phase 9 lands in 2029, at velocities already revised upward twice. Carl said "then we will discuss roofing"; the discussion should start from that date, not a phase number in a table.

Deferring the roofing *engine* is right on the evidence: **VERIFIED, DB already pays HOVER $58.99–112.61/job and CANVAS $0.40/SF.** Exteriors have a working commercial answer; interiors have none. And roofing's markup structure (×2.33–2.65 warranty adders vs ×1.450 materials) would make the Phase 3 parallel run unreadable.

**But seam 8 should not wait.** The vendor-measurement adapter needs no canvas, no geometry and no AI — measurement ingestion plus provenance, ~1–2 dev-weeks — and it makes roofing and exterior estimating usable through the same engine, assemblies, approval gate and push **years earlier.** It moves to **Phase 2b.** If Carl's roofing appetite is near-term, that is the answer (§2.6).

Nine seams, declared at near-zero cost because each is expensive to retrofit:

1. **Trade dimension from day one.** `assembly.trade` + `allowed_project_type_prefix`, keyed to DB's existing fields: Job Type has exactly two options (Roofing, Construction) and every Project Type is prefixed `C-` or `R-`. Phases 1–8 populate `C-*` only. Roofing is a **data addition**, not a code change.
2. **`Square` = exactly 100/1 ft²** as an exact rational in the Phase 2a unit table, with its real JobTread unit id.
3. **`roofFacet` measurement kind with a REQUIRED pitch attribute**, declared in Phase 4b even though no roof is measured.
4. **`projectedArea` vs `surfaceArea` as a type-level distinction.** Binding a plan-projected roof area into an assembly input declared as surface area is a **compile-time and publish-time error.** The seam that matters most: treating plan area as surface area understates by 11.8% at 6/12 and 41.4% at 12/12 — plausible numbers, catastrophic bid. Twenty lines now versus a dangerous refactor of every measurement consumer later.
5. **`SLOPE_FACTOR(pitch) = sqrt(1 + (rise/12)²)`** ships in Phase 2a as a dimensionless multiplier, so the roofing quantity chain is expressible without an engine bump.
6. **Item-scoped packaging, not global conversions.** `PACKS(quantity, catalogItem)` resolves through that item's `PackageSpec`, so shingle bundles-per-square being product-specific needs no new mechanism.
7. **Roofing markups stay quarantined as item-level rules.** The markup engine resolves by most-specific selector (item > cost code > cost type), so roofing enters as rows and cannot distort interior pricing.
8. **A vendor-measurement adapter — implemented in Phase 2b.** `measurement.method` includes `vendor_report`, so a HOVER or CANVAS report ingests as measurements with full provenance and prices through the same assemblies, gate and push. **For most roofs that is the honest answer: buy the geometry for $59, own the pricing.**
9. **`estimate.contract_type`** (§9.9), with only `lump_sum` implemented and approval blocked on every other value. Restoration is carrier-schedule or cost-plus; service repair is T&M. Both exist in DB's business today.

**Travelling with roofing, not before it: insurance restoration.** The Insurance Restoration Agreement template and the job custom fields (Insurance Claim, Carrier, Claim Number, Adjuster Name/Phone/Email) already exist. Two things are honoured now: restoration observations are **cohorted separately** in Phase 1's mining, because carrier schedules are a different pricing regime and blending them corrupts both cohorts; and restoration plan sets carry homeowner PII, which is why the self-hosted OCR path stays alive.

**Phase 9's real exit criterion is the seam test:** roofing must ship without changing `packages/money`, the JobTread write path, the approval gate or the scale interlock. If any had to change, the seams failed — worth recording honestly rather than hiding.

---

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation | Kills project? |
|---|---|---|---|---|
| **The senior developer is never hired, or the FTE is not sustained** | **High** | Fatal — a half-built canvas has zero value | Hiring is a **Gate 0 criterion with 10 weeks of calendar and a budget line.** Phase 0 is done by a short-term contractor (easier to buy, and a working interview). Every phase boundary is a stopping point. **Plus a named secondary on retainer and a leave blackout (§8.10)** | **Yes** |
| **The project never ships** — beautiful canvas, no push, everyone quietly returns to the spreadsheet | **High** | Total loss + organizational scar tissue | The entire sequencing: usable read-only tool at week 24, real push at week 48, the old path fully open forever with one-click Excel export on every screen. **The annual abandonment drill proves it (§13.1)** | **Yes** |
| **Estimator abandonment** — lost work, an unexplainable number, slower at the fifty-times-a-day task | Medium | Fatal — adoption cannot be mandated; tools get bypassed under deadline | Treat the causes as engineering requirements (§9.6, provenance chips, Enter-and-nothing-else commit, permanent Excel export, defined hypercare). **Gate 3 trains every estimator and requires a cold-start documentation test.** Phase 4 fails if takeoff is slower than today | **Yes** |
| **Bus factor of one** | **High** | Severe, growing annually | ADRs superseded not edited; golden + parallel-run suites as executable specifications; machine-enforced package boundaries in CI; mainstream stack; CODEOWNERS on `money` and `geometry`; **a named year-3 maintenance owner is a Gate 0 criterion**; **the annual takeover test is funded and specified (§13)** | **Yes** |
| **A wrong number reaches a customer as a signed contract** | Medium | Severe — financial loss, permanent loss of confidence, **and a liability question** | Six layers: the scale interlock in the database; measurement/quantity separation; the MRC; the hard approval gate; the ROM sanity gate (§8.6); the trust ladder with written demotion triggers. **Plus E&O review, a scrivener's-error clause in the footer, and Carl's written statement of absorbed exposure** | No |
| **Phase 4 overruns past 30 weeks** | **High** | Severe — burns budget and goodwill | 24 dev-weeks in **three independently shippable slices**, so stopping after 4a or 4b is a real option. Scheduled at 1.25x AI assistance, openly. **Spike 3 measures clipped sub-rectangle rendering, because pdf.js has no canvas tiling and the pyramid is the hidden 3–5 week item.** 25 hours of a senior graphics engineer reviewing the coordinate model **before it hardens.** Konva as an explicit fallback, `packages/geometry` kept library-free. **Phase 3 being live means an overrun is disappointing, not fatal** | No |
| **Catalog reconciliation stalls on Carl's calendar** | **High** | Severe — everything downstream prices off unreconciled data | Spike 8 counts the decisions first. **Workstream C is its own dated phase with no developer dependency.** **The 709 are split by trade FIRST and Gate 1 is stated against the C-scope subset only** — otherwise Carl's hours burn on gutters and step flashing | No |
| **Duplicate customer contract from a retried push** | Low | **Catastrophic — legal, not just financial** | The §7.4 state machine with 20/20 fault injection as an MRC item. Uniqueness enforced by us because server enforcement is UNVERIFIED. Nightly orphan sweep both directions **plus 60-second `documentDeleted` detection.** Grant holds no `deleteDocument`, `deleteCostItem` or `deleteCostGroup` | No |
| **Tax is wrong on a customer document** | **Medium–high if not engineered against** | Severe — under-billed tax is DB's to eat, and it compounds silently | **80,462 taxable items and 60 documents at 0.0725 exist today** (§1.1). `TaxPolicy` versioned and pinned per revision; `taxRate` validated as a 0–1 fraction at the boundary; CPA sign-off is a blocking MRC item | No |
| **Create-time defaults corrupt a customer document** | Medium if not engineered against | Moderate–severe; lands in front of a customer | Typed payload builder where **all 13 dangerous-default fields are required by the type system** (MRC 5); post-push read-back assertion; payload snapshot tests. Note `showQuantity` and `showChildCosts` default TRUE while DB's own template sets them FALSE | No |
| **JobTread-side edits diverge invisibly** | **High that it happens** — DB's workflow includes post-push editing | Moderate–severe | `document.events` per-document tail + content-hash diff + **mandatory** nightly sweep + self-write filtering **by grant id, because `createdByGrantId` is populated for human edits too.** JobTread always wins; divergence stops and asks | No |
| **Our writes break DB's own services, or reach QuickBooks** | Medium | Moderate–severe, and lands as a mysterious failure | **VERIFIED: 4 webhooks registered. Two fire on `documentCreated`** (db-zone-setter on Vercel, ops.deitemeyerbrothers.com); **three on `documentUpdated`** (those two plus a Google Apps Script). Push #1 hits at least two DB-owned services immediately. Spike 9 reads every handler and gets an explicit namespace skip **before push #1**; QBO answered in writing, `qboIsIgnored` on test documents | No |
| **JobTread ships estimating, or DB leaves JobTread** | Low–medium over five years | **Severe — the bridge is the largest justification for building, and its value goes to zero** | No mitigation is available, and pretending otherwise would be dishonest. What is available: confine the coupling to `packages/jobtread` behind an interface so the engine survives, and re-test the justification at every gate. **If DB is considering leaving JobTread, this project should not start** | Effectively **yes** |
| **A JobTread breaking change with no notice** | Medium over a multi-year horizon | Moderate–severe — pushing stops mid-bid-week | **§7.10 runbook:** break → P1 → push auto-disables by feature flag → estimators use the rehearsed manual path → 5-business-day RTO. Named certified contact. **$10–15K/yr reactive reserve, separate from maintenance** | No |
| **Grant expires or is revoked mid-bid-week** | Medium | Moderate — pushing stops | Alarms at 30/14/7 days (**current grant expires 2026-12-17, inside Phase 1**); rehearsed rotation with dual-read; historical grant ids retained so echo suppression survives rotation; quarterly rotation so it is never expiry-driven. **The grant in use today is heavily over-privileged and holds `updateCatalog` (§7.8)** | No |
| **Vector census comes back low, or text is unextractable** | **Medium** | Moderate–severe — removes the Phase 6 advantage and demotes the best scale source | Spike 2 measures **four axes** from DB's own last 50 jobs. Low vector → stop at Gate 3 and buy detection. Low text → §8.3 source (a) and cross-check (iv) demote, 4–6 weeks of OCR work moves forward, and Gate 4's speed criterion is renegotiated **before** Phase 4 starts. eTakeoff ships Togal.AI as an embedded OEM engine, proving detection is licensable separately | No |
| **Automation bias on AI suggestions** | Medium–high once extraction ships; **worsens as the model improves** | Severe — the silent-error class | Separate proposals store; reserved colour; manifested, atomically-undoable bulk accept; **accept-time coverage, band and footprint checks built BEFORE the features they check**; per-category gates with auto-demotion. **Gated ML is cut precisely because its failures are silent (Decision 22)** | No |
| **The audit trail is destroyed by estimators nudging line items to hit a number** | **High — it is what people do** | Severe — silently defeats the provenance chain the project exists to build | **§9.8 `price_adjustment` is the sanctioned mechanism**, with a closed reason list, a named author, and underlying lines left untouched. Without it, this is near-certain | No |
| **Scope creep via "all the best features"** | Medium–high, because the ask invites it | Severe — converts a gated plan into a three-year march | The deliberate-skip list is a **signed Gate 0 artifact**, re-read at every boundary. Every addition must displace, not append. **§0 states in Carl's own words which named features are not in scope** | No |
| **Nobody verified what STACK actually costs** | **High unless Spike 1b runs** | Moderate–severe on the decision itself | Two phone calls in Phase 0, owned by Carl. The buy-side number is uncertain by 2.5–3x, and at the low end the cost case for building is materially weaker | No |
| **The contractor walks away with DB's cost book** | Medium if no agreement is signed | Severe — the pricing corpus is the asset the build case rests on | **A signed contractor agreement is a Gate 0 criterion and a prerequisite to §16 action 3**: IP assignment, confidentiality, data handling (Grant C read-only, no local copies, deletion on termination), a narrow 12-month non-compete, and repo/ADR/runbook custody in DB's own GitHub org from commit one | No |

---

## 13. What could kill this project

Ordered by likelihood. Each is checkable, not a matter of taste.

1. **Spike 0 succeeds.** If STACK feels good on DB's real plan sets and a throwaway script pushes its export into JobTread as a nested `customerOrder`, the right answer is buy plus glue: $8–15K/yr and ~14 dev-weeks instead of fifteen months. The most likely kill condition, and why Spike 0 runs before any product code.
2. **Spike 2b succeeds.** If Togal clears the §10.3 thresholds on DB's own sheets, Phase 6's extraction — ~$91K — should not be built, and the plan becomes Phases 1–5 plus a licensed detection layer. A ~$300 trial settles it.
3. **Carl is the developer.** Fifteen to twenty-four months of the highest-leverage hours in a company running 3,987 jobs, diverted. The version built "on nights and weekends" is the version 40% finished in eighteen months and abandoned. If there is no budget for a contractor or hire, buy.
4. **There is no year-3 maintenance owner.** An internal estimating system the business bills through, understood by one person, is an unacceptable single point of failure. If the honest answer is "nobody," do not start. A subscription's maintenance burden is a credit card.
5. **No estimator will commit 4 hours a week.** Without a named design partner who has agreed in writing, this becomes a developer's theory of how estimating works — subtly wrong in ways that surface only as distrust, and distrust means bypass under deadline.
6. **The vector census comes back below 30%** — or comes back nominally fine but shows DB's architects plot text as SHX geometry, or draw hatched/poché walls, either of which silently breaks the mechanisms Phases 4b and 6 are built on.
7. **Spike 6 fails.** If DB's pricing is genuinely case-by-case rather than rule-shaped, formalizing it is a months-long elicitation in Carl's head, not a mining project, and the moat is thinner than it looks.
8. **The real bottleneck is somewhere else.** If DB's constraint is lead flow, sub coverage or production throughput, a faster estimate produces nothing. Spike 1 tests this.
9. **Insurance restoration turns out to be most of the interior work.** Different pricing regime, different incumbent (Xactimate), and the mining corpus shrinks. Spike 1 counts it.
10. **DB is considering leaving JobTread, or JobTread is building this.** Either takes the largest justification to zero.
11. **Zero tolerance for a bad quarter.** There will be a Tuesday where a plan set breaks something STACK would have handled. STACK has ~1,400 reviews' worth of edge cases already found and 4.7/5 support. If DB cannot absorb one bad week during transition with the spreadsheet as fallback, buy the decade of hardening.
12. **The motivation is the subscription cost.** Five-year TCO is $626K–$1.08M against $45K plus re-keying. The build must be justified by recovered hours, the margin case, the bridge and audit provenance — or not at all.
13. **Scope discipline collapses.** A build landing at 80% of STACK's takeoff quality plus perfect JobTread integration is probably the right trade. A build landing at 40% in two years is strictly worse than the subscription — and the difference is almost entirely staffing and scope discipline, not technology.

**Building is clearly right under six conditions:** a named developer who is not Carl; a named maintenance owner; a named estimator design partner with calendared hours; H × N above ~$20K/yr **or** a measured margin case above ~$30K/yr; a budget that can fund the P80; and a genuine willingness to stop at a gate.

**The bus-factor test, specified rather than intended.** "Could a contractor take this over in a week from the repo alone?" with no procedure, evaluator, pass mark or budget is an intention. Replaced with: **annually, pay an outside developer 8 hours to implement one defined small change from the repo, ADRs and runbooks alone, with zero access to the incumbent developer. Pass = a merged PR with green CI inside the 8 hours.** The result is written up and the gaps it exposes become documentation work items. ~$1.5K/yr, in the maintenance line.

**Infrastructure exit criteria**, so hosting is revisitable rather than religious: move to AWS ECS/RDS when any of — more than ~15 named users; a compliance or insurance requirement naming specific controls; sustained CPU spend where Graviton is materially cheaper; a genuine need for VPC-level isolation; or two provider incidents in one quarter that cost estimating time. Migration is cheap because everything is containers, Postgres and S3-compatible storage; avoid provider-specific primitives beyond service definitions.

### 13.1 Wind-down — how to stop

Good partial pieces — one-click Excel export, weekly Drive bundles, JobTread as the system of record — are not an exit plan. On the day this is abandoned, or the developer vanishes mid-Phase 4, what do estimators do Monday?

- **The Abandonment Drill.** Once in Phase 3 and **annually thereafter**: disable the app for one business day and produce one complete bid the old way, timed and recorded. Same procedure as the coverage fallback (§8.10) and the JobTread-break fallback (§7.10) — one rehearsed procedure, three uses. **A Gate 3 exit criterion.**
- **The export bundle.** Monthly, versioned, off-provider: a Postgres logical dump, **a human-readable schema document** so a third party can read the dump without the codebase, every plan set, and **every sealed revision rendered to PDF with its pins and provenance intact.** Generated and verified readable once as **MRC item 12**, then monthly.
- **The no-lock-in rule.** Through Gate 3, **no estimating capability may exist only inside DB Estimator.** Anything not reproducible in Excel is out of scope until the tool is authoritative and proven. This is what makes every gate a genuine stopping point rather than a one-way door.

---

## 14. Staffing and the client-time budget

### 14.1 Roles

| Role | Commitment | Notes |
|---|---|---|
| **Senior full-stack engineer** | Full time, 15+ months | **The binding constraint and the hire Carl does not have.** Must personally own the decimal money engine, the geometry kernel and coordinate model, and the JobTread sync state machine. Must be willing to build Phases 1–2a with little to demo — a developer who needs a visible demo every two weeks will not survive Phase 1, and Phase 1 is where correctness is won. Must be disciplined about ADRs, golden files and CI boundaries. **Must not be Carl.** Budget 8–10 weeks of search and a premium over $150/hr |
| **Phase 0 contractor** | 10 weeks, then retained | A 10-week senior engagement is far easier to buy than a 15-month hire, de-risks everything before the big commitment, and doubles as a working interview. **Then retained** for Phase 0b and as the named coverage secondary (§8.10). **Cannot start before the signed agreement in §14.2** |
| **Second engineer** | 0.5 FTE from Phase 4 | Useful only for the canvas. Phases 1–3 are gated by domain decisions, not typing speed. Expect ~30% compression on Phases 4 and 6, near zero on 1/2/3 |
| **Carl** | ~4 hrs/wk, 15 months | Domain authority, not stakeholder. The only person who can decide whether `Insulation - Batt` coded to Siding is an error or a reporting bucket — and the only one who can set contingency, price-adjustment and approval policy |
| **Named estimator** | ~4 hrs/wk, heavy in Phase 3 | Assembly authorship, parallel run, timed comparisons, AI ground truth. **In writing, on a recurring calendar block** |
| **Maintenance owner** | 0.2–0.35 FTE, forever | Named at Gate 0 |

### 14.2 Outside help worth buying (~$22K)

- **Signed contractor agreement — BEFORE the engagement is posted (~$1K, 2 lawyer hours).** The contractor will hold DB's complete cost book, markup schedule, customer list and financials, and will write the code. Without work-for-hire and IP assignment, DB may not own the deliverable; without confidentiality, the pricing corpus the build case calls DB's defensible asset walks out the door. Required: **IP assignment to DB; confidentiality over cost and customer data; data handling (Grant C read-only, no local copies, deletion on termination); a narrow 12-month non-compete limited to contractor estimating tools in DB's market; repo, ADR and runbook custody in DB's own GitHub organization from commit one.**
- **Senior graphics/CAD engineer, 25 hrs, before Phase 4b hardens (~$5K).** Reviews the coordinate model, affine viewport, tile pyramid, DPR handling, snap tolerance in user space, and the float64 decision. **The best-value spend in the budget** — the least AI-assistable code, and where a wrong early decision is most expensive to unwind. Storing geometry in screen space is the mistake that ends projects, and it is not obvious from the inside. **Non-optional.**
- **Construction estimating consultant who is not a DB employee, 30 hrs (~$6K).** Reviews assemblies, waste factors, productivity rates, markup structure, **and the contingency and general-conditions model.** Carl knows how DB estimates; an outsider catches where DB's habits are quietly wrong.
- **Lawyer, 8 hrs (~$3K)** — four named questions (§8.6): contract validity; **liability when a valid contract is wrong**, including E&O review and a scrivener's-error clause; **plan-data licensing and retention**; restoration retention obligations.
- **CPA, 8 hrs (~$3K)** — the taxability model (a blocking decision), **plus ASC 350-40 capitalization with its gate-stop impairment consequence, and §174 / R&D-credit treatment versus a deductible subscription.**
- **Security review, 12 hrs (~$3K)** — grant scoping, secret custody, cost-visibility authorization paths, **and the authentication, session and MCP surfaces (§8.9)** — before push #1.
- **JobTread API Developer Certification** (~$1K) for whoever owns the integration.
- **Annual external takeover test, 8 hrs (~$1.5K/yr)** — the bus-factor test (§13).

**Do not hire:** an ML engineer (**gated ML is cut; Phases 1–6 train no model and Phase 6 buys its OCR**); a DevOps/SRE (hosting is chosen so one person can run it, and a cluster nobody has time to operate is itself the likeliest cause of an outage); a designer beyond a few days on the worksheet; a QA function (the golden and parallel-run suites are the QA; a 40-page test plan gets skipped by week three); a project manager.

### 14.3 The honest client-time budget

| Phase | Carl | Estimator | What |
|---|---|---|---|
| −1 Hire | 20 | — | Screening, interviews, reference checks |
| 0 Decide & Prove | 24 | 34 | Spike 1 timing + revenue/margin pull, Spike 1b calls, Spike 2b Togal comparison, Spike 6 markup sessions, Spike 6b workbook collection, Gate 0 memo |
| 0b Deferred spikes | 4 | 6 | Spike 4 validation, Spike 8 triage review |
| C Catalog reconciliation | 16 | 40 | **C-scope rows only**, by trade, in 90-min batches |
| 1 Cost Intelligence | 20 | 30 | Distribution review, confidence promotion, exception register, margin-baseline sign-off |
| 2a Estimate Core | 24 | 50 | 16 assemblies, waste factors, approval / contingency / price-adjustment policy |
| 2b Bridge, COs, Allowances | 12 | 24 | Template selection, CO and allowance policy, 3 parallel estimates |
| 3 Parallel Run | 10 | **130** | **Bids done twice** + delta triage + training every estimator + drills |
| **Through Gate 3** | **130** | **314** | **≈ $43K** (estimator at $75; Carl at an assumed $150 — **he must supply the real number**) |
| 4a–4c Takeoff | — | 40 | Conditions setup, 6 timed head-to-heads |
| 5 Change Under Pressure | — | 20 | Addendum drill, sub board |
| 6 Extraction | — | **50** | **AI ground truth: 8–12 hrs per category to reach n≥30, hand takeoff performed purely to grade a model** |
| 8 Actuals Loop | — | 10 | Variance review |
| 9 Roofing | — | 20 | |
| **Total** | **130** | **454** | **≈ $34K of loaded estimator time, plus Carl's 130 hours** |

**These hours are in the §2.3 TCO**, because omitting them understates the build in the dimension that is scarcest.

**State the opportunity cost, not just the loaded cost.** 454 estimator hours is roughly a quarter's worth of bids not produced. At DB's win rate and average margin — numbers Spike 1 now measures — that foregone margin may exceed the $34K loaded figure by a multiple. It belongs in the Gate 0 memo.

**This must be scheduled, not assumed.** Phase 3 is the crunch: 130 hours is 13 hrs/week for one person at N ≥ 80, which is why **Phase 3's calendar is set by estimator availability and measured N, not by code** (§6.6).

---

## 15. Questions only Carl can answer

Ordered by how much the answer changes the plan.

1. **Who is going to write this code, and is it you?** If it is you, this plan is wrong regardless of how good it is. If it is a hire or contractor, what is the budget and start date? And separately: **who maintains this in year three?** A "nobody" answer should stop the project at Gate 0.
2. **How many general-construction estimates a year, and how many hours does one take** — split between measuring, pricing in the spreadsheet, and retyping into JobTread? At 1.5 hrs × 45 bids it is $5K/yr and you should buy. At 4 hrs × 150 bids it is $45K/yr and the build is defensible.
3. **What is your annual general-construction revenue, your bid win rate, and your average gross margin — and how much does margin vary job to job?** Probably the most important question here, and your own `job` reconciliation fields hold most of the answer. **At $8M and a half-point of margin improvement the build returns $40K/yr and the decision is genuinely close. At $4M and a quarter-point, it is not close: buy.**
4. **What did STACK and Togal actually quote you, in writing, for your real seat count?** A 2.5–3x spread on the most important cost number, and it is two phone calls.
5. **Will you genuinely trial STACK for 30 days on two real bids, and run Togal against your own plan sets, before we build anything?** I need you open to the outcome where buying plus a 200-line script is the right answer, not humoring the test.
6. **Materials run ×1.450 and labor runs ×1.818 in your catalog today.** The first is a 45% markup (31.03% margin); the second is a 45% margin (81.8% markup). Both get called 45%. **Is that deliberate — different bases for different cost types — or has one of them been an accident nobody noticed?** The single most consequential domain question in the project. **And if it was an accident, do you want the new system to reproduce it or correct it?** I will not let a historical-fidelity gate quietly become your pricing policy (§8.4).
7. **Your live data shows 80,462 taxable cost items and 60 documents at a 7.25% tax rate, including customer-facing Estimates.** Which project types and contract types are taxable, and has a CPA ever set that rule? **Be aware that asking may surface historical exposure.**
8. **Is the $55/hr labor cost burdened** — payroll taxes, workers' comp, benefits, non-productive time — **or is it a bare wage?** If bare, every job has been under-recovering by the burden (commonly 25–40%) and the margin reports have been reading healthy anyway.
9. **What is your target gross margin by project type, and the floor below which an estimate must not go out without your sign-off?** Pick the four-eyes threshold too. And tell me honestly whether you would live with a hard gate that blocks you at 5pm on bid day — because if not, it is not a gate.
10. **Do you carry a contingency on jobs today, and where does it live?** If it is inside a markup multiplier, nobody can report it, release it as a credit, or learn from it. §9.7 makes it a named amount — but you decide the default rate by project type and whether the customer sees it.
11. **When you shade a bid to hit a number — a round figure, a target margin, a competitive price — how do you do it today?** I have assumed you adjust the bottom line, and §9.8 gives that a sanctioned place to live. If instead people nudge line quantities, the audit trail this project exists to build gets destroyed in week one and I need to design around that behaviour, not against it.
12. **Which of the six templates named "Estimate" is correct for general construction** — `Const - Small`, `Const - Med`, `Const - Large` or `Ballpark`? I have read the Const-Large footer: it is your full contract, with the six-stage 10/25/20/20/15/10 schedule and `$XXX,XXX.XX` placeholders. **Is that text current and legally reviewed?**
13. **Has a lawyer reviewed whether a contract generated by this system is valid?** And the harder half: **what happens when it is valid and wrong?** Does your E&O cover machine-generated pricing? **What dollar exposure will DB absorb from a tool-caused pricing error before the tool gets demoted?**
14. **What do your architect agreements say about storing, deriving from and transmitting their drawings?** We will keep originals, generate tile pyramids and extracted geometry, and potentially send sheet images to a model provider. That is a licensing question, not a privacy one.
15. **Does creating a `customerOrder` via the API propagate into your QuickBooks Online, and is that acceptable?** Early evidence says probably not — zero of your 2,181 customer orders carry a QBO id while 1,106 invoices and bills do — but confirm in writing.
16. **You have four webhooks registered. Two fire on `documentCreated`, three on `documentUpdated`.** Who owns them, and can we get each handler read and given an explicit skip for our `DBE` namespace before we push anything?
17. **Of the ~709 priced catalog items, how many are general construction rather than roofing and exterior?** We split by trade first, reconcile only the C-scope, and park the rest visibly. How many will you personally review, and can we start with the top 30 cost codes by dollar volume?
18. **Which jobs should be excluded from historical mining as unrepresentative** — insurance restoration, warranty, service repair, anything in an unusual market or a bad year? Only you know which were anomalies.
19. **What share of your general-construction work is insurance restoration?** If large, the corpus shrinks, the ROI shrinks, and the real incumbent is Xactimate.
20. **Your GC estimates are allowance-heavy. JobTread offers three allowance types — cost, cost-and-fee, and price.** For a stated $4,500 appliance allowance: is that a cost budget you mark up to $6,525, the customer-facing price with margin inside, or cost plus a stated fee? **That one question decides whether you leak margin on every selection.**
21. **Do you do change orders off a signed contract often enough that CO estimating needs its own markup policy and numbering?** I have assumed yes and put it in Phase 2b.
22. **Which estimator owns this day to day, and do they want it?** Name them. A tool built over the heads of the people who must use it gets bypassed under deadline.
23. **What is your realistic budget ceiling — and can you fund the P80, not just the P50?** Phases 0–3 are $250–290K at P50 and ~$370K at P80. Under ~$150K the honest answer is buy.
24. **What is the longest outage you can tolerate during a bid week, and what are the two worst estimating weeks of your year?** The deploy policy, degraded mode, RTO targets and the developer's leave blackout are set from your calendar, not a template.
25. **Is there any realistic chance you leave JobTread in the next five years, or that JobTread ships its own estimating module?** Either takes the largest justification for this build to zero.
26. **How do people log in, and who takes access away when someone leaves?** This system holds your complete cost book and 3,550 customer records.
27. **Is there any intention, now or later, to sell or license DB Estimator to other contractors?** If yes, say so now — it changes nearly every architectural decision, and it is a different company, not a later feature.
28. **And the hard one:** if at Gate 3 the honest recommendation is "buy two or three takeoff seats and build only the ledger, the assemblies and the JobTread bridge" — removing 60–70% of the engineering risk and the part where AI assistance helps least — **is that an acceptable outcome, or would it feel like failure?** Your answer changes how Phases 0–2 should be scoped, and I would rather know now.

---

## 16. Monday morning

**Week of 2026-09-21 — six actions, in order. Action 1 is a prerequisite for action 3.**

1. **Get the contractor agreement drafted (Carl + lawyer, 2 hours).** IP assignment, confidentiality, data handling, narrow non-compete, repo custody in DB's own GitHub org. **Nobody touches DB's cost book without it.**
2. **Two phone calls (Carl, 1 hour).** STACK and Togal: written quote for your real seat count, tier structure, where AI is gated. **Start the 30-day STACK trial and the Togal trial the same day** — both clocks should be running before anything else.
3. **Post the contractor engagement (Carl, 2 hours).** A 10-week senior full-stack engagement for the Phase 0 spikes, framed explicitly as a working interview for the 15-month role. **Simultaneously** open the 15-month search — 8–10 weeks is realistic and it is the binding constraint on every date here.
4. **Name three people, in writing (Carl, 30 minutes).** The estimator design partner with 4 hrs/week on a recurring calendar block. The year-3 maintenance owner. The second approver for the four-eyes threshold. Gate 0 does not pass without all three.
5. **Measure the business this week (estimator + Carl, 8 hours).** Time three real bids, split takeoff / pricing / re-keying. Count general-construction estimates in the last 12 months and the insurance-restoration share of interior work. **The revenue side is already measured (§2.5): ~$9.1M annualized approved, 70.5% win rate by count but only 53.8% by value, 36.5% estimated margin.** What is left is splitting that by `Job Type`/`Project Type` to isolate general construction, and picking 15-20 completed GC jobs to reconcile retrospectively — **realized margin is the one number that would prove the build case, and it is the one DB does not currently measure.** So H, N and the GC split still need the stopwatch; the revenue side no longer does.
6. **Pull the raw material (estimator day 1, contractor days 1–3).** The estimator collects **every version of the estimating spreadsheet in use** — the cheapest source of domain truth in the project and the input to all 16 assemblies. The contractor exports 40–60 real historical `customerOrder` documents (including `22PejfgufCkY`) as scrubbed JSON, gathers the five ugliest plan sets plus one scanned remodel set, and snapshots the catalog. Commit to `fixtures/`. Everything downstream is measured against this corpus, and gathering it needs no architecture decisions.

**Then, weeks 2–10:** the core spikes in §6.3, each ending in a written verdict appended to ADR 0001. **Gate 0 decision: Monday 2026-11-30.** It is genuinely allowed to say no — and if the numbers say buy, that is a successful outcome of this engagement, not a failed one.

---

## Appendix A — Repository layout

```
db-estimator/
├── docs/
│   ├── adr/
│   │   ├── 0001-jobtread-verified-facts.md   ← living; every spike appends here
│   │   ├── 0002-money-and-rounding.md        ├── 0003-markup-basis.md
│   │   ├── 0004-measurement-vs-quantity.md   ├── 0005-scale-interlock.md
│   │   ├── 0006-idempotency-and-identity.md  ├── 0007-direction-of-truth.md
│   │   ├── 0008-geometry-storage.md
│   │   ├── 0009-tax-policy.md                ← blocked on CPA sign-off
│   │   ├── 0010-contingency-and-adjustment.md
│   │   ├── 0011-ai-ladder-and-gates.md       ← incl. why rung 15 is permanent
│   │   ├── 0012-hosting-and-exit-criteria.md
│   │   ├── 0013-estimating-workbook-spec.md  ← Spike 6b output; input to assemblies
│   │   └── 0014-plan-data-licensing.md
│   ├── runbooks/
│   │   ├── grant-rotation.md           ├── restore-drill.md
│   │   ├── jobtread-breaking-change.md ├── degraded-manual-push.md
│   │   ├── abandonment-drill.md        └── offboarding.md
│   └── user-guide/                     ← Phase 3; cold-start tested at Gate 3
├── fixtures/
│   ├── documents/        40–60 scrubbed historical customerOrders
│   ├── plans/            5 ugliest real sets + 1 scanned remodel
│   ├── catalog/          709-row snapshot, effective-dated
│   └── geometry/         golden traces: rotated, cropped, UserUnit, scanned
├── packages/
│   ├── money/            decimal, markup basis, rounding, contingency,
│   │                     escalation, jobtread boundary   ← 100% cov, CODEOWNERS
│   ├── units/            dimensions, units, PackageSpec, SLOPE_FACTOR
│   ├── assemblies/       hard-coded TS defs + golden tests ← 100% cov
│   ├── estimate/         model, invariants, revision, approval, change-order,
│   │                     allowance, adjustment, duration    ← 100% cov
│   ├── geometry/         LIBRARY-FREE kernel: affine, polygonize, snap,
│   │                     hit-test   ← CODEOWNERS; Konva stays out of here
│   ├── pdf/              operator-list harvest, OCG layers, text-encoding
│   │                     detection, tile pyramid  ← pdf.js version PINNED
│   ├── mining/           corpus partition, aggregates, distributions,
│   │                     productivity, duration, assembly-discovery
│   ├── catalog/          cluster, unit-normalize, mapping-table
│   ├── jobtread/         taxonomy (by id), payload, push, reconcile,
│   │                     template-hydrate, payment-schedule, plan-push
│   │                     ← ALL JobTread coupling lives here, behind an interface
│   ├── vendor-measure/   HOVER / CANVAS adapters (seam 8)
│   └── auth/             SSO, session, roles, audit
├── apps/
│   ├── web/              estimator UI
│   ├── worker/           pg-boss: push, reconcile, mine, canary
│   └── admin/            catalog admin — the ONLY holder of Grant B
├── tools/
│   ├── layer0-assertions/  nightly VERIFIED-premise suite (Grant C)
│   ├── mock-pave/          fault-injecting JobTread mock
│   └── export-bundle/      §13.1 wind-down bundle generator
└── .github/
    ├── CODEOWNERS          money/ geometry/ jobtread/ require review
    └── workflows/ci.yml    typecheck · lint (no-float, no-===-on-Money) ·
                            unit · property · golden · pdfjs-operator-golden ·
                            cassette · e2e · projection-rebuild ·
                            package-boundary · deploy-window-guard
```

---

## 17. Revision 5 — what the Managed Agents decision changes

**Decided 2026-09-28.** Architecture: **Claude Managed Agents** (harness *and* deployment
hosted by Anthropic) driving a thin approval UI, with a deterministic rule engine in
ordinary code. JobTread stays the system of record, keeps its own assembly engine (§1.2),
and renders the customer document. Scope: **homeowner remodels and additions**. Writes to
JobTread are **built but disabled** in v1.

Two findings, both verified after this document's phase plan was written, are what collapse it:

1. **JobTread already runs a working parametric assembly engine** — ~95 roofing assemblies,
   4,684 computed lines across 185 live jobs, flowing through to customer estimates
   automatically (§1.2). The plan's largest build item was a second one.
2. **Managed Agents supplies the agent loop, state, sandbox and deployment.** There is no
   harness to write, no scheduler, no session store, and credentials never enter the model's
   reach.

### 17.1 Phase disposition

| # | Phase | Was | Now | Why |
|---|---|---|---|---|
| −1 | Hire | Senior full-stack, 15+ months | **Contractor, ~6–8 weeks** | No CAD viewport, no geometry kernel, no sync state machine. The project's #1 named risk is retired by not needing that hire. |
| 0 | Decide & Prove | 10 wks, 6.2 dev-wks, ~$50K | **~2–3 wks, mostly Carl's time** | Most spikes existed to decide the canvas. Spike 6 (markup) is **done** — cost-type margins are now set and machine-readable. Spike 1 (revenue, win rate, margin) is **partly done** (§2.5). |
| 0b | Deferred spikes | 4.6 dev-wks | **~1 dev-wk** | PDF engine bake-off and room polygonization deleted. Webhook/QBO audit and reading the 101 catalog formulas survive. |
| C | Catalog reconciliation | 6 wks, 16 + 40 hrs, parallel | **Unchanged — and now critical path** | Proven by the Jones job: the Countertop Sub underpriced by $1,039.89 because a catalog item still carried the old ×1.30. The rule engine finds these; only a person fixes them. |
| 1 | Cost Intelligence | 13 cal wks, 11 dev-wks | **~3–5 dev-wks** | No taxonomy mirror to build — the agent queries JobTread live. Comparables are a query, not a pipeline. The replay harness survives as the rule engine's test suite. |
| 2a | Estimate Core | 11 cal wks, 10 dev-wks | **~3–4 dev-wks** | Assembly engine, worksheet and revisions are JobTread's. The decimal money engine shrinks to decimal *comparison* with an epsilon, because we check arithmetic rather than perform it. Dimensional typing becomes a check, not a type system. |
| 2b | Bridge, COs & Allowances | 11 cal wks, 10 dev-wks | **~4–6 dev-wks, off in v1** | The write path survives intact and is still the most dangerous code in the system (replace semantics, pricing-request line IDs, idempotency, template hydration). Change orders and allowances are JobTread-native — configure, don't build. |
| 3 | Parallel Run & Cutover | 9 dev-wks, **130 estimator hrs** | **~2–3 dev-wks, far less estimator time** | We are adding an assistant, not replacing the system of record — estimates live in JobTread under both arms. The auditor can be replayed against historical estimates at zero estimator cost. |
| 4a/4b/4c | **Takeoff canvas** | **24 dev-wks, ~$137K** | **Deleted** | The largest single deletion. Re-decided separately as a buy: two or three STACK or Bluebeam seats. |
| 5 | Change Under Pressure | 8 dev-wks | **~1–2 dev-wks** | With no canvas there are no stale takeoffs to invalidate. What survives is the agent re-reading a changed scope. |
| 6 | Deterministic Extraction | 18 cal wks, 16 dev-wks | **Mostly deleted** | OCR adapters, table extraction, symbol counting and XObject walking were canvas-era infrastructure. Reading drawings and schedules is what the model does natively. |
| 8 | Actuals Loop | 6 dev-wks | **Unchanged — now the most valuable phase left** | Only 18 jobs carry a realized margin and all are small service work (§2.5). This is still the compounding asset and still nobody else's to sell. |
| 9 | Roofing | 8 dev-wks | **Largely already built** | §1.2. What remains is pointing the agent at assemblies that already run. |

### 17.2 The new shape

| | Original plan | Revision 5 |
|---|---|---|
| Time to first real use | ~month 11 | **~6–8 weeks** |
| Engineering to a usable tool | 13–15 months | **6–8 dev-weeks** |
| Cost to that point | $250–290K (P80 ~$370K) | **~$40–60K** |
| Staffing | Senior full-stack FTE, 15+ months | Contractor ~2 months, then part-time |
| Run cost | $6–8.4K/yr + $43–75K/yr maintenance | **~$1–3K/yr model + minimal hosting** |
| Takeoff canvas | 24 dev-wks, ~$137K | Rented, or not bought at all |

Roughly **an 80% reduction in cost and time**, and the deletions are concentrated exactly
where the risk was.

### 17.3 What this buys, and what it does not

**Buys:** a tool in weeks rather than a year; no bespoke agent loop, state store or
scheduler to maintain; JobTread grant credentials that never enter the model's context;
a hard dollar cap per estimate; and relief for the reviewer bottleneck (§2.5) without
touching the system of record.

**Does not buy:** a takeoff tool. The interior measurement gap is untouched — roofing works
because HOVER supplies the numbers, and there is no interior equivalent. A rep still walks
the job and types the driver quantities. That gap is real, it is the reason CANVAS was
tried and did not stick, and this plan does not close it.

### 17.4 Risks specific to the new plan

| Risk | Note |
|---|---|
| **Managed Agents is beta** | Bounded in v1 because writes are off — the worst failure is a wasted draft, not a bad contract. Re-assess before enabling writes. |
| **Deeper coupling to JobTread** | The assembly engine, the worksheet and the customer document are all theirs now. A JobTread change lands harder than it would have. **Keep the $10–15K/yr reactive integration reserve** from §2.2. |
| **The rule engine becomes load-bearing** | It is what makes an agent-drafted estimate safe. It needs golden tests against real historical documents — that is what survives of the Phase 1 replay harness, and it is not optional. |
| **Catalog hygiene moves onto the critical path** | Every stale catalog item silently underprices work. It was a parallel nicety in the old plan; it is a dependency now. |
| **Correlated AI error on measurement** | An AI reviewing an AI's reading of a drawing is not an independent check. Quantities are guarded by comparables, HOVER cross-checks and a human — not by a second model. |

### 17.5 What Revision 1–4 got right, and kept

The phase plan is superseded; the findings are not. Still authoritative and still load-bearing:

- **§1.1** — the verified JobTread facts, including the `_type` discriminator, the tax
  premise, and that `createdByGrantId` does not separate humans from machines.
- **§1.2** — the existing assembly engine.
- **§2** — the build-vs-buy analysis. Its conclusion now holds *more* strongly: buying was
  2.3–5.2× cheaper than the build, and the build just got 80% smaller by buying more.
- **§7** — the JobTread integration subsystem. The write path, idempotency via `externalId`
  and `globalId`, the three-tier reconciliation forced by the missing `costItem` webhook,
  and the conflict policy are unchanged and are exactly what Phase 2b implements.
- **§8.2** — money and markup. The markup/margin ambiguity it identified was real; it was
  resolved on 2026-09-28 by setting Subcontractor to 30% margin, and the rule engine now
  reads that policy live from the API rather than hardcoding it.
- **§8.5** — the trust ladder. Unchanged in principle: earn autonomy in stages, with
  evidence at each one.

---

## 18. Rollout, training, and how we know it worked

### 18.1 The baseline, measured — VERIFIED 2026-09-28

100 jobs created 6–31 July 2026. Every one has had two-plus months, so this is settled data,
not work in flight. Bucketed by trade from the job name.

| Bucket | Jobs | No estimate | Median days to first estimate | Mean | p90 | Over 30 days |
|---|---|---|---|---|---|---|
| **Roofing / exterior** | 57 | 19 (33%) | **6** | 9.6 | 29 | 2 |
| **General construction** | 35 | 12 (34%) | **13** | 24.6 | 50 | **9** |

**General construction takes 2.4× longer to a first estimate than roofing** — the trade that
already has the parametric assembly pipeline (§1.2). Same company, same reps, same
JobTread. The difference is that one side has assemblies and the other does not.

The tail is where the damage is. Nine of 35 GC jobs took over a month:

| Days | Job |
|---|---|
| 75 | 261305 Jones_Bath/Kitchen |
| 74 | 261273 Dewitt_Interior |
| 50 | 261257 Reynolds_Remodel |
| 49 | 261332 Shanks_Windows |
| 44 | 261335 Abram_Bathroom |
| 43 | 261275 Craig_Door |
| 35 | 261280 Ricker_Bathroom |

**The "no estimate" rate is the same in both buckets (33% vs 34%)** — those are dead leads,
not a GC-specific failure. The GC-specific failure is elapsed time on the jobs that do get
priced.

**Rework, as currently measurable, is not the differentiator.** Estimate documents per job,
among jobs with at least one: roofing mean 1.45 (34% need more than one), GC mean 1.48
(30%). Nearly identical. See §18.3 — the metric needs redefining.

### 18.2 The metric that cannot be measured today

Carl named **estimated vs. actual margin** as a success measure. It is the right measure and
it is currently unavailable: only **18 jobs** carry a `Final Margin %`, `Reconciled Est
Margin` has **2** values, and all 18 are small service work averaging $7,777 (§2.5). There
is no general-construction realized-margin baseline to compare against.

This is not a reporting gap to work around. **Either reconciliation starts happening on GC
jobs, or this metric is unavailable for a year**, and the build's central economic claim
stays unproven. Reconciling 15–20 completed GC jobs retrospectively is the cheapest way to
create the baseline, and it needs Carl and a project manager, not a developer.

### 18.3 What to measure instead, and why

| Metric | Baseline | Target | Source |
|---|---|---|---|
| **Kristen's review minutes per estimate** | **unmeasured — get it in week 0** | −60% | Stopwatch, then the tool's own timestamps |
| GC lead → first estimate, median | **13 days** | under 5 | JobTread `createdAt` deltas, same query as §18.1 |
| GC estimates over 30 days | **9 of 35 (26%)** | under 5% | Same |
| Defects caught before release | Jones: **$2,979** on one estimate | Track $ and count | Rule engine log |
| Defects reaching a customer | unmeasured | zero | Change orders coded as corrections |
| Estimated vs. actual margin | **unavailable** (§18.2) | ±5 pts | Requires GC reconciliation first |

**Rework needs a sharper definition than "more than one estimate document."** A second
estimate is usually a legitimate option or an added scope, not an error — which is why the
figure is identical across trades. Measure instead: **estimates revised after being sent to
a customer**, and **defects the auditor catches that a human had already approved**. Those
are errors. Multiple options are not.

**Watch for the bottleneck moving rather than lifting.** If drafting gets faster and
Kristen's review time holds, the queue has shifted from the rep to her and nothing has been
gained. Her minutes are the primary metric; everything else is secondary.

### 18.4 Rollout

Each stage has an entry condition, a measurement, and an exit gate. No stage starts before
the previous one exits.

| Stage | Weeks | What runs | Exit gate |
|---|---|---|---|
| **0 · Baseline** | 0 | Nothing. Kristen times 5 reviews with a stopwatch; §18.1 query re-run and recorded | The review-minutes number exists in writing |
| **1 · Auditor, shadow** | 1–2 | v0.5 runs against estimates already in JobTread. No process change — Kristen may ignore it | ≥20 estimates audited; **≥80% of findings Kristen judges real**; every false positive logged |
| **2 · Auditor, in the loop** | 3–4 | Kristen reviews *through* the auditor screen instead of the raw estimate | **Median review time down ≥40%**; no estimate released carrying a defect she dismissed in error |
| **3 · Drafter, one rep** | 5–8 | v1. Robert drafts 5 GC estimates. Kristen reviews as usual. **Writes off** — a human enters into JobTread | 5 estimates delivered; lead time and Kristen's edit count recorded per estimate |
| **4 · Drafter, all reps** | 9–12 | Remaining reps added one at a time, a week apart | 20 estimates; **GC median lead time under 5 days**; no defect reaching a customer |
| **5 · Writes on** | later | One rep, one job type, behind the diff screen | A separate decision, not automatic. Requires Stage 4 clean and a Managed Agents beta re-assessment |

**Stage 1 is deliberately useless-looking.** The auditor changes nothing about how anyone
works; it only proves the rule engine is right before anyone depends on it. Skipping it
means discovering the false-positive rate after Kristen has started trusting it.

**Stage 1 exited 2026-09-29.** Twenty approved construction estimates, twenty findings,
graded by Kristen: 13 real, 7 not real (65%). All seven were one line on seven jobs —
*Sales On-Site Support*, a $0 time-tracking catalog item that the empty-line rule filed as
unfinished work because it looked at the blank quantity before it looked at the money.
Fixed the same day (`09302d9`, with the false positive recorded in `test/audit.test.ts`),
re-run against the same twenty: 13 of 13 (100%). Stage 2 runs on drafts, before an estimate
goes out (`--status draft`). Its gate needs the Stage 0 review-minutes number, which has not
been written down yet.

### 18.5 Training

The reps are not technical and the training is not about the software. It is about who owns
what, because the one failure that matters is a rep assuming the tool owns something it does
not.

| Who | Time | Content |
|---|---|---|
| **Kristen** | 90 min | The four exception types and what each means. How to dismiss with a reason. That "Approve" is a release decision, not an acknowledgement. Where the audit trail lives |
| **Reps, each** | 60 min + 1 supervised estimate | **You own the measurements and the scope. The tool owns the arithmetic. Kristen owns the release.** How to enter driver quantities. When to stop and ask rather than guess |
| **Carl** | 30 min | Policy changes propagate from JobTread's cost types — change a margin there, not in the tool. Reading the defect log |

**One rule stated explicitly in rep training:** if you do not know a dimension, leave it
blank and say so. A guessed measurement is the one error neither the rule engine nor a
second model will catch (§ the correlated-error problem), and it flows straight into a
contract.

### 18.6 When to stop

Stop and reconsider if any of these holds:

- Stage 1 shows a false-positive rate above 20% and it does not fall with tuning. The rule
  engine is the foundation; if it cries wolf, Kristen will stop reading it and the project
  has no value.
- Stage 2 does not cut her review time by 40%. That was the entire business case.
- Any defect reaches a customer that the tool should have caught. Halt, root-cause, and do
  not resume until the rule exists and is tested.
- Stage 3 estimates need more of Kristen's editing than hand-built ones did. The tool is
  generating work rather than removing it.
- Twelve weeks in, GC median lead time has not moved from 13 days.

**"Nobody used it" is the most likely failure**, not a wrong number. Watch adoption weekly
from week 5: estimates drafted through the tool as a share of GC estimates created. If that
share is falling, find out why before adding features.

---

## 19. Guardrails

### 19.1 The principle

**Prefer an absent capability to a checked capability.** A check is code that can be wrong,
bypassed, or talked around. A capability the credential does not carry cannot be exercised
by any prompt, any bug, or any injected instruction. Every guardrail below is pushed as far
down this list as it will go:

1. The grant cannot perform the action at all *(strongest)*
2. Our orchestrator refuses before the call is made
3. The platform pauses for a human
4. The agent is instructed not to *(weakest — never the only control)*

### 19.2 Grant scoping is real, and the current grant is far too broad — VERIFIED 2026-09-28

`grant.allowedActions` is a **nullable array of `action`**, so a JobTread grant can be
scoped to an explicit list. The grant used for all exploration in this document carries
**130+ actions**. Among them:

| Action on the current grant | Why it must not be on the agent's grant |
|---|---|
| **`updateCostType`, `updateCostCode`, `updateCatalog`** | **The self-referential hazard.** The agent could alter the markup policy the rule engine checks estimates against. A tool that can rewrite its own invariants has none. |
| `updateRole`, `updateUser`, `updateMembership`, `updateOrganization` | Org administration. No estimating task needs it. |
| `updateWebhook` | Could silently redirect or disable the event feed the reconciliation depends on. |
| `createJobs`, `updateJobs` (plural) | Bulk operations. Blast radius of a mistake is the whole org rather than one job. |

Useful separations the vocabulary already provides:

- **`readCatalogCosts` and `readCatalogPrices` are distinct actions.** A price-only role is
  enforceable server-side, not by stripping fields in our UI. This answers the cost-visibility
  question §3.1 raised and could not previously resolve.
- **`draftDocument` is distinct from `updateDocument`**, and `readDocumentInternals`,
  `readJobInternals` and `readJobFinancialSummary` are separately gateable.
- `deleteDocument` is **not** on the current grant. Keep it that way.

**Proposed agent grant — v1 (writes off).** Reads only:
`seeOrganization`, `seeJob`, `readJob`, `readJobBudget`, `readJobInternals`, `readDocument`,
`readDocumentInternals`, `readCustomerOrders`, `readCostItem`, `readCostGroup`,
`readCatalog`, `readCatalogCosts`, `readCatalogPrices`, `readCustomField`,
`readCustomFieldValue`, `readComment`, `readFile`, `readFiles`, `readEvent`, `readPlan`,
`readJobPlans`, `readBidRequests`, `readJobBudgetBackup`.

**Stage 5 adds exactly three:** `draftDocument`, `createCustomerOrder`, `updateDocument`.
Nothing else, and never the four rows in the table above.

> **Correction:** this document previously stated the exploration grant expires 2026-12-18.
> It now reads **2026-12-27**, so the expiry **rolls rather than sitting at a fixed cliff**.
> The recommendation is unchanged — the agent needs its own scoped grant, and grant identity
> is also the echo-suppression key (§7a) — but the deadline framing was wrong.

**Unresolved:** no explicit *send* action appeared in the `action` vocabulary, and
`root.sendDocument` takes `documentRecipientId` and `emailMessage`. Whether sending is
governed by `draftDocument`, `updateDocument`, or an action not surfaced by search **must be
determined by test on a disposable document before anyone relies on "the grant cannot send"**
as an invariant. Until then, treat "cannot send" as a layer-2 control (the orchestrator has
no send code path), not layer 1.

### 19.3 The six named guardrails

**Roles.** Rep drafts; Kristen or Carl approves; nobody else releases. Enforced in three
places: the UI hides Approve from a rep, the orchestrator refuses an approve action from a
non-approver identity, and the agent grant cannot send. Carl's exemption model — "every
estimate from a rep who hasn't earned an exemption yet" — is a per-rep flag, defaulting to
*no exemption*, that only Carl can set. Cost visibility rides on `readCatalogCosts` /
`readCatalogPrices` rather than UI masking.

**Audit trail.** Four sources, joined by our own estimate-revision id:

| Source | Carries |
|---|---|
| Managed Agents session events + Console trace | Every tool call, message and model decision |
| `document.events` (per-document) | Who touched the document, when, under which grant |
| JobTread budget backups | A restore point taken automatically on every change |
| Our approval log | Who approved, when, which exceptions they dismissed **and the reason** |

The fourth is the one nothing else provides and the only one that answers "why did this
number go out".

**Nothing reaches a customer without approval.** Layered: no send code path in the
orchestrator; the agent grant scoped away from sending once §19.2's open question is
answered; `documentRecipients` never created by the tool; and release is a distinct action
from approval, available only to Carl and Kristen. **The tool never emails anyone** — it
produces a draft and a proposed message that a human sends from JobTread.

**Concurrent-edit detection.** The hard one, because three obvious mechanisms do not work:
there is **no `costItem` webhook**, `document` has **no `updatedAt`**, and
**`createdByGrantId` does not separate humans from machines** (§7a). What does work:

1. Record a **content fingerprint** of the document tree when the draft is built.
2. Before writing, re-read and compare. Any difference halts and shows the diff.
3. Read the `document.events` tail and **positively match our own grant id**; anything else
   is someone else's edit.
4. Show *who* and *when* — "Kristen edited this 4 minutes ago" — not a generic conflict error.

This is exactly the situation Carl hit on Lincolnview when a coworker was editing the same
budget. The tool must stop and fold the change in, never overwrite.

**Re-read and check after every write.** Three verified gotchas set the sequence:

- `updateJob` / `updateDocument` with `lineItems` **replace the entire tree** — any line
  whose id is omitted is deleted. **Vendor pricing requests are tied to budget line ids**, so
  those ids must be carried through explicitly.
- `updateCostItem` on a single line **does not refresh the document's stored total**; only
  re-sending the full tree does.
- `isTaxable` **defaults to `true`** on create, against an org convention of false.

So: snapshot → preflight (rule engine refuses a non-conforming tree) → write → **re-read the
whole document** → compare every line's quantity, unit cost, unit price, `isTaxable` and
`globalId` against what was sent, and the document total against the sum of line extensions
→ any mismatch pages a human and **does not retry**. Float comparison uses an epsilon,
because JobTread returns IEEE floats (§8).

**Markup and tax enforced automatically.** Markup is solved: the rule engine reads
`costType.margin` live from JobTread, so Carl's change to 30% on 2026-09-28 propagated with
no code change, and the Jones estimate's $1,039.89 gap was found by comparing against it.
**Tax is not solved.** 80,462 cost items are taxable, 60 documents carry a rate, `isTaxable`
defaults true, and `taxRate` is a fraction in [0,1] where writing `7.25` for `0.0725` is a
100× error. Until a CPA sets the rule, **the tool must refuse to set any taxability itself**
and surface the decision to a human on every estimate.

### 19.4 Guardrails not named, that matter

**Prompt injection through job content.** The agent reads vendor quotes, owner scope
documents, customer emails and comments — all untrusted text, some of it from outside DB. It
cannot exfiltrate the grant credential (vaults, §3), but it can be *steered*. The controls:
the rule engine is code and cannot be prompted; the write path is a deterministic gate the
agent does not control; the agent has no send capability; and the approver sees the estimate,
not the agent's reasoning about it. **Treat every document the agent reads as hostile input
and never let a document's content decide whether something is written.**

**Writing to the wrong job.** A single wrong `jobId` puts an estimate on someone else's job.
Bind the session to one job at creation, refuse any write whose `jobId` differs, and show the
job name and number on the diff screen.

**Containment during rollout.** Until Stage 5, the write path targets a **designated
disposable test job only**, enforced by an id allowlist in the orchestrator — not by the
agent being told which job to use.

**Runaway cost.** A session budget per estimate (`"500"` = $5.00). The session pauses rather
than terminating, so nothing is lost when it trips.

**Data handling.** Customer names, addresses, job costs and full pricing enter the model's
context. That is a business decision to make explicitly rather than discover. The vault
boundary protects the *credential*, not the *data*.

### 19.5 What cannot be guarded

**A wrong measurement.** If a rep types 24 feet where the wall is 26, every control here
passes: the markup conforms, the tax is right, the math reconciles, the totals match, the
comparables look plausible because the whole estimate scales together. It flows into a signed
contract.

There is no technical fix. A second model reading the same drawing is not an independent
check (§ correlated error). The only controls are partial: cross-checks against an
independent source where one exists — HOVER squares, a dimension printed on the plan, $/SF
against this job type's history — and a human who knows the job.

**This is why rep training says: if you do not know a dimension, leave it blank and say so
(§18.5).** It is the one failure mode where the guardrails are people, not code.

---

*Conventions: every factual claim is tagged VERIFIED (confirmed by direct query against organization `22PBAjem8SSC`), REPORTED (asserted in research, spike attached), or UNVERIFIED (explicitly unknown, no design depends on an assumed answer). The verified facts in §1.1 each overturn an assumption that would otherwise have produced a defect — most consequentially the tax premise, the `_type` discriminator, and the assumption that `createdByGrantId` distinguishes machine writes from human ones. Effort is re-baselined with Phase 0 given a possible calendar, Phase 2 split in two, Phases 1, 3, 4 and 6 lengthened, and gated ML cut. Exit criteria are counts, caps and protocols rather than judgements. Five domain entities — contingency, price adjustment, duration, escalation and contract type — are added at Phase 2a, because their absence would corrupt the audit trail this project exists to create.*

---

## 20. Revision 6 — the drafter, and what Carl said on 2026-09-30

**Decided 2026-09-30.** The branches to that date had built a good tool for the wrong end
of the pipeline: the auditor, the catalog audit and the scope review all check an estimate
a rep has already finished. The problem Carl named is upstream of all of it — two reps
doing two inspections a day and no time to build the estimate, Kristen reviewing every one
and then making the work orders, purchase orders and the production folder, and general
construction taking a median of 13 days to a first estimate (§18.1). Stage 3 of §18.4,
"Drafter, one rep", is the first stage that touches the rep, and nothing existed for it.

Three facts from Carl, which fix the design:

1. **The discovery report is on the job.** Job 261323 carries it as a comment (a full
   meeting summary with the room measured) plus 18 CompanyCam photos. There is no separate
   document to parse; the scope review's packet already reads exactly this.
2. **Estimates are built in JobTread from budget templates, and those templates must
   still be used.** A rep adds a template group to the Budget tab, deletes the lines the job
   does not need, and brings in another template only for lines the first lacks. When no
   template has the line, Carl decides. VERIFIED against the API: a budget template is a
   top-level catalog cost group (44 of them); its lines carry no price and each points at
   the ungrouped priced catalog item JobTread prices it from when the group is added.
3. **Work orders and purchase orders are made in JobTread from its document templates**
   (`Work Order` and `Purchase Order`, both `vendorOrder`).

So the drafter (`src/draft/`, `docs/drafter.md`) reproduces the rep's process rather than
generating lines: the model picks the template(s) and says which lines to keep with what
quantity and on what evidence; the code prices each kept line from its catalog item with
the auditor's arithmetic; scope with no template line is flagged for Carl; a line id the
model names that is in no chosen template is rejected and listed. Its page is the steps the
rep takes in JobTread, because the write path (§7) is still off. Its gate is in
`docs/drafter.md`: ten of Robert's jobs, three counts per draft, until eight of ten need
under ten minutes of his work.

**JobTread's own AI panel was tried the same day and ruled out** for this step: given the
job and the template rule it summarised the discovery note correctly, then looped re-reading
the API help, could not filter the catalog, and produced nothing. It is not reachable from
the API either, so it cannot be tested, priced by code or gated. Recorded in
`docs/drafter.md`.

What this changes in the rollout (§18.4): Stage 3 starts now, in shadow, on the drafter's
own gate, and does not wait for Stage 2's review-minutes number. Stage 2 still runs; it is
Kristen's half of the problem and the drafter is the reps'. Kristen's paperwork after the
contract — work orders and purchase orders from the same lines regrouped by who does the
work, and the folder — is the phase after the drafter has been used live, and it is the
one that gives her design time back.

### 20.4 Addendum, 2026-09-30 evening — regional ballpark, contingency, and the first write

Carl's two asks after the third live run:

1. *For items with no template line and no history, create the line items
   with estimated costs based on our area, and make note to the sales rep.*
   Done in the history call: a gap that history cannot price gets a regional
   ballpark per unit for northwest Ohio, priced at the gap's cost-type margin,
   labelled "regional ballpark, not DB pricing — confirm with Carl or a sub
   bid", kept out of the totals and out of the learned price book. Template
   lines never get one.
2. *Add contingency with a formula rate based on whatever is normal, and add
   the contingency line to every construction budget template below Phase 4
   as a new group.* Done in JobTread: catalog item `Project Contingency`
   ($1.00 / $1.00, Lump Sum, Other, General Requirements) and a
   `Phase 5 - Contingency` group after Phase 4 in the seven phased
   construction templates, each with one line on that item and the quantity
   formula `{Contingency Base} * {Contingency Rate} / 100`. The rate policy
   is §9 decision 2 of the preconstruction redesign (5 / 8 / 10, at cost,
   unused credited at closeout). The drafter prints the rate it chose, the
   base and the two parameters on every construction draft. Record and
   undo instructions: `docs/contingency.md`.

This was the project's first write to JobTread. It went through a new
`src/jobtread/writer.ts` — a second grant key, an allowlist of three
mutations, no retries — with the read-only client and its guard untouched.
The disposable-test-job rule (§7.3) was kept in spirit: a throwaway catalog
group was created, read, repositioned and deleted before any template was
touched. `npm run contingency` is the repeatable, verifying form of the same
change.
