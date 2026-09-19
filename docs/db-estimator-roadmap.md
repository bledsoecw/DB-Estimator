# DB Estimator — Build Roadmap

**Deitemeyer Brothers · General Construction First · 2026-09-18**

> The long-form edition, with the full JobTread subsystem spec and per-section engineering detail, is `docs/db-estimator-roadmap-full.md`. This is the founding document: every decision, gate, table and schema needed to start building — or to decide not to.

---

## 0. Headline recommendation

**Approve Phase 0 only — 10 weeks, ~$50K — and make the real decision at Gate 0 on 2026-11-30.**

Phase 0 is a decision phase: eight ranked spikes, a 30-day STACK trial as the control arm, and a Togal trial on DB's own plan sets. It ends with a costed three-way memo — full build, hybrid, or buy — that Carl signs. It commits ~$50K and forecloses nothing.

Behind Gate 0 sits a costed option: **Phases 1–3 at 13–15 calendar months and $250–290K of engineering** (P50 at contract rates; **budget the P80 at ~$370K**). That delivers cost intelligence mined from DB's own history, an estimating engine reproducing DB's markup schedule to the cent, change orders and allowances, and an atomic idempotent push into JobTread. The takeoff canvas is decided separately at Gate 3.

**What you are approving contains none of the features you named.** Of STACK's takeoff, its $899 FloorPlan AI, Togal's auto-detection of spaces off PDFs, and natural-language plan querying — **none is in the scope behind Gate 0.** Takeoff off PDFs begins at month ~14 and is re-decided at Gate 3. Togal-style automatic room detection is **deliberately never built**; the honest substitute is reading the area the architect already printed in the room tag, which is exact and free (§10). Natural-language plan query arrives with Phase 6, ~2.5 years out. **Roofing, on this sequence, is a 2029 deliverable** — with one exception worth taking early (§11).

What $250–290K and 13–15 months buys instead: pricing intelligence from 3,987 real jobs, an engine matching DB's markup schedule exactly, first-class change orders and allowances, and an estimate that lands in JobTread as a nested phase tree without anyone retyping it.

Three reasons this ordering is right and the vendor ordering is wrong:

1. **The canvas is 60–70% of the engineering risk and the least AI-assistable code in the project.** If it goes first, nothing is usable for months, estimators watch demos instead of doing bids, and the project enters the zone where it is quietly abandoned.
2. **The pain that costs money every week is not measuring.** It is the triple-entered quantity: measured somewhere, priced in Excel, retyped into JobTread. That leg has zero canvas risk, it is the half reviewers say STACK is weakest at, and no vendor will ever build it, because it is specific to DB's JobTread instance.
3. **The defensible asset is data, not AI.** 709 curated priced catalog items and ~175,000 historically priced instances across 3,987 jobs. Togal has training data DB will never have; DB has *pricing* data Togal will never have.

**The uncomfortable part, up front:** on cost avoidance alone, building never pays back. Buying is cheaper in every scenario, by 2.3–5.2x over five years (§2.3). The build is justified by three things not for sale — the JobTread bridge, the historical cost corpus, full audit provenance — plus one that must be measured before it can be claimed: **margin improvement.** On a business running 3,987 jobs, a half-point of realized margin plausibly dwarfs every engineering number here. Neither the re-keying hours nor the margin variance is known; both are measured in Spike 1. **If they come back low, buy STACK, keep Phase 1, and build only the push.** That is a legitimate and much smaller project, and this document is structured so you can take it at any gate without waste.

---

## 1. Provenance discipline

| Tag | Meaning |
|---|---|
| **VERIFIED** | Confirmed by direct query against organization `22PBAjem8SSC`, recorded in ADR 0001 |
| **REPORTED** | Asserted in research, not confirmed by query. A hypothesis with a spike attached |
| **UNVERIFIED** | Explicitly unknown. No design may depend on an assumed answer |

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

## 2. The build-vs-buy reckoning

### 2.1 What buying costs (the weakest number here — must be re-quoted)

| Option | Structure | 6 seats | 3 production seats + viewers |
|---|---|---|---|
| STACK, as Carl was quoted | $249–299/user/mo + $899/user FloorPlan AI | **$26,900/yr** | $13,500/yr |
| STACK, per independent research | Annual tiers ~$1,999 / ~$4,999 (3 full + 6 viewers) / custom; AI gated ~$2,999/yr | $12–18K/yr | **$8,000/yr** |
| Togal.AI | ~$299/user/mo, **quantities only** — no pricing, no proposal, no JobTread | $21,500/yr | $10,800/yr |
| Beam AI | $8–25K/yr **per trade**, done-for-you, 24–72h turnaround | n/a | n/a |
| HOVER + CANVAS | $58.99–112.61/report; $0.40/SF | *continues under every scenario* | *continues* |

A **2.5–3x spread on the most important cost number in the decision.** Two phone calls close it (Spike 1b). Togal produces quantities only — under "buy Togal," DB still needs Phase 1 + Phase 2 to price them and land them in JobTread. **Honest working figure for what DB needs: $8,000–15,000/yr.**

### 2.2 What building costs

A dev-day is **7.6 hours** (38 productive hours / 5 days), stated explicitly because effort tables that quietly use a 5.8-hour day are how impossible calendars hide. AI assistance is priced unevenly and deliberately: **~2.2x on CRUD, API clients, schema, reports and tests; ~1.25x on canvas, viewport, geometry and PDF plumbing.** Anyone scheduling Phase 4 at CRUD velocity misses by two months.

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

**There is no Phase 7.** Gated ML is cut (Decision 22). **These are P50 point estimates. Carry a 25–30% contingency reserve** — Phases 0–3 at P80 is **~$370K** contract, ~$265K salaried. **Budget the P80.** Funding only the P50 funds a project you will have to stop mid-phase.

| Also unavoidable | Cost |
|---|---|
| Run cost (Postgres w/ PITR, API + workers, object storage + CDN, Sentry, ~$60/mo model API) | $500–700/mo → **$6–8.4K/yr** |
| Maintenance from Gate 3 onward | **0.2 FTE (no canvas) → $43K/yr** · **0.3–0.35 FTE (with canvas) → $64–75K/yr** |
| **Reactive integration reserve** — one JobTread breaking change is 40–80 hours | **$10–15K/yr** |
| Specialist help (§14.2) | **~$22K one-time** |
| Carl's time | **130 hours** (§14.3), at his own loaded rate — he must supply it |
| Estimator time | **454 hours ≈ $34K** at $75/hr loaded; **314 hrs ≈ $23.6K** through Gate 3 |

**Storage.** At ~60 pages/set, ~40 tiles/page across levels 0–2, ~120KB/tile, a plan set is ~290MB plus the original; at 150 sets/yr, ~45GB/yr. Trivial in cost, not in lifecycle: **a retention policy is required** — tiles for closed jobs to cold storage at 90 days, purged at the limit set by the plan-licensing answer (§10.4); originals follow the restoration retention obligation (§8.6).

**Maintenance is 0.2 FTE, not 0.15, and its scope is named** so it cannot be quietly re-cut: mandated drills (quarterly grant rotation, monthly single-estimate restore, quarterly full off-provider restore, annual abandonment drill), dependency upgrades, alert and drift triage. It **excludes** reactive API work — hence the separate reserve. One hazard is budgeted: **the vector harvest depends on pdf.js `getOperatorList`, not a stable public contract.** The version is pinned and an operator-list golden test fails the build on upgrade.

### 2.3 Five-year TCO — with the benefits on the same page

A cost-only comparison is not decision-grade. Re-keying is carried in every scenario that does not eliminate it; client time in every scenario that consumes it. Re-keying = H × N × $75 × 5 years, with H and N **UNVERIFIED** until Spike 1.

| Scenario | Build | Maint. | Run + reserve | Subscription | Client time | 5-yr direct | **+ re-keying @$15K/yr** | **+ re-keying @$45K/yr** |
|---|---|---|---|---|---|---|---|---|
| **Buy only** (STACK 3 seats + AI) | — | — | — | $45K | — | **$45K** | **$120K** | **$270K** |
| **Hybrid** — build to Gate 3, rent takeoff | $290K | $172K | $76K | $45K | $43K | **$626K** | **$626K** | **$626K** |
| **Full build** through Phase 6 | $563K | $245K | $92K | — | $51K | **$951K** | **$951K** | **$951K** |
| **Everything** through Phase 9 | $643K | $280K | $100K | — | $54K | **$1.08M** | **$1.08M** | **$1.08M** |

At the low end of re-keying, **buy-only is ~5.2x cheaper than the hybrid.** At the high end, **~2.3x cheaper.** Neither ratio is close. Anyone presenting this project as "cheaper than STACK" is selling. **The build does not clear on cost avoidance. It can only clear on margin** (§2.5).

**Cash flow** is front-loaded against benefits starting week ~24: Phase 0 ~$17K/mo; **Phase 1 + 0b ~$46K/mo, the peak**; Phases 2a/2b ~$25K/mo; Phase 3 ~$28K/mo plus 130 estimator hours. Ask the CPA whether this capitalizes under **ASC 350-40** — and if so, the useful life and **the impairment consequence of stopping at a gate, which this plan explicitly invites** — and how **§174** treatment compares after tax against an immediately-deductible subscription.

### 2.4 What the premium buys

| Value | Certainty | Annual value | Purchasable? |
|---|---|---|---|
| **Recovered re-keying hours** — estimate lands in JobTread as a nested phase tree, no retyping | High; size unknown | $5–45K | No vendor will integrate with JobTread |
| **Margin improvement from better pricing** — distributions with n and spread replacing a stale spreadsheet rate | Plausible, unmeasured | **Potentially the largest item here** | No. Nobody else has DB's reconciled job costs |
| **Historical cost corpus as live pricing intelligence** | High | Compounding | No |
| **Margin protection from auditability** — markup ambiguity forced open, stale-takeoff blocking, hard approval gate, provenance from every dollar to its source | Real, hard to quantify | One $278K job mispriced 3% = $8.3K | Partly — a *gap* in STACK, not a strength |
| **Availability control** — no vendor's deploy window landing on bid day | Real | Insurance, not revenue | No |

### 2.5 Break-even, and the margin case

| Recovered hours: H per bid | N = 45 | N = 80 | N = 150 |
|---|---|---|---|
| 1.5 h | $5.1K | $9.0K | $16.9K |
| 2.5 h | $8.4K | $15.0K | $28.1K |
| 4.0 h | $13.5K | $24.0K | **$45.0K** |

At the low end, recovered hours do not cover the subscription. At the high end they cover subscription plus most of maintenance — **never the build.**

**The margin case is the half that decides it.** DB's `job` custom fields already hold **Reconciled Revenue, Reconciled Cost, Est Cost, Est Margin, Final Margin %** — so annual GC revenue, win rate, average and median gross margin by project type, and margin variance across the last 40 reconciled jobs are **all obtainable in Spike 1 from data DB already owns.**

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

Three disciplines bind the claim, because it is the one most vulnerable to wishful arithmetic. It must be **attributable** — Phase 8's variance decomposition makes it measurable rather than assertable. The **baseline is measured before Gate 1** from the last 40 reconciled jobs and published (§8.5 needs it too). And it is **re-tested at Gate 3** against real tool-priced jobs: if realized margin is not measurably better, the margin case is dead and only the re-keying and audit cases remain — which do not clear.

### 2.6 The recommendation

| If Phase 0 finds… | Then |
|---|---|
| STACK's takeoff feels good on DB's real plan sets **and** its export can be scripted into a nested JobTread `customerOrder` (Spike 0) | **Buy STACK. Keep Phase 1. Build only the push.** ~$8–15K/yr + ~14 dev-weeks. The most likely correct answer, and a better outcome than the full build |
| **Togal clears the §10.3 thresholds on DB's own sheets (Spike 2b)** | **Build Phases 1–5, license the detection layer, never build Phase 6 extraction.** eTakeoff already ships Togal as an embedded OEM engine, so detection is licensable separately. A ~$300 trial settles a ~$91K question |
| H × N < ~$15K/yr **and** margin sensitivity < ~$25K/yr | **Buy.** Neither case clears; the remainder is insurance |
| Vector sheets < 30% of GC work, **or** machine-readable dimension strings < 50% of sheets (Spike 2) | **Stop at Gate 3.** The exactness thesis does not apply to DB's inputs |
| No senior developer signed, or no year-3 maintenance owner | **Buy.** A half-built system the business bills through is worse than a subscription |
| Markup rules cannot be formalized (Spike 6) | **Pause.** Fix the pricing model with Carl before software encodes it |
| **A markup basis turns out to be an accident, not a policy (Spike 6 / Q6)** | **Split the gate.** Reproduce history *and* reproduce intent, in shadow, with the dollar delta per project type reported to Carl before he chooses a go-forward rule set (§8.4) |
| Carl's roofing appetite is near-term | **Take seam 8 early** — the vendor-measurement adapter moves into Phase 2b (§11) |
| All of the above come back favorably | **Approve Phases 1–3. Re-decide the canvas at Gate 3.** |

---

## 3. What "all the best features" should actually mean

STACK is a decade of engineering across two stapled-together products plus three AI layers, sold to thousands of contractors across every trade and input condition. Togal is a floor-plan segmentation engine producing quantities, not prices. Beam is not software at all — ~526 people doing a QA pass on every output.

**Roughly a third of that surface exists to sell seats to strangers**, and for six people with one system of record it is irrelevant or worse than the DB-specific answer: a 10,000-item generic catalog, licensed BNi regional cost data, a sub bid-leveling network, unlimited viewer tiers, Procore/Sage connectors, mobile takeoff.

**One thing is genuinely out of reach:** Togal-class segmentation on arbitrary raster input. But the useful line is not vector versus raster — **it is what the file asserts versus what must be deduced.** Architect-issued PDFs *state* an enormous amount outright: room areas printed inside room tags, wall types in a legend, dimension strings, door and window schedules, sheet indexes, title-block metadata. Where the file states a number, reading it has **zero model error**, and it is the *same number the architect will cite in a dispute* — a stronger position than a number DB recomputed, however exactly. Where the number must be deduced, DB is doing what Togal does with less data and less tuning.

**The rule: prefer the architect's assertion over our own reconstruction, everywhere the assertion exists.** This is the most valuable design principle in the document, and it is why automatic room segmentation is never built.

Two census questions gate all of it, because four subsystems depend on them:

- **Text encoding.** AutoCAD exports using SHX fonts store lettering as **stroked vector geometry with no text layer at all** — which is why Autodesk ships `PDFSHXTEXT`. On such a sheet there is no dimension string to extract, no room-tag area to read, no title block to parse, nothing to full-text search. Revit exports TrueType and is fine. A one-afternoon measurement gating weeks of Phase 4 and 6 work.
- **Layer metadata (PDF Optional Content Groups).** AutoCAD, Revit and MicroStation map drawing layers to OCGs. Where "Include layer information" was enabled, **every path carries its originating layer** — `A-WALL-EXTR`, `A-DOOR`, `A-ANNO-DIMS`. Exact metadata, not inference. It classifies walls, doors, windows, dimensions and annotation for free; it works on poché walls where stroke-width clustering fails outright; and it directly solves the error source the one independent AI-takeoff study identified — dimension lines, leaders and notes measured as construction geometry.

**The two things reviewers complain about most in the market leader are the two a private build wins outright:** slow plan loading and lag during takeoff, and an estimating module weaker than the takeoff module with insufficient customization. Chasing parity on the other twenty-five features is what would prevent winning on these two.

**The accounting: 23 capabilities built, 6 better than the incumbent, 10 deliberately absent, 4 honestly weaker without a text layer, 4 that no subscription provides.**

### 3.1 Feature coverage vs STACK / Togal / Beam

| Feature | Source | Our approach | Phase | Verdict |
|---|---|---|---|---|
| PDF upload, multi-page sheet burst | STACK | Content-addressed originals (sha256 dedupe), server-side tile pre-rasterization of levels 0–2, per-page **vector/raster/hybrid + text-encoding + layer** classification **stored as a permission** governing which methods may produce a billable number | 4a | **better** |
| Large-plan-set rendering performance | STACK's #1 complaint | Tile pyramid pre-generated on upload, never on demand; byte-budgeted LRU `ImageBitmap` cache sized **from measured device ceilings**; geometry on its own layer; CI perf budget per device class | 4a | **better** |
| **Sheet-index integrity diff → missing-sheets RFI** | nobody does this well | Set arithmetic over extracted sheet numbers. Near-exact, nearly free | **4a** | **better — unconditional where text exists** |
| Per-sheet scale calibration | STACK, Togal | Per-**viewport** state machine, up to 5 ranked sources, 7 named cross-checks, database-enforced confirmed-only gate (§8.3) | 4b | **materially better** |
| 9 measurement types w/ derived secondaries | STACK | Measurement carries a *dimension*, never a commercial unit; one polygon feeds LF of plate, SF of drywall, EA of studs via typed `QuantityBinding`s | 4b | **better architecture** |
| **Snap-assisted tracing over harvested geometry** | *neither vendor exposes this* | Snap to the architect's own vector coordinates. The measurement **is** the drawing's geometry — exact, free per sheet | **4b** | **better — largest single time saving in the plan** |
| Autocount symbol recognition | STACK | User-seeded counting: Form XObject `Do`+CTM walking for exact counts **where the exporter instanced**, geometry hashing otherwise | 6 | **parity at best** — instancing premise unverified |
| Floor Plan AI (walls/doors/windows/rooms) | STACK $899 add-on, Togal core | **Read the printed room-tag area and the legend**; wall-graph reconstruction only as a drafting aid with broken-enclosure markers | 6 | **better on stated data; worse on inferred data** |
| Natural-language plan query | Togal, STACK IQ | RAG with mandatory click-through citations **carrying sheet id and coordinate**; numeric questions route to SQL; backend rejects any model number not byte-matching a tool result | 6 | **better** — we control the schema |
| Items catalog (10,000+) | STACK | DB's own 709 reconciled items with effective-dated history and mined distributions (median, p25/p75, n) | 1 | **deliberately different, better substance** |
| Assemblies with formulas, waste, auto-quantity | STACK | Versioned, golden-tested, dimensionally-typed, seeded from **DB's own 101 live `quantityFormula` rows**, the workbook spec, and discovery over 46,248 cost groups | 2a | **better** — seeded from history |
| Labor rates and productivity | STACK | Burdened crew rate modelled **separately** from production rate; hours alongside dollars; rates mined from DB's `timeEntries` | 1 / 2a / 8 | **better** |
| Markup, margin, overhead, tax, waste | STACK | Explicit `markupBasis` discriminated union, canonical decimal multiplier, all three readings displayed together (§8.2) | 1 / 2a | **materially better** — DB's data contains both readings of "45%" |
| **Contingency, price adjustment, duration, escalation, contract type** | *gaps in all three* | Five first-class entities: reportable/releasable contingency; the only sanctioned way to move a bottom line; per-phase duration driving general conditions; required `valid_until` plus separately-reported escalation; `contract_type` with only `lump_sum` implemented (§9.7–9.9) | **2a** | **gaps repaired** |
| Branded proposal generation | STACK (limited customization) | **JobTread renders the contract.** We hydrate the verified template footer and **compute** the six-stage payment schedule (§7.6) | 2b | **better** |
| **Change orders** | all three | Baseline reference, gapless per-job numbering, CO-specific markup selector, cumulative contract value reconciled against JobTread (§9.2) | **2b** | **gap repaired** |
| **Allowances & selections** | residential remodel table stakes | Mapped to JobTread's **native three-value `allowanceType`**; material-only allowances blocked without a sibling labor line (§9.3) | **2b** | **gap repaired** |
| **Lead-stage (unbound) estimates** | daily GC workflow | Legal with `jobtread_job_id IS NULL`; push blocked until bound; lost bids marked with a reason (§9.1) | **2a** | **gap repaired** |
| **Vendor-measurement ingest (HOVER/CANVAS)** | *nobody offers this* | A $59 report ingests as measurements with full provenance and prices through the same assemblies, gate and push (§11 seam 8) | **2b** | **better — buy the geometry, own the pricing** |
| Plan markup & annotation | STACK (clunky) | Annotations strictly separate from measurement geometry, **pushed to JobTread's native plan room as vector paths**, plus assumption/exclusion pins that auto-populate proposal clarifications | 5 | **better** |
| Integrations (Procore, QBO, Sage, Excel) | STACK | One integration, done deeply: **JobTread** (§7) | 2b | **far better — the reason to build** |
| Done-for-you takeoff, ±1% guarantee | Beam AI | None — and read what it is: a *consistency* guarantee against the client's own conventions, achievable because ~526 people enforce it. **DB already owns that half** | never | **already owned** |
| **Estimate versioning, audit trail, locked sent proposals** | *gap in all three* | Hash-chained append-only log, `UPDATE`/`DELETE` revoked at the DB grant; immutable revisions pinning every dependency version; takeoffs bound to plan revision + confirmed calibration | 2a / 4b | **capability none of them sells** |
| **Controlled availability** | *gap in all three* | Deploys never in bid hours; degraded read-only mode; exportable snapshots; rehearsed manual fallback (§8.10) | 3 | **better** |
| **Estimate→actuals feedback loop** | *nobody can do this for DB* | Variance decomposed into quantity, price, **duration** and scope, attributed to the exact assembly output alias via our own `globalId` | 8 | **the compounding asset** |

---

## 4. Resolving the three-way tension

Ship-fast, prove-correct and AI-first are not in conflict about **order** — all three agree the canvas is late. They conflict about what the first shippable thing is and what gates it.

**AI-first wins the first phase and loses its own name.** Its real contribution is mining the cost corpus, which involves no machine learning. That goes first because it is **read-only** (zero possibility of a wrong number reaching a customer), because it front-loads the long-lead domain work blocking everything downstream, and because it ships user-visible value at ~week 24. Phase 1 is a SQL-and-aggregation phase.

**Ship-fast wins the sequence and loses on schedule.** The engine and push land before the canvas, because the re-keying is the pain and typed quantities are enough to eliminate it. But eleven weeks to a real pushed bid was 2–3x optimistic; the first real push is realistically **month 11**.

**Prove-correct wins the gates and loses its sequencing instinct.** The parallel run is a **funded, named phase with numeric exit criteria** (Phase 3), not a soft pilot — without a measured gate, "it feels right" becomes the trust criterion and the first wrong contract is found by a customer. But wanting the full reliability apparatus before anything ships delays first value past month 12 and maximizes the adoption risk it names as a project killer. The repair is the **Minimum Reliability Core** (§8.1): a named, non-negotiable subset hard-blocking push #1, with the rest arriving in Phase 3. When a phase slips, the reliability property Carl asked for cannot be quietly negotiated away while the feature list stays intact.

**AI-first loses the sequence outright, and loses its headline capability permanently.** The extraction that matters needs the geometry harvest, which needs the canvas's coordinate model. And the capability most associated with "AI estimator" — automatic room segmentation — is **not built**, because the architect already printed the area in the tag.

**One thesis holds across every phase:** text from the model, numbers from geometry and the cost database. Enforced in the schema, not in a prompt.

---

## 5. Decision log

| # | Decision | Choice | Rejected | Why it lost |
|---|---|---|---|---|
| 1 | Build order | Cost intelligence → engine + push → parallel run → canvas | Canvas first | Canvas-first means nothing usable for months and a worse canvas than you can rent. Each boundary here is a stopping point with standalone value |
| 2 | Assembly formulas in v1 | **Hard-coded, unit-tested TypeScript** | A dimensionally-typed expression DSL with a persisted AST | 100–200 hours for a capability that, at 16 assemblies authored by the developer, buys nothing. It earns its place when a non-developer must author one without a deploy, or the count exceeds ~40 |
| 3 | Worksheet in v1 | Plain grid + saved column sets + Excel keyboard model | Pivot selector with nested saved views | 150–300 hours for a reporting convenience. Grouping is a view over a flat line pool either way |
| 4 | Offline posture | **Offline-tolerant, not offline-first.** Server-authoritative through Phase 3 | "Local-first client keeps working when the server does not" | Cannot coexist with a concurrency design that rejects CRDTs and has no local store or sync layer. An IndexedDB WAL arrives in Phase 4c where it earns its keep |
| 5 | Direction of truth | JobTread owns jobs, customers, actuals, the signed document. We own takeoff, assemblies, rates, the draft. One-way explicit push | Bidirectional line-item sync | **VERIFIED:** no `costItem`/`costGroup` event of any kind, and the `event` type carries no such relation. Line-item edits inside JobTread are invisible by construction. Two-master financial sync across a boundary you cannot observe loses money quietly |
| 6 | Money representation | Decimal, scale 4 for unit costs, 2dp extensions, sum-of-rounded aggregation, one rounding boundary | Floats or integer cents | **VERIFIED:** every money field is a plain `number`; no decimal type exists. Observed: `8.206999999999999`, `869.9999999999999`. Floats drift or raise phantom alarms, and alarm fatigue disables every other control. Cents throw away real sub-cent unit costs |
| 7 | Markup representation | Discriminated union `{MARKUP_ON_COST \| MARGIN_ON_PRICE \| MULTIPLIER}`, canonical decimal multiplier, all three readings shown | A percentage field plus a convention | **VERIFIED:** DB's data contains both readings of "45%" simultaneously — Materials ×1.450 (45% markup, 31.03% margin), Labor ×1.818 (45% margin, 81.8% markup). One field reproduces one and corrupts the other, invisibly until close-out |
| 8 | Measurement vs Quantity | Four separate entities; `Measurement` has **no** unit, waste or rounding field | The computed quantity stored on the shape | Conflation breaks six things: one wall cannot feed LF + SF + EA without duplicate traces that drift; waste compounds silently for the second consumer; rounding destroys the evidence; revision triage becomes impossible; re-pricing requires re-measuring; the audit question becomes unanswerable |
| 9 | Scale | Per-**viewport** state machine, database-enforced confirmed-only view | Auto-detect with a dismissible warning | A wrong scale multiplies every length by k and every area by k² with no symptom — a ¼″ plan read as 3⁄16″ makes every area 78% of truth. Warnings get clicked through under deadline, and one clicked-through warning becomes a contract |
| 10 | Queue / outbox | pg-boss on the same Postgres, own schema, JobTread writes at concurrency 1 | Redis-backed BullMQ | Sealing a revision and enqueuing its push must be **one transaction.** Redis needs a two-phase dance to recover what Postgres gives free, plus a second stateful system that can be lost |
| 11 | Concurrency | Single-writer soft lease, version-checked writes, hard rejection | CRDTs (Yjs / Automerge) | CRDTs guarantee convergence, not correctness — and a converges-to-a-line-nobody-priced outcome goes into a signed contract. Per-field last-write-wins on money is a policy about whose number wins, disguised as a data structure. Also 4–8 weeks plus a permanent complexity tax, and it breaks the audit requirement that every customer-facing number has exactly one named author |
| 12 | Customer proposal | **JobTread renders the contract.** We hydrate the template and compute the payment schedule | Our own branded proposal generator | **VERIFIED:** `createDocument` accepts no `templateId`, and the footer of `22PBz2nQunqm` *is* the DB contract, where customers already sign. Rebuilding it duplicates a legal instrument for no gain and creates divergence between two copies |
| 13 | Formula mirroring | Push a **resolved, variable-free derivation string** into `quantityFormula` | Push live executable formulas | **VERIFIED:** JobTread has a working evaluator — 5,451 live formulas — but **zero on `customerOrder` lines.** DB's convention keeps formulas off customer-facing documents. A second calculation engine co-authoring contract numbers, where no webhook would report it, is worse than a cosmetic gain |
| 14 | Extraction strategy | **Read the architect's assertions first; reconstruct only what is not stated. Deterministic before any model** | Train or fine-tune a segmentation model | A read tag area or legend row has **zero model error** and is the number the architect will defend. CubiCasa5K is ~5,000 Finnish apartments and will not transfer; labelling DB's sheets means 500–2,000 sheets of skilled annotation |
| 15 | AI output location | A separate proposals store, **schema-incapable** of feeding a line item | Auto-accept above a confidence threshold | Automation bias is the failure mechanism: the more often it is right, the less it gets checked. Model confidence is not calibrated, so a threshold is a false control. The accept action is the only moment a human is forced to look at the drawing |
| 16 | AI feature priority | **Features whose failures are VISIBLE first.** Counting and schedule extraction before anything producing an area | Rank by accuracy or demo impact | A wrong count mark sits on the sheet where an estimator sees it. A fused polygon or skipped opening back-out produces a clean, plausible number nobody catches until the job loses money. **This is why gated ML is cut** |
| 17 | PDF engine | **Decided by measurement in Spike 3, on the *tiling* criterion** | Commit up front, or license Apryse | pdf.js has **no canvas tiling support** — one canvas per page, memory w×h×4 bytes, multiplied again on high-DPI. Apryse loses here because licensing it means it owns the viewer and the annotation model |
| 18 | Geometry storage | PDF user space (points), per page, `Float64Array`, forever | Screen space; or recompute at read time | Screen space makes every measurement depend on zoom and DPR. Recomputing at read time means a kernel upgrade changes the price of a signed estimate. Float32 drifts visibly on a 3024×2160pt sheet |
| 19 | Roofing | Deferred to Phase 9 — **honestly, 2029** — except seam 8, which moves into Phase 2b | Build both together | **VERIFIED:** DB already pays HOVER $58.99–112.61/job and CANVAS $0.40/SF. Exteriors have a working answer; interiors have none. Roofing's markup structure would make the Phase 3 parallel run unreadable. But the adapter needs no canvas, geometry or AI |
| 20 | Hosting | Managed Postgres w/ PITR + API + workers + object storage/CDN. Single US region. **No GPU** | AWS ECS/RDS Terraformed; or Kubernetes | The dominant risk is running out of hours, not cloud reliability. The failure mode that matters is a wrong number, not a slow page. Exit criteria to AWS are written down (§13) |
| 21 | **What "exact" means** | "Zero measurement error **against the drawing**, residual error bounded by **drafting fidelity — which we measure**" | "A vector-derived area has zero model error" | Those are the *drawing's* coordinates, not the building's. Dimension strings govern and override graphics, details are drawn NTS, remodel walls are drawn schematically. Spike 4 measures the disagreement distribution; it becomes the published accuracy floor **and** the §8.3 cross-check (iv) tolerance |
| 22 | **Gated ML as a phase** | **Cut.** Wall-graph reconstruction and NL query move to Phase 6; scanned-sheet OCR becomes a **purchased** adapter; room segmentation becomes a non-goal | A conditional 12-week ML phase | A conditional phase with a budget line is a phase that gets attempted. Research-grade room segmentation is ~0.50–0.77 mean IoU cross-domain — not contract-grade — and its failures are the silent class the human gate does not catch. Cutting it removes 12 dev-weeks, ~60 estimator hours of labelling, and the plan's worst risk |

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

Dates after Gate 0 are **derived, not committed** — Phase 3's duration is a function of N (bids/yr), which Spike 1 measures.

| Phase | Start | End | Note |
|---|---|---|---|
| −1 Hire search | Mon 2026-09-21 | Fri 2026-11-27 | Parallel to Phase 0 |
| 0 Decide & Prove | Mon 2026-09-21 | Fri 2026-11-27 | **Short-term senior contractor** — far easier to buy than a 15-month hire, and a working interview. Contains a calendar-bound 30-day STACK trial |
| **Gate 0** | | **Mon 2026-11-30** | Carl signs one of three paths |
| C Catalog reconciliation | Mon 2026-11-30 | Fri 2027-01-08 | Carl + estimator; fills the hiring gap productively |
| 1 Cost Intelligence (+ 0b) | Mon 2026-11-30 | Fri 2027-02-26 | 13 cal wks / 11 dev-wks, holidays absorbed |
| **Gate 1** | | **Mon 2027-03-01** | |
| 2a Estimate Core | Mon 2027-03-01 | Fri 2027-05-14 | |
| **Gate 2a** | | **Mon 2027-05-17** | Engine correct before it may write |
| 2b Bridge, COs & Allowances | Mon 2027-05-17 | Fri 2027-07-30 | |
| **Gate 2 — MRC** | | **Mon 2027-08-02** | First push to a real customer job |
| 3 Parallel Run & Cutover | Mon 2027-08-02 | **f(N)** | 12 cal wks at N≥80; longer below |
| **Gate 3 — canvas decision** | | ~**Mon 2027-10-25** | Re-quote STACK/Togal the same week |
| 4a–4c Takeoff | Mon 2027-11-01 | ~Fri 2028-05-19 | 24 dev-wks + slack, three gated slices |
| 5, 6, 8, 9 | 2028 → **2029** | | **Phase 9 roofing lands in 2029** |

**Named owners** filled in before Gate 0: *Developer*, *Carl* (gate decisions, markup ratification, cost-code adjudication, approval / contingency / price-adjustment policy), *Named Estimator*, *Maintenance Owner*.

### 6.3 Phase 0 — Decide & Prove (10 cal weeks, 6.2 dev-weeks core)

Ten calendar weeks, which the 30-day STACK trial requires anyway, carrying a **must-answer core of 31 dev-days**, with six spikes deferred to **Phase 0b** inside Phase 1's calendar on contractor retainer. Every spike ends with a **written verdict** in ADR 0001; no spike may end "pending." A template-introspection spike is *not* on this list — it was executed during preparation of this document and the answer is in §1.1, which is the shape every spike should take.

| # | Spike (core) | Days | Kill criterion |
|---|---|---|---|
| **0** | **The cheap competitor.** 30-day STACK trial, two real bids, then a throwaway ~200-line script reading STACK's export and creating a nested JobTread `customerOrder`; verify the export carries structure Phase 2 can ingest | 5 | **If it works and the estimators would use it daily: buy, keep Phase 1, build only the push.** Most likely correct answer |
| **1** | **Measure today — cost AND revenue.** Time three real bids, split takeoff / pricing / re-keying. Count GC estimates/yr. **Plus, from the `job` reconciliation fields: annual GC revenue, bids submitted, bids won, average and median gross margin by project type, margin variance across the last 40 reconciled jobs.** Count the insurance-restoration share of interior work | 3 | H×N < ~$15K/yr **and** margin sensitivity < ~$25K/yr → buy. Restoration > ~40% of interior volume → Xactimate is the real incumbent; re-scope |
| **1b** | **Two phone calls.** Written quotes from STACK and Togal for DB's real seat count. **Owner: Carl** | 0 | Not a kill; a hard blocker on the Gate 0 memo |
| **2** | **Four-axis plan census** over the last 50 jobs' plan sets. Per page: (i) vector/raster/hybrid; (ii) wall representation — stroked linework with clusterable widths vs hatched/poché/filled; (iii) **text encoding** — real text objects, per-glyph text needing reassembly, or stroked SHX geometry, reported as the share of sheets with machine-readable *dimension strings* and *room tags*; (iv) **layer metadata** — presence and quality of PDF OCGs. Also count distinct Form XObjects invoked >5×/page | 5 | < 30% vector → **stop at Gate 3.** < 50% machine-readable dimension strings → §8.3 source (a) demotes, cross-check (iv) unavailable, ~4–6 weeks of OCR work moves into Phase 6. OCGs present → several Phase 6 designs simplify. No instancing → autocount is not "better than STACK" |
| **2b** | **Togal on DB's own sheets.** Five real plan sets plus one scanned remodel set through a Togal trial; hand-measure the same rooms and walls; publish MAE, max error and mean signed error **per category** | 3 | Togal clears the §10.3 thresholds → **build Phases 1–5, license detection, never build Phase 6 extraction** |
| **5** | **JobTread write-path harness** against ONE disposable test job (`DBE0.` prefix, compile-time allowlist): `updateDocument` lineItems replace-vs-merge; is `externalId`/`globalId` uniqueness server-enforced (probe by attempting a duplicate); behaviour on a `createDocument` that times out after succeeding; `customFieldValues` write key format. **Plus JobTread's own rounding policy:** push three fixtures (a 4dp `unitCost`; one where round-per-line and sum-then-round differ by a cent; a half-cent extension) and read back `cost`, `price` and every line's | 6 | Full-replace `updateDocument` → the in-place path is **banned**. **If JobTread sums-then-rounds, the reconciliation contract changes — not our rounding** |
| **6** | **Markup formalization.** Candidate rules vs the **46 measured** priced rows; classify the **general-construction subset** of the 709 into rule-covered / named-exception / data-quality-artifact / undecided. **Must answer Q6: is the Materials-markup / Labor-margin split deliberate or accidental?** | 5 | 46 rows not reproduced to the cent, or < 85% C-scope rule-covered → pause. **"Accidental" → the replay gate splits in two (§8.4) and Carl chooses a go-forward rule set with an effective date** |
| **6b** | **Read the spreadsheet.** Collect every estimating workbook in use, dump all formulas, reverse-engineer implicit assemblies, waste factors, productivity rates, markup order-of-operations and any final-price adjustment step into a written spec. **Collection needs no developer.** The cheapest source of domain truth: DB's actual estimating logic lives in the workbook this plan replaces, and inferring markup rules from 46 catalog rows is guessing at something that may be written in a cell formula | 2 | Not a kill. **Its output — not the developer's reconstruction — is the input to Phase 2a's 16 assemblies, and a required cross-check on Spike 6** |
| **7** | **Historical replay** of 3 real estimates (incl. `22PejfgufCkY`, $277,971.02 / $177,437.36, 28 groups / 72 items) to the penny | 3 | Unexplainable discrepancy → the money model is wrong and must be fixed before anything is built on it |
| | **Core total** | **31 ≈ 6.2 dev-weeks** | |

| # | Spike (Phase 0b, inside Phase 1) | Days | Kill criterion |
|---|---|---|---|
| 3 | **PDF engine bake-off** on the tiling criterion: can the engine render an arbitrary **clipped sub-rectangle** of the densest sheet at 8× in <120ms, in the browser *and* in Node, without full-page allocation? Plus peak memory over a 100-page scroll — desktop Chrome **and the actual field iPad, whose real `ImageBitmap`/canvas ceiling this measures rather than assuming** | 5 | Neither engine can tile → **the canvas is a buy decision; re-run build-vs-buy** |
| 4 | **Vector room polygonization AND drafting fidelity** on 3 real sheets, **validated two ways: against printed room-tag areas, and by comparing extracted geometry against every printed dimension string** | 7 | < 80% of tagged rooms within 2% → reconstruction is a drafting aid only. **The fidelity distribution becomes the published accuracy floor and the §8.3 cross-check (iv) tolerance** |
| 8 | **Catalog triage + read DB's own 101 catalog `quantityFormula` rows** | 3 | > ~250 rows needing Carl → Workstream C re-cut by trade with named tranches |
| 9 | **Webhook + QBO audit.** Read every consumer's handler; confirm whether an API-created `customerOrder` propagates into QuickBooks Online | 3 | Not a kill; a **hard blocker on push #1** |
| 10 | **Grant + rate limits.** Provision the least-privilege runtime grant (§7.8); rotation rehearsal (current grant expires **2026-12-17**); token-bucket calibration | 3 | Scoped grant impossible → the compile-time allowlist becomes safety-critical code with its own tests |
| 11 | **Plan-room coordinate calibration:** what `plan.scale` means (ratio or units-per-pixel), what coordinate space `annotations[].points` uses, how `isNegative` composites | 2 | Getting `scale` wrong silently corrupts every pushed quantity — **calibrate empirically.** A JobTread `plan` is ONE page with ONE scale, so §8.3's per-viewport model is **not natively representable** |
| | **0b total** | **23 ≈ 4.6 dev-weeks** | |

**Also delivered:** the fixture corpus (40–60 scrubbed historical `customerOrder`s + 5 real plan sets + one scanned remodel set + a catalog snapshot); the repo skeleton with CI; ADRs 0001–0014; catalog triage tooling; and a **costed three-way go/no-go memo** Carl signs.

**Gate 0 exit criteria** — each a document or a number, not a judgement: every core spike has a written verdict with measured numbers · the PDF engine chosen on a tiling measurement · the four-axis census published as four percentages · H, N, annual GC revenue, win rate and the 40-job margin variance are measured numbers · Togal's per-category MAE / max / mean-signed error published · all ADR 0001 open questions resolved in writing, including JobTread's rounding policy · every webhook consumer owner has confirmed or scheduled a namespace-skip patch · the estimating workbook spec exists and Carl has countersigned it · **a senior developer is signed with a start date** · **a named estimator has committed 4 hrs/week in writing, on a recurring calendar block** · **a year-3 maintenance owner is named** · **a signed contractor agreement covering IP assignment, confidentiality and data handling**, dated before the contractor's first day · Carl has signed one of the three paths.

### 6.4 Phase 1 — Cost Intelligence (13 cal weeks, 11 dev-weeks) · READ-ONLY

Ships a usable tool at ~week 24 with **zero possibility of a wrong number reaching a customer**, because nothing writes to JobTread. The permanent parallel-run CI harness reproducing 40–60 historical documents to the cent is what makes this 11 dev-weeks rather than 8.

**Modules:** `packages/db` · `packages/jobtread/taxonomy.ts` (62 cost codes / 5 cost types / 28 units / 30 templates / 70 custom fields, **keyed by id — never by name**, because `Specialites` is misspelled and load-bearing and six templates share the name "Estimate") · `packages/mining/*` · `packages/catalog/*` · `packages/money/*` · `apps/web` (read-only).

**The corpus partition rule — the gap that would otherwise double-count.** VERIFIED: 176,156 cost items, of which **81,473 have `document = null`** (catalog + *job budget* lines) and **709** are the true priced catalog.

```
CORPUS PARTITION (enforced in packages/mining/corpus.ts; every statistic
declares its partition, and the UI shows it next to the number)

  P0  catalog        document=null ∧ job=null ∧ prices>0   →   709   vocabulary
  P1  job_budget     document=null ∧ job≠null              → ~80,764 planned
  P2  quoted         document.type='customerOrder'         → ~?      what we quoted
  P3  invoiced       document.type='customerInvoice'       → ~?      what we billed
  P4  paid           document.type='vendorBill'            → ~?      what we PAID ← unit costs
  P5  committed      document.type='vendorOrder'           → ~?      earlier signal

  Unit-cost distributions := P4, fallback P2
  Productivity (hrs/unit) := costItem.timeEntries ÷ installed qty from P2
  Realized waste / yield  := purchased (P4/P5) ÷ theoretical (ours)
  Phase duration (weeks)  := timeEntries date span per job phase      → §9.9
  Margin baseline         := job Reconciled Revenue/Cost, Final Margin % → §2.5, §8.5
  NEVER union P1 with P2/P3.  NEVER union P2 with P3.
```

**Cohort tagging with visible exclusions** — insurance restoration, warranty, service repair, unreconciled jobs and `unitAmbiguous` rows are excluded from general-construction statistics **by default, with the reason shown beside every statistic.** A statistic whose population is a mystery does not get trusted, and correctly so.

**Mining uses server-side `group`/`aggs`** (VERIFIED: `count`, `sum`, `avg`, `min`, `max`, `values`, plus `group` taking `{by, firstIdBy, aggs, where}`). Pave offers **no median, no percentile, no stddev**, so `values` streams raw unit costs and medians / IQR-trimmed means are computed client-side; **`values` is subject to the same 100-row page cap.** Every output is a **distribution with n and spread** — never a value: VERIFIED, `Drywall Board - Mat` appears three times in one group at $27.98, $26.18 and $21.68, all linked to the same `organizationCostItem`.

**Assembly discovery** starts with DB's own **101 live catalog `quantityFormula` rows** — explicit human-authored rules — and only then clusters 46,248 cost groups for co-occurrence sets and quantity ratios.

**Confidence grading:** every mined statistic lands `UNVERIFIED` and **invisible to estimators** until a senior estimator promotes it with a name and timestamp. Publishing produces an immutable `RateTableVersion`.

**Gate 1 exit criteria:**
- The parallel-run CI job reproduces **≥95% of line items within $0.01**, and **document cost and price to the cent on ≥40 fixtures.** **Named exceptions capped at ≤5% of line items and ≤0.5% of aggregate document value** — above either cap the rule set has failed, whatever anyone signs.
- The **46 measured** priced catalog rows reproduce `unitPrice` from `unitCost` byte-exact. **Hard, no exceptions.**
- **The 709 are split by trade first.** Then **100% of the general-construction subset classified with zero undecided, ≥85% rule-covered.** The roofing/exterior subset is **explicitly parked as UNVERIFIED and invisible, with its count published.** A large share of the 709 are gutters, downspouts, step flashing and warranty products Phases 1–8 will never price.
- ≥200 catalog items carry a promoted distribution with n ≥ 5, covering DB's top 30 cost codes by dollar volume.
- **The margin baseline is published:** mean and spread of |actual − estimated| as a % of contract value across the last 40 reconciled jobs.
- **Nightly ingest runs unattended 14 consecutive days with a heartbeat.**
- **Measured usage, not inferred enthusiasm:** ≥8 distinct sessions by ≥2 estimators during live bids within a stated 3-week window, evidenced by telemetry (session, bid id, queries run), with one written sentence per session on what they were trying to learn.
- Zero writes to JobTread outside the disposable test job.

**Not in this phase:** any write to JobTread (compile-time read-only client) · any PDF, canvas or takeoff · any model call · estimate creation · auto-applying any proposed correction · `updateCatalog` in any runtime grant.

### 6.5 Phase 2 — split into 2a and 2b (22 cal weeks, 20 dev-weeks)

The split puts a gate between "the engine computes correctly" and "the engine is allowed to write." The **MCP server** and the **LLM-drafted scope narrative** move out to Phase 5; neither is on the critical path.

**Phase 2a — Estimate Core (10 dev-weeks) · still no writes.** Money + units core (decimal scale 4, one rounding boundary, sum-of-rounded aggregation, dimensional typing where multiplying a quantity by an incompatible unit cost is a **compile error**, item-scoped `PackageSpec`) · **16 assemblies** authored with the named estimator, seeded from the Spike 6b workbook spec and Phase 1 discovery · worksheet (flat line pool, saved column sets, Excel keyboard model, paste-a-column, provenance chip on every quantity, visible rule chain on every price, amber override badge, persistent margin bar, **audience mode where Customer Preview structurally omits cost columns from the rendered document**) · **contingency, final-price adjustment, duration, escalation, bid validity, contract type (§9.7–9.9)** · **lead-stage unbound estimates (§9.1)** · immutable revisions with pinned dependency sets · append-only hash-chained event log with `UPDATE`/`DELETE` revoked at the DB grant · approval gate with server-enforced blockers, named approver, four-eyes above a Carl-set threshold · **authentication and identity (§8.9)** · proposal PDF and internal cost worksheet from the immutable approved snapshot.

*Gate 2a:* the engine reproduces the Phase 1 fixture corpus to the cent **from assemblies** rather than stored line values · 100% line and branch coverage on `packages/{money,units,assemblies,estimate}` · every §9.7–9.9 entity has one test proving its gate blocker **fires** on a crafted violation · three estimates in parallel with the spreadsheet agreeing within 1% on ≥95% of lines · **no unauthenticated path to any cost or customer data, proven by test.**

**Phase 2b — Bridge, Change Orders & Allowances (10 dev-weeks).** The JobTread bridge in full (§7) · **change orders** (§9.2) and **allowances and selections** (§9.3) on JobTread's native primitives · **the vendor-measurement adapter** (§11 seam 8): a $59 HOVER or CANVAS report ingests as measurements with full provenance and prices through the same assemblies, gate and push — ~1–2 dev-weeks, no canvas, no geometry, no AI, and it makes exterior and roofing estimating usable **years** before Phase 9.

*Gate 2 = the MRC (§8.1), all 17 items green, plus:* the computed payment-schedule footer reproducing a real historical estimate's figures to the cent · a senior estimator having pushed a real estimate to a real job after reading the pre-flight diff aloud, and that document having gone to a customer unchanged.

**Not in this phase:** any takeoff or PDF viewer · any AI-generated quantity · `updateDocument` on anything a human may have sent or signed · job budget sync, POs, sub packages · pivot worksheet · granular permissions beyond four roles · mobile.

### 6.6 Phase 3 — Parallel Run & Cutover (9 dev-weeks; calendar is f(N))

A fixed 10-week window requiring 15 bids done both ways assumes N ≥ 80. At N = 45, ten weeks yields ~8.6 bids.

| Measured N | Phase 3 calendar | Qualifying parallel bids | Historical re-runs allowed |
|---|---|---|---|
| ~45 | **17 weeks** | 9 live | + 6 closed historical bids re-run, at **half evidentiary weight** |
| ~80 | **12 weeks** | 15 live | 0 |
| ~150 | **8 weeks** | 15 live | 0 |

**A qualifying parallel bid** is a real bid actually sent to a customer, produced independently both ways, ≥$15K in value, with the diff triaged and signed within 5 business days. A historical re-run tests the engine but not the workflow, hence half weight, and cannot exceed 40% of the total.

**The diff harness first.** Line-by-line comparison matched on cost code + name + unit, unmatched lines called out, money at epsilon, every delta triaged into exactly one of: **tool bug** (fixed, with a regression test committed *before* the fix ships), **old-process error** (documented), **intentional methodology difference** (signed by Carl). **"Explained" requires a second named person to countersign** — otherwise it is adjudicated by the party who wants to pass. Plus: shadow mode for every calculation change (a flag flips only after 10 real estimates with zero unexplained deltas) · rollout beyond one estimator (printed cheat sheet, two 90-minute sessions each, a written cutover plan for in-flight estimates, buddy pairing) · **maintained user documentation** (a short written guide per workflow, a screen recording of each, a documented "new estimator day one" path) · operational hardening (deploys **never in bid hours** via a path-based CI rule; read-only degraded mode; eight named alerts; 7am digest; heartbeats on every scheduled job; **monthly** single-estimate PITR drill and **quarterly** full off-provider restore drill, with a full restore older than 100 days blocking feature deploys) · **the coverage procedure and abandonment drill built and rehearsed here** · **bootstrap the actuals loop now** from historical closed jobs.

**Gate 3 exit criteria** — every one a count, a measurement or a dated artifact: the qualifying bid count for the measured N · ≥95% of lines within 1% · **zero deltas > $100 or > 0.5% of total lacking a countersigned classification** · **100% of triaged deltas classified, with the old-process-error count published — whatever it is, including zero** (requiring "at least one case where the tool caught an old-process error" depends on the old process having erred during the window, is not achievable by effort, and creates a live incentive to inflate one) · zero lost-work incidents, zero duplicate documents · canary + nightly recompute audit green 30 consecutive days · quarterly full restore drill passed inside the 4-hour RTO, with a timed written log committed · **abandonment drill passed** · **a person who has never seen the tool produces a correct bid from the written guide alone, observed** · **every estimator trained** · **the margin re-test (§2.5)** — if realized margin on tool-priced jobs is not measurably better than the Phase 1 baseline, the margin case is dead and the Gate 3 memo says so · the spreadsheet formally retired for general construction, with Excel export one click away on every screen.

**Gate 3 is also the canvas decision.** Re-quote STACK and Togal the same week.

### 6.7 Phases 4–9

**Phase 4 · Takeoff — 24 dev-weeks in three shippable slices.** The tile pyramid is the hidden line item: **pdf.js has no canvas tiling support**, so the pyramid means driving it with per-tile clipped transforms in the browser *and* in Node — 3–5 weeks on its own, with Spike 3 as its gate.

- **4a · Plan ingest + viewer (8 dev-weeks).** Four-axis page classification stored as a permission; tile pyramid (levels 0–2 server-side with the *same* engine binary the browser uses, so client and server can never disagree about coordinates); **Sheet Register with title-block parsing and the sheet-index integrity diff**; full-text search; iPad plan view, photo and voice capture, proposal presentation. Useful alone the day it ships. *Exit:* perf budget met **per named device class** — 60fps pan/zoom and <100ms commit on the densest real sheet on desktop Chrome, with a separately stated and **permitted-to-be-lower** iPad target derived from the ceiling Spike 3 measured.
- **4b · Scale, measurement and snapping (11 dev-weeks).** The scale interlock (§8.3); vector geometry harvest (**OCG layers where present, stroke-width clustering where not**); viewport as one affine matrix with geometry in PDF user space `Float64Array` forever; Canvas2D overlay + DOM/SVG layer for active-edit handles only; Flatbush + RBush hit-testing; conditions with colour **and** hatch; first-class deductions; **Measurement → MeasurementSet → QuantityBinding → Quantity** as four persisted entities; **and snap-assisted tracing over the harvested geometry.** Snapping belongs here, not Phase 6: it is the largest single time saving in the plan, the harvest is already a 4b deliverable, and Gate 4's speed criterion is unpassable without it. *Exit:* geometry goldens ≤0.25% on every fixture variant (rotated / cropped / non-standard size / `UserUnit` / scanned) · the scale property (k → k, k², k³ and nothing else) · screen→user→screen round-trip within 0.5px on every commit · **timed head-to-head measured properly: 6 real jobs, alternating which method goes first, an independent timekeeper, the first two new-tool jobs excluded as training, and a pre-registered protocol defining where the clock starts and stops.** If Spike 2 returned below 30% vector, snapping does not apply and this criterion is renegotiated **before** Phase 4 starts, not failed at its end.
- **4c · Guards, recovery and locks (5 dev-weeks).** Overlap Guard (Primary / Reference / Linked + method-conflict flag); IndexedDB write-ahead log; per-sheet soft locks; the conflict recovery screen (§9.6). *Exit:* force-kill the browser mid-polygon, 20 times, and lose nothing.

**Phase 5 · Change Under Pressure (8 dev-weeks).** Ship the cheap half first and separately — the sheet-index diff and unmatched-NEW-sheet task list is set arithmetic, near-exact and nearly free, and it catches *added scope*, the failure nobody detects because nothing looks stale. It ships in 4a. **Then** plan revisions with sheet lineage matching (seeded from `plan.previousFilePages`); registration by title-block corners refined with matched vector content; vector + raster diff; per-measurement staleness verdicts with **no "probably fine" state**; **Impact Report ranked by dollars, not drawing order**; the stale-walker with a running "remaining stale exposure: $X of $Y" counter. **The gate is precision, not recall** — the hard problem is suppressing noise. Also: sub bid board with `bidRequest` Pricing Requests and a 15-second phone-quote widget; **options/alternates on JobTread's native selection groups** over one shared line pool; supplier price-list import with diff-review; draft POs; job budget sync; the read-only **MCP server** and the **LLM-drafted scope narrative**.

**Phase 6 · Deterministic Extraction (16 dev-weeks).** **Schedule / legend / tag extraction first, because its failures are visible** — on text-bearing vector sheets this is a **spatial join between two exact datasets**, near-exact, not a recognition problem, **including wall-TYPE legend reading**, which neither Togal nor STACK does and which is precisely where a GC's cost error lives · **a source crop image stored with every extracted row**, so verification is a two-second glance rather than a hunt through 200 sheets · **user-seeded symbol counting** via XObject instancing with geometry-hash fallback, **scheduled only after Spike 2's instancing census returns** · wall-graph reconstruction and NL query · **scanned-sheet OCR and table extraction: purchased, not built**, one swappable adapter chosen by a 20-sheet bake-off on DB's real sheets. *Exit:* **≥35% takeoff time reduction measured on the vector-sheet subset, reported alongside the unimproved scanned-sheet number and the blended number weighted by DB's actual input mix.** A single blended gate can be passed by cherry-picking three vector-heavy jobs.

**Phase 8 · Actuals Loop (6 dev-weeks, continuous thereafter).** Variance decomposed into **quantity** `(Qa−Qe)×Pe`, **price** `(Pa−Pe)×Qa`, **duration** (general conditions, the largest indirect block, previously unattributable), and **scope** from approved COs — attributed to the exact assembly output alias because our `globalId` rides on every pushed line. **Final-price adjustments (§9.8) are excluded from variance attribution**, so a competitive discount never pollutes a learned rate. Governed `PricingProposal` batches with an impact simulation ("23 assemblies affected; re-pricing the last 20 live estimates moves average price +1.4%, max +4.1%"), human-approved, published as an immutable `RateTableVersion`. **Nothing auto-updates. Never tune the geometry engine — geometry is deterministic and its errors are bugs, so "tuning" one hides it.**

**Phase 9 · Roofing (8 dev-weeks) — a 2029 deliverable.** See §11.

---

## 7. The JobTread integration as a subsystem

Not an integration — a first-class subsystem with its own state machine, test harness and failure budget. JobTread explicitly does not support or debug customer-built integrations, so DB owns this code.

**Direction of truth.** JobTread owns jobs (3,988), accounts (3,550), the cost-code/cost-type/unit vocabularies, the 709-item catalog, documents and their status, signatures, recipients, budgets, the 30 templates (which carry the legal contract text), files, the native plan room, and **cumulative contract value**. DB Estimator owns plan ingest, per-viewport scale calibration, takeoff geometry, the derivation DAG, assemblies, rate-table versions, the pre-commit draft and its revision history, mapping tables, CO baselines, allowance state, contingency, price adjustments, escalation and duration. **The estimate document is the only shared object.** `costItem` has no geometry field and there is no assembly primitive, so round-tripping geometry through line items would mean encoding it in `description` text — which is how integrations rot. Geometry goes to the **plan room** as vector annotations instead.

**Identity.** VERIFIED: `document.externalId` is nullable, ≤32 chars, filterable, **null on all 2,181 `customerOrder` documents**; `costItem.globalId` is nullable, ≤100 chars, filterable, **null across all 176,156 cost items.** Server-side uniqueness is **UNVERIFIED** — assume it does not exist and enforce it ourselves, because assuming the server does it is the one assumption that could double-create a customer contract.

```
Document key (31 of 32 chars):  DBE1.01K5J7QX8ZN4M2VYB3TDCFGH9P
                                └┬─┘ └────────── ULID ──────────┘
                              namespace + schema version
Line key (69 of 100 chars):     dbe1|<rev ULID 26>|<grpPathB32 10>|<line ULID 26>
Test artifacts:                 DBE0.<...>   ← permanently identifiable, filterable
```

ULID over UUID: a hyphenated UUID is 36 chars, it sorts lexicographically, and its leading 48 bits are a millisecond timestamp, so an `externalId` is self-dating when you are debugging at 11pm. **The ULID is generated at ENQUEUE time and persisted before any network call** — not at send time, not derived from content. That is what makes retries safe. Deliberately *not* a content hash: two revisions can be byte-identical and still be distinct business events. `costGroup` has **no** `globalId` or `externalId`, so a base32 digest of the group's materialized path is encoded into each child item's key and the tree is rebuilt from the leaves.

### 7.1 The write path

One atomic `createDocument` builds the entire nested tree. VERIFIED: the `lineItems` cap is **1500 declared independently at each level** — a **per-level cap, not a document-wide node budget.** The largest real DB estimate is 100 nodes. No partial-tree state is ever observable, and the design leans on it completely: we never build an estimate incrementally.

**The discriminator is the entity type, not the variant key.** VERIFIED: `_on_newCostItem._type` is the constant **`"costItem"`**, `_on_newCostGroup._type` is **`"costGroup"`**, and new-versus-existing is discriminated by the **presence of `id`**. A payload using `"newCostItem"` as the `_type` string is rejected by validation.

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
      // From TaxPolicy (§8.6) — never a default, never assumed zero.
      "taxRate": 0.0725,

      "requireSignature": true,        // ← default FALSE; template says true
      "includeInBudget": false,        // ← DEFAULT IS TRUE. Always explicit.
      "showProfit": false,
      "showQuantity": false,           // ← default TRUE, template says FALSE
      "showChildCosts": false,         // ← default TRUE, template says FALSE
      "showCostItemFiles": true,

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
                  "showQuantity": true,
                  "showDescription": true,
                  "requireSpecificationApproval": false,  // ← default TRUE
                  "hasFinalActualCost": false,
                  "isSelected": false,
                  "isSpecification": false,
                  "isEditable": false,
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

- **Cost codes are INHERITED from the resolved catalog item**, never derived from our taxonomy or the item's name. VERIFIED: `Insulation - Batt` is coded to *Siding*; `Fastener - Framing Nails` to *Roofing* inside a Framing Materials group; `Walk-In Shower` to `Specialites`. Their cost codes are financial-reporting buckets shaped by history. Reproduce them; do not correct them. Corrections are *proposed* to a human, applied in JobTread's catalog, then re-synced.
- **`organizationCostItemId` is OUR invariant, not the API's.** VERIFIED it is `{nullable: jobtreadId}`, so 100% presence in DB's data is convention, not constraint. Our preflight enforces it; a server-side rejection will not.
- **`showQuantity` and `showChildCosts` are traps in the opposite direction from `isTaxable`.** VERIFIED: `createDocument` defaults both **true**, while DB's Const-Large template sets both **false**. Inheriting the API default shows customers quantities and child costs they have never been shown. Every `show*` flag is copied from the template explicitly and asserted on read-back.
- **Name/description overrides are idiomatic, not a smell.** VERIFIED: one catalog item appears four times on one estimate with four different board specs, and a fifth time renamed while keeping the catalog link.
- **Ordering is by array index.** `positionAfter` exists on `createCostItem.$` but is **absent from every `createDocument`/`updateDocument` lineItems variant.** `position` *is* a lexicographic fractional index (`"j"`, `"k"`, `"l"`), so never write integers into it on the incremental-repair path.
- **Preflight asserts node count < 1200 per level** and refuses above it rather than silently splitting.

### 7.2 JobTread field mapping

| DB Estimator concept | JobTread target | Type / limit | Notes |
|---|---|---|---|
| Revision identity | `document.externalId` | string ≤32, nullable, filterable | `DBE1.<ULID>`. Uniqueness enforced by us. Clean on `customerOrder` only |
| Line identity | `costItem.globalId` | string ≤100, nullable, filterable | `dbe1\|rev\|grpPath\|line`. Null across all 176,156 rows — a `dbe1\|` line is provably ours |
| Group identity | *(none)* | — | No `globalId`/`externalId`; encoded into child line keys, tree rebuilt from leaves |
| Phase tree | nested `costGroup.lineItems` | 1500 **per level** | Construction-sequence tree, 2–3 deep |
| Cost code | `costItem.costCodeId` | jobtreadId | **Inherited from catalog item.** Match by id — `Specialites` is misspelled |
| Cost type / Unit | `costTypeId` / `unitId` | jobtreadId | 5 / 28 values; `Square` = 100 ft² exactly (§11) |
| Catalog link | `costItem.organizationCostItemId` | jobtreadId, **nullable** | Our invariant, not the API's |
| Quantity derivation | `costItem.quantityFormula` | string, nullable | **Resolved, variable-free prose.** JobTread has a live evaluator but DB keeps formulas off customer documents (Decision 13) |
| Unit cost / price | `unitCost` / `unitPrice` | **IEEE float** | Decimal scale 4 internally; convert at exactly two boundary functions (§8.2) |
| Taxability | `costItem.isTaxable` | boolean, **default TRUE** | From `TaxPolicy` (§8.6) — not hardcoded false |
| Document tax | `document.taxRate` | number, **gte 0 lte 1** | A **fraction**. 60 live documents carry 0.0725 |
| Allowance | `costItem.allowanceType` | enum `{cost, costAndFee, price}` | **Three values, not a boolean** (§9.3) |
| Allowance reconciliation | `createDocument.$.allowanceCostItemId` | jobtreadId | Native allowance-reconciliation documents |
| Selections / alternates | `costGroup.isSimpleSelection`, `minSelectionsRequired`, `maxSelectionsAllowed`, `showChildDeltas` | int / boolean | Native options with customer-facing deltas |
| Contract terms | `document.footer` | string ≤65,536 | **Copied from `documentTemplate` — it IS the DB contract** (§7.4) |
| Scope narrative | `document.description` | string ≤**32,768** | Not 65,536 |
| CO → baseline link | `createDocument.$.references` | ≤1000 | Native document-to-document reference |
| Takeoff geometry | `plan.annotations[]` via `updatePlan` | ≤1000 annotations, ≤1000 xy pairs each | Vector paths with `isNegative` for deductions |
| Per-line plan markup | `costItem.files[].annotatedUploadRequestId` | ≤10 files/item | **Structured vector data, not a flattened image** |
| Room / area tag | `costItem.jobArea` | string, nullable | 6 live non-null values — 99.997% free, not empty. Do not assert null |
| Custom provenance | `costItem.customFieldValues` | connection | SKU, Supplier, Room, Specifications, Internal Notes already exist |
| *(not writable)* | `document.sourceId`, `sourceMetadata`, `sourceOrganization` | — | On the read type, **absent from create and update inputs** |

### 7.3 The push state machine

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
  Uploads MUST precede the document: fileTargetType excludes BOTH costItem and
  costGroup, so per-item files travel only inside the document mutation.

  The runtime grant holds NO deleteDocument, deleteCostItem or deleteCostGroup,
  so the system is structurally incapable of "cleaning up" a contract a customer
  may have seen.
```

**Money verification uses an epsilon, deliberately.** We push 3–4 decimal unit prices into a system that VERIFIED stores IEEE floats, and exact equality also assumes JobTread rounds line extensions the way we do rather than sum-then-round. **If JobTread sums-then-rounds, exact comparison fails every multi-line push on day one**, and alarm fatigue then disables every other control. Spike 5 measures their policy; **if it differs from ours, the reconciliation contract changes — not our rounding**, because our rounding must reproduce DB's 709 catalog rows.

### 7.4 Reconciliation, template hydration, conflict policy

**Three tiers, because there is no `costItem` webhook.** VERIFIED: no `costItem`/`costGroup` event of any kind, and the `event` type carries no such relation — line-item edits inside JobTread are invisible to webhooks, and `documentUpdated` is a hint, never a description.

- **Tier 1 · event tail, 60s.** **`document.events`** — a per-document connection carrying `type`, `createdAt`, `createdByGrantId`, `createdByGrantName`, `createdByUser`, IP and user agent. Lower latency than sweeping `organization.events`, and it names *who* and *when*. **Never select `event.data`** — untyped, and a `documentUpdated` can carry both copies of a 65,536-char footer. **Echo suppression matches our own grant ids**, because VERIFIED `createdByGrantId` is populated for human UI edits too and `createdByGrantName` is "JobTread App" for all of them. **`documentDeleted` is a real event type** with a `deletedDocument` stub, so deletion of a customer contract is caught in 60 seconds, not overnight.
- **Tier 2 · content fingerprint, 15 min for open documents.** Re-read `costItems`/`costGroups` paged at 100 (or subtree-scoped via `descendentCostItems`), canonicalize, hash, compare to the hash recorded at publish. Produces a **per-line diff**. Ground truth, because VERIFIED `document` has **no `updatedAt`** — "documents changed since T" is not expressible.
- **Tier 3 · nightly sweep, 02:00.** Orphan hunt over every `DBE1.` `customerOrder` reconciled against the outbox **in both directions**; **cumulative contract-value reconciliation** (§9.2); catalog content-hash refresh; taxonomy refresh; **template footer hash check** (a changed contract footer means published revisions were built on superseded terms — a legal-review alert, not a log line); grant-expiry alarm; webhook health.

**Self-healing:** lost webhook → Tier 1 within 60s. Corrupted cursor → Tier 2 within 15 min. Lost outbox row → Tier 3 adopts by `externalId`. Lost entire local database → Tier 3 rebuilds the mapping from `externalId` alone. **The one thing deliberately not self-healing is a duplicate customer contract:** that always stops and asks a human.

**Template hydration.** VERIFIED: `createDocument` accepts **no `templateId`**, and the footer of `22PBz2nQunqm` IS the DB contract. **A document created naively via API would be a signable contract with no terms in it.** So the push must, in the same transaction, read the chosen template and copy `footer`, `description`, `signatureDisclaimer`, `scheduledDocuments`, `requireSignature` and every `show*` flag **verbatim**, substitute the money placeholders, and store a hash of the template on the revision. `documentTemplate` has **no `taxRate`**, so tax comes from `TaxPolicy`. The footer's `$XXX,XXX.XX` total and six `$XX,XXX.XX` stage placeholders were substituted **by hand** 38 minutes after creation on a real estimate; DB Estimator computes them:

```
Unit-tested to the cent against the real historical footer; part of the MRC:
  total $277,971.02
  →  10%  $27,797.10      20%  $55,594.20      15%  $41,695.65
     25%  $69,492.76      20%  $55,594.20      10%  $27,797.11  ← remainder on the FINAL stage
  Σ == total exactly.  Assertion, not a comment.
```

**Conflict policy: JobTread always wins.** **DB Estimator never overwrites a human edit — not ever, not even when we are confident we are right.** Refusing to overwrite costs an estimator a retype; overwriting means a deliberate human correction silently reverts and goes out as a signed contract. Detection keys on `globalId`: a `dbe1|`-shaped id is provably ours, a line without one provably human-added.

| Drift class | Action |
|---|---|
| Cosmetic (position, collapse state) | Absorb silently, update the fingerprint, log |
| **Enrichment** — human ADDED a line (null `globalId`), or edited description text | Accept as authoritative. Import as read-only "added in JobTread" so a later revision does not drop it. **Never delete a human-added line** |
| **Quantity or price edit on a line we own** | Freeze the revision, mark DIVERGED, surface before/after and who. Three explicit choices, no default: **Accept theirs** (record as an override and **flag the takeoff for re-measurement** — a human overriding our number is the highest-quality signal we will get that our assembly is wrong, and it feeds Phase 8); **Supersede** (revision N+1 as a new document, old marked denied); **Detach** |
| Structural (groups renamed/moved/deleted, our lines deleted) | Treat as a fork. Detach automatically with a loud notification |
| **Lifecycle** — `status` leaves `draft`, a recipient appears, `documentSent` fires, `signedAt` non-null | **HARD LOCK.** Permanently read-only. Zero `updateDocument` calls, forever, regardless of drift |

**`includeInBudget` is NOT a lifecycle trigger.** VERIFIED: it **defaults to TRUE**, and the live in-flight estimate `22PejfgufCkY` has it true while `status` is still `pending`. Using it as a hard-lock trigger would permanently freeze essentially every document DB creates, immediately. VERIFIED: `documentStatus` is exactly `{draft, pending, approved, denied}`.

`updateDocument` is called almost never, and only under **all** of: status still draft, zero recipients, `signedAt` null, fingerprint matches what we published, and the estimator explicitly clicked "update in place" — in practice, a typo caught 30 seconds after publishing. Every field on `existingCostItem` is optional (a sparse patch), implying the array defines the line-item *set*; **the fate of an omitted item is the unknown, and it is why Spike 5 is a hard gate.**

### 7.5 Grants, secrets, blast radius

VERIFIED: the grant in use today is `22PXNFaV6ZW4` ("Access for claude.ai", user Carl Bledsoe), **expiring 2026-12-17 — inside Phase 1.** There is **no `createGrant`/`updateGrant`/`deleteGrant`**, so rotation is a UI action. **Create a dedicated service user**: `event.createdByUser` is non-nullable, so a service user is what makes the audit trail readable, and because every grant displays the name "JobTread App", **matching must be on grant `id`**, with historical ids retained across rotations.

**A live finding worth telling Carl immediately:** the grant currently in use is dramatically over-privileged — `updateCatalog`, `updateOrganization`, `updateCostCode`, `updateCostType`, `updateUnit`, `updateCustomField`, `updateDocumentTemplate`, `updateRole`, `updateMembership`, `updateUser`, `updateWebhook`, `updateWorkflow`. It holds **no delete action of any kind**, which is the good news.

| Grant | Holds | Must NOT hold |
|---|---|---|
| **A · Estimator runtime** (the only one the backend holds) | read* on organization/job/document/costItem/costGroup/catalog/customField/account/file/plan/event, `createCustomerOrder`, `updateCustomerOrders`, `updateDocument`, `draftDocument`, `updateFile`, `createBidRequest` | **`updateCatalog`** — 176,156 cost items depend on 709 catalog rows and a bug there is not cleanly reversible. **Plus `deleteCostItem` and `deleteCostGroup`**, which exist as real root mutations and could gut a pushed contract line by line *without* deleting the document — the "structurally incapable" property fails unless both are excluded. Also no `deleteDocument`, `deleteDocumentPayment`, `deleteDocumentRecipient`, `deleteDocumentReference`, `deleteDocumentTemplate`, `createCostCode`, `updateCostCode`, `updateCostType`, `updateUnit`, `updateDocumentTemplate`, `updateOrganization`, `updateRole`, `updateMembership`, `updateUser`, `updateWebhook` |
| **B · Catalog admin** | adds `updateCatalog`, `updateCustomField` | Human-operated admin tool only. Never the runtime service, never a background job |
| **C · Read-only analytics** | read actions only | The grant a developer gets on a laptop |

VERIFIED: `readCatalogCosts` and `readCatalogPrices` are separate actions from `readCatalog`, so a price-blind viewer role is achievable at the grant level; and `root.whoCan` exposes per-action variants, so the **Layer-0 suite can programmatically prove Grant A's posture.** **The blast radius exceeds data exposure:** `updateDocument.$` can write **`status`** and **`signaturePath`**, so a leak means contract approval and signature forgery, not just disclosure. `grantKey` lives only in a managed secret store; log the grant **id**, never the key; rotation is a rehearsed dual-read runbook, quarterly and on any personnel change, with alarms at 30/14/7 days. **`signQuery`** has **no visible expiry or scope parameter**, so "keep tokens short-lived" may not be enforceable: scope narrowly, log every issuance, never sign a mutation.

### 7.6 Testing without a sandbox, and when JobTread changes

Four layers: **Layer 0** (Grant C, nightly + CI) asserts every premise — stable taxonomy counts on equality, hardcoded ids still resolving, `globalId` still null, **zero `customerOrder`s with a non-`DBE` `externalId`** (scoped to `customerOrder`), the measured markup pairs, Grant A's posture via `whoCan`, and a **schema-shape hash** over the write surface; **counts that drift daily are asserted as monotonic lower bounds, never equality** — all three moved by one during preparation of this document, and a suite that fails nightly gets muted, which is worse than none. **Layer 1** golden fixtures (offline, every PR). **Layer 2** a fault-injecting mock Pave server — the timeout-that-actually-succeeded scenario runs a thousand times here, which you cannot do against production. **Layer 3** one disposable test job with a **compile-time allowlist** (a constant, not an env var — an env-var typo is exactly how someone writes to a real customer's job at 4pm). Teardown is manual, because our grant holds no delete actions; **never build a programmatic mass-delete against their production org.**

**When JobTread changes:** the shape-hash break fires a P1 · pushing **auto-disables via a feature flag, not a code change** · estimators fall back to the documented manual path (export the approved revision to Excel/CSV and hand-enter — today's process, kept rehearsed) · **stated RTO 5 business days**, because it is one developer reverse-engineering someone else's undocumented change · the integration owner holds the **JobTread API Developer Certification** · one breaking change is 40–80 hours, which is the reactive reserve. **And the strategic version: if JobTread ships estimating, or DB leaves JobTread, the bridge value — the largest justification for building — goes to zero.**

**Native capabilities worth using** (all VERIFIED, each replacing something otherwise built): `document.events`; `documentDeleted`; `updatePlan.annotations` (≤1000 vector annotations with `isNegative`, `isClosed`, freedraw or bezier — and `createUploadRequest` accepts the same payload, so per-item markup is structured geometry, not a flattened image); `plan.previousFilePages` (native page-revision lineage); `allowanceType` `{cost, costAndFee, price}` plus `allowanceCostItemId`; native selection groups (`isSimpleSelection`, `minSelectionsRequired`, `maxSelectionsAllowed`, `showChildDeltas`); `document.references` (a CO links its baseline inside JobTread); `costGroup.descendentCostItems`; `documentTemplate.templateName`; `createDocument.$.files` with `copyFromFileId` for server-side copies; `createCostCodeMapping` `{name, costCodeId}`; `document.taxIsLocked`; `root.$.viaUserId`. One thing that does **not** exist as assumed: **`createJob` is a three-step `createCustomer` → `createLocation` → `createJob` chain with no atomicity**, so it needs its own idempotency handling.

---

## 8. Reliability and the trust ladder

### 8.1 The Minimum Reliability Core — a hard blocker on push #1

When a phase slips — and Phase 2b or 4 will — reliability work is what gets cut, and the property Carl asked for disappears while the feature list stays intact. **All 17 items green before any estimate reaches a real customer.**

| # | Item | Evidence required |
|---|---|---|
| 1 | Decimal money end to end | 100% line + branch coverage on `packages/money`; a lint rule bans raw `number` in money positions; `fromJobTread` ingests the literal observed wire values (`8.206999999999999`, `869.9999999999999`, `28.999999999999996`) to exact decimals |
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
| 17 | **Authentication** | **No unauthenticated path to any cost or customer data, proven by test**; MFA enforced for the push privilege and Admin role; session and re-auth policy implemented; login and role-change events in the append-only log (§8.6) |

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
  totals — because that is what DB's 709 catalog rows encode.
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
  Margin input clamped below 100% at the keystroke.
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
  `===` on Money is caught by lint.
```

### 8.3 Scale as a safety interlock

If only one thing here gets built carefully, it is this. A wrong scale multiplies every length by *k* and every area by *k²*, silently: a ¼″ plan misread as 3⁄16″ makes every area 78% of truth. A missed door is one line item; a wrong scale is the whole estimate.

**The number of available detection sources is a property of the page, not a constant.** On a sheet whose text was plotted as SHX geometry there is no dimension string and no room tag, so sources (a) and (c) plus cross-check (iv) do not exist. The UI displays how many were available, and **user two-point calibration is the assumed default path, not the last resort.**

1. **Per-viewport state machine, not a float on the sheet.** `unset → detected → confirmed`, persisted with the detecting source, the confirming user and a timestamp. Per *viewport* because one sheet routinely carries a ¼″ floor plan beside ¾″ wall sections; per-sheet scale is a guaranteed wrong-number bug the first week. A JobTread `plan` is ONE page with ONE `scale`, so this is **not natively representable** there; a pushed plan carries its primary viewport's scale and says so.
2. **Up to five sources, ranked.** (a) **Self-validating dimension string** — find a dimension line whose text was extracted exactly from the vector layer (12'-6"), measure the extension-tick endpoint distance, divide; the drawing told you both the pixels and the feet, so it validates itself. Run on 5–20 strings and require agreement. **Requires a real text layer**, and demotes below (b) if Spike 2 shows a high SHX share. (b) Scale note text by proximity below the view title. (c) Known dimension from a schedule (a 3068 door leaf is 3'-0"). (d) Title-block scale field — frequently stale or "AS NOTED". (e) **User two-point calibration** — always available, final authority. **Do not trust PDF-native scale metadata:** ISO 32000 defines `/Measure` and `/UserUnit`, but Autodesk publishes its own articles stating AutoCAD and Revit PDF exports do not print to scale.
3. **Seven independent named cross-checks, each individually reported.** (i) Door leaf width in 2'-0"..3'-0". (ii) Wall thickness in 3.5"..8". (iii) Stud/joist spacing quantizes to 16" or 24" o.c. (iv) **Computed room area vs the area printed in the room tag** — the best check where tags carry areas, a direct comparison against the architect's own number; its **tolerance is set by Spike 4's measured drafting-fidelity distribution**, not an arbitrary 2%; requires extractable text. (v) Computed footprint vs gross SF in the title block. (vi) Sheet-geometry plausibility (a derived scale implying a 400' residence is rejected outright). (vii) **Cross-sheet consistency within 1%** — disagreement means one of two scales is wrong and you cannot tell which, so you stop and ask. **Checks (ii), (iii), (v) and (vi) are pure geometry and work with zero extractable text**, which is why the interlock survives a bad Spike 2 result.
4. **Graded, named feedback — not a score.** Green <1% / amber <5% / red, per check, in plain language: "3 doors measure 4'-2" — expected 2'-0" to 3'-0"". A single aggregate confidence number teaches nothing and is ignored within a week.
5. **Never auto-apply.** Detect, cross-check, propose, require a human click — one per viewport per revision.
6. **Database-enforced, not UI-enforced.** A view exposing only confirmed viewports plus a check constraint is the ONLY thing the quantity layer can read. **Re-confirm on every revision upload** — letting a Rev 3 set silently inherit a Rev 1 scale is how this fails in production.

### 8.4 Falsifiable gates

"Reproduce to the cent, with every unreproduced line explained in writing" always passes, because the explanation clause swallows the criterion. A "register signed by Carl" is not a criterion either. Both are replaced with caps.

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

### 8.6 Tax, legal surface, authentication, coverage

**Tax.** VERIFIED: **80,462 cost items are taxable, 18,602 on `customerOrder` lines, and 60 documents carry `taxRate` 0.0725 — including `customerOrder` documents named "Estimate."** Hardcoding zero under-bills Ohio sales tax on a real subset of work, and `documentTemplate` carries no `taxRate`, so it cannot be inherited. **CPA sign-off is a blocking decision, not a formality:** which project types, contract types and cost types are taxable, at what rate. A versioned `TaxPolicy` carries `materialTaxTreatment ∈ {embedded_in_unit_cost, separate_line}`, `purchaseTaxRate`, `customerTaxRate`, `nonRecoverableTax`, and **`defaultLineIsTaxable` set per project type rather than globally false**; every estimate pins a `tax_policy_version`; **purchase tax under `embedded_in_unit_cost` must never also produce customer tax on the same line**; `taxRate` is validated as a fraction in [0,1] at the boundary. **Also ask the CPA** about **ASC 350-40** capitalization, useful life, and the impairment consequence at each gate this plan invites you to stop at, and **§174** / R&D-credit treatment versus a deductible subscription. **Warn Carl in advance that asking about construction-contract sales tax may surface historical exposure.**

**Legal (8 lawyer hours), four questions not one:** (1) is a document created via API, with a programmatically copied footer and computed payment amounts, a valid contract? (2) **What happens when it is valid and wrong?** — review general liability and any E&O coverage for exclusions bearing on automated pricing, notify the carrier that pricing is now machine-generated, and **draft a clerical-error / mutual-mistake correction clause for the Estimate footer** before push #1. (3) **Plan-data licensing** (§10.4). (4) Insurance-restoration retention obligations. Plus: **Carl states, in writing, the dollar exposure DB will absorb from a tool-caused pricing error and the threshold at which the trust ladder auto-demotes** — one 3% mispricing on a $278K job is $8.3K, a systematic markup-basis bug across a quarter is an order of magnitude worse, and an SLO with no stated consequence is a wish. And **a rough-order-of-magnitude sanity gate**: block push when an estimate's total deviates more than X% from an assembly-independent ROM check, which catches the class of error that is arithmetically consistent and completely wrong.

**Authentication** — absent from most first-pass designs, and a hole under the words "professional grade" in a system holding DB's complete cost book, 3,550 customer records and insurance claim data. **Google Workspace SSO** (DB is already on Google), no local passwords · **MFA mandatory** for the push privilege and Admin role · stated session lifetime with **re-authentication required for approval and push specifically**, the two irreversible actions · managed-device enrollment for the field iPad or no authenticated session · **login, logout, role change and privilege grant all land in the same append-only hash-chained log**, with `estimate_event.actor_id` a FK to a real account table · a documented offboarding checklist (SSO revocation, session invalidation, JobTread grant rotation, device wipe) · **MCP server authentication named explicitly** — a read-only surface holding the entire cost corpus, authenticating as a specific user with a scoped token, not as the application.

**Coverage — who an estimator calls at 4pm on bid day.** "Extremely reliable" promised against one developer, no rotation, and no answer for vacation or resignation during bid week is not a plan. Required: **a one-page, estimator-executable degraded procedure** (how to get approved numbers into JobTread by hand — today's process), built in Phase 3, rehearsed at cutover, **re-rehearsed quarterly**, and doubling as the JobTread-break and abandonment-drill procedure · **a named secondary**, most cheaply a retainer with the Phase 0 contractor · **a leave blackout** during the two weeks Carl names as the worst estimating period of the year · **hypercare defined** as a stated triage commitment for a named severity class during a named two-week window · and **availability measured by an external prober or not measured at all.**

**SLOs, and which are commitments.** Commitments with zero tolerance: pushed document matches its approved revision field-for-field (one breach = postmortem in 48h + regression test + one-stage demotion if it reached a customer); zero duplicate documents; zero confirmed losses of committed work; zero unexplained nightly recompute deltas > $0.01, where "explained" requires a countersigned classification; zero silent push failures. Targets, not commitments: 99% push first-attempt success; p99 < 3s durable commit; p95 < 300ms full recalc on a 500-line estimate. And stated honestly: **99.5% business-hours availability is a target, not a commitment** — one developer, no on-call rotation, and the only monitor described is an internal canary that **cannot observe an outage taking the whole system down.**

**Testing strategy.** Deliberately lopsided: **~70% of test effort on pure-function correctness, 20% on the JobTread boundary, 10% on E2E**, enabled by the engine being a pure library with zero I/O. CI gates to merge: typecheck · lint (no-floats-in-domain, no-`===`-on-Money) · unit · property (~2,000 cases each, shrunk cases promoted to named tests permanently) · golden · recorded-cassette JobTread contract · **pdf.js operator-list golden** · E2E (8–12 scenarios, not more — E2E suites rot and get muted) · projection-rebuild equality. **Coverage is reported but not a gate, except `packages/{money,units,assemblies,estimate}` and the payload builder, held at 100% line and branch.**

---

## 9. Domain model

Eight entities daily GC workflow requires and that a first-pass design typically omits. All Phase 2a or 2b.

```sql
-- §9.1 Lead-stage (unbound) estimates. GCs bid work that never becomes a job.
create table estimate (
  id                   uuid primary key,
  kind                 text not null,        -- 'base' | 'change_order' | 'alternate_set'
  contract_type        text not null default 'lump_sum',
      -- 'lump_sum' | 'unit_price' | 'time_and_materials' | 'cost_plus_fee'
      -- | 'carrier_schedule'   — only lump_sum is implemented; §9.9
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
-- An estimate is legal and fully priceable while unbound: APPROVAL IS ALLOWED,
-- PUSH IS BLOCKED. Binding selects a real job (never by name matching -- 3,550
-- accounts with known duplicates) or creates one via the three-step
-- createCustomer -> createLocation -> createJob chain, which has NO atomicity.
-- A lost bid is marked lost with a reason. WE NEVER DELETE.

-- §9.2 Change orders. Where margin is made or lost.
create table change_order (
  id                   uuid primary key,
  estimate_id          uuid not null references estimate(id),  -- kind='change_order'
  job_id               text not null,
  baseline_revision_id uuid not null,   -- the accepted base this CO amends
  jt_reference_pushed  boolean not null default false,
      -- JobTread natively supports document->document references, so the CO
      -- links its baseline INSIDE JobTread and a PM sees what it amends
  co_number            int  not null,   -- sequential PER JOB, gapless, at approval
  reason               text not null,   -- customer request | field condition
                                        --   | plan revision | allowance reconciliation
  markup_rule_set_id   uuid not null,   -- CO markup is often higher: explicit, recorded
  source_allowance_id  uuid,
  unique (job_id, co_number)
);
-- contract_value(job) = accepted_base.price + Σ accepted_co.price, COMPUTED.
-- The base revision is NEVER mutated to "include" a CO.
-- BUT JobTread is AUTHORITATIVE for contract value and we are not: its statuses
-- and rollups move without us, and a signed base is permanently read-only to us
-- while humans keep acting on it. The nightly sweep reconciles our computed value
-- against JobTread's accepted customerOrder set and alerts above DOC_EPSILON.
-- We DISPLAY contract value as a mirror with a staleness stamp, never as our own
-- figure. Two systems showing two contract values with no stated authority
-- between them is the opposite of one direction of truth.

-- §9.3 Allowances. JobTread already models the central question with three
-- values; a local includes_markup boolean silently drops 'costAndFee'.
create table allowance (
  id                   uuid primary key,
  line_item_id         uuid not null references line_item(id),
  --   'cost'       = a cost budget, marked up to a customer price
  --   'price'      = the customer-facing price, margin already inside
  --   'costAndFee' = cost plus a stated fee
  jt_allowance_type    text NOT NULL,        -- ← NO DEFAULT. Maps 1:1 to allowanceType.
  fee_pct              numeric(19,6),        -- required iff 'costAndFee'
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

-- §9.7 Contingency: a named, reportable, RELEASABLE amount, never a hidden
-- multiplier. Reported SEPARATELY from markup everywhere, and EXCLUDED from
-- §8.4's markup-reproduction gates.
create table contingency (
  id                  uuid primary key,
  estimate_id         uuid not null references estimate(id),
  scope               text not null,        -- 'project' | 'phase' | 'line'
  scope_ref           text,
  basis               text not null,        -- 'pct_of_cost' | 'pct_of_price' | 'lump_sum'
  rate                numeric(19,6),
  amount              numeric(19,4),
  customer_visible    boolean not null,
  release_rule        text not null,        -- 'credit_at_closeout'
                                            --   | 'change_order_on_consume' | 'absorbed'
  consumed_amount     numeric(19,4) not null default 0,
  constraint rate_or_amount check (num_nonnulls(rate, amount) = 1)
);

-- §9.8 Final-price adjustment: THE ONLY sanctioned way to move a bottom line
-- without changing scope. Without it, estimators hit their number by nudging
-- line quantities -- which destroys the audit trail the project exists to build.
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
  allocation      text not null,      -- 'unallocated_single_line' (default, honest)
                                      --   | 'prorated_customer_view'
  created_at      timestamptz not null default now(),
  constraint mode_fields check (
    (mode='delta_amount') = (delta_amount is not null) and
    (mode='target_price') = (target_price  is not null))
);
-- Under 'prorated_customer_view' the customer sees the adjustment spread across
-- groups while the UNDERLYING LINES STAY UNTOUCHED. Surfaced on the approval gate
-- with its dollar AND margin impact. EXCLUDED from Phase 8 variance attribution,
-- so a competitive discount never pollutes a learned rate.

-- §9.9 Duration: without it, the largest indirect-cost block (general conditions)
-- is a typed-in guess with no provenance inside a system premised on provenance.
create table phase_duration (
  estimate_id     uuid not null references estimate(id),
  phase_path      text not null,
  weeks           numeric(19,2) not null,
  derivation      text not null,      -- 'entered' | 'from_labor_hours'
  crew_size       numeric(19,2),      -- required when derivation='from_labor_hours'
  primary key (estimate_id, phase_path)
);
-- Derived = Σ labor hours ÷ (crew_size × 40), shown as provenance like any other
-- quantity. Phase 1 mines ACTUAL durations from timeEntries date spans to seed
-- crew sizes. Phase 8 adds a DURATION variance alongside quantity, price, scope.

-- §9.5 Event log: append-only. The app role has INSERT + SELECT only.
create table estimate_event (
  id           bigserial primary key,
  aggregate    text  not null,
  aggregate_id text  not null,
  seq          int   not null,
  actor_id     uuid  not null,       -- FK to our own account table, never an email
  occurred_at  timestamptz not null default now(),
  type         text  not null,       -- includes auth events: login, role_change
  field_path   text,
  before       jsonb, after jsonb,   -- money as decimal STRINGS, never floats
  reason_text  text,
  source       text  not null,       -- ui|assembly|recalc|planRevisionIngest
                                     --   |jobTreadSync|ratePublish|auth|vendorMeasure
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
  pins          jsonb not null,
  totals        jsonb not null,      -- from STORED line values, never re-derived
  content_hash  bytea not null,
  sealed_at     timestamptz, sealed_by uuid,
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

**A revision is a full pinned snapshot, not a diff.** Publishing a new rate table, correcting an assembly or fixing a unit mapping can **never** retroactively change a number the customer already saw. A nightly replay test re-derives the last N revisions from their pins and asserts identical totals — **if replay diverges, something non-deterministic entered the engine and we learn it from CI, not from a customer.** That test is a release gate.

**Allowance rules.** `jt_allowance_type` has no default, deliberately: a stated $4,500 appliance allowance is either a cost budget marked up to $6,525 at ×1.45, or the customer-facing price with a $3,103 cost budget inside. **Leaving it implicit leaks margin on every selection, invisibly, because the number the customer remembers is the same either way.** **Hard invariant at the approval gate:** a `material_only` allowance requires a sibling labor line in the same group that is *not* part of the allowance, or the gate blocks — the "tile allowance with no setter" failure. **Allowance reconciliation drafts a change order; it does not mint one:** it creates a task and a draft CO in `lead`/`draft` status with the delta pre-populated, entering the same approval gate, and a test proves it cannot produce a pushed document without an approval event. Every estimate reports **total allowance exposure in dollars and as a percentage of contract value** — a job that is 22% allowances is not a fixed-price job in any meaningful sense.

**Escalation and bid validity.** `valid_until` is required on every issued revision (default 30 days) and **surfaced in the proposal alongside the payment schedule**; an approval-gate blocker fires when any pinned rate's source-data median age exceeds a Carl-set threshold; and `escalation_pct_month` applies from `expected_start_date` as an **explicit, separately reported adjustment** — never folded into markup, contingency or waste. DB's own contract footer already contains a §5.2 material-escalation clause above 5%, so this is their existing commercial position.

**Crash recovery.** Phases 2–3 are server-authoritative: autosave per *intent* (a completed field edit, a blur, a line edit, a drag-reorder), free text debounced 400ms, hard flush on `blur`/`visibilitychange`/`pagehide`, and a visible "N unsaved changes / save now" indicator, always — estimators will not trust an invisible mechanism. Phase 4c adds a real IndexedDB write-ahead log: every intent becomes an op with a client ULID appended **before** it touches React state, the server dedupes on op id, and a conflict presents a **recovery screen listing affected ops with their values** — never silently discarded, never silently applied.

### 9.4 Assembly definition format

Authoring inputs, in priority order: (1) the Spike 6b workbook specification — DB's actual estimating logic; (2) DB's **101 live catalog `quantityFormula` rows**; (3) Phase 1's statistical discovery over 46,248 cost groups.

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

**Build the DSL when — and only when — one of these is true:** a non-developer must author or edit an assembly without a deploy; the count exceeds ~40; or an assembly needs versioning independent of a release. Three properties hold either way: **outputs declare BOTH a phase path and a cost code** (DB's estimates are a construction-sequence phase tree while cost codes carry the CSI-ish classification — orthogonal, and collapsing them makes our output unrecognizable to their estimators); **an output's `alias` is immutable forever**, because overrides, actuals matching and `globalId` generation all key on `(assemblyInstanceId, alias)`; and **taxability resolves from `TaxPolicy`, never hardcoded.**

---

## 10. AI strategy

Accuracy is **split by what the file contains**, because one blended number across two input classes oversells one and undersells the other.

| Rung | Capability | Realistic accuracy | Phase |
|---|---|---|---|
| 1 | Vector **geometry** extraction (pdf.js operator list) | **Exact on every vector-authored page.** Residual error is drafting fidelity, not model error (Decision 21) | 4b |
| 1b | Vector **text** extraction | **Exact where the exporter emitted real text operators** (Revit/TrueType). **Zero where text was plotted as SHX stroked geometry** (common in AutoCAD) — no text layer exists to read, with no runtime warning beyond an empty layer | 4a |
| 1c | **Layer classification from PDF OCGs** | **Exact where OCGs survived export** — classifies walls, doors, dimensions and annotation with no inference, and works on poché walls where stroke-width clustering fails outright | 4b |
| 2 | Sheet classification, title-block / index parsing | **~99% on text-bearing sheets** (real text at known coordinates, not OCR). **80–90% on clean 300+DPI scans, worse degraded.** Failures benign and visible | 4a |
| 3 | Scale determination and verification | **90–95% correct pre-filled proposal on text-bearing sheets; 50–70% on stroked-text sheets** using the four pure-geometry cross-checks. **100% require one human confirmation click** | 4b |
| **4** | **Snap-assisted manual takeoff on harvested geometry** | **Exact** — the measurement *is* the drawing's geometry. Zero model error, zero per-sheet cost | **4b** |
| 5 | **User-seeded** symbol counting | **Exact where the exporter instanced; 85–95% recall with reviewable false positives where it did not.** Many Revit/AutoCAD paths flatten repeated symbols. False positives concentrate in dimension lines, leaders and notes — the error source the one independent study identified | 6 |
| 6 | Schedule / legend / tag extraction incl. **wall types** | **Near-exact on text-bearing vector sheets** — ruling lines are real vector rects, cell contents real text: a **spatial join between two exact datasets, not recognition.** **85–94% per field via a purchased OCR adapter on scans** | 6 |
| 7 / 8 | Assembly expansion; JobTread integration | Deterministic, auditable | 2a / 2b |
| **9** | **Room area — READ THE PRINTED ROOM-TAG AREA** | **Exact where tags carry areas**, and it is the *same number the architect will cite in a dispute* — a stronger position than our own recomputed polygon | 6 |
| 9b | Room **perimeter**, area for **untagged** spaces (wall-graph reconstruction as a drafting aid) | **60–85% of rooms clean, failures concentrated in open-plan areas where the dollars are.** Dangles and cut edges surface as "enclosure broken here" markers. **No accuracy claim is promised to Carl** | 6 |
| 10 | Wall linear footage with **type** | **No accuracy claim, because none is computable.** Junction resolution has no objective ground truth: two competent DB estimators differ by 2–5% and both are correct by their own convention. Deliverable is the graph overlay. **First, DB's junction convention is written down and encoded as the measurement rule** — internal consistency is what Beam's ±1% guarantee actually measures | 6 |
| 11 | Model mapping of features to assemblies | **80–90% top-1 on familiar work**, presented as **top-3 with rationale**, with the accept UI showing **the resulting line count and dollar value** — an estimator will accept "Interior Partition" but not "11 lines, $14,280" on a closet | 6 |
| 12 | Natural-language plan/spec query | **85%+ useful for *locating*; unreliable for quantities.** Coverage, not accuracy, is the limit | 6 |
| 13a | **Sheet-index / addendum set diff** | **Near-exact, nearly free.** Catches *added scope*, the failure nobody detects because nothing looks stale | **4a** |
| 13b | Geometric revision comparison | 70–85% detection recall; **delta quantification much worse, and the deciding number is the false-positive rate.** Gated on measured **precision** | 5 |
| **15** | **VLM reading a drawing image to produce a measurement** | **Unusable, and the 2026 benchmark record is not improving.** The best method places only ~31% of predictions within a 0–40% error margin while **over a third exceed 100% error**; frontier VLMs fall below 60% on structured scientific diagrams, with engineering diagrams strictly harder; 2026 studies across 37 VLMs find systematic egocentric bias and weak rotation comprehension. Distance, length and scale are their *weakest* categories — while text-only spatial reasoning scores ~93% | **never** |
| **16** | **Generative estimate with model-produced quantities** | **No defensible error bound.** Errors arrive as a tidy, confident, professional line-item list with no visible defect | **never** |
| **17** | **Unattended takeoff → signed contract** | Not achievable. Attentive.ai raised ~$48M, reached ~$58M revenue, and chose ~526 employees over closing the gap with models | **never** |

**Rung 15's asymmetry is the design principle:** models reason well about coordinates handed to them and badly about coordinates they must read off a picture. **And it is not narrowing** — so a future model release is not a reason to revisit rung 15, whereas a future *extraction* improvement is a reason to revisit rungs 1–6.

```
The language model FINDS and CITES.  The geometry engine COUNTS and MEASURES.

Enforced in code, not in a prompt:
  • Numeric questions route to generated SQL over extracted quantity tables
  • The model gets TOOLS that return numbers; it may not emit a computed number
  • Structured output requires a source_id on EVERY numeric field
  • The backend VALIDATES that each source_id exists AND that the number matches
    the tool result byte-for-byte, and rejects-and-retries otherwise
  • The answer renders the SHEET ID and COORDINATE beside every number, with
    click-through. Byte-matching proves the number is real; it does NOT prove the
    right result was cited, so a model can return a true number from the wrong
    sheet. The coordinate closes that hole cheaply.
  • The estimate schema has no writable path from the model layer to a quantity field

A prompt instruction is not a control. This validation loop is the control.
```

**Per-category gating.** Each category is enabled independently, never globally, and only after **n ≥ 30** benchmarked against human takeoff on DB's own sheets; **dollar-weighted MAE ≤ 2%**; **max error ≤ 5%**; **mean *signed* error within ±0.5%**. A rolling 20-sample MAE breach **auto-demotes** to proposal-only. MAE is dollar-weighted because 2% across twenty rooms is meaningless if the error sits in the largest one, and **the ground-truth budget is real** — 8–12 estimator hours per category, so ~50–70 hours per category benchmarked. **A category with no funded ground-truth budget does not ship.**

**Accept-time safety checks, built before the thing they check:** a coverage map shading regions no accepted measurement covers (how you notice the model missed the pantry); a per-room area band check against DB's own historical distribution; a sum check of accepted room areas against the exterior-wall footprint. They fire **in the tray at accept time**, not at the approval gate three hours later. **The proposals store is schema-incapable of contributing a quantity**; suggestions render dashed in a reserved cyan; bulk accept shows a manifest, requires the estimator to have cycled the sheet, and is **one atomic undo**; every accept records model version, confidence, raw geometry and the accepting human, filterable so a reviewer can spot-check exactly the bulk-accepted set.

**The limit of the accept gate, stated plainly:** it catches **visible** failures — a wrong count mark, a misread schedule row — which is why Decision 16 sequences those first. It does **not** catch silent ones: a fused room polygon, a skipped opening back-out, or a plausible-but-wrong assembly mapping all render as clean professional output. **A category whose failures are silent and whose accept-time check is not built does not ship.** Applied honestly, that removes automatic room segmentation entirely — which is what rung 9 does by reading the tag instead.

**Privacy and plan-data licensing.** **Plans MAY go to a model provider under zero-retention terms. DB's cost data NEVER does** — unit costs, prices, margins and vendor names are stripped before any external call, every call is gated behind a per-job toggle writing an audit event, and a self-hosted OCR path stays alive for restoration sets carrying homeowner PII. Model spend is trivial (a realistic 100-sheet set is **under $2**), which makes the discipline free rather than a trade-off. **Licensing is a different question:** architect-issued drawings are copyrighted works normally licensed for construction of that project only, and this plan permanently stores originals, **generates derivative works** (tile pyramids, harvested geometry, extracted schedules), **ships sheet images to an external provider**, and **attaches annotated crops to JobTread cost items that go to customers.** Required: `plan_set.license_terms` and `plan_set.external_processing_permitted` set at ingest, **defaulting to false**; a documented retention and purge policy; and an indemnity clause in DB's own subcontract and owner agreements.

---

## 11. Roofing seams — and the honest date

**On this sequence, roofing estimating is a 2029 deliverable.** Carl said "then we will discuss roofing"; the discussion should start from that date, not a phase number in a table. Deferring the roofing *engine* is right on the evidence — **VERIFIED, DB already pays HOVER $58.99–112.61/job and CANVAS $0.40/SF**, so exteriors have a working commercial answer while interiors have none, and roofing's markup structure (×2.33–2.65 warranty adders vs ×1.450 materials) would make the Phase 3 parallel run unreadable.

**But seam 8 should not wait.** The vendor-measurement adapter needs no canvas, no geometry and no AI — ~1–2 dev-weeks — and it makes roofing and exterior estimating usable through the same engine, assemblies, approval gate and push **years earlier.** It moves to **Phase 2b.**

1. **Trade dimension from day one.** `assembly.trade` + `allowed_project_type_prefix`, keyed to DB's existing fields: Job Type has exactly two options (Roofing, Construction) and every Project Type is prefixed `C-` or `R-`. Roofing becomes a **data addition**, not a code change.
2. **`Square` = exactly 100/1 ft²** as an exact rational in the Phase 2a unit table, with its real JobTread unit id.
3. **`roofFacet` measurement kind with a REQUIRED pitch attribute**, declared in Phase 4b even though no roof is measured.
4. **`projectedArea` vs `surfaceArea` as a type-level distinction.** Binding a plan-projected roof area into an input declared as surface area is a **compile-time and publish-time error.** The seam that matters most: treating plan area as surface area understates by 11.8% at 6/12 and 41.4% at 12/12 — plausible numbers, catastrophic bid.
5. **`SLOPE_FACTOR(pitch) = sqrt(1 + (rise/12)²)`** ships in Phase 2a as a dimensionless multiplier.
6. **Item-scoped packaging, not global conversions.** `PACKS(quantity, catalogItem)` resolves through that item's `PackageSpec`, so shingle bundles-per-square being product-specific needs no new mechanism.
7. **Roofing markups stay quarantined as item-level rules.** The markup engine resolves by most-specific selector (item > cost code > cost type), so roofing enters as rows and cannot distort interior pricing.
8. **A vendor-measurement adapter — implemented in Phase 2b.** `measurement.method` includes `vendor_report`. **For most roofs that is the honest answer: buy the geometry for $59, own the pricing.**
9. **`estimate.contract_type`** with only `lump_sum` implemented and approval blocked on every other value. Restoration is carrier-schedule or cost-plus; service repair is T&M. Both exist in DB's business today.

**Travelling with roofing, not before it: insurance restoration.** The Insurance Restoration Agreement template and the job custom fields already exist. Two things are honoured now: restoration observations are **cohorted separately** in Phase 1's mining, because carrier schedules are a different pricing regime and blending them corrupts both cohorts; and restoration plan sets carry homeowner PII, which is why the self-hosted OCR path stays alive.

**Phase 9's real exit criterion is the seam test:** roofing must ship without changing `packages/money`, the JobTread write path, the approval gate or the scale interlock.

---

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation | Kills project? |
|---|---|---|---|---|
| **The senior developer is never hired, or the FTE is not sustained** | **High** | Fatal — a half-built canvas has zero value | Hiring is a **Gate 0 criterion with 10 weeks of calendar and a budget line.** Phase 0 is done by a short-term contractor. Every phase boundary is a stopping point. **Plus a named secondary on retainer and a leave blackout** | **Yes** |
| **The project never ships** — beautiful canvas, no push, everyone returns to the spreadsheet | **High** | Total loss + organizational scar tissue | The entire sequencing: usable read-only tool at week 24, real push at week 48, the old path fully open forever with one-click Excel export. **The annual abandonment drill proves it (§13.1)** | **Yes** |
| **Estimator abandonment** — lost work, an unexplainable number, slower at the fifty-times-a-day task | Medium | Fatal — adoption cannot be mandated; tools get bypassed under deadline | The causes treated as engineering requirements (autosave, provenance chips, permanent Excel export, defined hypercare). **Gate 3 trains every estimator and requires a cold-start documentation test.** Phase 4 fails if takeoff is slower than today | **Yes** |
| **Bus factor of one** | **High** | Severe, growing annually | ADRs superseded not edited; golden + parallel-run suites as executable specifications; machine-enforced package boundaries; CODEOWNERS on `money` and `geometry`; **a named year-3 maintenance owner is a Gate 0 criterion**; **the annual takeover test is funded and specified** | **Yes** |
| **A wrong number reaches a customer as a signed contract** | Medium | Severe — financial loss, permanent loss of confidence, **and a liability question** | Six layers: the scale interlock in the database; measurement/quantity separation; the MRC; the hard approval gate; the ROM sanity gate; the trust ladder with written demotion triggers. **Plus E&O review, a scrivener's-error clause, and Carl's written statement of absorbed exposure** | No |
| **Phase 4 overruns past 30 weeks** | **High** | Severe — burns budget and goodwill | 24 dev-weeks in **three independently shippable slices.** Scheduled at 1.25x AI assistance, openly. **Spike 3 measures clipped sub-rectangle rendering, because pdf.js has no canvas tiling and the pyramid is the hidden 3–5 week item.** 25 hours of senior graphics review **before the coordinate model hardens.** **Phase 3 being live means an overrun is disappointing, not fatal** | No |
| **Catalog reconciliation stalls on Carl's calendar** | **High** | Severe — everything downstream prices off unreconciled data | Spike 8 counts the decisions first. **Workstream C is its own dated phase with no developer dependency.** **The 709 are split by trade FIRST and Gate 1 is stated against the C-scope subset only** | No |
| **Duplicate customer contract from a retried push** | Low | **Catastrophic — legal, not just financial** | The §7.3 state machine with 20/20 fault injection as an MRC item. Uniqueness enforced by us because server enforcement is UNVERIFIED. Nightly orphan sweep both directions **plus 60-second `documentDeleted` detection.** Grant holds no delete action | No |
| **Tax is wrong on a customer document** | **Medium–high if not engineered against** | Severe — under-billed tax is DB's to eat, and it compounds silently | **80,462 taxable items and 60 documents at 0.0725 exist today.** `TaxPolicy` versioned and pinned per revision; `taxRate` validated as a 0–1 fraction at the boundary; CPA sign-off is a blocking MRC item | No |
| **Create-time defaults corrupt a customer document** | Medium if not engineered against | Moderate–severe; lands in front of a customer | Typed payload builder where **all 13 dangerous-default fields are required by the type system**; post-push read-back assertion; payload snapshot tests. `showQuantity` and `showChildCosts` default TRUE while DB's own template sets them FALSE | No |
| **JobTread-side edits diverge invisibly** | **High that it happens** | Moderate–severe | `document.events` tail + content-hash diff + **mandatory** nightly sweep + self-write filtering **by grant id, because `createdByGrantId` is populated for human edits too.** JobTread always wins; divergence stops and asks | No |
| **Our writes break DB's own services, or reach QuickBooks** | Medium | Moderate–severe, and lands as a mysterious failure | **VERIFIED: 4 webhooks. Two fire on `documentCreated`, three on `documentUpdated`** — push #1 hits at least two DB-owned services immediately. Spike 9 reads every handler and gets an explicit namespace skip **before push #1** | No |
| **JobTread ships estimating, or DB leaves JobTread** | Low–medium over five years | **Severe — the bridge is the largest justification for building, and its value goes to zero** | No mitigation is available, and pretending otherwise would be dishonest. Confine the coupling to `packages/jobtread` behind an interface so the engine survives, and re-test the justification at every gate. **If DB is considering leaving JobTread, this project should not start** | Effectively **yes** |
| **A JobTread breaking change with no notice** | Medium | Moderate–severe — pushing stops mid-bid-week | Break → P1 → push auto-disables by feature flag → rehearsed manual path → 5-business-day RTO. Named certified contact. **$10–15K/yr reactive reserve, separate from maintenance** | No |
| **Grant expires or is revoked mid-bid-week** | Medium | Moderate — pushing stops | Alarms at 30/14/7 days (**expires 2026-12-17, inside Phase 1**); rehearsed dual-read rotation; historical grant ids retained. **The grant in use today is heavily over-privileged and holds `updateCatalog`** | No |
| **Vector census comes back low, or text is unextractable** | **Medium** | Moderate–severe — removes the Phase 6 advantage and demotes the best scale source | Spike 2 measures **four axes.** Low vector → stop at Gate 3 and buy detection. Low text → source (a) and cross-check (iv) demote, OCR work moves forward, and Gate 4's speed criterion is renegotiated **before** Phase 4 starts | No |
| **Automation bias on AI suggestions** | Medium–high once extraction ships; **worsens as the model improves** | Severe — the silent-error class | Separate proposals store; reserved colour; manifested, atomically-undoable bulk accept; **accept-time checks built BEFORE the features they check**; per-category gates with auto-demotion. **Gated ML is cut precisely because its failures are silent** | No |
| **The audit trail is destroyed by estimators nudging line items to hit a number** | **High — it is what people do** | Severe — silently defeats the provenance chain the project exists to build | **§9.8 `price_adjustment` is the sanctioned mechanism**, with a closed reason list, a named author, and underlying lines left untouched | No |
| **Nobody verified what STACK actually costs** | **High unless Spike 1b runs** | Moderate–severe on the decision itself | Two phone calls in Phase 0, owned by Carl | No |
| **The contractor walks away with DB's cost book** | Medium if no agreement is signed | Severe — the pricing corpus is the asset the build case rests on | **A signed contractor agreement is a Gate 0 criterion and a prerequisite to Monday action 3**: IP assignment, confidentiality, data handling, a narrow 12-month non-compete, and repo custody in DB's own GitHub org from commit one | No |

---

## 13. What could kill this project

1. **Spike 0 succeeds.** If STACK feels good on DB's real plan sets and a throwaway script pushes its export into JobTread as a nested `customerOrder`, the right answer is buy plus glue: $8–15K/yr and ~14 dev-weeks instead of fifteen months. The most likely kill condition, and why Spike 0 runs before any product code.
2. **Spike 2b succeeds.** If Togal clears the §10 thresholds on DB's own sheets, Phase 6's extraction — ~$91K — should not be built. A ~$300 trial settles it.
3. **Carl is the developer.** Fifteen to twenty-four months of the highest-leverage hours in a company running 3,987 jobs, diverted. If there is no budget for a contractor or hire, buy.
4. **There is no year-3 maintenance owner.** If the honest answer is "nobody," do not start. A subscription's maintenance burden is a credit card.
5. **No estimator will commit 4 hours a week.** Without a named design partner who has agreed in writing, this becomes a developer's theory of how estimating works — subtly wrong in ways that surface only as distrust.
6. **The vector census comes back below 30%** — or shows DB's architects plot text as SHX geometry, or draw hatched/poché walls, either of which silently breaks the mechanisms Phases 4b and 6 are built on.
7. **Spike 6 fails.** If DB's pricing is genuinely case-by-case rather than rule-shaped, formalizing it is a months-long elicitation in Carl's head, not a mining project.
8. **The real bottleneck is somewhere else.** If DB's constraint is lead flow, sub coverage or production throughput, a faster estimate produces nothing. Spike 1 tests this.
9. **Insurance restoration turns out to be most of the interior work.** Different pricing regime, different incumbent (Xactimate), smaller corpus.
10. **DB is considering leaving JobTread, or JobTread is building this.**
11. **Zero tolerance for a bad quarter.** There will be a Tuesday where a plan set breaks something STACK would have handled. If DB cannot absorb one bad week during transition with the spreadsheet as fallback, buy the decade of hardening.
12. **The motivation is the subscription cost.** Five-year TCO is $626K–$1.08M against $45K plus re-keying.
13. **Scope discipline collapses.** A build landing at 80% of STACK's takeoff quality plus perfect JobTread integration is probably the right trade; 40% in two years is strictly worse than the subscription — and the difference is staffing and scope discipline, not technology.

**Building is clearly right under six conditions:** a named developer who is not Carl; a named maintenance owner; a named estimator design partner with calendared hours; H × N above ~$20K/yr **or** a measured margin case above ~$30K/yr; a budget that can fund the P80; and a genuine willingness to stop at a gate.

**The bus-factor test, specified rather than intended:** annually, pay an outside developer 8 hours to implement one defined small change from the repo, ADRs and runbooks alone, with zero access to the incumbent developer. **Pass = a merged PR with green CI inside the 8 hours.** Gaps it exposes become documentation work items. ~$1.5K/yr.

**Infrastructure exit criteria:** move to AWS ECS/RDS when any of — more than ~15 named users; a compliance or insurance requirement naming specific controls; sustained CPU spend where Graviton is materially cheaper; a genuine need for VPC-level isolation; or two provider incidents in one quarter that cost estimating time.

### 13.1 Wind-down — how to stop

- **The Abandonment Drill.** Once in Phase 3 and **annually thereafter**: disable the app for one business day and produce one complete bid the old way, timed and recorded. Same procedure as the coverage fallback and the JobTread-break fallback — one rehearsed procedure, three uses. **A Gate 3 exit criterion.**
- **The export bundle.** Monthly, versioned, off-provider: a Postgres logical dump, **a human-readable schema document** so a third party can read the dump without the codebase, every plan set, and **every sealed revision rendered to PDF with its pins and provenance intact.** Generated and verified readable once as **MRC item 12**, then monthly.
- **The no-lock-in rule.** Through Gate 3, **no estimating capability may exist only inside DB Estimator.** Anything not reproducible in Excel is out of scope until the tool is authoritative and proven. This is what makes every gate a genuine stopping point rather than a one-way door.

---

## 14. Staffing and the client-time budget

| Role | Commitment | Notes |
|---|---|---|
| **Senior full-stack engineer** | Full time, 15+ months | **The binding constraint and the hire Carl does not have.** Must personally own the decimal money engine, the geometry kernel and coordinate model, and the JobTread sync state machine. Must be willing to build Phases 1–2a with little to demo — a developer who needs a visible demo every two weeks will not survive Phase 1, and Phase 1 is where correctness is won. **Must not be Carl.** Budget 8–10 weeks of search and a premium over $150/hr |
| **Phase 0 contractor** | 10 weeks, then retained | Far easier to buy than a 15-month hire, de-risks everything before the big commitment, and doubles as a working interview. **Then retained** for Phase 0b and as the named coverage secondary. **Cannot start before the signed agreement** |
| **Second engineer** | 0.5 FTE from Phase 4 | Useful only for the canvas. Phases 1–3 are gated by domain decisions, not typing speed |
| **Carl** | ~4 hrs/wk, 15 months | Domain authority, not stakeholder. The only person who can decide whether `Insulation - Batt` coded to Siding is an error or a reporting bucket, and the only one who can set contingency, price-adjustment and approval policy |
| **Named estimator** | ~4 hrs/wk, heavy in Phase 3 | Assembly authorship, parallel run, timed comparisons, AI ground truth. **In writing, on a recurring calendar block** |
| **Maintenance owner** | 0.2–0.35 FTE, forever | Named at Gate 0 |

**Outside help worth buying (~$22K):** a **signed contractor agreement before the engagement is posted** (~$1K, 2 lawyer hours — IP assignment, confidentiality, data handling, a narrow 12-month non-compete, repo custody in DB's own GitHub org from commit one) · a **senior graphics/CAD engineer, 25 hrs, before Phase 4b hardens** (~$5K) to review the coordinate model, affine viewport, tile pyramid, DPR handling and the float64 decision — **the best-value spend in the budget, and non-optional**, because storing geometry in screen space is the mistake that ends projects and it is not obvious from the inside · a **construction estimating consultant who is not a DB employee, 30 hrs** (~$6K) · **lawyer, 8 hrs** (~$3K) · **CPA, 8 hrs** (~$3K) · **security review, 12 hrs** (~$3K) covering authentication, session handling and the MCP surface · **JobTread API Developer Certification** (~$1K) · **annual external takeover test, 8 hrs** (~$1.5K/yr).

**Do not hire:** an ML engineer (gated ML is cut; Phases 1–6 train no model and Phase 6 buys its OCR); a DevOps/SRE (hosting is chosen so one person can run it, and a cluster nobody has time to operate is itself the likeliest cause of an outage); a designer beyond a few days on the worksheet; a QA function (the golden and parallel-run suites are the QA); a project manager.

| Phase | Carl | Estimator | What |
|---|---|---|---|
| −1 Hire | 20 | — | Screening, interviews, reference checks |
| 0 Decide & Prove | 24 | 34 | Spike 1 timing + revenue/margin pull, Spike 1b calls, Spike 2b Togal comparison, Spike 6 markup sessions, Spike 6b workbook collection, Gate 0 memo |
| 0b Deferred spikes | 4 | 6 | Spike 4 validation, Spike 8 triage review |
| C Catalog reconciliation | 16 | 40 | **C-scope rows only**, by trade, in 90-min batches |
| 1 Cost Intelligence | 20 | 30 | Distribution review, confidence promotion, margin-baseline sign-off |
| 2a Estimate Core | 24 | 50 | 16 assemblies, waste factors, approval / contingency / price-adjustment policy |
| 2b Bridge, COs, Allowances | 12 | 24 | Template selection, CO and allowance policy, 3 parallel estimates |
| 3 Parallel Run | 10 | **130** | **Bids done twice** + delta triage + training every estimator + drills |
| **Through Gate 3** | **130** | **314** | **≈ $43K** (estimator at $75; Carl at an assumed $150 — **he must supply the real number**) |
| 4a–4c Takeoff | — | 40 | Conditions setup, 6 timed head-to-heads |
| 5 / 6 / 8 / 9 | — | 20 / **50** / 10 / 20 | Addendum drill · **AI ground truth, 8–12 hrs per category to reach n≥30** · variance review · roofing |
| **Total** | **130** | **454** | **≈ $34K of loaded estimator time, plus Carl's 130 hours** |

**These hours are in the §2.3 TCO**, because omitting them understates the build in the dimension that is scarcest. **And state the opportunity cost, not just the loaded cost:** 454 estimator hours is roughly a quarter's worth of bids not produced, and at DB's win rate and average margin that foregone margin may exceed the $34K loaded figure by a multiple. **This must be scheduled, not assumed** — Phase 3 is 13 hrs/week for one person at N ≥ 80, which is why its calendar is set by estimator availability and measured N, not by code.

---

## 15. Questions only Carl can answer

1. **Who is going to write this code, and is it you?** If it is you, this plan is wrong regardless of how good it is. And separately: **who maintains this in year three?** A "nobody" answer should stop the project at Gate 0.
2. **How many general-construction estimates a year, and how many hours does one take** — split between measuring, pricing in the spreadsheet, and retyping into JobTread? At 1.5 hrs × 45 bids it is $5K/yr and you should buy. At 4 hrs × 150 bids it is $45K/yr and the build is defensible.
3. **What is your annual general-construction revenue, your bid win rate, and your average gross margin — and how much does margin vary job to job?** Probably the most important question here, and your own `job` reconciliation fields hold most of the answer. **At $8M and a half-point of margin improvement the build returns $40K/yr and the decision is genuinely close. At $4M and a quarter-point, it is not close: buy.**
4. **What did STACK and Togal actually quote you, in writing, for your real seat count?** A 2.5–3x spread on the most important cost number, and it is two phone calls.
5. **Will you genuinely trial STACK for 30 days on two real bids, and run Togal against your own plan sets, before we build anything?** I need you open to the outcome where buying plus a 200-line script is the right answer, not humoring the test.
6. **Materials run ×1.450 and labor runs ×1.818 in your catalog today.** The first is a 45% markup (31.03% margin); the second is a 45% margin (81.8% markup). Both get called 45%. **Is that deliberate, or has one of them been an accident nobody noticed?** The single most consequential domain question in the project. **And if it was an accident, do you want the new system to reproduce it or correct it?** I will not let a historical-fidelity gate quietly become your pricing policy.
7. **Your live data shows 80,462 taxable cost items and 60 documents at a 7.25% tax rate, including customer-facing Estimates.** Which project types and contract types are taxable, and has a CPA ever set that rule? **Be aware that asking may surface historical exposure.**
8. **Is the $55/hr labor cost burdened** — payroll taxes, workers' comp, benefits, non-productive time — **or is it a bare wage?** If bare, every job has been under-recovering by the burden (commonly 25–40%) and the margin reports have read healthy anyway.
9. **What is your target gross margin by project type, and the floor below which an estimate must not go out without your sign-off?** Pick the four-eyes threshold too. And tell me honestly whether you would live with a hard gate that blocks you at 5pm on bid day — because if not, it is not a gate.
10. **Do you carry a contingency on jobs today, and where does it live?** If it is inside a markup multiplier, nobody can report it, release it as a credit, or learn from it.
11. **When you shade a bid to hit a number, how do you do it today?** I have assumed you adjust the bottom line. If instead people nudge line quantities, the audit trail this project exists to build gets destroyed in week one and I need to design around that behaviour, not against it.
12. **Which of the six templates named "Estimate" is correct for general construction** — `Const - Small`, `Const - Med`, `Const - Large` or `Ballpark`? I have read the Const-Large footer: it is your full contract. **Is that text current and legally reviewed?**
13. **Has a lawyer reviewed whether a contract generated by this system is valid?** And the harder half: **what happens when it is valid and wrong?** Does your E&O cover machine-generated pricing? **What dollar exposure will DB absorb before the tool gets demoted?**
14. **What do your architect agreements say about storing, deriving from and transmitting their drawings?** That is a licensing question, not a privacy one, and nobody has asked it.
15. **Does creating a `customerOrder` via the API propagate into your QuickBooks Online?** Early evidence says probably not — zero of your 2,181 customer orders carry a QBO id while 1,106 invoices and bills do — but confirm in writing.
16. **You have four webhooks registered. Two fire on `documentCreated`, three on `documentUpdated`.** Who owns them, and can we get each handler read and given an explicit skip for our `DBE` namespace before we push anything?
17. **Of the ~709 priced catalog items, how many are general construction rather than roofing and exterior?** How many will you personally review, and can we start with the top 30 cost codes by dollar volume?
18. **Which jobs should be excluded from historical mining as unrepresentative?** Only you know which were anomalies.
19. **What share of your general-construction work is insurance restoration?** If large, the corpus shrinks, the ROI shrinks, and the real incumbent is Xactimate.
20. **Your GC estimates are allowance-heavy, and JobTread offers three allowance types — cost, cost-and-fee, and price.** For a stated $4,500 appliance allowance: is that a cost budget you mark up to $6,525, the customer-facing price with margin inside, or cost plus a stated fee? **That one question decides whether you leak margin on every selection.**
21. **Which estimator owns this day to day, and do they want it?** Name them. A tool built over the heads of the people who must use it gets bypassed under deadline.
22. **What is your realistic budget ceiling — and can you fund the P80, not just the P50?** Phases 0–3 are $250–290K at P50 and ~$370K at P80. Under ~$150K the honest answer is buy.
23. **What is the longest outage you can tolerate during a bid week, and what are the two worst estimating weeks of your year?** The deploy policy, degraded mode, RTO targets and the developer's leave blackout are set from your calendar.
24. **Is there any realistic chance you leave JobTread in the next five years, or that JobTread ships its own estimating module?** Either takes the largest justification for this build to zero.
25. **How do people log in, and who takes access away when someone leaves?** This system holds your complete cost book and 3,550 customer records.
26. **Is there any intention, now or later, to sell or license DB Estimator to other contractors?** If yes, say so now — it changes nearly every architectural decision.
27. **And the hard one:** if at Gate 3 the honest recommendation is "buy two or three takeoff seats and build only the ledger, the assemblies and the JobTread bridge" — removing 60–70% of the engineering risk and the part where AI assistance helps least — **is that an acceptable outcome, or would it feel like failure?** Your answer changes how Phases 0–2 should be scoped, and I would rather know now.

---

## 16. Monday morning

**Week of 2026-09-21 — six actions, in order. Action 1 is a prerequisite for action 3.**

1. **Get the contractor agreement drafted (Carl + lawyer, 2 hours).** IP assignment, confidentiality, data handling, narrow non-compete, repo custody in DB's own GitHub org. **Nobody touches DB's cost book without it.**
2. **Two phone calls (Carl, 1 hour).** STACK and Togal: written quote for your real seat count, tier structure, where AI is gated. **Start the 30-day STACK trial and the Togal trial the same day** — both clocks should be running before anything else.
3. **Post the contractor engagement (Carl, 2 hours).** A 10-week senior full-stack engagement for the Phase 0 spikes, framed explicitly as a working interview for the 15-month role. **Simultaneously** open the 15-month search — 8–10 weeks is realistic and it is the binding constraint on every date here.
4. **Name three people, in writing (Carl, 30 minutes).** The estimator design partner with 4 hrs/week on a recurring calendar block. The year-3 maintenance owner. The second approver for the four-eyes threshold. Gate 0 does not pass without all three.
5. **Measure the business this week (estimator + Carl, 8 hours).** Time three real bids, split takeoff / pricing / re-keying. Count general-construction estimates in the last 12 months and the insurance-restoration share of interior work. **And pull the revenue side: annual GC revenue, bids submitted, bids won, average and median gross margin by project type, and the margin spread across the last 40 reconciled jobs** — most of it is already in your `job` custom fields. **This one day of work replaces the two load-bearing economic assumptions in this document**, and it needs no developer.
6. **Pull the raw material (estimator day 1, contractor days 1–3).** The estimator collects **every version of the estimating spreadsheet in use** — the cheapest source of domain truth in the project and the input to all 16 assemblies. The contractor exports 40–60 real historical `customerOrder` documents (including `22PejfgufCkY`) as scrubbed JSON, gathers the five ugliest plan sets plus one scanned remodel set, and snapshots the catalog. Commit to `fixtures/`.

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

*Conventions: every factual claim is tagged VERIFIED (confirmed by direct query against organization `22PBAjem8SSC`), REPORTED (asserted in research, spike attached), or UNVERIFIED (explicitly unknown, no design depends on an assumed answer). The verified facts in §1.1 each overturn an assumption that would otherwise have produced a defect — most consequentially the tax premise, the `_type` discriminator, and the assumption that `createdByGrantId` distinguishes machine writes from human ones. Effort is re-baselined with Phase 0 given a possible calendar, Phase 2 split in two, Phases 1, 3, 4 and 6 lengthened, and gated ML cut. Exit criteria are counts, caps and protocols rather than judgements. Five domain entities — contingency, price adjustment, duration, escalation and contract type — are added at Phase 2a, because their absence would corrupt the audit trail this project exists to create.*
