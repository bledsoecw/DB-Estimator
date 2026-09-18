# DB Estimator — Build Roadmap

**Deitemeyer Brothers · General Construction First · Prepared 2026-09-18**

---

## 0. Headline recommendation

**Approve Phase 0 only — 10 weeks and roughly $50K — and make the real decision at Gate 0 on 2026-11-30.**

Phase 0 is not a warm-up. It is a decision phase with eight ranked spikes, a 30-day STACK trial run as the control arm, and a Togal trial on DB's own plan sets. It ends with a costed three-way memo — full build, hybrid, or buy — that Carl signs. Approving it commits ~$50K and forecloses nothing.

Behind Gate 0 sits a costed option: **Phases 1 through 3, re-baselined at 13–15 calendar months and $250–290K of engineering at contract rates** (P50; budget P80 at $370K). That delivers cost intelligence mined from DB's own history, an estimating engine that reproduces DB's markup schedule, change orders and allowances, and an atomic idempotent push into JobTread. The takeoff canvas is decided separately at Gate 3, with real velocity data and a real subscription quote in hand.

**What you are approving does not contain the features you asked for.** Say it plainly, because the feature table in §3.1 is findable but the headline is what gets remembered. Of the capabilities Carl named — STACK's takeoff, its $899 FloorPlan AI, Togal's auto-detection of spaces off PDFs, natural-language plan querying — the scope behind Gate 0 contains **none of them**. Takeoff off PDFs begins at month ~14 and is re-decided at Gate 3. Togal-style automatic room detection is deliberately **not built at all** in this plan; the honest substitute is reading the area the architect already printed in the room tag, which is exact and free. Natural-language plan query arrives with Phase 6, roughly 2.5 years out. Roofing, on this sequence, is a **2029 deliverable** — with one exception worth taking early (§11).

What $250–290K and 13–15 months buys instead: pricing intelligence from DB's own 3,987 jobs, an estimating engine that matches DB's markup schedule to the cent, first-class change orders and allowances, and an estimate that lands in JobTread as a nested phase tree without anyone retyping it.

Three reasons this ordering is right and the vendor ordering is wrong:

1. **The canvas is 60–70% of the engineering risk and the least AI-assistable code in the project.** If it goes first, nothing is usable for months, the estimators watch demos instead of doing bids, and the project enters the zone where it is quietly abandoned. That is the failure mode to design against — not a scale bug.
2. **The pain that costs money every week is not measuring.** It is the triple-entered quantity: measured somewhere, priced in Excel, retyped into JobTread. That leg has zero canvas risk, it is the half reviewers say STACK is weakest at, and it is the half no vendor will ever build for DB because it is specific to their JobTread instance.
3. **The defensible asset is data, not AI.** 709 curated priced catalog items and ~175,000 historically priced instances across 3,987 jobs. Togal has years of proprietary training data DB will never have. DB has years of proprietary *pricing* data Togal will never have. Build against your asset, not theirs.

**And the uncomfortable part, stated up front:** on cost avoidance alone, building never pays back. Buying is cheaper in every scenario — and after re-baselining, by a wider margin than the previous draft of this plan claimed. The build is justified by three things that are not for sale (the JobTread bridge, the historical cost corpus, full audit provenance) plus one thing this plan previously failed to quantify at all: **margin improvement**. On a business running 3,987 jobs, a half-point of realized margin plausibly dwarfs every engineering number in §2. Neither the re-keying hours nor the margin variance is currently known. Both are measured in Phase 0 (§6.3, Spike 1). **If they come back low, the correct decision is to buy STACK, keep Phase 1, and build only the push.** That is a legitimate and much smaller project, and this document is structured so you can take it at any gate without waste.

---

## 1. Provenance discipline (read this before trusting any number below)

This project will live or die on whether "verified" means something. Three tiers are used throughout and they are enforced:

| Tag | Meaning |
|---|---|
| **VERIFIED** | Confirmed by direct query against organization `22PBAjem8SSC` and recorded in `docs/jobtread-api-field-notes.md` or in §1.1 below. |
| **REPORTED** | Asserted during research but *not* confirmed by query. Treated as a hypothesis with a Phase 0 spike attached. |
| **UNVERIFIED** | Explicitly unknown. No design may depend on an assumed answer. |

### 1.1 Corrections — including two to the previous draft's own corrections

A plan whose authority rests on the word "verified" cannot afford to invent verifications, and it cannot afford to "correct" a true claim into a false one. Both happened. All seven items below were re-checked by live query on 2026-09-18.

**Correction 1 — `externalId` is NOT null everywhere. The original research was right; the previous draft's correction was wrong.**
VERIFIED: **2,156 of 8,463 documents carry a non-null `externalId`** — 2,155 `vendorBill` and one `vendorOrder`. Observed values include `69420400`, `H26957`, `523815`, `000296`, `355057` and `355057_2`. The previous draft argued these "were almost certainly document numbers"; they are not, because `document.number` is a separate integer field (it is `8` on the reference estimate). The `_2` suffix is circumstantial evidence that a human hit a collision and worked around it.
**The design conclusion survives intact and gets stronger:** VERIFIED, **zero of 2,181 `customerOrder` documents carry an `externalId`.** Our namespace is clean *in the document type we write to*. Two consequences: the `DBE1.` scheme is safe, and the Layer-0 assertion suite must scope its namespace guard to `customerOrder` — an org-wide "externalId is null everywhere" assertion fails on the first run.

**Correction 2 — the JobTread plan room is real, writable, and a genuine differentiator. The previous draft demoted it to a hypothesis in error.**
VERIFIED by introspection: `root.createPlan`, `updatePlan`, `deletePlan`, `createPlanTask`, `updatePlanTask` all exist. `updatePlan.$.annotations` is an array (max 1000) of a `oneOf` over `{path, text, point, meta}`. The `path` variant carries `isNegative`, `isClosed`, `strokeWidth`, `strokeColor`, `fillColor`, `fillOpacity` and `points` (freedraw arrays up to 1000 xy pairs, or bezier chains referencing other annotations). `plan.previousFilePages` exists and gives native page-revision lineage. The same annotation payload is accepted by `createUploadRequest`, which means the `annotatedUploadRequestId` attached to an individual cost item is **structured vector data, not a flattened image**.
"The PM opens the plan in JobTread and sees the takeoff, with deductions drawn as negative regions" is achievable and should be promised. Spike 11 is re-scoped from *existence* to *coordinate space and scale calibration*, which remains genuinely unknown.

**Correction 3 — the markup schedule was measured on n = 46, not 709.** The field notes are explicit. Any exit criterion phrased as "reproduce all 709 priced catalog rows byte-exact" sets a gate against a rule set inferred from a 6% sample, and "with every exception named as a deliberate item-level rule" is an escape clause that swallows the criterion whole. §8.4 replaces it with a falsifiable gate.

**Correction 4 — the tax premise is false, and it is the most expensive error in the previous draft.**
The previous draft forced `isTaxable: false` and `taxRate: 0` on the grounds that this "mirrors DB's current data." It does not. VERIFIED: **80,462 of 176,156 cost items have `isTaxable = true`** (46%), of which **18,602 are on `customerOrder` lines**. **60 documents carry `taxRate` > 0**, including `customerOrder` documents named "Estimate" at `taxRate` 0.0725 — Ohio 7.25%. Hardcoding zero is not mirroring; it is a revenue regression that under-bills tax on a real subset of work.
Also VERIFIED: `createDocument.$.taxRate` is constrained `gte 0, lte 1` — **a fraction, not a percentage**. Writing `7.25` instead of `0.0725` is a 100× error that the type system will happily accept. §8.6 is rewritten and the CPA sign-off moves from formality to blocking decision.

**Correction 5 — JobTread has a live formula evaluator, and DB already uses it.**
The previous draft's Decision 13 rested on "all three formula fields are null across all 176,155 live cost items." VERIFIED: **`quantityFormula` is populated on 5,451 cost items** — 101 on catalog rows, ~5,350 on job-budget lines, and **zero on `customerOrder` lines**. Live syntax observed: `round({Area}/8.5)` on Demolition, `round(({Area}*{Depth})/27)` on Hand and Bulk Excavation. That is a working named-variable formula language in production use. `unitCostFormula` and `unitPriceFormula` *are* null everywhere (0 of 176,156), as is `costGroup.quantityFormula`.
Two consequences. Spike 8 gets cheaper and more valuable: **those 101 catalog formulas are DB's own assembly logic, written down explicitly**, and should be read before mining 46,248 cost groups statistically. And Decision 13 is *re-affirmed on better grounds* — DB's own convention deliberately keeps formulas off customer-facing documents, so we honour it.

**Correction 6 — template hydration is VERIFIED, not hypothetical. The subsystem stands.**
The previous draft asserted §7.6 as "VERIFIED-adjacent and decisive" without a query behind it, and a reviewer correctly flagged that an entire deliverable was being deleted on an unchecked claim. It has now been checked. VERIFIED: `documentTemplate` is API-readable; `footer` accepts up to 65,536 characters (`description` is 32,768, not 65,536); and **the footer of template `22PBz2nQunqm` is the Deitemeyer Brothers contract verbatim** — formation and rescission, change orders, §4.4 Unforeseen Circumstances at $2.00/SF sheeting and $10.00/LF dimensional lumber, the six-stage 10/25/20/20/15/10 payment schedule with `$XXX,XXX.XX` and `$XX,XXX.XX` placeholders, Ohio governing law and Van Wert County venue, the five-year workmanship warranty, and the photo release. `createDocument` accepts **no** `templateId`. The subsystem in §7.6 is necessary and correct as designed.
Two details the previous draft got wrong: there are **six** templates named "Estimate", not ten, and `documentTemplate.templateName` disambiguates them completely — `Const - Small`, `Const - Med`, `Const - Large`, `Ballpark`, `Roof - No Terms/50% Down`, `Roof - SS No Terms/50% Down`. **Q10 to Carl is therefore largely self-answering: `22PBz2nQunqm` / "Const - Large" is the general-construction template.** Carl still confirms the footer is the current legally reviewed text.

**Correction 7 — `createdByGrantId` is populated for human UI edits. Do not build echo suppression on the assumption that it is null.**
A review asserted that `createdByGrantId` is null for actions taken by humans in the JobTread UI and populated only for grant-authenticated writes, which would make echo suppression a clean binary test. VERIFIED against the live per-document event feed: **it is populated on every event observed, including human UI edits** — `documentUpdated` by Kristin Holt carries grant `22PcWa26R9rb`, `documentCreated` by the Operations Account carries `22PdTim6CFBz`, and **both display the name "JobTread App."**
Had this been folded in uncritically, echo suppression would have classified every human edit as our own write and silently swallowed it — the exact failure §7.7 exists to prevent. The original rule stands and is now VERIFIED rather than assumed: **match on our own specific grant id, retain historical grant ids across rotations, and never match on grant name.**

`docs/jobtread-api-field-notes.md` becomes **ADR 0001**, split into an immutable decision record plus a living verified-facts document with a nightly read-only assertion suite behind it (§8.7). Every Phase 0 spike appends its written answer there. Corrections 1, 4 and 5 are applied to the field notes before any code is written.

---

## 2. The build-vs-buy reckoning

### 2.1 What buying actually costs (must be re-quoted — this is the weakest number in the analysis)

| Option | Structure | 6 seats | 3 production seats + viewers |
|---|---|---|---|
| STACK, as Carl was quoted | $249–299/user/mo + $899/user FloorPlan AI | **$26,900/yr** | $13,500/yr |
| STACK, per independent research | Annual tiers ~$1,999 / ~$4,999 (3 full + 6 viewers) / custom; AI gated at ~$2,999/yr Premium | $12–18K/yr | **$8,000/yr** |
| Togal.AI | ~$299/user/mo, **quantities only** — no pricing, no proposal, no JobTread | $21,500/yr | $10,800/yr |
| Beam AI | $8–25K/yr **per trade**, done-for-you, 24–72h turnaround | n/a | n/a |
| HOVER + CANVAS | $58.99–112.61/report; $0.40/SF | *continues under every scenario* | *continues* |

That is a **2.5–3x spread on the single most important number in the decision.** Two phone calls close it (§6.3, Spike 1b). Do not approve or reject this project against a number no vendor has put in writing. Note also that Togal produces quantities only — under a "buy Togal" scenario DB still needs something downstream to price them and land them in JobTread, which is Phase 1 + Phase 2 of this plan.

**Honest working figure for what DB actually needs (2–3 production takeoff seats, viewers, AI): $8,000–15,000/yr.**

### 2.2 What building costs

Effort is **re-baselined for the second time**, and the second re-baseline is larger than the first. The previous draft doubled the original estimates and was still short in four places: Phase 0 packed 46 dev-days into 30 working days; Phase 2 absorbed change orders, allowances and lead-stage estimates as "repaired gaps" without adding a single week; Phase 3 had to build shadow-mode dual computation and a read-only degraded mode in six dev-weeks; and Phase 4 was priced at 18 dev-weeks for a scope that includes a tile pyramid built on a library with **no canvas tiling support at all**.

A dev-day here is **7.6 hours** (38 productive hours / 5 days). The previous draft's Phase 0 reconciled 46 dev-days to 266 hours only at a 5.8-hour day, which is where that impossibility hid.

AI assistance is priced unevenly and deliberately: **~2.2x on CRUD, API clients, schema, reports and tests; ~1.25x on canvas, viewport, geometry and PDF plumbing**, where the training corpus for "build a CAD viewport with exact coordinate fidelity" is genuinely thin. Anyone who schedules Phase 4 at CRUD velocity will miss by two months.

| Phase | Dev-weeks | Hours | Cumulative | @ $150/hr contract | @ $106/hr salaried |
|---|---|---|---|---|---|
| 0 · Decide & Prove (core spikes) | 6.2 | 236 | 236 | $35K | $25K |
| 0b · Deferred spikes *(runs inside Phase 1)* | 4.6 | 175 | 411 | $62K | $44K |
| 1 · Cost Intelligence | 11 | 418 | 829 | $124K | $88K |
| 2a · Estimate Core *(no writes)* | 10 | 380 | 1,209 | $181K | $128K |
| 2b · Bridge, COs & Allowances | 10 | 380 | 1,589 | $238K | $168K |
| 3 · Parallel Run & Cutover | 9 | 342 | 1,931 | **$290K** | **$205K** |
| 4 · Takeoff *(4a+4b+4c)* | 24 | 912 | 2,843 | $426K | $301K |
| 5 · Change Under Pressure | 8 | 304 | 3,147 | $472K | $334K |
| 6 · Deterministic Extraction | 16 | 608 | 3,755 | $563K | $398K |
| 8 · Actuals Loop | 6 | 228 | 3,983 | $597K | $422K |
| 9 · Roofing | 8 | 304 | 4,287 | $643K | $454K |

**Phase 7 (Gated ML) is cut entirely.** Its useful parts move into Phase 6; the rest is a buy decision or a non-goal. See §10.

**These are P50 point estimates on a project whose estimates have now been wrong twice.** Carry a **25–30% contingency reserve**: Phases 0–3 at P80 is **~$370K** at contract rates, ~$265K salaried. Budget the P80. If you can only fund the P50, you are funding a project you will have to stop mid-phase.

**Plus, unavoidably:**

| Item | Cost |
|---|---|
| Run cost (Postgres w/ PITR, API + workers, object storage + CDN, Sentry, ~$60/mo model API) | $500–700/mo → **$6–8.4K/yr** |
| Plan storage growth — see model below | folded into run cost; re-forecast at Gate 3 |
| Maintenance, forever — from Gate 3 onward | **0.2 FTE (no canvas) → $43K/yr** · **0.3–0.35 FTE (with canvas) → $64–75K/yr** |
| **Reactive integration reserve** — one JobTread breaking change is 40–80 hours | **$10–15K/yr** |
| Specialist help (§14.2) | **~$22K one-time** |
| Carl's time | 118 hours (§14.3) — at his own loaded rate, which he must supply |
| Estimator time | **370 hours ≈ $27.8K** at $75/hr loaded (§14.3) |

**Storage model** (absent from the previous draft, which quoted a flat monthly figure while pre-generating a tile pyramid for every page of every plan set of a business with 3,987 jobs): at ~60 pages/set, ~40 tiles/page across levels 0–2, ~120KB/tile, a plan set is ~290MB of tiles plus the original. At 150 sets/yr that is ~45GB/yr, trivial in cost but not trivial in lifecycle. **Retention policy is required, not optional:** tiles for closed jobs move to cold storage at 90 days and are purged at the retention limit set by the plan-licensing answer (§10.4); originals follow the insurance-restoration retention obligation the lawyer establishes (§8.6).

**Maintenance is 0.2 FTE, not 0.15, and the scope is named** so it cannot be quietly re-cut: mandated drills (quarterly grant rotation, monthly single-estimate restore, quarterly full off-provider restore, annual abandonment drill), dependency upgrades, alert and drift triage. It explicitly **excludes** reactive API work, which is why the reserve line exists. Two specific upgrade hazards are budgeted here: **the vector harvest depends on pdf.js `getOperatorList`, which is not a stable public contract and changes between releases** — the version is pinned, and an operator-list golden test fails the build on upgrade.

### 2.3 Five-year total cost of ownership — with the benefits on the same page

The previous draft compared costs without benefits, concluded "buying is ~8.6x cheaper," and then two sections later conceded the two largest benefits were unquantified. That comparison is not decision-grade. Re-keying cost is carried in every scenario that does not eliminate it, and client time is carried in every scenario that consumes it.

Re-keying cost = H hours/bid × N bids/yr × $75 loaded × 5 years. Both H and N are **UNVERIFIED** and measured in Spike 1. Columns show H×N at $15K/yr (low) and $45K/yr (high).

| Scenario | Build | Maint. | Run + reserve | Subscription | Client time | 5-yr direct | **+ re-keying @$15K** | **+ re-keying @$45K** |
|---|---|---|---|---|---|---|---|---|
| **Buy only** (STACK 3 seats + AI) | — | — | — | $45K | — | **$45K** | **$120K** | **$270K** |
| **Hybrid** — build to Gate 3, rent takeoff | $290K | $172K | $76K | $45K | $46K | **$629K** | **$629K** | **$629K** |
| **Full build** through Phase 6 | $563K | $245K | $92K | — | $50K | **$972K** | **$972K** | **$972K** |
| **Everything** through Phase 9 | $643K | $280K | $100K | — | $54K | **$1.10M** | **$1.10M** | **$1.10M** |

At the low end of re-keying, **buy-only is ~5.2x cheaper than the hybrid.** At the high end it is **~2.3x cheaper.** Neither ratio is close. Anyone presenting this project as "cheaper than STACK" is selling.

**The build does not clear on cost avoidance. It can only clear on margin.** That case is quantified in §2.5b, and the inputs are measured in Spike 1.

### 2.3b Cash flow — the shape matters as much as the total

Spend is front-loaded against benefits that start at week ~24 and revenue effects that start after Gate 3. Peak monthly burn through Phases 0–3, at contract rates:

| Window | Months | Monthly burn | Notes |
|---|---|---|---|
| Phase 0 | 2026-09 → 2026-11 | ~$17K | Contractor only; plus STACK/Togal trial fees |
| Phase 1 + 0b | 2026-12 → 2027-02 | ~$46K | Hire plus contractor on retainer — **the peak** |
| Phase 2a | 2027-03 → 2027-05 | ~$25K | |
| Phase 2b | 2027-05 → 2027-07 | ~$25K | |
| Phase 3 | 2027-08 → 2027-10 | ~$28K | Plus 130 estimator hours — the real constraint |

Ask the CPA (§14.2) whether this spend capitalizes under **ASC 350-40** internal-use software rules — and if so, what the impairment consequence is of stopping at a gate, which this plan explicitly invites — and how **§174** treatment of domestic software development costs compares after tax against an immediately-deductible subscription. That last point can move the effective build-vs-buy gap materially in either direction and is a straightforward question for a CPA already being engaged.

### 2.4 What the premium actually buys

Five things survive scrutiny. Two are near-certain, one is now quantifiable, two are insurance.

| Value | Certainty | Annual value | Purchasable? |
|---|---|---|---|
| **Recovered re-keying hours** — estimate lands in JobTread as a nested phase-tree `customerOrder` with no retyping | High, size unknown | $5–45K (§2.5) | No. No vendor will integrate with JobTread. |
| **Margin improvement from better pricing** — distributions with n and spread replacing a stale spreadsheet rate | Plausible, unmeasured | **Potentially the largest item in the analysis** (§2.5b) | No. Nobody else has DB's reconciled job costs. |
| **Historical cost corpus as live pricing intelligence** — median, spread, n, productivity from DB's own `timeEntries` | High | Compounding | No. |
| **Margin protection from auditability** — markup/margin ambiguity forced open, stale-takeoff blocking, hard approval gate, provenance from every dollar to its source | Real, hard to quantify | One $278K job mispriced 3% = $8.3K | Partly — it is a *gap* in STACK, not a strength. |
| **Availability control** — no vendor's deploy window landing on bid day | Real | Insurance, not revenue | No. |

### 2.5 The break-even on recovered hours, with the unknowns named

If re-keying and reconciliation cost **H** hours per bid across **N** bids/yr at a $75 loaded estimator hour:

| H | N = 45 | N = 80 | N = 150 |
|---|---|---|---|
| 1.5 h | $5.1K | $9.0K | $16.9K |
| 2.5 h | $8.4K | $15.0K | $28.1K |
| 4.0 h | $13.5K | $24.0K | **$45.0K** |

At the low end, recovered hours do not cover the subscription. At the high end they cover the subscription plus most of the maintenance — but **never the build.** Both H and N are measured in Spike 1 by timing three real bids, which is one day of work and replaces the single load-bearing cost assumption in this document.

### 2.5b The margin case — the half the previous draft never computed

DB runs 3,987 jobs. The `job` custom fields already hold **Reconciled Revenue, Reconciled Cost, Est Cost, Est Margin and Final Margin %** — so annual general-construction revenue, win rate, average and median gross margin by project type, and the margin variance across the last 40 reconciled jobs are all **obtainable in Spike 1 from data DB already owns.** None of it was asked for. It should have been, because on a business this size it dominates.

Sensitivity, with annual general-construction revenue **R** as the unknown Spike 1 fills in:

| Realized margin improvement | R = $4M | R = $8M | R = $15M |
|---|---|---|---|
| +0.25 pt | $10K/yr | $20K/yr | $37.5K/yr |
| +0.50 pt | $20K/yr | $40K/yr | $75K/yr |
| +1.00 pt | $40K/yr | $80K/yr | **$150K/yr** |

| Win-rate improvement from faster turnaround (at 10% avg gross margin) | R = $4M | R = $8M | R = $15M |
|---|---|---|---|
| +2 pts | $8K/yr | $16K/yr | $30K/yr |
| +5 pts | $20K/yr | $40K/yr | $75K/yr |

**Read this honestly in both directions.** At R = $8M and +0.5 pt of margin, the build returns $40K/yr — $200K over five years — which closes roughly half the hybrid's gap to buy-only and makes the decision genuinely close. At R = $4M and +0.25 pt, it returns $50K over five years and the decision is not close at all: **buy.**

The margin case is also the least certain claim in this document, and it is the one most vulnerable to wishful arithmetic. Three disciplines apply. The improvement must be **attributable** — Phase 8's variance decomposition (§6.7) is what makes it measurable rather than assertable. The **baseline must be measured before Gate 1**, from the last 40 reconciled jobs, and published (§8.5 depends on it too). And it must be **re-tested at Gate 3** against real jobs priced with the tool: if realized margin on tool-priced jobs is not measurably better than baseline, the margin case is dead and the honest conclusion is that only the re-keying and audit cases remain — which do not clear.

### 2.6 The recommendation, in one table

| If Phase 0 finds… | Then |
|---|---|
| STACK's takeoff feels good on DB's real plan sets **and** its export can be scripted into a nested JobTread `customerOrder` (Spike 0) | **Buy STACK. Keep Phase 1. Build only the push.** ~$8–15K/yr + ~14 dev-weeks. This is the most likely correct answer and it is a better outcome than the full build. |
| **Togal clears the §10.3 thresholds on DB's own sheets (Spike 2b)** | **Build Phases 1–5, license the detection layer, never build Phase 6's extraction.** eTakeoff already ships Togal as an embedded OEM engine, so the detection layer is licensable separately. A ~$300 trial settles a ~$91K question. |
| H × N < ~$15K/yr **and** the margin sensitivity (§2.5b) lands under ~$25K/yr | **Buy.** Neither case clears and the remainder is insurance. |
| Vector sheets < 30% of general-construction work, **or** machine-readable dimension strings < 50% of sheets (Spike 2) | **Stop at Gate 3.** The exactness thesis does not apply to DB's inputs and DB cannot out-train Togal. |
| No senior developer signed, or no year-3 maintenance owner (§14.1) | **Buy.** A half-built estimating system the business bills through is worse than a subscription. |
| Markup rules cannot be formalized (Spike 6) | **Pause.** Fix the pricing model with Carl before any software encodes it. |
| **A markup basis turns out to be an accident, not a policy (Spike 6 / Q7)** | **Split the gate.** Reproduce history *and* reproduce intent, in shadow, with the dollar delta per project type reported to Carl before he chooses a go-forward rule set (§8.4). Do not let a historical-fidelity gate silently become pricing policy. |
| Carl's roofing appetite is near-term | **Take seam 8 early.** The vendor-measurement adapter moves into Phase 2b and prices HOVER/CANVAS reports through the same engine years before Phase 9 (§11). |
| All of the above come back favorably | **Approve Phases 1–3. Re-decide the canvas at Gate 3.** |
