# DB Estimator

A private, in-house takeoff and estimating application for **Deitemeyer Brothers**, designed
to integrate natively with JobTread. General construction first; roofing later.

**Status: v0.5 auditor runs; the rest is design material.** The auditor reads one
JobTread estimate and checks it against policy, and renders the reviewer's screen —
read-only, no writes, no AI in the loop. Everything beyond that is still the decision material for whether — and how —
to build the larger thing. [Jump to running it](#running-the-v05-auditor).

---

## Start here

| Document | What it is |
|---|---|
| **[`docs/ROADMAP.md`](docs/ROADMAP.md)** | The build roadmap. Phases, gates, costs, the build-vs-buy reckoning, the JobTread subsystem design, the reliability model, and the questions only Carl can answer. |
| **[`docs/jobtread-api-field-notes.md`](docs/jobtread-api-field-notes.md)** | The JobTread Pave API, verified by direct query against the live organization. The factual baseline the integration is designed against. |
| **[`src/`](src/)** | The v0.5 auditor. `src/money.ts` is the arithmetic everything else depends on; `src/rules/` holds the eight policy checks; `src/report.ts` renders the approver screen. |

## The short version

The roadmap recommends **approving a 10-week, ~$50K decision phase — not a build.** That
phase runs eight spikes, a 30-day STACK trial and a Togal trial against Deitemeyer
Brothers' own plan sets, and ends in a costed three-way memo: build, hybrid, or buy.

Behind that gate sits a costed option on roughly **13–15 months and $250–290K** (budget the
P80 at ~$370K) to deliver the *estimating* half — cost intelligence mined from 3,987 real
jobs, an engine that reproduces the existing markup schedule exactly, change orders and
allowances, and an atomic idempotent push into JobTread. The takeoff canvas is a separate
decision, taken later.

Two things the roadmap says plainly, because they are easy to miss:

- **The scope behind the first gate contains none of the features that prompted this
  project.** No takeoff, no FloorPlan AI, no Togal-style space detection, no
  natural-language plan query. Those are sequenced later, and one of them is deliberately
  never built.
- **On cost avoidance alone, building never pays back.** Buying is 2.3–5.2x cheaper over
  five years. The build can only be justified by measurable margin improvement plus three
  things that are not for sale: the JobTread bridge, the historical cost corpus, and full
  audit provenance. Both unknowns are measured in the first phase.

If the numbers come back the wrong way, the recommended answer is to buy STACK, keep the
cost-intelligence phase, and build only the bridge — and the roadmap treats that as a
successful outcome, not a failed one.

## Running the v0.5 auditor

Read-only. It checks one JobTread estimate against policy and writes nothing.

### Getting it onto your machine

The auditor is on the branch `claude/gifted-keller-prgxh5`. It is not on `main`.

```bash
cd /c/dev                                              # wherever you keep repos
git clone https://github.com/bledsoecw/DB-Estimator.git
cd DB-Estimator
git checkout claude/gifted-keller-prgxh5
npm install
```

Run those one line at a time and read each result. If the clone fails, the `cd`
fails too, and every command after it runs against whatever repository you were
already sitting in — which looks like `Missing script: "doctor"` or
`cp: cannot stat '.env.example'` and sends you hunting for the wrong bug. Before
going on, `pwd` should end in `/DB-Estimator` and `git branch --show-current`
should print `claude/gifted-keller-prgxh5`.

Needs Node 22.9 or newer; `npm install` refuses an older one and names the
version it wants.

### Setup for live runs

1. Create a grant at [app.jobtread.com/grants](https://app.jobtread.com/grants). The key is
   shown once and begins with `grant_`.
   **Scope it to reads only** — see §19.2 of the roadmap. It must not carry
   `updateCostType`, `updateCostCode` or `updateCatalog`: an auditor that can rewrite the
   policy it audits against has no invariants.
2. `cp .env.example .env`, then open `.env` and replace the placeholder key with
   yours. `.env` is git-ignored and never leaves your machine.
3. `npm run doctor` — it checks the key, the org id, and whether JobTread is actually
   reachable from where you are.

### Commands

```bash
npm run doctor                                                      # check your setup
npm run audit -- --fixture test/fixtures/jones-bath-kitchen.json   # offline, no setup
npm run audit -- <documentId>                                       # live
npm run audit -- <documentId> --html review.html                    # the approver screen
npm run audit -- <documentId> --capture test/fixtures/name.json     # live + save a fixture
npm run audit -- --recent 20 --status approved --out review          # a batch
npm test                                                            # 55 tests
```

The `--` is required. Without it npm eats the arguments instead of passing them on.

### Auditing a batch

```bash
npm run audit -- --recent 20 --status approved --out review
start review/index.html
```

Audits the 20 most recent estimates and writes an index over them — job, price,
margin, how many findings, how much under policy — with each row linking to its own
approver screen.

`--status approved` is the one to start with. Those estimates already went to a
customer, so anything the auditor says about them is either a real miss or a false
positive, and nothing it does can disturb live work. That is the shadow stage in
§18 of the roadmap, and its gate is **≥20 estimates audited and ≥80% of findings
judged real**. Until that number exists, the rules are fitted to three estimates.

### The approver screen

`--html` writes the reviewer's view as one self-contained file — open it by
double-clicking, or attach it to an email. No server, no install, nothing to fetch.

It leads with the number that decides the estimate (*under policy by $2,979.07*),
then one card per exception: what is wrong, the arithmetic behind it, and the
choices. Clicking a choice records it and updates the tally; **Copy the notes**
puts a plain-text summary on the clipboard to paste back to the rep.

It decides nothing. Choosing an option changes no price, writes nothing to
JobTread, and releases no estimate — the page says so where it can be seen.
v0.5 buys review *time*, not authority.

A rendered report carries the customer's name and your real pricing, so it is
git-ignored (`*.html`) and belongs on your machine, not in a repository and not
in anyone's cloud.

**Live runs need network access to `api.jobtread.com`.** A Claude Code cloud session
cannot reach it: outbound egress is restricted, so a request comes back `403` from the
proxy rather than from JobTread. `npm run doctor` tells the two apart — it checks whether
the response body is JSON, because JobTread always returns JSON and a proxy does not. Run
it on your own machine, or anywhere with normal outbound access.

Offline work needs none of this: the fixture path exercises every rule with no network and
no credential. Three real estimates are captured in `test/fixtures/`:

| Fixture | Why it is there |
|---|---|
| `jones-bath-kitchen.json` | A GC remodel, 26 lines, zero-rated. The original golden case. |
| `daeger-roof.json` | Roofing, 67 lines, 7.25% rate, **approved and sold** — the baseline for what a clean estimate must not be flagged as. |
| `wright-roof.json` | Roofing, 101 lines, 6.85% rate. Crosses JobTread's 100-item page cap and reconciles through three unselected option branches. |

## Working conventions

Every factual claim about JobTread in these documents is tagged:

- **VERIFIED** — confirmed by direct query against organization `22PBAjem8SSC`
- **REPORTED** — asserted in research, not yet confirmed; a spike is attached
- **UNVERIFIED** — explicitly unknown; no design depends on an assumed answer

The field notes carry a revision log because an earlier revision generalized from a single
sampled estimate and got six things wrong. Claims about org-wide state are backed by counts
over the whole organization, never by inspection of one record.

**Read-only discipline:** all observations to date came from read queries and schema
introspection against live production data. No mutation has been executed. Write testing
is confined to a dedicated disposable test job.

**Secrets:** no JobTread `grantKey`, webhook token or customer data belongs in this
repository. `.gitignore` covers `.env*`, `plans/` and `*.pdf` for this reason.
