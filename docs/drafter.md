# Drafting a budget from the templates

The auditor asks whether an estimate is priced right, and the scope review
asks whether the right lines are on it. Both need an estimate to exist. The
drafter is for the step before that: the rep has done the site visit, the
notes and photos are on the job, and nobody has two hours to build the
budget. It produces the budget the way a rep does, and nothing else.

Status: built and tested offline on 2026-09-30 against job 261323
Haag_Remodel, then run live three times the same day (notes below). The
drafter itself writes nothing to JobTread. Two things do, both through
`src/jobtread/writer.ts` under a separate grant: `npm run contingency` put
the contingency group in the construction templates (`docs/contingency.md`),
and `npm run build-budget` builds a finished draft into a job's budget
(**Build it in JobTread**, below; first done on test job 25-0000 on
2026-10-01).

## How DB builds an estimate today, and what the drafter reproduces

An estimate at Deitemeyer Brothers is built in JobTread from **budget
templates**. In the API a budget template is a top-level catalog cost group
(`Bathroom Remodel`, `Deck`, `X-Division 09 Finishes`; 44 of them on
2026-09-30). The rep:

1. adds a template group to the job's Budget tab;
2. deletes the lines the job does not need;
3. sets quantities;
4. for a line the template lacks, pulls the line from the catalog into the
   right section of the job's copy of the template — or, when the catalog
   has nothing, creates a new line there and prices it;
5. and takes what they had to create to Carl, who decides.

Carl, 30 Sep 2026: *"The actual catalog budget template is never modified,
only the one copied onto a job is modified. I am not requiring a rep to add
a template before running through the estimator: you pick the best template
or templates to start out with."* So the rep starts from an empty Budget
tab, the drafter picks, and every instruction on the page is about the
job's copy.

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
   might sub, the trade's own single word first: "epoxy", "floor coating";
   "skim", "skim coat". A term is matched as written, so when every term of
   a target is a phrase the code puts its key word in front ("epoxy floor
   coating" also searches "epoxy"). Up to sixteen terms a run are searched,
   dealt out in rounds: gaps first, then subcontracted lines, then labor
   lines, and every target's first term before any target's second.
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
   never scanned. Every job's **files** are searched for the term too, by
   name and description: DB files a sub's quote on the work order or
   purchase order as "Momper Insulation Quote", "Quote for concrete",
   "Epoxy Quote", often on a job whose line is called something else
   ("Flooring - Sub"). Up to two jobs a term are added that way, read
   through the document the file hangs on, so the lines beside the quote are
   evidence whatever they are named.
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
step exists because of it.

On 25-0000, 2026-10-01, the same quote was missed. Three reasons, all fixed
the same day: the search took the first ten terms in the order the lines
came, and the paint, drywall and flooring lines used them up before the
epoxy gap's first term; a phrase like "epoxy floor coating" does not match
"Epoxy Sub Pckg"; and the price book then learned "nothing found" for the
epoxy terms that were never searched, which would have hidden Myers for a
month. Now the terms are dealt out gaps first, up to sixteen, a phrase gets
its key word, every job's files are searched for the term, and only a target
whose terms were searched is remembered. A run made before the fix may have
left that "nothing" in `.db-estimator/learned-prices.json`; one run with
`--relearn` replaces it. Skim coat: nothing, by name or description; the nearest thing
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

`review/<jobId>-draft.json` holds the same draft as data. It is what
`npm run build-budget` reads to build the budget on the job (**Build it in
JobTread**, below); the steps on the page are the same work done by hand.

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
path (`build-budget`) goes against the Pave API directly, not through a chat
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
4. For every gap, matched or not, the model also names the **section** of a
   chosen template — from the list of the chosen templates' groups, by id —
   where the line belongs on the job's copy: insulation with the rough-in
   or framing section, electrical with electrical. The code checks the id
   is a real, non-structural group of a chosen template; an id that is not
   is noted and the rep picks the section.
5. The code prices the match from the catalog like any kept line, puts it
   in the gap's option, and lists it under **Found in the catalog**: "into
   X-Division 09 Finishes › FINISHES › Drywall/Plaster: Insulation - Batt,
   909 SF — from Addition/House Build › … › Insulation", with the quantity
   and the price. What history said about the gap rides onto the line, per
   unit when the units agree, so a $0.91/SF batt from a past invoice sits
   beside the catalog's $13.93. What nothing covers goes under **Nowhere in
   the catalog** as a line to *create* on the job, under its section, with
   the price to type: history's figure, the regional ballpark with its
   note, or "Carl sets it".

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

## Build it in JobTread

`npm run build-budget -- <job>` does the page's "Build it in JobTread" steps
on the job's Budget tab. It reads the last draft's JSON (`review/<jobId>-draft.json`,
or `--draft path`), reads the chosen templates and the catalog items the draft
prices from again, and creates the budget as the rep would have:

- **one group per chosen template**, named for the template's scope group
  (`FINISHES`, `BATHROOM REMODEL`), with the kept lines in their template
  sections in template order, each a job line pointing at its catalog item
  and priced at today's price of record. The primary's group starts with the
  **General Description** line carrying the scope text;
- **found lines** in the section the model named (or the primary's group when
  it named none), priced from the catalog item they came from;
- **open items** created on the job as lines tagged `(DRAFT - Carl confirms)`:
  a catalog match at quantity 0 with the description saying the rep sets the
  count, otherwise a new line priced from DB history or the regional ballpark
  with the basis and the warning in its description, under General
  Requirements;
- **CUSTOMER OPTIONS**, one selection group per option group: two or more
  choices make a required pick (`min 1 / max 1`) with the first choice
  pre-selected, one choice is an add-on (`min 0 / max 1`) nobody has picked;
- **Phase 5 - Contingency** with the Project Contingency line on the
  base scope: `Contingency Base` is the base-scope cost **as built** (the
  template groups, the found lines and the created lines, not the options),
  so the figure matches the budget JobTread shows; the formula is stored and,
  because the API does not evaluate it, the quantity in dollars goes too.
  **Each option carries its own share** — a second Project Contingency line
  inside each choice group, `contingency(base + choice) − contingency(base)`
  — so the budget's contingency follows what the customer picks: take LVP
  and the framed walls and their shares come with them, decline the ceiling
  paint and its share goes too. The two job parameters are set first,
  merged with whatever parameters the job already has
  (`updateJob.parameters` replaces the list).

The job's structural groups (CLOCK IN ITEMS, BURDEN, GENERAL AND
ADMINISTRATIVE, CHANGE ORDER) are not touched, and no catalog template is
ever modified: everything is created on the job's copy.

Without `--apply` it is a dry run: it prints the tree with quantities and
prices, writes the same tree as a page to read the way the draft page is
read (`review/<jobId>-build-plan.html`: each group, every line with its
quantity, unit price and extension, the DRAFT lines marked, the options with
the pre-selected choice, the contingency formula, and the `--apply` command
to run next), writes the exact mutations to `review/<jobId>-build-plan.json`,
and changes nothing. With `--apply` it needs `JOBTREAD_WRITE_GRANT_KEY`,
issues one `createCostGroup` per top-level group, records what it created in
`review/<jobId>-built.json` after every write (so a run that dies mid-way
leaves a record of what exists), then reads the budget back and says, on the
terminal and on the page, whether each group is there with as many lines as
planned, the contingency line has its quantity, and the parameters are set.
A run the gate refuses writes the page too, with the reason.

**Check before you apply.** Both pages open with a box of what to look at
before anything is built (`src/draft/checks.ts`), problems first, each with
the lines and the dollars, and the build page tags every row a check names
(`problem 1`, `check 3`). The terminal prints the same list after the tree.

- **The same work paid twice** in one place: a subcontractor line beside
  DB's crew for the same trade (a problem), beside DB's material for it (a
  check, and a problem when both are for the same amount, as "Insulation -
  Sub" and "Insulation - Batt" both for 909 SF were on 25-0000), two subs of
  one trade, or one line twice.
- **A line counted in one unit and priced per another**: "Drywall Brd- Mat"
  said Each in five templates while its price, $1.02, is per square foot,
  so 21 sheets came to $21.42 of drywall. The line keeps its own unit,
  because which side is wrong is a judgment: for the board it was the
  template's Each, for "Drywall - Sub" it was the price item's Lump Sum
  (both fixed in the catalog 2026-10-01, `docs/catalog-corrections.md`).
  The page says what the count comes to, the model is told the line is in
  conflict and gives the count in both units, and the catalog gets fixed by
  a person. A draft counted before such a fix is caught on the build too.
- **What is not final**: lines with no count yet, lines with no price, and
  the DRAFT lines Carl confirms, with their total.
- **What the contingency comes to** on the base and with the pre-selected
  choices, so a figure like $44 on a $30,000 budget is seen.

Rule 14 of the drafting prompt tells the model to do the work one way (the
sub or the crew, not both) and to put a genuine choice in questions; the
check is there for when it does not.

Three gates, in `gateBuild`:

- only a **test job** (a name with "test", the Kay Oss customer, or
  "template") is built unless `--live` is given;
- another job's draft goes only onto a test job, which is how the first
  build was done;
- the budget must be **empty apart from the structural groups**. `--replace`
  takes down exactly the top-level groups the last record says this tool
  built and refuses if anything else is on the budget — a group a rep added
  by hand is never deleted. Clear the budget in JobTread, or rerun with
  `--replace`, and the draft goes on again (after a `--revise` pass, say).

The first build was job 25-0000 on 2026-10-01: a hand-written pass-2 draft in
the Haag basement's shape (paint the block or frame false walls, LVP or epoxy
floor, a ceiling-paint add-on, four open items) against the two X-Division
templates. Four groups, nineteen lines, selection groups and the pre-selected
choices as sent, the contingency line at $190.40 — `test/fixtures/build-sample.json`
holds the draft, the plan and what JobTread held afterwards, and
`test/build.test.ts` checks the plan against both. What JobTread taught along
the way (a job line needs its cost code; prices are not copied from the
catalog item; a null quantity bills one unit; the parameter list replaces;
formulas are not evaluated) is in `docs/jobtread-api-field-notes.md` under
*Writing a job budget*.

After the build the rep opens the Budget tab: the DRAFT-tagged lines are
theirs to confirm with Carl and to give counts to, the options are the
customer's to pick on the estimate, and Kristen still reviews before anything
goes out. Building the estimate document from the budget is JobTread's own
step, as today.

## Running it

```
cd /c/dev/DB-Estimator && git pull && npm install
npm run draft -- 261323 --dry-run                 # sends nothing; writes what the model would read
npm run draft -- 261323 --out review              # needs ANTHROPIC_API_KEY in .env
npm run draft -- 261323 --templates 22PLCZU3cbqS,22PF3gnGCuiB   # skip the picker
npm run draft -- 261323 --capture test/fixtures/haag-live.json  # save the job and templates
npm run draft -- --fixture test/fixtures/haag-basement.json     # replay offline (still calls the model)
npm run build-budget -- 25-0000                   # dry run: the tree and review/<jobId>-build-plan.json
npm run build-budget -- 25-0000 --apply           # writes; needs JOBTREAD_WRITE_GRANT_KEY; test jobs only
npm run build-budget -- 261323 --apply --live     # a real job; the budget must be empty of scope
npm run build-budget -- 25-0000 --apply --replace # take down this tool's last build there, build the new draft
npm run build-budget -- --fixture test/fixtures/build-sample.json   # the plan from a saved fixture, offline
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
descriptions go to Anthropic's API under its commercial terms. No prices go.
The drafter writes nothing back to JobTread; `build-budget --apply` does,
under the separate write key, and only what the dry run printed. The
rendered page and JSON stay local like the other reports.

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

- **Rebuilding by section.** `build-budget` builds the whole draft onto an
  empty budget, or takes down its own last build first (`--replace`) and
  builds the new pass. Adding one found line to a budget a rep has already
  worked on, or changing one quantity after a `--revise` pass, is still the
  rep's click. The writer allows four mutations (`createCostItem`,
  `createCostGroup`, `deleteCostGroup`, and `updateJob` for the parameters
  only); anything else is refused before it is sent.
- **A real job.** The first build went onto test job 25-0000. The first
  `--live` build on a job a customer will see is the gate below, not a
  version number.
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
