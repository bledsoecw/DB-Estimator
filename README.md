# DB Estimator

A private, in-house takeoff and estimating application for **Deitemeyer Brothers**, designed
to integrate natively with JobTread. General construction first; roofing later.

**Status: pre-build. Nothing here is code yet.** This repository currently holds the
decision material for whether — and how — to build it.

---

## Start here

| Document | What it is |
|---|---|
| **[`docs/ROADMAP.md`](docs/ROADMAP.md)** | The build roadmap. Phases, gates, costs, the build-vs-buy reckoning, the JobTread subsystem design, the reliability model, and the questions only Carl can answer. |
| **[`docs/jobtread-api-field-notes.md`](docs/jobtread-api-field-notes.md)** | The JobTread Pave API, verified by direct query against the live organization. The factual baseline the integration is designed against. |

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

```bash
npm install
npm run audit -- --fixture test/fixtures/jones-bath-kitchen.json   # offline, no setup
npm run doctor                                                      # check your setup
npm run audit -- <documentId>                                       # live
npm run audit -- <documentId> --capture test/fixtures/name.json     # live + save a fixture
npm test                                                            # 32 tests
```

### Setup for live runs

1. Create a grant at [app.jobtread.com/grants](https://app.jobtread.com/grants). The key is
   shown once and begins with `grant_`.
   **Scope it to reads only** — see §19.2 of the roadmap. It must not carry
   `updateCostType`, `updateCostCode` or `updateCatalog`: an auditor that can rewrite the
   policy it audits against has no invariants.
2. `cp .env.example .env` and put the key in it. `.env` is git-ignored.
3. `npm run doctor` — it checks the key, the org id, and whether JobTread is actually
   reachable from where you are.

**This has to run somewhere with network access to `api.jobtread.com`.** A Claude Code
cloud session cannot reach it: outbound egress is restricted, so a request there comes back
`403` from the proxy rather than from JobTread. `npm run doctor` tells the two apart — it
checks whether the response body is JSON, because JobTread always returns JSON and a proxy
does not. Run it on your own machine, or anywhere with normal outbound access.

Offline work needs none of this: the fixture path exercises every rule with no network and
no credential.

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
