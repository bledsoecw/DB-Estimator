# DB Estimator

A private, in-house takeoff and estimating application for **Deitemeyer Brothers**, designed
to integrate natively with JobTread. General construction first; roofing later.

**Status: the auditor runs, and the drafter is built and waiting for its first live run.**
The auditor reads one JobTread estimate and checks it against policy, and renders the
reviewer's screen — read-only, no writes, no AI in the loop. The drafter goes the other
way: it reads a job's site-visit notes and photos and produces the budget a rep would build
from DB's own budget templates — which templates, which lines, what quantities, and what has
no template line and goes to Carl. Also read-only. [Running the auditor](#running-the-v05-auditor)
&middot; [Drafting a budget](#drafting-a-budget).

---

## Start here

| Document | What it is |
|---|---|
| **[`docs/ROADMAP.md`](docs/ROADMAP.md)** | The build roadmap. Phases, gates, costs, the build-vs-buy reckoning, the JobTread subsystem design, the reliability model, and the questions only Carl can answer. |
| **[`docs/jobtread-api-field-notes.md`](docs/jobtread-api-field-notes.md)** | The JobTread Pave API, verified by direct query against the live organization. The factual baseline the integration is designed against. |
| **[`docs/drafter.md`](docs/drafter.md)** | The budget drafter: how DB builds an estimate from budget templates, what the model is asked, what the rep gets, and the gate before anyone trusts it. |
| **[`src/`](src/)** | The v0.5 auditor and the drafter. `src/money.ts` is the arithmetic everything else depends on; `src/rules/` holds the policy checks; `src/report.ts` renders the approver screen; `src/draft/` builds a budget from the templates. |

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

The auditor and the drafter are on the branch `claude/magical-goldberg-325cjd`. There is no `main`.

```bash
cd /c/dev                                              # wherever you keep repos
git clone https://github.com/bledsoecw/DB-Estimator.git
cd DB-Estimator
git fetch origin
git checkout claude/magical-goldberg-325cjd
npm install
```

Already have the clone? Skip the first two lines and start at `git fetch origin`. A
branch pushed after your last fetch is invisible to `git checkout` until you fetch, and
the error for that is `pathspec ... did not match any file(s) known to git`, which reads
like a typo and is not one.

Run those one line at a time and read each result. If the clone fails, the `cd`
fails too, and every command after it runs against whatever repository you were
already sitting in — which looks like `Missing script: "doctor"` or
`cp: cannot stat '.env.example'` and sends you hunting for the wrong bug. Before
going on, `pwd` should end in `/DB-Estimator` and `git branch --show-current`
should print `claude/magical-goldberg-325cjd`.

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
npm run audit -- --catalog --out review                              # the whole catalog
npm run draft -- 261323 --dry-run                                    # what the drafter would read
npm run draft -- 261323 --out review                                 # draft the budget (needs a key)
npm test                                                            # 158 tests
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

**The catalog is the price of record, and a line is judged against it.** The cost types
are four numbers for a catalog of thousands; the catalog is where the intent already
lives, item by item — Designer at ×1.25 because design is billed at a rate, HOVER at cost
because it is a pass-through, fasteners at ×1.667 because the subcontractor supplies them
and carries the markup. None of that needs a rule written for it.

`catalog.drift` compares each line to its own catalog item and the cost-type policy is the
fallback for lines with nothing to compare to — hand-typed ones. It compares
**multipliers, not prices**: a line written in March holds March's cost and that is not an
error, but the markup on top of it should not have moved. An empty catalog means "not
captured", never "everything matches".

**Per-item decisions live in [`src/rules/exceptions.ts`](src/rules/exceptions.ts).** Each
entry names one catalog item, who decided and when, and exactly one of:

- `approvedAt` — this price is right; don't raise it. It **lapses** the moment the price
  moves off what was approved, because the decision was about a price and a different
  price is a decision nobody has made.
- `measureAgainst` — a different book prices this item than its cost type says. Still
  checked, just against the right number.

An entry names one item by id, or a **class** by name prefix — `Fastener` at ×1.667 is one
decision covering seventeen catalog items and every fastener added after them. A class
still applies only at its rate, and an id entry beats a prefix so one item can be carved
out of its class.

Who does the work decides the cost type; which trade it is decides the book. Gutter and
siding **removal and rehang** are DB crew at the roofing schedule. Listed per catalog item
rather than matched on "Remove" or "Install" in the name — the line reading
`Aluminum Soffit Install` is catalog item `Vinyl Soffit Install`, and a string test would
never know.

**The catalog is the truth, not the lines.** Two items were listed here as needing the
Subcontractor margin, read off the estimate lines. The catalog had them right all along —
`Aluminum Fascia Install` is DB crew at 45% and `Fascia and Soffit Install` is the
subcontracted one at 30%, two different items. What the lines actually showed was drift
*from* the catalog ($7.20 against a catalog $7.27), which is a check this auditor cannot
yet make because it never reads the catalog.

**The document is checked against the job budget it was built from.** A customer
order is built from the job budget, and from then on they are separate records:
editing a budget line changes nothing on a document already built from it. On
261457 Hunnaman_Window the rep repriced the Window line in the budget ($653.90 →
$617.17 cost, new Wellcraft spec) after the customer had viewed the estimate twice,
then asked for the estimate to be reviewed. The document's own arithmetic was
clean, so every other check passed. `budget.drift` joins each line to the budget
line it came from (`jobCostItem`) and raises one card per document listing every
line whose name, quantity, unit cost, unit price or description no longer matches,
with the document total against the budget total as the headline. A budget line
that sits on **no** document of the job — added after the document was built, so
the customer has never seen it — is the more serious case and is priced into the
same card. A line carried by a change order on the same job is not missing from the
estimate, and is not reported as such.

**Not raised** is where the checks account for what they chose not to interrupt
anyone with, and it is never empty by accident: deliberately priced exceptions,
lines that are off policy by less than the materiality floor, lines with no budget
link, the 40-odd zero-cost time-tracking lines the job template puts in every
budget (`CLOCK IN ITEMS`, `BURDEN`, `GENERAL AND ADMINISTRATIVE`), budget lines
that belong to another document, and comparables dropped from the margin band.
Nothing is dropped silently.

**It audits Construction only.** Roofing is entirely subcontracted and prices from its
own templates, which are correct and are not the cost-type margins; Construction is what
the cost types govern and the only work that gets reviewed before it goes out. Checking
roofing against the cost types reads a correctly priced, sold estimate as $3,943 short.
`--job-type Roofing` or `--all-job-types` overrides it, and a single roofing document
audited directly says that markup was not checked rather than passing silently. A job
with no `Job Type` recorded **is** checked — guessing it is roofing would hide real
findings on construction work.

**The first shadow run changed the rules.** Twenty approved estimates produced 87
findings, and 39 came from three checks that were describing how the company works
rather than finding anything wrong — a missing signature requirement (true of 57% of
approved orders, all of which were accepted), itemised line prices (82%), and stale
taxable flags (4,170 of them, on documents that charge no tax). One check was deleted
and two became context. The principle that cost: **a check that fires on the majority
of work the company has already sold is measuring a convention, not a defect.**

The index also carries **Judging the findings** — every finding that needs a human,
grouped by rule, with Real / Not real against each one, a live score against the 80%
gate, and a **Copy the log** button that names every false positive. That is the whole
of what the gate asks for, in one sitting. It records a judgement about the auditor,
not about the estimate; nothing there touches JobTread.

Grouping by rule is the point: a check that is systematically wrong shows up as a block
of red rather than as scattered disagreement. The three checks retired after the first
run would have been obvious in seconds.

`--status approved` is the one to start with. Those estimates already went to a
customer, so anything the auditor says about them is either a real miss or a false
positive, and nothing it does can disturb live work. That is the shadow stage in
§18 of the roadmap, and its gate is **≥20 estimates audited and ≥80% of findings
judged real**. Until that number exists, the rules are fitted to three estimates.

### Auditing the catalog

```bash
npm run audit -- --catalog --out review
start review/catalog.html
```

The other half of the catalog check. A line is judged against its catalog item because the
catalog is the intent — which means a catalog item priced wrong passes every line that
comes off it, forever. This reads every priced catalog item (718 at last count, eight
pages) and reports two things, both org-level and neither an estimate's problem:

- **Off policy** — items whose price is not their cost type's margin, grouped by cost type
  and then by the rate they actually sit at, so eleven warranties at ×2.40 read as one
  decision rather than eleven mistakes. Approved exceptions are set aside and listed.
- **Duplicate names** — two or more catalog items with one name. `6" Gutters` exists once
  under Materials and once under Subcontractor; `8x8 Step Flashing` exists twice
  identically. A template that pulls a name can get either. Copies that disagree on price
  or cost type are listed first.

`--capture test/fixtures/catalog.json` freezes the whole catalog to disk; `--fixture` runs
against one offline; `--json` for machines. It is the whole price book, so treat the
capture like the other fixtures — real, private, and not for anyone's cloud.

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
no credential. Four real estimates are captured in `test/fixtures/`:

| Fixture | Why it is there |
|---|---|
| `jones-bath-kitchen.json` | A GC remodel, 26 lines, zero-rated. The original golden case. |
| `daeger-roof.json` | Roofing, 67 lines, 7.25% rate, **approved and sold** — the baseline for what a clean estimate must not be flagged as. |
| `wright-roof.json` | Roofing, 101 lines, 6.85% rate. Crosses JobTread's 100-item page cap and reconciles through three unselected option branches. |
| `catalog-sample.json` | The first 20 priced catalog items by name, after the 2026-09-29 sweep. One item at ×2.40, four duplicate names. |
| `hunnaman-window.json` | A GC egress window, 43 lines, pending, captured **with its job budget**. The budget was edited after the customer had viewed the estimate — the drift case. |
| `haag-basement.json` | Job 261323, a basement refresh with one discovery note and 18 photos (records only), the 44 budget templates, and two of them in full. The drafter's offline case. |

The three older fixtures predate the budget check and carry no budget; on them it
reports *Budget not captured*, never drift. A fresh `--capture` includes the budget.

### Reviewing scope

The pricing checks ask whether the lines are priced right. `npm run scope`
asks whether the right lines are there: it reads the job's conversation,
supplier quotes and site photos, and has a model compare them with the
estimate, raising what is missing, what quantity does not fit the evidence,
where a quote and a line disagree, and what the rep should confirm. Findings
land on the same approver page as "Scope" cards, judged the same way.

```
npm run scope -- <documentId> --dry-run      # prints what would be sent; sends nothing
npm run scope -- <documentId> --out review   # needs ANTHROPIC_API_KEY in .env
```

What it reads, what it costs (about $0.30 to $1 an estimate), what leaves the
building and what it will not do are in `docs/scope-review.md`.

### Drafting a budget

Both checks above need an estimate to exist. `npm run draft` is for the step
before that, which is where the reps' time goes: it reads what came back from
the site visit — the discovery notes on the job, the CompanyCam photos, any
drawings or quotes — and builds the budget the way a rep does, from DB's own
**budget templates** in JobTread.

```
npm run draft -- 261323 --dry-run          # sends nothing; writes what the model would read
npm run draft -- 261323 --out review       # needs ANTHROPIC_API_KEY in .env
npm run draft -- 261323 --templates 22PLCZU3cbqS,22PF3gnGCuiB   # you pick the templates
```

The job is the six-digit number that starts its name, the hyphenated number
JobTread stores, or the job id.

**It picks templates and prunes them; it does not invent lines.** A budget
template is a top-level catalog cost group — `Bathroom Remodel`, `Deck`,
`X-Division 09 Finishes`, 44 of them — whose lines carry no price of their own
and point at the priced catalog item JobTread prices them from when the rep
adds the group. The model reads the job and picks the template(s), then reads
every line of those templates (no prices) and says which to keep, with a
quantity, the basis for it and the evidence it rests on. The code prices each
kept line from its catalog item, rounded to cents once. Scope with no template
line lands under **Not in any template**, flagged for Carl. A line id the
model names that is in no chosen template is **rejected and listed**, never
added — that is the "made it up" case, and it is meant to be seen.

The page is written as the steps the rep takes in JobTread — add this
template, keep these lines, delete those, set these quantities, put these in
a selection group, write this in General Description — with a Copy button.
A JSON copy of the draft sits beside it; it is the payload the write path will
push one day. Today the rep follows the steps, and Kristen still reviews.

What it reads, what it costs (about $0.50 to $1.50 a job), what leaves the
building, the gate before anyone trusts it, and what is not built yet are in
`docs/drafter.md`.

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
