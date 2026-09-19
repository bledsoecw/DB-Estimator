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
