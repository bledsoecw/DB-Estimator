# Drafting a budget from the templates

The auditor asks whether an estimate is priced right, and the scope review
asks whether the right lines are on it. Both need an estimate to exist. The
drafter is for the step before that: the rep has done the site visit, the
notes and photos are on the job, and nobody has two hours to build the
budget. It produces the budget the way a rep does, and nothing else.

Status: built and tested offline on 2026-09-30 against job 261323
Haag_Remodel, then run live three times the same day (notes below). The
drafter writes nothing to JobTread. The one write this project has made is
the contingency group in the construction templates, recorded in
`docs/contingency.md`.

## How DB builds an estimate today, and what the drafter reproduces

An estimate at Deitemeyer Brothers is built in JobTread from **budget
templates**. In the API a budget template is a top-level catalog cost group
(`Bathroom Remodel`, `Deck`, `X-Division 09 Finishes`; 44 of them on
2026-09-30). The rep:

1. adds a template group to the job's Budget tab;
2. deletes the lines the job does not need;
3. sets quantities;
4. adds a second template only for lines the first lacks, and deletes its
   extras too;
5. and when no template has the line, tells Carl, who decides.

Two facts about the templates decide the design, both VERIFIED by query:

- **Template lines carry no price.** Every line in a template has
  `unitCost: null` and points through `organizationCostItem` at an
  ungrouped, priced catalog item, the price of record. When the rep adds the
  template, JobTread prices the copied lines from those items. On job
  261457 the budget's `Window` line links to catalog item `22PCCE2YsEvY`,
  the same item the Bathroom Remodel template's `Window` line points at.
- **Every budget starts with the job template's own groups.** `CLOCK IN
  ITEMS`, `BURDEN` and `GENERAL AND ADMINISTRATIVE` are on 261323 before any
  estimate exists: 41 zero-cost lines for time tracking and fees. They are
  not scope and the drafter never touches them.

So the drafter's output is not a list of invented lines. It is: **which
templates to add, which of their lines to keep with what quantity, which to
delete, and what has no template line at all.** The model chooses and
quantifies. The code prices, from the catalog item each kept line points at,
with the same exact arithmetic the auditor uses. A line id the model names
that is not in the chosen templates is rejected and listed on the page.
That is the "out of thin air" case Carl asked to see, and it is never
silently added or silently dropped.

## Two calls

**Pick.** The model reads the job (description, the whole conversation,
the site photos, any drawings or quotes) and the list of all 44 templates
with their descriptions and group names, and picks a primary template plus
at most three supplements, or says nothing fits. A basement paint-and-floor
refresh has no job-type template, so the expected pick is `X-Division 09
Finishes` with `X-Division 01 General Requirements` beside it.

**Draft.** The model reads the job again beside every line of the chosen
templates (id, group, unit, cost type, description; no prices) and returns
the lines to keep, each with a quantity, the basis for it, the evidence it
rests on, an option name when the customer is choosing between alternatives,
and a confidence. It also returns the gaps, the questions for the rep, and
the scope-of-work text for the General Description line.

Rules the model is held to, from the roadmap's "failures must be visible":

- quantities come from measurements or counts written in the notes, counts
  visible in photos, or arithmetic on written dimensions, shown; nothing is
  measured from a photo;
- labor hours are its estimate, with a stated basis and an honest
  confidence, because the rep will check those first;
- when a line's description already includes waste, none is added;
- an option named "Group — Choice" is one of several the customer picks
  between; a bare name is a yes-or-no add-on the customer may decline;
- a non-monetized time-tracking line (Sales On-Site Support) is kept at
  quantity 0, not treated as scope;
- at most six questions, ordered by how much the answer changes the price;
- pricing, markup and margin are not its business and are not mentioned.

## Learning from past work

Carl's rule, 2026-09-30: when DB usually subcontracts a trade, the estimate
should lean on what the sub charged last time, not on a template rate. That
evidence is already in JobTread. Every past estimate, change order, work
order, vendor bill and invoice is a cost item with a job behind it, and a
vendor document names the sub in `document.account`.

So the draft has a third, short call:

1. In the draft call the model gives one to three search terms (`lookBack`)
   on every Subcontractor line, every gap, and any labor line for a trade DB
   might sub: "epoxy", "floor coating"; "skim coat", "skim".
2. The code searches JobTread once per term, name and description, on real
   jobs only. Test jobs, the job being drafted, $0 placeholders, credits and
   time-tracking lines are dropped. Lines are grouped by job and tagged by
   how much they prove: **billed** (a vendor bill DB paid), **sold** (an
   approved estimate, change order or invoice), **ordered** (a work or
   purchase order), **quoted** (a bid request), **draft**. For the top jobs
   it also reads the other lines on the same document, and the **files on
   the matched lines' documents**: the sub's quote is attached to the work
   order or change order it priced, and that is where the square footage a
   lump-sum line does not carry is written. Failing that, the job's files
   whose name or description carries the search term. Quotes before other
   PDFs before photos, one copy of a file uploaded twice, three files a job,
   twelve a read, dealt out one per search term per round so the first term
   searched cannot take them all; a job with a thousand migrated files is
   never scanned.
3. The model reads the matches and the attached files and, per target, says
   whether DB has done this before, cites the lines and files it relies on,
   and gives a unit cost only when the arithmetic is shown. A size written
   on a sub's quote is written evidence. A lump sum with no size anywhere
   stays a lump sum and the model says what would settle it. For a labor
   line it says whether DB usually subs that trade, and to whom.

The code then prices what history proposes at the margin JobTread applies to
that line's cost type (a sub's rate at the Subcontractor margin, a crew rate
at the Labor margin) and shows it as a **proposal**: on a subcontracted line,
beside the template rate ("history says $13.60/SF against the template's
$7.50", or "history agrees with the template's $55.00/hour"); on a gap, as
the cost and price the gap would carry.
Proposals never enter the totals. The header says how much history proposes
for the flagged items and that Carl confirms.

On 261323 the history read as follows. Epoxy: one job, 246466 Myers, an
"Epoxy Sub Pckg" at $5,712 from Rhino Concrete Coatings, approved, ordered
and invoiced in August and September 2026, with no square footage on the
change order — but "6466 Dennis Myers_Epoxy Quote.pdf" is attached to the
work order and the change order, and the quote carries the measurements.
Carl pointed that out after the first version read lines only; the files
step exists because of it. Skim coat: nothing, by name or description; the nearest thing
is a drywall sub. Painting: DB subs it often, mostly as lump sums from Jeff
Southworth's Drywall & Painting, and 261257 Reynolds carries a
"Seal/Prime & Paint Ceiling" line at $3.95 a square foot. When there is no
match at all the third call is skipped and the page says what was searched.

### The learned price book

Carl's second rule, the same day: once a past price has been found for a
kind of work, keep it, and only look again after a long time, a year, in
case the sub's pricing moved. So every history finding is written to a local
price book, `.db-estimator/learned-prices.json`, under the search terms that
produced it, with when it was learned and on which job. On the next job a
target whose terms hit a fresh entry is answered from the book: no search,
no model call, and the page says "Learned 2026-09-30 on 261323 Haag_Remodel;
not searched again until 2027-09-30". A learned cost per square foot is not
carried onto a line priced in hours; the summary and the past work still
are. "Nothing found" is remembered for thirty days only, because the next
job may be the first of its kind.

The file is plain JSON, readable and editable by hand: delete an entry to
forget it. It holds DB's pricing, so it is git-ignored and lives on the
machine that runs the drafter. `--relearn` ignores the book for one run and
overwrites what it finds; `--relearn-after 180` shortens the year;
`--learned path` moves the file.

`--no-history` turns the whole step off. A `--capture` saves the history
that was read, so a replay from the fixture is offline.

## What the rep gets

`review/<jobId>-draft.html`, one self-contained page:

- the base scope's price, cost and margin, and each option's on its own
  (`Flooring — LVP` against `Flooring — Epoxy`, so the customer can pick);
- per template: the lines to keep with quantity, unit price, extension and
  basis, and the list to delete;
- **Not in any template**: the gaps, flagged red, for Carl;
- **Confirm before it goes out**: the questions;
- **Named by the model, not in the templates**: rejected ids, if any;
- the General Description text;
- **Build it in JobTread**: the numbered steps, with a Copy button.

`review/<jobId>-draft.json` holds the same draft as data. It is the payload
the write path (roadmap §7) will one day push as a job budget; today a
person follows the steps.

## Why not JobTread's own AI

Tried 2026-09-30, on 261323, with the prompt below pasted into the "Build with
AI" panel on the Budget tab. It never produced a budget. It found the discovery
note and summarised it correctly, then spent the rest of the session re-reading
JobTread's API help pages, reported that "the catalog search isn't filtering
properly — it's returning all items regardless of the search term", and looped.

The panel is a general assistant that has to rediscover the Pave API on every
question. It did not know that a budget template is a top-level cost group with
no parent, that a template line carries no price and points at a priced catalog
item, or how to filter the catalog. Those are the verified facts this repository
exists to hold (`jobtread-api-field-notes.md`), and the drafter has them written
down. The panel is also not reachable from the API, so nothing it does can be
tested against a fixture, priced by code, or gated on ten of Robert's jobs.

The prompt, for the record:

> Build this job's budget only from our budget templates in the Catalog, the way
> our reps do. Read the discovery notes in Messages and the photos in Files first.
> Pick the template that fits this job, add it, delete the lines the job does not
> need, and set quantities from the measurements in the notes (18'4" x 38'6", 8'
> walls). Add a second template only for lines the first does not have. Do not
> create any line that is not in a template. If the job needs something no
> template has, list it separately for Carl instead of adding it.

Decision: the drafter runs on the Anthropic API with a capped key. The write
path, when it comes, is roadmap §7 against the Pave API directly, not a chat
panel asked to type.

## The first live run — 261323, 2026-09-30

Two calls, about fifty cents. The picker chose `X-Division 09 Finishes` with
`01 General Requirements` and `02 Site Construction` beside it, which is what
a rep would reach for on a basement refresh. The draft kept 12 lines across
the three, every quantity traced to the measurement in Robert's note with
the arithmetic shown, and it read the photos: steel posts, a block pier, the
sump pit and the laundry platform slowing the LVP install; peeling paint and
cracks on the walls; an old coating on the slab. It split flooring into LVP
and epoxy for the customer to choose and made ceiling paint and contents
moving optional. It flagged two gaps rather than bend a line: skim-coating
concrete walls has no template line, and it would not use the drywall mud
lines for it. That is a real catalog question for Carl.

The second run, with history: the painting terms were searched first and
their jobs' files took the whole file budget, so the two Rhino epoxy quotes
were listed as found but not attached and the lump sum stayed a lump sum;
a crew-labor rate from history was priced at the subcontractor margin; and
"history says $55 against the template's $55" was agreement written as a
difference. All three fixed the same day; the file budget is now dealt out
across the terms in turns.

Four things were wrong on the first run, all fixed the same day:

1. The base price left the skim coat out, because the skim coat was in the
   gaps, and said nothing about it. The total now says how many flagged items
   it leaves out, and the page says so beside the number.
2. Ceiling paint and contents moving are yes-or-no add-ons, not either-or
   choices, but every option was rendered as "one choice required". The
   option name now carries the difference ("Flooring — LVP" is one of
   several; "Ceiling paint" is an add-on) and the steps build each the right
   way.
3. It deleted Sales On-Site Support, the $0 time-tracking line every
   construction budget carries. Non-monetized lines are now kept at
   quantity 0 and shown as tracking, not as unpriced.
4. Ten questions. Six changed the price; the rest were things the estimate
   already handles. Capped at six, ordered by what they change.

## The fourth live run — 261323, 2026-09-30, with contingency and the ballpark

The first run after the regional ballpark and the contingency step. What
worked: Rhino's epoxy quote was read and turned into $7.00/SF against the
template's $7.50; both $55/hour crew rates were confirmed from sold lines;
the skim coat, which the model now flags rather than fitting under the
drywall-mud lines, came back priced from the area at $1.25/SF labor and
$0.45/SF material, labelled as not DB pricing; moving the contents became
an add-on on X-Division 02's Site Prep Labor instead of a gap. Three things
were wrong, fixed the same evening:

1. "1 line to price by hand" was Sales On-Site Support, the $0 tracking
   line. Tracking lines no longer count as unpriced.
2. Contingency was figured on the $2,500 base alone, while the customer
   must pick a floor that costs twice that. Each option now carries its
   share (contingency on base + option, minus contingency on base, so the
   shares add to the cent), the header shows the total with each required
   choice, and the step tells the rep to add each taken option's cost to
   `Contingency Base`.
3. The by-hand instruction said "after Phase 4" on X-Division templates
   that have no phases. It now says "at the end of the scope".

Still the rep's call, and the questions on the page say so: whether the skim
coat is base scope or an upgrade; which product holds on damp, efflorescing
block; whether the garage is in the job at all.

## A ballpark where history has nothing

Carl, 30 Sep 2026: for items with no template line and no history, "create
the line items with the estimated costs based on our area", and tell the
rep. So the third call has a second job. Every gap that neither history nor
the learned price book could price goes to the model — even when no search
term matched anything, in which case the call is made for the gaps alone —
and the model gives `regionalUnitCost`: a cost per the gap's unit for DB's
own market (Van Wert and the small towns of northwest Ohio and northeast
Indiana, not a national average) for the kind of work and the cost type the
gap carries, with the assumption written out ("a two-man crew at about
$45/hour loaded; moving a basement of contents is two to four hours").

The code prices it at the margin for the gap's cost type, exactly as it
prices a history proposal, and then keeps the two apart everywhere:

- history wins: a gap with a cited past cost never gets a regional figure;
- the page labels it **"Regional ballpark … NOTE TO REP: an estimate for
  our area, not DB pricing; confirm with Carl or a sub bid before it goes
  out"**, on the gap and in the header line beside the base total;
- it never enters a total, and it is **never written to the learned price
  book** — the book holds what DB actually paid, and a guess about the area
  is not that;
- template lines never get one: they already have a price.

A gap whose quantity is what is unknown still gets the unit figure, marked
"quantity still to be confirmed".

## Contingency

Every construction draft (job type not Roofing) ends its template steps
with a contingency step. The model chooses the rate under DB's policy
(decided 28 Sep 2026: 5% when everything stays in place, 8% for a remodel
where anything moves, 10% for additions, structural work or hidden
conditions) and says why from the evidence; the code snaps it to one of the
three, applies it to the base-scope cost, and prints the amount and the two
job parameters the rep types — `Contingency Rate` and `Contingency Base`.
When a chosen template carries the `Project Contingency` line (the seven
phased construction templates do, since 2026-09-30), the step says to keep
it; when none does, an X-Division draft, it says how to add the group and
the catalog item by hand. The line is never the model's to keep or drop,
and it is priced at cost. `docs/contingency.md` has the whole story.

## Gaps against the whole catalog

Carl, reading pass 2 of 261323: the draft flagged batt insulation, the
vapor barrier and the electrical work as having no line, "but at least in
Addition/House Build › New Home Build › Phase 2 - Rough-In › Insulation",
"Phase 3 Interiors › Electrical - Rough-in", and the catalog's "Vapor
Barrier 4 mil"; and "standard Crew Labor in the catalog can be used for any
labor item that does not have a specific labor line item." That is step 4
of his process — when the template you brought in lacks the line, find
another template that has it — and the drafter had only ever shown the
model the chosen templates' lines.

So a gap is no longer flagged until the whole catalog has been looked at:

1. Every gap's search terms (its `lookBack`, or the telling words of its
   scope) go to one Pave query over every catalog cost item — template
   lines and ungrouped items alike, `job` and `document` null — by name and
   description, plus Crew Labor by name. Template lines carry their group
   chain up to the template root; structural groups, "DO NOT USE" groups
   and the templates already chosen are left out. The result is folded to
   one candidate per priced item: the ungrouped item, or the first template
   that carries the line with the other templates named, so the rep is
   pointed at a template when one exists.
2. Each gap gets its candidates — a term in the name or description, the
   gap's own cost type first, at most eight, and Crew Labor for any Labor
   gap — and they ride along to the third call beside the gap.
3. The model picks the candidate that is the same thing, or none, and gives
   the quantity in that line's unit with the arithmetic ("909 SF of wall; a
   10 × 25 roll covers 250 SF, so 4 rolls"). A homonym is not a match. An
   id it names that was not a candidate is noted and not used, the same
   rule as an invented line id; a match with no quantity in the line's unit
   leaves the gap open with a note that the rep sets it.
4. The code prices the match from the catalog like any kept line, puts it
   in the gap's option, and lists it under **Found in other templates and
   the catalog**: template › groups › line, or the catalog item, with the
   quantity, the price, and where else the line lives. What history said
   about the gap rides onto the line, per unit when the units agree, so a
   $0.91/SF batt from a past invoice sits beside the catalog's $13.93.
   Only what nothing covers stays under **Nowhere in the catalog**, with
   its ballpark.

`--no-catalog` turns the search off. A fixture captured with `--capture`
carries the candidates, so a replay is offline.

## The rep's second pass

Carl, 30 Sep 2026, reading the fourth run as the rep: *"forget the skim
coating and let's go with a mold-resistant concrete paint, or an option to
frame out walls 6–8 inches from the foundation with plastic, drywall on top,
wainscot on the bottom, paint it, insulation batts in the false walls. I
would type this in the UI and run this update."*

That is `--revise`. The rep says what to change, in plain words, and reruns:

```
npm run draft -- 261323 --revise "forget the skim coat; go with a mold-resistant concrete paint, or an option to frame out false walls ..."
npm run draft -- 261323 --revise-file review/haag-notes.txt        # the same, from a file
```

The CLI reads the last pass's JSON from `--out`, and both model calls get
one more block right after the job: the rep's direction (every direction so
far, newest last), the rule that it is a decision made on site and outranks
the photos and notes, and what the last pass kept — every line with its
quantity and option, the gaps it flagged, the questions it asked, the
contingency rate it carried. The picker may add templates the direction
calls for (framing, insulation, drywall); the drafter changes what the
direction changes, keeps the rest, drops the questions the direction
answers, and says "per the rep's direction" in the basis of each changed
line.

The page then opens with the direction and **what moved**: templates added
or dropped, lines added or dropped, quantities changed, options moved,
flagged items resolved or new, the contingency rate. The earlier pass stays
on disk as `-pass1.html` and `-pass1.json`, so the two can be compared, and
the JSON records every direction so a third pass carries both. Every page,
pass 1 included, ends with a **Change it** box: type the direction, copy the
rerun command.

There is no UI beyond that page yet. When there is one, this is the call it
makes.

## Running it

```
cd /c/dev/DB-Estimator && git pull && npm install
npm run draft -- 261323 --dry-run                 # sends nothing; writes what the model would read
npm run draft -- 261323 --out review              # needs ANTHROPIC_API_KEY in .env
npm run draft -- 261323 --templates 22PLCZU3cbqS,22PF3gnGCuiB   # skip the picker
npm run draft -- 261323 --capture test/fixtures/haag-live.json  # save the job and templates
npm run draft -- --fixture test/fixtures/haag-basement.json     # replay offline (still calls the model)
```

The job is the six-digit number that starts its name, the hyphenated number
JobTread stores, or the job id. The dry run needs only the JobTread key.

Before the first paid call the CLI asks Anthropic for the model's record,
which is free and fails exactly where a paid call would: a key scoped to the
organization rather than a workspace (add `ANTHROPIC_WORKSPACE_ID` to `.env`,
or create the key inside a workspace), a bad key, or a console with no credit.
It stops there with a plain sentence, and nothing is spent.

## Cost

Two calls on Claude Opus 5.5 at $4 per million input tokens and $20 per
million output, plus a third, text-only call of a few thousand tokens when
past work matched. The pick reads the job and 18 photos plus the template list
(about 40,000 tokens); the draft reads the job and photos again plus two
templates' lines (about 45,000 tokens) and writes perhaps 6,000. Roughly
$0.50 for a job like 261323; a large addition against the 350-line
`Addition/House Build` template might be $1.50. The page prints the actual
figure. Twenty drafts a month is on the order of $10 to $30.

## What leaves the building

Nothing, until a key is set. With one, the job's description, comments,
photos and files, and the chosen templates' line names, units and
descriptions go to Anthropic's API under its commercial terms. No prices go,
and nothing is written back to JobTread. The rendered page and JSON stay
local like the other reports.

## Gate

The same shape as the auditor's Stage 1. Robert drafts his next ten
construction jobs through it and, for each, records three numbers on the
page: lines the draft kept that he deleted, lines he had to add by hand, and
quantities he changed by more than a quarter. Kristen grades the gaps and
questions Real or Not real. The prompt is fixed for each class of miss
until eight of ten drafts need under ten minutes of the rep's work to become
the budget he would have built. Until then it is a draft he reads, not one
he trusts.

## Not built yet

- **The write path for budgets.** The JSON is the payload; pushing it as a
  job budget is roadmap §7, still off. The steps on the page are what the
  rep does by hand today. The only write so far is the template change in
  `docs/contingency.md`, through `src/jobtread/writer.ts` under a separate
  grant with three allowed mutations.
- **Adding a found line by itself.** The page says "add just this line"
  for a line found in another template. Whether JobTread's catalog picker
  lets the rep check one line inside a template group, or the rep must add
  the group and delete the rest as Carl described, is for the rep to
  report from the first live use; the ungrouped catalog item behind the
  line prices the same either way.
- **The auditor on the draft.** Every kept line is priced from the catalog,
  so the pricing checks pass by construction; the comparables band (this
  draft's margin against approved jobs of its size) is the one worth
  wiring in.
- **Work orders, purchase orders, the project folder.** Kristen's work after
  the contract is signed: the same lines regrouped by who does them, on the
  `Work Order` and `Purchase Order` document templates. Next, after the
  drafter has been used live.
